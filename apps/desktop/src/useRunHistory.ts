import { useEffect, useRef, useState } from "react";
import { emptyHistory, HistoryStore, type HistoryEntry } from "./history";
import type { Model, Run } from "./types";

export function useRunHistory() {
  const [store] = useState(() => new HistoryStore());
  const [history, setHistory] = useState(emptyHistory);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const pending = useRef<HistoryEntry | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void store.read().then(value => { if (alive.current) setHistory(value); })
      .catch(e => { if (alive.current) setError(String(e)); });
    return () => { alive.current = false; };
  }, [store]);

  async function capture(model: Model, run: Run) {
    pending.current = structuredClone({ model, run });
    setSaving(n => n + 1);
    try {
      const value = await store.capture(model, run);
      if (alive.current) { setHistory(value); setError(null); }
      if (pending.current?.run.run_id === run.run_id) pending.current = null;
    } catch (e) { if (alive.current) setError(String(e)); }
    finally { if (alive.current) setSaving(n => n - 1); }
  }
  async function retry() {
    if (pending.current) await capture(pending.current.model, pending.current.run);
    else try { setHistory(await store.read()); setError(null); } catch (e) { setError(String(e)); }
  }
  return { ...history, error, saving: saving > 0, capture, retry };
}
