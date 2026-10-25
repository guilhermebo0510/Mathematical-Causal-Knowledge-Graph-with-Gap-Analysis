import { useState } from "react";
import { Download, History, RefreshCw } from "lucide-react";
import { useI18n } from "./i18n";
import { download } from "./project";
import type { HistoryEntry } from "./history";

export function RunHistory({ entries, currentRunId, error, saving, evicted, onRetry }: {
  entries: HistoryEntry[]; currentRunId?: string; error: string | null; saving: boolean;
  evicted: number; onRetry: () => void;
}) {
  const { t, date } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const [showModel, setShowModel] = useState(false);
  const entry = entries.find(e => e.run.run_id === selected);
  return <>
    <div className="result-filterbar">
      <span title={t("Retenção local: até 20 execuções e 8 MB por perfil.")}>{t("Histórico local do projeto")}</span>
      {saving && <small role="status">{t("Arquivando…")}</small>}
      {evicted > 0 && <small title={t("A retenção removeu {p0} registros antigos neste perfil.", { p0: evicted })}>{t("Retenção aplicada")}</small>}
    </div>
    {error && <div className="history-warning" role="alert">
      <span>{t("Não foi possível atualizar o histórico. A análise atual foi preservada.")}</span>
      <button disabled={saving} onClick={onRetry}><RefreshCw size={13} />{t("Tentar novamente")}</button>
      <details><summary>{t("Detalhes do histórico")}</summary><code>{error}</code></details>
    </div>}
    <div className="result-content">
      {entries.length ? entries.map(({ model, run }) => <button type="button" className="execution-row" key={run.run_id}
        data-testid="archive-entry" data-revision={run.model_revision} aria-expanded={selected === run.run_id}
        aria-label={t("Ver execução {p0}", { p0: run.run_id })}
        onClick={() => { setSelected(selected === run.run_id ? null : run.run_id); setShowModel(false); }}>
        <History size={14} /><span>{date(run.created_at)} · {model.title} · {t("{p0} achados", { p0: run.counts.failed })}</span>
        <code>{run.model_revision.slice(0, 8)}</code><small>{run.run_id === currentRunId ? t("Execução atual") : t("Arquivada")}</small>
      </button>) : <p className="dock-empty">{t("Nenhuma execução arquivada neste projeto.")}</p>}
      {entry && <article className="archived-evidence" aria-label={t("Evidência arquivada")}>
        <div className="archived-heading"><strong>{entry.model.title}</strong>
          <button onClick={() => download(JSON.stringify({ format: "nexo-run-evidence", version: 1, record: entry }, null, 2), `${entry.run.run_id}.nexo-evidence.json`)}>
            <Download size={13} />{t("Exportar evidência")}</button></div>
        <p>{t("Registro somente leitura. Não altera a análise atual nem o grafo.")}</p>
        <dl><dt>{t("Revisão")}</dt><dd><code>{entry.run.model_revision}</code></dd>
          <dt>{t("Motor")}</dt><dd>{entry.run.engine_version}</dd>
          <dt>{t("Data")}</dt><dd>{date(entry.run.created_at)}</dd></dl>
        {entry.run.checks.map(check => <details key={check.id} className={"archived-check " + check.status}>
          <summary>{t(check.title)} · {check.status === "passed" ? t("Consistente neste teste") : check.status === "failed" ? t("Investigar") : t("Inconclusivo")}</summary>
          <code>{check.rule_id} · v{check.rule_version}</code><p>{check.evidence}</p><p>{check.suggested_action}</p>
        </details>)}
        <details onToggle={event => setShowModel(event.currentTarget.open)}><summary>{t("Modelo da execução")}</summary>
          {showModel && <pre>{JSON.stringify(entry.model, null, 2)}</pre>}</details>
        <details><summary>{t("Limitações da execução")}</summary><ul>{entry.run.limitations.map((line, i) => <li key={i}>{line}</li>)}</ul></details>
      </article>}
    </div>
  </>;
}
