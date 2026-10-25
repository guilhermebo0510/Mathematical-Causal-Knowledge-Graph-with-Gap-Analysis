import { expect, test } from "vitest";
import { makeRecovery, parseRecovery, RECOVERY_LIMIT, RecoveryStore } from "./recovery";
import { serializeProject } from "./project";
import type { Model } from "./types";

const model: Model = { schema_version: 1, id: "recovery_test", title: "Análise recuperável",
  description: "Synthetic", variables: [{ id: "x", label: "Entrada", unit: "1", value: 12.5, source: "Synthetic" }],
  equations: [], assumptions: [], requirements: [], observations: [] };
const snapshot = () => makeRecovery(serializeProject(model, {
  viewport: null, explorer: false, inspector: true, navigator: false, results: true,
}, "2026-10-24T07:00:00Z"));

test("recovery preserves authored data without adopting a file path or saved verdict", () => {
  const raw = JSON.parse(snapshot());
  raw.path = "C:/protected/original.nexo";
  raw.project.run = { outcome: "consistent" };
  raw.project.runs = [{ model_revision: "fake" }];
  const parsed = parseRecovery(JSON.stringify(raw));
  expect(parsed.project.model).toEqual(model);
  expect(parsed).not.toHaveProperty("path");
  expect(parsed.project).not.toHaveProperty("run");
  expect(parsed.project).not.toHaveProperty("runs");
});

test("malformed, unknown, oversized and invalid workspace snapshots are rejected", () => {
  expect(() => parseRecovery("bad")).toThrow();
  const raw = JSON.parse(snapshot());
  expect(() => parseRecovery(JSON.stringify({ ...raw, version: 2 }))).toThrow();
  expect(() => parseRecovery(JSON.stringify({ ...raw, capturedAt: "yesterday" }))).toThrow();
  expect(() => parseRecovery(" ".repeat(RECOVERY_LIMIT + 1))).toThrow("limite");
  raw.project.workspace.viewport = { camera: { zoom: -1 }, positions: [], visibility: {} };
  expect(() => parseRecovery(JSON.stringify(raw))).toThrow();
});

test("a slow checkpoint cannot resurrect a discarded snapshot", async () => {
  let value: string | null = null;
  const events: string[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const store = new RecoveryStore({ read: async () => value,
    write: async text => { events.push("write"); await pending; value = text; },
    clear: async () => { events.push("clear"); value = null; } });
  const first = store.write(snapshot());
  const clear = store.clear();
  release();
  await Promise.all([first, clear]);
  expect(events).toEqual(["write", "clear"]);
  expect(await store.read()).toBeNull();
});

test("storage failure preserves the last copy and does not poison later writes", async () => {
  const previous = snapshot();
  let value = previous, fail = true;
  const store = new RecoveryStore({ read: async () => value,
    write: async text => { if (fail) throw new Error("disk full"); value = text; }, clear: async () => {} });
  await expect(store.write(snapshot())).rejects.toThrow("disk full");
  expect(value).toBe(previous);
  fail = false;
  await store.write(snapshot());
  expect((await store.read())?.project.model.title).toBe(model.title);
});

test("corrupt recovery is left in storage until an explicit discard", async () => {
  let cleared = false;
  const store = new RecoveryStore({ read: async () => "corrupt", write: async () => {}, clear: async () => { cleared = true; } });
  await expect(store.read()).rejects.toThrow();
  expect(cleared).toBe(false);
  await store.clear();
  expect(cleared).toBe(true);
});
