import { expect, test } from "vitest";
import { appendHistory, emptyHistory, HistoryStore, parseHistory, HISTORY_LIMIT, type HistoryEntry } from "./history";

function entry(id = "run_1"): HistoryEntry {
  return { model: { schema_version: 1, id: "test", title: "Análise térmica", description: "Synthetic",
    variables: [{id: "x", label: "Entrada", unit: "1", value: 12.5, source: "Synthetic input"}],
    equations: [], assumptions: [], requirements: [], observations: [] },
  run: { run_id: id, model_revision: "a".repeat(64), engine_version: "test-v1", created_at: "2026-10-24T08:00:00Z",
    outcome: "consistent", counts: {passed: 1, failed: 0, inconclusive: 0},
    checks: [{id:"c1", rule_id:"test", rule_version:1, status:"passed", node_ids:["x"], title:"Synthetic check", evidence:"12.5", suggested_action:"None"}],
    values: {x:{value:12.5,unit:"1",origin:"given"}}, limitations:["Synthetic data"] } };
}
test("history retains input, sources, revision, engine and evidence independently of later edits", () => {
  const original = entry();
  const history = appendHistory(emptyHistory(), original);
  original.model.variables[0].value = 99;
  const roundtrip = parseHistory(JSON.stringify(history));
  expect(roundtrip.entries[0].model.variables[0].value).toBe(12.5);
  expect(roundtrip.entries[0].model.variables[0].source).toBe("Synthetic input");
  expect(roundtrip.entries[0].run.engine_version).toBe("test-v1");
  expect(roundtrip.entries[0].run.model_revision).toBe("a".repeat(64));
});
test("retention keeps recent runs, reports eviction and deduplicates repeated acknowledgements", () => {
  let history = emptyHistory();
  for (let i=0; i<23; i++) history = appendHistory(history, entry(`run_${i}`));
  expect(history.entries).toHaveLength(20);
  expect(history.entries[0].run.run_id).toBe("run_22");
  expect(history.entries.at(-1)?.run.run_id).toBe("run_3");
  expect(history.evicted).toBe(3);
  expect(appendHistory(history, entry("run_22"))).toEqual(history);
});

test("symbolic expression metadata uses the record byte budget instead of the short label limit", () => {
  const record = entry();
  record.run.values.x.expression = "symbol + ".repeat(1500) + "symbol";
  const history = parseHistory(JSON.stringify(appendHistory(emptyHistory(), record)));
  expect(history.entries[0].run.values.x.expression).toBe(record.run.values.x.expression);
});
test("byte retention also evicts older records before the count limit is reached", () => {
  let history = emptyHistory();
  for (let i=0; i<5; i++) {
    const record = entry(`large_${i}`);
    record.model.variables[0].source = "x".repeat(1_850_000);
    history = appendHistory(history, record);
  }
  expect(history.entries).toHaveLength(4);
  expect(history.evicted).toBe(1);
  expect(new TextEncoder().encode(JSON.stringify(history)).length).toBeLessThanOrEqual(HISTORY_LIMIT);
  expect(history.entries.at(-1)?.run.run_id).toBe("large_1");
});
test("malformed records, inconsistent counts, nonfinite values and unsupported envelopes remain errors", () => {
  const history = appendHistory(emptyHistory(), entry());
  history.entries[0].run.counts.passed = 2;
  expect(() => parseHistory(JSON.stringify(history))).toThrow("Contagem");
  history.entries[0].run.counts.passed = 1;
  history.entries[0].run.values.x.value = Infinity;
  expect(() => parseHistory(JSON.stringify(history))).toThrow("Valor");
  expect(() => parseHistory('{"format":"other"}')).toThrow();
  expect(() => parseHistory(" ".repeat(HISTORY_LIMIT+1))).toThrow("8 MB");
});
test("failed writes retain previous archive, and retries do not duplicate entries", async () => {
  const previous = JSON.stringify(appendHistory(emptyHistory(), entry("old")));
  let raw = previous, fail = true;
  const store = new HistoryStore({read: async()=>raw, write: async value=> {if(fail) throw new Error("disk full"); raw=value;}});
  const next = entry("new");
  await expect(store.capture(next.model,next.run)).rejects.toThrow("disk full");
  expect(raw).toBe(previous);
  fail=false;
  await store.capture(next.model,next.run);
  await store.capture(next.model,next.run);
  expect((await store.read()).entries.map(e=>e.run.run_id)).toEqual(["new","old"]);
});
test("corrupt storage is not replaced by a new analysis", async () => {
  let writes=0;
  const store = new HistoryStore({read: async()=>"corrupt", write: async()=>{writes++;}});
  const e=entry();
  await expect(store.capture(e.model,e.run)).rejects.toThrow();
  expect(writes).toBe(0);
});
test("native capture sends only the receipt ID, without permitting a model or verdict write", async () => {
  const e=entry(); const calls:string[]=[];
  const store=new HistoryStore({read:async()=>null, archive:async id=>{calls.push(id);return JSON.stringify(appendHistory(emptyHistory(),e));}});
  expect((await store.capture(e.model,e.run)).entries).toHaveLength(1);
  expect(calls).toEqual([e.run.run_id]);
});
