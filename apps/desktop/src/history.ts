import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Model, Run } from "./types";

export const HISTORY_KEY = "nexo.history.v1";
export const HISTORY_LIMIT = 8_000_000;
export const HISTORY_RETAIN = 20;
export interface HistoryEntry { model: Model; run: Run }
export interface RunHistory { format: "nexo-run-history"; version: 1; evicted: number; entries: HistoryEntry[] }
export const emptyHistory = (): RunHistory => ({ format: "nexo-run-history", version: 1, evicted: 0, entries: [] });
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 10000): v is string => typeof v === "string" && v.length <= max;
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

export function validateHistoryEntry(value: unknown): asserts value is HistoryEntry {
  if (!object(value) || !object(value.model) || !object(value.run)) throw new Error("Registro de execução inválido.");
  const m = value.model, r = value.run;
  if (m.schema_version !== 1 || !text(m.id, 64) || !text(m.title, 1000) || !text(m.description) ||
      ["variables", "equations", "assumptions", "requirements", "observations"].some(k => !Array.isArray(m[k])) || bytes(m) > 2_000_000 ||
      !text(r.run_id, 128) || !text(r.engine_version, 128) || !text(r.model_revision, 64) || !/^[a-f0-9]{64}$/i.test(r.model_revision) ||
      !text(r.created_at, 128) || !Number.isFinite(Date.parse(r.created_at)) || !["consistent", "attention", "inconclusive"].includes(r.outcome) ||
      !object(r.counts) || !object(r.values) || !Array.isArray(r.checks) || r.checks.length > 2000 ||
      !Array.isArray(r.limitations) || r.limitations.some((s: unknown) => !text(s)) || bytes(value) > 4_000_000)
    throw new Error("Registro de execução inválido.");
  for (const c of r.checks) {
    if (!object(c) || !text(c.id, 128) || !text(c.rule_id, 128) || !count(c.rule_version) ||
        !["passed", "failed", "inconclusive"].includes(c.status) || !text(c.title) || !text(c.evidence, 100000) || !text(c.suggested_action) ||
        !Array.isArray(c.node_ids) || c.node_ids.length > 240 || c.node_ids.some((id: unknown) => !text(id, 64)))
      throw new Error("Evidência arquivada inválida.");
  }
  for (const status of ["passed", "failed", "inconclusive"]) {
    if (!count(r.counts[status]) || r.counts[status] !== r.checks.filter((c: any) => c.status === status).length)
      throw new Error("Contagem de execução inválida.");
  }
  const expected = r.counts.failed ? "attention" : r.counts.inconclusive ? "inconclusive" : "consistent";
  if (r.outcome !== expected) throw new Error("Estado de execução inválido.");
  for (const v of Object.values(r.values))
    if (!object(v) || typeof v.value !== "number" || !Number.isFinite(v.value) || !text(v.unit, 128) || !text(v.origin) ||
        (v.expression !== undefined && !text(v.expression, 4_000_000))) throw new Error("Valor arquivado inválido.");
}

export function parseHistory(raw: string): RunHistory {
  if (new TextEncoder().encode(raw).length > HISTORY_LIMIT) throw new Error("Histórico excede 8 MB.");
  const data = JSON.parse(raw);
  if (!object(data) || data.format !== "nexo-run-history" || data.version !== 1 || !count(data.evicted) ||
      !Array.isArray(data.entries) || data.entries.length > HISTORY_RETAIN) throw new Error("Histórico inválido.");
  const ids = new Set<string>();
  for (const entry of data.entries) {
    validateHistoryEntry(entry);
    if (ids.has(entry.run.run_id)) throw new Error("Execução duplicada no histórico.");
    ids.add(entry.run.run_id);
  }
  return { format: "nexo-run-history", version: 1, evicted: data.evicted, entries: data.entries };
}

export function appendHistory(history: RunHistory, entry: HistoryEntry): RunHistory {
  validateHistoryEntry(entry);
  if (history.entries.some(e => e.run.run_id === entry.run.run_id)) return history;
  const next: RunHistory = { ...history, entries: [structuredClone(entry), ...history.entries] };
  while (next.entries.length > HISTORY_RETAIN || bytes(next) > HISTORY_LIMIT) {
    next.entries.pop(); next.evicted++;
  }
  return next;
}

interface HistoryBackend {
  read(): Promise<string | null>;
  write?(text: string): Promise<void>;
  archive?(runId: string): Promise<string>;
}
function backend(): HistoryBackend {
  if (isTauri()) return {
    read: async () => JSON.stringify(await invoke("history_read")),
    // Never send model/verdict data to the native archive; acknowledge a real receipt.
    archive: async runId => JSON.stringify(await invoke("archive_run", { runId })),
  };
  return { read: async () => localStorage.getItem(HISTORY_KEY),
    write: async value => { localStorage.setItem(HISTORY_KEY, value); } };
}
export class HistoryStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private storage: HistoryBackend = backend()) {}
  private enqueue<T>(action: () => Promise<T>) {
    const next = this.queue.then(action); this.queue = next.catch(() => {}); return next;
  }
  private async readNow() {
    const raw = await this.storage.read(); return raw === null ? emptyHistory() : parseHistory(raw);
  }
  read() { return this.enqueue(() => this.readNow()); }
  capture(model: Model, run: Run) {
    const entry = structuredClone({ model, run });
    return this.enqueue(async () => {
      if (this.storage.archive) return parseHistory(await this.storage.archive(entry.run.run_id));
      const next = appendHistory(await this.readNow(), entry);
      await this.storage.write!(JSON.stringify(next)); return next;
    });
  }
}
