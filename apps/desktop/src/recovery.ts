import { invoke, isTauri } from "@tauri-apps/api/core";
import { parseProject, type ProjectDocument } from "./project";

export const RECOVERY_KEY = "nexo.recovery.v1";
export const RECOVERY_LIMIT = 2_100_000;
export interface RecoverySnapshot {
  format: "nexo-recovery";
  version: 1;
  capturedAt: string;
  project: ProjectDocument;
}

// A snapshot is data, never a saved verdict or authorization to overwrite a path.
export function parseRecovery(text: string): RecoverySnapshot {
  if (new TextEncoder().encode(text).length > RECOVERY_LIMIT)
    throw new Error("Cópia de recuperação excede o limite.");
  const raw = JSON.parse(text);
  if (!raw || raw.format !== "nexo-recovery" || raw.version !== 1 ||
      typeof raw.capturedAt !== "string" || !Number.isFinite(Date.parse(raw.capturedAt)))
    throw new Error("Cópia de recuperação inválida.");
  const parsed = parseProject(JSON.stringify(raw.project));
  if (!parsed.document) throw new Error("Cópia de recuperação inválida.");
  const p = parsed.document;
  if (!p.model || typeof p.model.title !== "string" || p.model.title.length > 1000)
    throw new Error("Cópia de recuperação inválida.");
  return { format: "nexo-recovery", version: 1, capturedAt: raw.capturedAt,
    project: { format: p.format, version: p.version, createdAt: p.createdAt,
      updatedAt: p.updatedAt, model: p.model, workspace: p.workspace,
      ...(p.revisionHistory?{revisionHistory:p.revisionHistory}:{}),
      ...(p.modules?{modules:p.modules}:{}),...(p.groups?{groups:p.groups}:{}) } };
}

export function makeRecovery(project: string): string {
  const text = JSON.stringify({ format: "nexo-recovery", version: 1,
    capturedAt: new Date().toISOString(), project: JSON.parse(project) });
  parseRecovery(text);
  return text;
}

export interface RecoveryBackend {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  clear(): Promise<void>;
}
export function recoveryBackend(): RecoveryBackend {
  if (isTauri()) {
    const call = (action: string, content?: string) =>
      invoke<string | null>("recovery_storage", { action, content });
    return { read: () => call("read"), write: async text => { await call("write", text); },
      clear: async () => { await call("clear"); } };
  }
  return { read: async () => localStorage.getItem(RECOVERY_KEY),
    write: async text => { localStorage.setItem(RECOVERY_KEY, text); },
    clear: async () => { localStorage.removeItem(RECOVERY_KEY); } };
}

// Serialize writes/removal; a slow old checkpoint cannot resurrect discarded data.
export class RecoveryStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private backend: RecoveryBackend) {}
  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.then(action);
    this.queue = next.catch(() => {});
    return next;
  }
  read() { return this.enqueue(async () => {
    const text = await this.backend.read();
    return text === null ? null : parseRecovery(text);
  }); }
  write(text: string) { return this.enqueue(async () => {
    parseRecovery(text);
    await this.backend.write(text);
  }); }
  clear() { return this.enqueue(() => this.backend.clear()); }
}
