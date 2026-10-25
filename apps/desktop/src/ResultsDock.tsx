import { useI18n } from "./i18n";
import { RunHistory } from "./RunHistory";
import type { HistoryEntry } from "./history";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  FileCheck2,
  History,
  Square,
  Terminal,
  TriangleAlert,
  X,
} from "lucide-react";
import type { Check, Run } from "./types";
import type { MessageValues } from "./i18n";

export interface ExecutionLogEntry {
  id: string;
  timestamp: string;
  level: "info" | "step" | "success" | "warn" | "error";
  message: string;
  values?: MessageValues;
  nodeId?: string;
}

export function ResultsDock({
  run,
  historyEntries,
  historyError,
  historySaving,
  historyEvicted,
  onRetryHistory,
  expanded,
  onExpand,
  onClose,
  height,
  onHeight,
  onSelect,
  activeTab = "terminal",
  onTabChange,
  executionLogs = [],
  executionProgress = 0,
  executingStepDescription = "",
  busy = false,
  onCancelExecution,
  onSelectNode,
}: {
  run: Run | null;
  historyEntries: HistoryEntry[];
  historyError: string | null;
  historySaving: boolean;
  historyEvicted: number;
  onRetryHistory: () => void;
  expanded: boolean;
  onExpand: (value: boolean) => void;
  onClose: () => void;
  height: number;
  onHeight: (height: number) => void;
  onSelect: (check: Check) => void;
  activeTab?: "terminal" | "checks" | "runs";
  onTabChange?: (tab: "terminal" | "checks" | "runs") => void;
  executionLogs?: ExecutionLogEntry[];
  executionProgress?: number;
  executingStepDescription?: string;
  busy?: boolean;
  onCancelExecution?: () => void;
  onSelectNode?: (nodeId: string) => void;
}) {
  const { t, language, locale, number: formatNumber, date: formatDate } = useI18n();
  const [internalTab, setInternalTab] = useState<"terminal" | "checks" | "runs">(activeTab);
  const tab = onTabChange ? activeTab : internalTab;
  const setTab = (nextTab: "terminal" | "checks" | "runs") => {
    if (onTabChange) onTabChange(nextTab);
    else setInternalTab(nextTab);
  };

  const [filter, setFilter] = useState<"all" | "failed" | "inconclusive">("all");
  const drag = useRef<{ y: number; height: number } | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const resize = (value: number) =>
    onHeight(Math.max(140, Math.min(window.innerHeight * 0.85, value)));

  const checks =
    run?.checks.filter(
      (check) => filter === "all" || check.status === filter,
    ) ?? [];

  useEffect(() => {
    if (tab === "terminal") {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [executionLogs, tab]);

  return (
    <section
      className={"results-dock" + (expanded ? " expanded" : "")}
      aria-label={t("Painel de resultados e execução")}
      style={expanded ? { height } : undefined}
    >
      {expanded && (
        <div
          className="results-splitter"
          role="separator"
          aria-label={t("Altura dos resultados")}
          aria-orientation="horizontal"
          aria-valuenow={height}
          aria-valuemin={140}
          aria-valuemax={Math.round(window.innerHeight * 0.85)}
          tabIndex={0}
          onPointerDown={(event) => {
            drag.current = { y: event.clientY, height };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (drag.current)
              resize(drag.current.height + drag.current.y - event.clientY);
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              resize(height + (event.key === "ArrowUp" ? 16 : -16));
            }
          }}
        />
      )}
      <div className="results-heading">
        <div role="tablist" aria-label={t("Resultados, console e execuções")}>
          <button
            role="tab"
            aria-label={t("Console de Execução")}
            aria-selected={tab === "terminal"}
            onClick={() => {
              setTab("terminal");
              onExpand(true);
            }}
          >
            <Terminal size={15} />{t("Console")}{busy && <span className="busy-pulse-dot" />}
          </button>
          <button
            role="tab"
            aria-label={t("Resultados")}
            aria-selected={tab === "checks"}
            onClick={() => {
              setTab("checks");
              onExpand(true);
            }}
          >
            <FileCheck2 size={15} />{t("Resultados")}{" "}
            <span
              className={
                run?.counts.failed ? "count-badge warning" : "count-badge"
              }
              data-testid="finding-count"
            >
              {run ? run.counts.failed : "—"}
            </span>
          </button>
          <button
            role="tab"
            aria-label={t("Histórico de Execuções")}
            aria-selected={tab === "runs"}
            onClick={() => {
              setTab("runs");
              onExpand(true);
            }}
          >
            <History size={15} />{t("Histórico ")}{historyError && <TriangleAlert size={12} aria-label={t("Histórico não salvo")} className="history-error-icon" />}<span className="run-count">{historyEntries.length || ""}</span>
          </button>
        </div>
        <div>
          <button
            aria-label={
              expanded ? t("Recolher resultados") : t("Expandir resultados")
            }
            onClick={() => onExpand(!expanded)}
          >
            {expanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
          <button aria-label={t("Fechar resultados")} onClick={onClose}>
            <X size={15} />
          </button>
        </div>
      </div>
      {expanded && (
        <>
          {tab === "terminal" && (
            <div className="terminal-dock-container">
              {(busy || run || executingStepDescription) && (
                <div className="terminal-header-bar">
                  <div className="terminal-progress-area">
                    <div className="terminal-step-info">
                      <span className="step-label">
                        {busy ? (
                          <span className="step-spinner spin" />
                        ) : run ? (
                          <CheckCircle2 size={13} className="success-icon" />
                        ) : (
                          <Terminal size={13} />
                        )}
                        <strong>
                          {executingStepDescription ||
                            (busy
                              ? "Verificando modelo…"
                              : run
                                ? "Verificação concluída."
                                : "")}
                        </strong>
                      </span>
                      {!busy && run && (
                        <span className="progress-percentage">
                          {Math.round(executionProgress)}%
                        </span>
                      )}
                    </div>
                    {(busy || run) && (
                      <div
                        className="progress-track"
                        role="progressbar"
                        aria-label={busy ? t("Verificando modelo") : t("Verificação concluída")}
                        aria-valuenow={busy ? undefined : Math.round(executionProgress)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className={"progress-fill" + (busy ? " busy-animated" : "")}
                          style={{ width: busy ? "100%" : `${Math.max(0, Math.min(100, executionProgress))}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="terminal-header-actions">
                    {busy ? (
                      <button
                        type="button"
                        className="terminal-cancel-btn"
                        onClick={onCancelExecution}
                        title={t("Descartar resultado; o motor nativo será liberado ao terminar")}
                      >
                        <Square size={12} fill="currentColor" />
                        <span>{t("Cancelar")}</span>
                        <kbd>Esc</kbd>
                      </button>
                    ) : run ? (
                      <button
                        type="button"
                        className="terminal-view-checks-btn"
                        onClick={() => setTab("checks")}
                      >
                        <span>{t("Ver Verificações")}</span>
                        <ArrowRight size={13} />
                      </button>
                    ) : null}
                  </div>
                </div>
              )}

              <div className="terminal-body" role="log" aria-live="polite">
                {executionLogs.length === 0 ? (
                  <div className="terminal-empty">
                    <p>{t("Pressione ")}<strong>{t("F5")}</strong>{t(" ou clique em ")}<strong>{t("Executar")}</strong>{t(" para iniciar a validação dos nós em cadeia.")}</p>
                  </div>
                ) : (
                  <div className="terminal-lines">
                    {executionLogs.map((entry) => (
                      <div key={entry.id} className={"terminal-line " + entry.level}>
                        <span className="log-time">[{/^\d{4}-/.test(entry.timestamp) ? new Date(entry.timestamp).toLocaleTimeString(locale, { hourCycle: "h23" }) : entry.timestamp}]</span>
                        <span className={"log-tag " + entry.level}>
                          {entry.level === "step"
                            ? t("[EXECUTANDO]")
                            : entry.level === "success"
                              ? t("[SUCESSO]")
                              : entry.level === "warn"
                                ? t("[AVISO]")
                                : entry.level === "error"
                                  ? t("[ERRO]")
                                  : t("[INFO]")}
                        </span>
                        <span className="log-msg">
                          {t(entry.message, entry.values?.rule
                            ? { ...entry.values, title: t(String(entry.values.title)) }
                            : entry.values)}
                          {entry.nodeId && (
                            <button
                              type="button"
                              className="log-node-link"
                              onClick={() => onSelectNode?.(entry.nodeId!)}
                              title={t("Inspecionar nó {p0}", {p0: entry.nodeId})}
                            >
                              <code>{entry.nodeId}</code>
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                    {busy && (
                      <div className="terminal-cursor-line">
                        <span className="terminal-cursor">█</span>
                      </div>
                    )}
                    <div ref={terminalEndRef} />
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "checks" && (
            <>
              <div className="result-filterbar">
                <div role="group" aria-label={t("Filtrar resultados")}>
                  {(["all", "failed", "inconclusive"] as const).map((value) => (
                    <button
                      key={value}
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                    >
                      {value === "all"
                        ? t("Todos")
                        : value === "failed"
                          ? t("Achados")
                          : t("Inconclusivos")}
                    </button>
                  ))}
                </div>
                <span>
                  {run
                    ? t("{passed} consistentes · {inconclusive} inconclusivos", { passed: run.counts.passed, inconclusive: run.counts.inconclusive })
                    : t("Sem verificação")}
                </span>
              </div>
              <div className="result-content">
                {run ? (
                  checks.length ? (
                    checks.map((check) => (
                      <button
                        className={"result-row " + check.status}
                        key={check.id}
                        onClick={() => onSelect(check)}
                      >
                        {check.status === "passed" ? (
                          <CheckCircle2 size={15} />
                        ) : check.status === "failed" ? (
                          <TriangleAlert size={15} />
                        ) : (
                          <CircleDot size={15} />
                        )}
                        <span>{t(check.title)}</span>
                        <code>
                          {check.rule_id} · v{check.rule_version}
                        </code>
                        <small>
                          {check.status === "passed"
                            ? t("Consistente neste teste")
                            : check.status === "failed"
                              ? t("Investigar")
                              : t("Inconclusivo")}
                        </small>
                      </button>
                    ))
                  ) : (
                    <p className="dock-empty">{t("Nenhum resultado neste filtro.")}</p>
                  )
                ) : (
                  <p className="dock-empty">{t("Execute uma verificação para investigar o modelo.")}</p>
                )}
              </div>
            </>
          )}

          {tab === "runs" && <RunHistory entries={historyEntries} currentRunId={run?.run_id}
            error={historyError} saving={historySaving} evicted={historyEvicted} onRetry={onRetryHistory} />}
        </>
      )}
    </section>
  );
}
