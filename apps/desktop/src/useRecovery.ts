import { useEffect, useRef, useState } from "react";
import { makeRecovery, recoveryBackend, RecoveryStore, type RecoverySnapshot } from "./recovery";

export function useRecovery({ active, capture }: { active: boolean; capture: () => string | null }) {
  const [store] = useState(() => new RecoveryStore(recoveryBackend()));
  const [candidate, setCandidate] = useState<RecoverySnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const latest = useRef({ active, capture });
  latest.current = { active, capture };
  const fingerprint = useRef<string | null>(null);
  const generation = useRef(0);
  const writing = useRef(false);
  const suspended = useRef(false);

  useEffect(() => {
    let alive = true;
    void store.read().then(value => {
      if (!alive) return;
      setCandidate(value);
      setReady(true);
    }).catch(e => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, [store]);

  useEffect(() => {
    if (!ready || candidate) return;
    let alive = true;
    const checkpoint = async () => {
      if (suspended.current || !latest.current.active || writing.current) return;
      const token = generation.current;
      try {
        const project = latest.current.capture();
        if (!project) return;
        const p = JSON.parse(project);
        const key = JSON.stringify([p.model, p.workspace, p.createdAt,p.revisionHistory,p.modules,p.groups]);
        if (key === fingerprint.current) return;
        writing.current = true;
        await store.write(makeRecovery(project));
        if (alive && token === generation.current) {
          fingerprint.current = key;
          setSavedAt(new Date().toISOString());
          setError(null);
        }
      } catch (e) { if (alive) setError(String(e)); }
      finally { writing.current = false; }
    };
    const timer = window.setInterval(() => void checkpoint(), 1500);
    return () => { alive = false; window.clearInterval(timer); };
  }, [ready, candidate, store]);

  async function discard() {
    generation.current++;
    suspended.current = true;
    try {
      await store.clear();
      fingerprint.current = null;
      setCandidate(null);
      setSavedAt(null);
      setReady(true);
      setError(null);
    } catch (e) { setError(String(e)); }
    finally { suspended.current = false; }
  }
  function restored() {
    fingerprint.current = null;
    setCandidate(null);
    setSavedAt(null);
  }
  return { candidate, ready, error, savedAt, discard, restored };
}
