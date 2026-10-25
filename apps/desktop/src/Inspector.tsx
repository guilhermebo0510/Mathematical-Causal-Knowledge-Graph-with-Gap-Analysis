import { useI18n } from "./i18n";
import { useState } from "react";
// Model editing is transactional: fields change the scientific model on Apply.
import {
  ChevronDown,
  ChevronRight,
  Crosshair,
  Database,
  FileText,
  FunctionSquare,
  Info,
  Layers,
  Link2,
  Move,
  Save,
  ShieldCheck,
  Sigma,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import type { Check, GraphNode, Model, Run } from "./types";
import {
  projectGraph,
  resolveConnection,
  RELATION_LABELS,
  type NodeUpdatePatch,
  type RelationType,
} from "./modelMutator";
import { formatExpr } from "./expression";
const LABELS = {
  variable: "Variável",
  equation: "Equação",
  assumption: "Hipótese",
  requirement: "Requisito",
  observation: "Referência",
};
const ICONS = {
  variable: Sigma,
  equation: FunctionSquare,
  assumption: FileText,
  requirement: ShieldCheck,
  observation: Database,
};
function NodeEditor({
  model,
  node,
  onApply,
  busy,
}: {
  model: Model;
  node: GraphNode;
  onApply: (id: string, patch: NodeUpdatePatch) => boolean;
  busy: boolean;
}) {
  const { t, language, locale, number: formatNumber, date: formatDate } = useI18n();
  const num = formatNumber;
  const variable = model.variables.find((v) => v.id === node.id),
    equation = model.equations.find((v) => v.id === node.id),
    assumption = model.assumptions.find((v) => v.id === node.id),
    requirement = model.requirements.find((v) => v.id === node.id),
    observation = model.observations.find((v) => v.id === node.id);
  const derived =
    variable && model.equations.some((e) => e.lhs === variable.id);
  const initial = {
    label: node.label,
    unit: variable?.unit ?? observation?.unit ?? "1",
    value: String(variable?.value ?? observation?.value ?? ""),
    source:
      variable?.source ??
      equation?.source ??
      observation?.source ??
      "Fonte ainda não informada.",
    expression: equation ? formatExpr(equation.rhs) : "",
    lhs: equation?.lhs ?? "",
    justification: assumption?.justification ?? "",
    equation_id: requirement?.equation_id ?? "",
    exclusion_reason: requirement?.exclusion_reason ?? "",
    variable_id: observation?.variable_id ?? "",
    tolerance: String(observation?.tolerance ?? 0),
  };
  const [draft, setDraft] = useState(initial),
    [changed, setChanged] = useState(false);
  const update = (key: keyof typeof draft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setChanged(true);
  };
  const field = (
    key: keyof typeof draft,
    label: string,
    opts: { type?: string; disabled?: boolean; multiline?: boolean } = {},
  ) => (
    <label className="editor-field">
      <span>{t(label)}</span>
      {opts.multiline ? (
        <textarea
          aria-label={t(label)}
          rows={3}
          value={draft[key]}
          onChange={(e) => update(key, e.target.value)}
          maxLength={key === "expression" ? 4000 : 300}
        />
      ) : (
        <input
          aria-label={t(label)}
          type={opts.type ?? "text"}
          step="any"
          disabled={opts.disabled}
          value={draft[key]}
          onChange={(e) => update(key, e.target.value)}
          maxLength={key === "unit" ? 64 : 300}
        />
      )}
    </label>
  );
  function apply(event: React.FormEvent) {
    event.preventDefault();
    const patch: NodeUpdatePatch = {};
    for (const key of [
      "label",
      "unit",
      "source",
      "justification",
      "lhs",
      "equation_id",
      "variable_id",
      "expression",
    ] as const)
      if (draft[key] !== initial[key])
        Object.assign(patch, { [key]: draft[key] });
    if (draft.value !== initial.value)
      patch.value =
        draft.value === "" ? (variable ? null : NaN) : Number(draft.value);
    if (draft.tolerance !== initial.tolerance)
      patch.tolerance = draft.tolerance === "" ? NaN : Number(draft.tolerance);
    if (draft.exclusion_reason !== initial.exclusion_reason)
      patch.exclusion_reason = draft.exclusion_reason || null;
    if (onApply(node.id, patch)) setChanged(false);
  }
  return (
    <form className="node-editor" onSubmit={apply}>
      <fieldset disabled={busy}>
        {field("label", "Rótulo")}
        {(variable || observation) && (
          <div className="editor-pair">
            {field("value", derived ? "Valor calculado" : "Valor", {
              type: "number",
              disabled: !!derived,
            })}
            {field("unit", "Unidade")}
          </div>
        )}
        {variable && (
          <small className="field-help">
            {derived
              ? t("Calculada pela equação produtora. Execute para atualizar.")
              : t("Valor vazio = quantidade ainda não informada. Unidade 1 = adimensional.")}
          </small>
        )}
        {equation && (
          <>
            <label className="editor-field">
              <span>{t("Saída calculada")}</span>
              <select
                aria-label={t("Saída calculada")}
                value={draft.lhs}
                onChange={(e) => update("lhs", e.target.value)}
              >
                <option value="unconnected_output">{t("Selecione uma variável derivada…")}</option>
                {model.variables
                  .filter((v) => v.value === null)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.id} · {v.label}
                    </option>
                  ))}
              </select>
            </label>
            {field("expression", "Expressão", { multiline: true })}
            <small className="field-help">{t("Identificadores, +, −, * e parênteses. Ex.: U * A * dT. A expressão define a operação.")}</small>
          </>
        )}
        {assumption &&
          field("justification", "Justificativa", { multiline: true })}
        {requirement && (
          <>
            <label className="editor-field">
              <span>{t("Equação exigida")}</span>
              <select
                aria-label={t("Equação exigida")}
                value={draft.equation_id}
                onChange={(e) => update("equation_id", e.target.value)}
              >
                <option value="unconnected_equation">{t("Selecione…")}</option>
                {model.equations.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id} · {e.label}
                  </option>
                ))}
              </select>
            </label>
            {field("exclusion_reason", "Justificativa de exclusão", {
              multiline: true,
            })}
          </>
        )}
        {observation && (
          <>
            <label className="editor-field">
              <span>{t("Quantidade observada")}</span>
              <select
                aria-label={t("Quantidade observada")}
                value={draft.variable_id}
                onChange={(e) => update("variable_id", e.target.value)}
              >
                <option value="unconnected_variable">{t("Selecione…")}</option>
                {model.variables.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id} · {v.label}
                  </option>
                ))}
              </select>
            </label>
            {field("tolerance", "Tolerância absoluta", { type: "number" })}
          </>
        )}
        {(variable || equation || observation) &&
          field("source", "Fonte / procedência", { multiline: true })}
        <button className="apply-properties" type="submit" disabled={!changed}>
          <Save size={14} />{t("Aplicar alterações")}</button>
        {changed && (
          <small className="field-help">{t("Alterações neste formulário ainda não aplicadas ao modelo.")}</small>
        )}
      </fieldset>
    </form>
  );
}
export function Inspector({
  model,
  run,
  node,
  check,
  onClose,
  onLocate,
  onUpdateNode,
  onDisconnectEdge,
  onConnectNodes,
  onDeleteNode,
  onCollapse,
  busy = false,
  selectedNodes,
  onDeleteNodes,
  onClearSelection,
}: {
  model: Model | null;
  run: Run | null;
  node: GraphNode | undefined;
  check: Check | null;
  onClose: () => void;
  onLocate: (id?: string) => void;
  onUpdateNode: (id: string, patch: NodeUpdatePatch) => boolean;
  onDisconnectEdge: (edge: {
    source: string;
    target: string;
    relation: string;
  }) => void;
  onConnectNodes: (
    from: string,
    to: string,
    fromPort?: number,
    toPort?: number,
    relation?: RelationType,
  ) => void;
  onDeleteNode: (id: string) => void;
  onCollapse?: () => void;
  busy?: boolean;
  selectedNodes?: string[];
  onDeleteNodes?: (ids: string[]) => void;
  onClearSelection?: () => void;
}) {
  const { t, language, locale, number: formatNumber, date: formatDate } = useI18n();
  const num = formatNumber;
  const [collapsed, setCollapsed] = useState(false),
    [candidate, setCandidate] = useState(""),
    [relation, setRelation] = useState<RelationType>("INPUT_TO");
  const graph = model ? projectGraph(model) : { nodes: [], edges: [] };
  const incident = graph.edges.filter(
    (e) => e.source === node?.id || e.target === node?.id,
  );
  const related = check
    ? [check]
    : (run?.checks.filter((c) => c.node_ids.includes(node?.id ?? "")) ?? []);
  const variable = model?.variables.find((v) => v.id === node?.id),
    equation = model?.equations.find((v) => v.id === node?.id),
    observation = model?.observations.find((v) => v.id === node?.id);
  const quantity = node && run?.values[node.id],
    failed = related.some((c) => c.status === "failed"),
    inconclusive = related.some((c) => c.status === "inconclusive");
  const Icon = node ? ICONS[node.kind] : Info;
  const entity =
    variable ??
    equation ??
    observation ??
    model?.assumptions.find((a) => a.id === node?.id) ??
    model?.requirements.find((r) => r.id === node?.id);
  const relations: RelationType[] =
    node?.kind === "variable"
      ? ["INPUT_TO", "PRODUCES", "VALIDATED_BY"]
      : node?.kind === "equation"
        ? ["INPUT_TO", "PRODUCES", "ASSUMPTION_FOR", "REQUIRES"]
        : node?.kind === "assumption"
          ? ["ASSUMPTION_FOR"]
          : node?.kind === "requirement"
            ? ["REQUIRES"]
            : ["VALIDATED_BY"];
  const chosen = relations.includes(relation) ? relation : relations[0];
  const candidates =
    model && node
      ? graph.nodes.filter(
          (n) =>
            n.id !== node.id &&
            resolveConnection(
              model,
              node.id,
              n.id,
              undefined,
              undefined,
              chosen,
            ).ok,
        )
      : [];
  return (
    <aside className="properties-panel" aria-label={t("Detalhes da investigação")}>
      <div className="pane-heading">
        <h2>
          <Info size={14} />{t("Propriedades")}</h2>
        <div>
          <button
            aria-label={t("Ocultar propriedades para a direita")}
            title={t("Recolher painel para a direita")}
            onClick={onCollapse ?? (() => setCollapsed(!collapsed))}
          >
            <ChevronRight size={15} />
          </button>
          <button aria-label={t("Fechar propriedades")} onClick={onClose}>
            <X size={15} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="property-content">
          {selectedNodes && selectedNodes.length > 1 ? (
            <div className="multi-selection-inspector" data-testid="multi-selection-inspector">
              <div className="multi-selection-header">
                <span className="multi-selection-badge">
                  <Layers size={18} />
                </span>
                <div>
                  <strong>{selectedNodes.length}{t(" elementos selecionados")}</strong>
                  <code>{t("Seleção múltipla ativa")}</code>
                </div>
              </div>

              <div className="multi-breakdown">
                <div className="multi-breakdown-title">{t("Composição da seleção:")}</div>
                <div className="multi-breakdown-tags">
                  {(() => {
                    const counts: Record<string, number> = {};
                    for (const id of selectedNodes) {
                      const n = graph.nodes.find((item) => item.id === id);
                      const kind = n?.kind ?? "variable";
                      counts[kind] = (counts[kind] ?? 0) + 1;
                    }
                    return Object.entries(counts).map(([kind, count]) => {
                      const KindIcon = ICONS[kind as keyof typeof ICONS] ?? Info;
                      return (
                        <span key={kind} className={"multi-tag " + kind}>
                          <KindIcon size={12} />
                          {count} {t(LABELS[kind as keyof typeof LABELS] ?? kind)}{count > 1 ? t("s") : ""}
                        </span>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="multi-chips-list">
                <div className="multi-chips-title">{t("Elementos:")}</div>
                <div className="multi-chips-grid">
                  {selectedNodes.map((id) => {
                    const n = graph.nodes.find((item) => item.id === id);
                    return (
                      <div key={id} className={"multi-chip " + (n?.kind ?? "variable")}>
                        <span className={"kind-dot " + (n?.kind ?? "variable")} />
                        <span className="multi-chip-label">{n?.label ?? id}</span>
                        <code>{id}</code>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="multi-hint-banner">
                <Move size={14} />
                <span>{t("Arraste qualquer nó selecionado no canvas para mover todos em bloco.")}</span>
              </div>

              <div className="multi-actions-panel">
                <button
                  type="button"
                  className="multi-btn danger"
                  onClick={() => onDeleteNodes?.(selectedNodes)}
                  disabled={busy}
                >
                  <Trash2 size={14} />
                  <span>{t("Excluir elementos selecionados")}</span>
                  <kbd>Del</kbd>
                </button>
                <button
                  type="button"
                  className="multi-btn secondary"
                  onClick={() => onLocate()}
                >
                  <Crosshair size={14} />
                  <span>{t("Enquadrar seleção")}</span>
                  <kbd>F</kbd>
                </button>
                <button
                  type="button"
                  className="multi-btn tertiary"
                  onClick={() => onClearSelection?.()}
                >
                  <X size={14} />
                  <span>{t("Limpar seleção")}</span>
                  <kbd>Esc</kbd>
                </button>
              </div>
            </div>
          ) : node && model ? (
            <>
              <div className="inspector-identity">
                <span className={"node-type-icon " + node.kind}>
                  <Icon size={21} />
                </span>
                <div>
                  <strong>{node.label}</strong>
                  <code>
                    {node.id} · {t(LABELS[node.kind])}
                  </code>
                </div>
                <button
                  aria-label={t("Localizar no grafo")}
                  title={t("Enquadrar elemento")}
                  onClick={() => onLocate()}
                >
                  <Crosshair size={16} />
                </button>
              </div>
              <div
                className={
                  "validation-state " +
                  (failed ? "failed" : inconclusive ? "inconclusive" : "")
                }
              >
                <ShieldCheck size={14} />
                {!run
                  ? t("Não verificado")
                  : failed
                    ? t("Requer investigação")
                    : inconclusive
                      ? t("Verificação inconclusiva")
                      : related.length
                        ? t("Consistente nos testes aplicados")
                        : t("Sem regra aplicável")}
              </div>
              {quantity && (
                <div className="inspector-value">
                  <strong>{num(quantity.value)}</strong>
                  <span>{quantity.unit}</span>
                  <small>
                    {quantity.origin === "derived"
                      ? t("Calculado nesta revisão")
                      : t("Valor nesta revisão")}
                  </small>
                </div>
              )}
              {equation && (
                <div className="expression-preview">
                  <code>
                    {equation.lhs} = {formatExpr(equation.rhs)}
                  </code>
                </div>
              )}
              <details className="property-section" open>
                <summary>
                  <Icon size={15} />{t("Definição")}</summary>
                <NodeEditor
                  key={node.id + JSON.stringify(entity)}
                  model={model}
                  node={node}
                  onApply={onUpdateNode}
                  busy={busy}
                />
              </details>
              <details className="property-section" open>
                <summary>
                  <Link2 size={15} />{t("Dependências")}{" "}
                  <span className="count-badge">{incident.length}</span>
                </summary>
                <div className="connections-list">
                  {incident.length ? (
                    incident.map((e) => {
                      const outgoing = e.source === node.id,
                        partner = outgoing ? e.target : e.source;
                      return (
                        <div className="connection-row" key={e.id}>
                          <button
                            className="connection-partner"
                            title={
                              graph.nodes.find((n) => n.id === partner)?.label
                            }
                            onClick={() => onLocate(partner)}
                          >
                            <span>
                              {outgoing ? "→" : "←"} {partner}
                            </span>
                            <small>
                              {t(RELATION_LABELS[e.relation as RelationType])}
                            </small>
                          </button>
                          <button
                            disabled={busy}
                            aria-label={t("Desconectar {p0} de {p1}", {p0: e.source, p1: e.target})}
                            title={t("Desconectar ligação")}
                            onClick={() => onDisconnectEdge(e)}
                          >
                            <Unlink size={14} />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="empty-connections">{t("Sem ligações.")}</p>
                  )}
                </div>
                <details className="connect-details">
                  <summary>{t("Adicionar ligação")}</summary>
                  <fieldset disabled={busy}>
                    <select
                      aria-label={t("Tipo de ligação")}
                      value={chosen}
                      onChange={(e) => {
                        setRelation(e.target.value as RelationType);
                        setCandidate("");
                      }}
                    >
                      {relations.map((r) => (
                        <option key={r} value={r}>
                          {t(RELATION_LABELS[r])}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={t("Selecionar elemento para conexão")}
                      value={candidate}
                      onChange={(e) => setCandidate(e.target.value)}
                    >
                      <option value="">{t("Selecione…")}</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.id} · {c.label}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={!candidate}
                      onClick={() => {
                        onConnectNodes(
                          node.id,
                          candidate,
                          undefined,
                          undefined,
                          chosen,
                        );
                        setCandidate("");
                      }}
                    >
                      <Link2 size={14} />{t("Conectar")}</button>
                  </fieldset>
                </details>
              </details>
              <button
                className="delete-node-button"
                disabled={busy}
                onClick={() => onDeleteNode(node.id)}
              >
                <Trash2 size={14} />{t("Excluir elemento")}</button>
            </>
          ) : (
            !check && (
              <div className="project-summary">
                <FileText size={28} />
                <h3>{t("Resumo do modelo")}</h3>
                <p>{t("Selecione um nó para definir dados, expressão, fonte e dependências.")}</p>
                <dl className="context-table">
                  <div>
                    <dt>{t("Quantidades")}</dt>
                    <dd>{model?.variables.length ?? 0}</dd>
                  </div>
                  <div>
                    <dt>{t("Equações")}</dt>
                    <dd>{model?.equations.length ?? 0}</dd>
                  </div>
                  <div>
                    <dt>{t("Referências")}</dt>
                    <dd>{model?.observations.length ?? 0}</dd>
                  </div>
                </dl>
              </div>
            )
          )}
          {related.length > 0 && (
            <details className="property-section" open>
              <summary>
                <ShieldCheck size={15} />{t("Evidências ")}<span className="count-badge">{related.length}</span>
              </summary>
              {related.map((c) => (
                <article key={c.id} className={"evidence-check " + c.status}>
                  <strong>{t(c.title)}</strong>
                  <p>{c.evidence}</p>
                  <details>
                    <summary>{t("Critério e próximo passo")}</summary>
                    <p>{c.suggested_action}</p>
                    <code>
                      {c.rule_id} · v{c.rule_version}
                    </code>
                  </details>
                </article>
              ))}
            </details>
          )}
          {observation && (
            <small className="field-help">{t("A comparação usa a unidade e a tolerância da referência. Conversões e resíduos são calculados pelo motor científico.")}</small>
          )}
          <small className="inspector-revision">
            {run
              ? t("Revisão {p0}", {p0: run.model_revision.slice(0, 8)})
              : ""}
          </small>
        </div>
      )}
    </aside>
  );
}
