import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  FileUp,
  FlaskConical,
  Focus,
  GitBranch,
  Layers3,
  LoaderCircle,
  Network,
  Play,
  Search,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { engine } from "./engine";
import { GraphView } from "./GraphView";
import type {
  Check as VerificationCheck,
  Example,
  Kind,
  LoadedModel,
  Run,
} from "./types";

const KIND: Record<Kind, string> = {
  variable: "Variável",
  equation: "Equação",
  assumption: "Hipótese",
  requirement: "Requisito",
  observation: "Observação",
};
const STATUS = {
  passed: "Consistente neste teste",
  failed: "Investigar",
  inconclusive: "Inconclusivo",
};
const number = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value);

function StatusIcon({ status }: { status: VerificationCheck["status"] }) {
  return status === "passed" ? (
    <CheckCircle2 size={17} />
  ) : status === "failed" ? (
    <TriangleAlert size={17} />
  ) : (
    <CircleDot size={17} />
  );
}

export function App() {
  const [examples, setExamples] = useState<Example[]>([]);
  const [exampleId, setExampleId] = useState("complete");
  const [loaded, setLoaded] = useState<LoadedModel | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedCheck, setSelectedCheck] = useState<VerificationCheck | null>(
    null,
  );
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"graph" | "elements" | "checks">("graph");
  const [focus, setFocus] = useState<"all" | "findings">("all");
  const [search, setSearch] = useState("");
  const [fitToken, setFitToken] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([engine.examples(), engine.load("complete")])
      .then(([catalog, data]) => {
        if (alive) {
          setExamples(catalog);
          setLoaded(data);
        }
      })
      .catch((e) => {
        if (alive) setError(String(e.message ?? e));
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  function replaceModel(data: LoadedModel) {
    setLoaded(data);
    setRun(null);
    setSelected(null);
    setSelectedCheck(null);
    setFocus("all");
    setError(null);
  }

  async function changeExample(id: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await engine.load(id);
      replaceModel(data);
      setExampleId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    if (!loaded) return;
    setBusy(true);
    setError(null);
    try {
      const result = await engine.analyze(loaded.model);
      setRun(result);
      const first = result.checks.find((c) => c.status === "failed") ?? null;
      setSelectedCheck(first);
      setSelected(first?.node_ids[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (file.size > 240_000)
        throw new Error("O modelo deve ter no máximo 240 KB.");
      const data = await engine.import(JSON.parse(await file.text()));
      replaceModel(data);
      setExampleId("imported");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível importar o JSON.",
      );
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function exportModel() {
    if (!loaded) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(loaded.model, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${loaded.model.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function selectNode(id: string) {
    setSelected(id);
    setSelectedCheck(null);
  }
  function selectCheck(check: VerificationCheck) {
    setSelectedCheck(check);
    setSelected(check.node_ids[0] ?? null);
  }

  const nodes = loaded?.graph.nodes ?? [];
  const filtered = nodes.filter((n) =>
    `${n.label} ${n.id}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const current = nodes.find((n) => n.id === selected);
  const findings = run?.checks.filter((c) => c.status !== "passed") ?? [];
  const detailChecks = selectedCheck
    ? [selectedCheck]
    : (run?.checks.filter((c) => selected && c.node_ids.includes(selected)) ??
      []);
  const variable = loaded?.model.variables.find((v) => v.id === selected);
  const equation = loaded?.model.equations.find((eq) => eq.id === selected);
  const assumption = loaded?.model.assumptions.find((a) => a.id === selected);
  const observation = loaded?.model.observations.find((o) => o.id === selected);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("graph");
          }}
          aria-label="Nexo, início"
        >
          <span className="brand-symbol">
            <Network size={24} strokeWidth={1.8} />
          </span>
          <span>
            nexo<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">LABORATÓRIO DE CONHECIMENTO</div>
        <div className="project-card">
          <span className="project-icon">
            <FlaskConical size={18} />
          </span>
          <div>
            <strong>Projeto exploratório</strong>
            <small>Espaço de trabalho local</small>
          </div>
        </div>
        <div className="nav-caption">EXPLORAR</div>
        <nav aria-label="Navegação principal">
          <button
            className={tab === "graph" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("graph")}
          >
            <Network size={18} />
            Mapa de conhecimento
            <span className="nav-count">{nodes.length}</span>
          </button>
          <button
            className={tab === "elements" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("elements")}
          >
            <Layers3 size={18} />
            Elementos do modelo
          </button>
          <button
            className={tab === "checks" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("checks")}
          >
            <ShieldCheck size={18} />
            Verificações
            {run && <span className="nav-count">{run.checks.length}</span>}
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="nav-caption">CENÁRIO DE ESTUDO</div>
        <label className="scenario-label" htmlFor="scenario">
          Balanço térmico
        </label>
        <div className="select-wrap">
          <select
            id="scenario"
            value={exampleId}
            disabled={busy}
            onChange={(e) => void changeExample(e.target.value)}
          >
            {examples.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
            {exampleId === "imported" && (
              <option value="imported">Modelo importado</option>
            )}
          </select>
          <ChevronDown size={14} />
        </div>
        <p className="scenario-description">
          {examples.find((e) => e.id === exampleId)?.description ??
            "Modelo JSON selecionado no computador."}
        </p>
        <button
          className="import-button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          <FileUp size={16} />
          Importar modelo JSON
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          aria-label="Arquivo do modelo"
          onChange={(e) => void importFile(e.target.files?.[0])}
        />
        <div className="sidebar-bottom">
          <span className="local-dot" />
          Processamento local<div>Sessão em memória · exporte para salvar.</div>
          <span className="version">PROTÓTIPO · 0.1</span>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Espaço de trabalho <span>/</span> <strong>Investigação</strong>
          </div>
          <span className="prototype-badge">
            <FlaskConical size={13} /> Laboratório experimental
          </span>
        </header>
        <main>
          <section className="page-heading">
            <div>
              <div className="eyebrow">CONECTAR · VERIFICAR · INVESTIGAR</div>
              <h1>Do conhecimento à evidência.</h1>
              <p>
                Explore relações, verifique modelos e descubra o que precisa de
                investigação.
              </p>
            </div>
            <button
              className="primary-button"
              disabled={busy || !loaded}
              onClick={() => void analyze()}
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Play size={15} fill="currentColor" />
              )}{" "}
              {busy ? "Processando…" : "Executar verificação"}
            </button>
          </section>
          {error && (
            <div role="alert" className="error-banner">
              <TriangleAlert size={18} />
              <span>{error}</span>
              <button onClick={() => setError(null)} aria-label="Fechar erro">
                <X size={16} />
              </button>
            </div>
          )}

          <section className="stats-row" aria-label="Resumo do modelo">
            <div className="stat">
              <span className="stat-icon">
                <Layers3 size={18} />
              </span>
              <div>
                <span>Elementos conectados</span>
                <strong>
                  {nodes.length || "—"}
                  <small>no modelo atual</small>
                </strong>
              </div>
            </div>
            <div className="stat">
              <span className="stat-icon">
                <GitBranch size={18} />
              </span>
              <div>
                <span>Relações explícitas</span>
                <strong>
                  {loaded?.graph.edges.length ?? "—"}
                  <small>com significado definido</small>
                </strong>
              </div>
            </div>
            <div className={`stat ${run?.counts.failed ? "stat-warning" : ""}`}>
              <span className="stat-icon">
                <Activity size={18} />
              </span>
              <div>
                <span>Pontos para investigar</span>
                <strong>
                  <span data-testid="finding-count">
                    {run ? run.counts.failed : "—"}
                  </span>
                  <small>
                    {run
                      ? `${run.counts.inconclusive} inconclusivos`
                      : "execute uma verificação"}
                  </small>
                </strong>
              </div>
            </div>
          </section>

          <div className="investigation-layout">
            <section className="model-panel">
              <div className="model-toolbar">
                <div>
                  <span className="model-kicker">MODELO EM FOCO</span>
                  <h2>{loaded?.model.title ?? "Preparando o laboratório…"}</h2>
                </div>
                <button
                  className="icon-button"
                  disabled={!loaded}
                  onClick={exportModel}
                  title="Exportar modelo JSON"
                  aria-label="Exportar modelo JSON"
                >
                  <ArrowDownToLine size={17} />
                </button>
              </div>
              <div className="view-toolbar">
                <div
                  className="tabs"
                  role="tablist"
                  aria-label="Visualização do modelo"
                >
                  <button
                    role="tab"
                    aria-selected={tab === "graph"}
                    onClick={() => setTab("graph")}
                  >
                    <Network size={14} />
                    Grafo
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === "elements"}
                    onClick={() => setTab("elements")}
                  >
                    <Layers3 size={14} />
                    Elementos
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === "checks"}
                    onClick={() => setTab("checks")}
                  >
                    <ShieldCheck size={14} />
                    Verificações
                  </button>
                </div>
                {tab === "graph" && (
                  <button
                    className="fit-button"
                    onClick={() => setFitToken((t) => t + 1)}
                  >
                    <Focus size={15} />
                    Enquadrar
                  </button>
                )}
              </div>

              {tab === "graph" && (
                <div className="graph-area">
                  <div className="graph-overlay">
                    <span className="graph-label">
                      <span className="local-dot" />
                      Grafo de dependências
                    </span>
                    <div className="segmented">
                      <button
                        aria-pressed={focus === "all"}
                        onClick={() => setFocus("all")}
                      >
                        Todos
                      </button>
                      <button
                        aria-pressed={focus === "findings"}
                        disabled={!findings.length}
                        onClick={() => setFocus("findings")}
                      >
                        Investigar
                      </button>
                    </div>
                  </div>
                  {loaded && (
                    <GraphView
                      graph={loaded.graph}
                      run={run}
                      selected={selected}
                      focus={focus}
                      onSelect={selectNode}
                      fitToken={fitToken}
                    />
                  )}
                  <div className="graph-hint">
                    Selecione um elemento para explorar suas relações
                  </div>
                </div>
              )}

              {tab === "elements" && (
                <div className="elements-view">
                  <label className="search-field">
                    <Search size={16} />
                    <input
                      aria-label="Buscar elemento"
                      placeholder="Buscar variável, equação ou evidência…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <div className="element-list">
                    {filtered.map((node) => (
                      <button
                        key={node.id}
                        className={`element-row ${selected === node.id ? "selected" : ""}`}
                        onClick={() => selectNode(node.id)}
                      >
                        <span className={`kind-dot ${node.kind}`} />
                        <span>
                          <strong>{node.label}</strong>
                          <small>{node.id}</small>
                        </span>
                        <span className="kind-label">{KIND[node.kind]}</span>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                    {!filtered.length && (
                      <p className="empty-copy">
                        Nenhum elemento corresponde à busca.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {tab === "checks" && (
                <div className="checks-view">
                  {run ? (
                    <>
                      <div className="run-summary">
                        <span
                          className={`status-pill ${run.outcome === "consistent" ? "passed" : "inconclusive"}`}
                        >
                          {run.outcome === "consistent"
                            ? "Consistente nas regras executadas"
                            : "Há resultados para investigar"}
                        </span>
                        <p>
                          {run.counts.passed} verificações consistentes ·{" "}
                          {run.counts.failed} achados ·{" "}
                          {run.counts.inconclusive} inconclusivas
                        </p>
                      </div>
                      {run.checks.map((check) => (
                        <button
                          key={check.id}
                          className={`check-row ${check.status}`}
                          onClick={() => selectCheck(check)}
                        >
                          <StatusIcon status={check.status} />
                          <span>
                            <strong>{check.title}</strong>
                            <small>
                              {check.rule_id} · regra v{check.rule_version}
                            </small>
                          </span>
                          <span className="check-state">
                            {STATUS[check.status]}
                          </span>
                          <ArrowRight size={14} />
                        </button>
                      ))}
                    </>
                  ) : (
                    <div className="empty-state">
                      <ShieldCheck size={30} />
                      <h3>O que este modelo explica?</h3>
                      <p>
                        Execute a verificação para conferir entradas, unidades,
                        cobertura e comparação com a referência.
                      </p>
                      <button
                        className="text-button"
                        disabled={busy || !loaded}
                        onClick={() => void analyze()}
                      >
                        Verificar agora <ArrowRight size={15} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <footer className="graph-footer">
                <div className="legend">
                  {(
                    [
                      "variable",
                      "equation",
                      "assumption",
                      "requirement",
                      "observation",
                    ] as Kind[]
                  ).map((kind) => (
                    <span key={kind}>
                      <i className={`kind-dot ${kind}`} />
                      {KIND[kind]}
                    </span>
                  ))}
                </div>
                <span>{loaded?.graph.edges.length ?? 0} relações</span>
              </footer>
            </section>

            <aside
              className="details-panel"
              aria-label="Detalhes da investigação"
            >
              <div className="details-heading">
                <BookOpen size={17} />
                <h2>Caderno de investigação</h2>
              </div>
              {current || selectedCheck ? (
                <>
                  <div className="detail-title">
                    <span className="eyebrow">
                      {current ? KIND[current.kind] : "VERIFICAÇÃO"}
                    </span>
                    <h3>{selectedCheck?.title ?? current?.label}</h3>
                    {current && <code>{current.id}</code>}
                  </div>
                  {variable && (
                    <div className="property-block">
                      <span>QUANTIDADE</span>
                      <strong>
                        {run?.values[variable.id]
                          ? number(run.values[variable.id].value)
                          : variable.value != null
                            ? number(variable.value)
                            : "Sem valor disponível"}{" "}
                        <small>{variable.unit}</small>
                      </strong>
                      <p>
                        {variable.source ??
                          "Resultado derivado de uma equação do modelo."}
                      </p>
                    </div>
                  )}
                  {equation && (
                    <div className="property-block">
                      <span>RELAÇÃO DECLARADA</span>
                      <strong className="equation-text">
                        {equation.label}
                      </strong>
                      <p>{equation.source}</p>
                    </div>
                  )}
                  {assumption && (
                    <div className="property-block">
                      <span>JUSTIFICATIVA</span>
                      <p>{assumption.justification}</p>
                    </div>
                  )}
                  {observation && (
                    <div className="property-block">
                      <span>REFERÊNCIA</span>
                      <strong>
                        {number(observation.value)}{" "}
                        <small>{observation.unit}</small>
                      </strong>
                      <p>
                        Tolerância absoluta: {observation.tolerance}{" "}
                        {observation.unit}. {observation.source}
                      </p>
                    </div>
                  )}
                  {detailChecks.map((check) => (
                    <article
                      className={`finding-detail ${check.status}`}
                      key={check.id}
                    >
                      <div>
                        <StatusIcon status={check.status} />
                        <strong>{STATUS[check.status]}</strong>
                      </div>
                      <h4>{check.title}</h4>
                      <p>{check.evidence}</p>
                      <span className="detail-caption">PRÓXIMO PASSO</span>
                      <p>{check.suggested_action}</p>
                      <code>
                        {check.rule_id} · v{check.rule_version}
                      </code>
                    </article>
                  ))}
                  {!detailChecks.length && (
                    <p className="detail-note">
                      {run
                        ? "Nenhuma regra executada cita diretamente este elemento. Isso não comprova sua validade."
                        : "Execute uma verificação para investigar este elemento."}
                    </p>
                  )}
                </>
              ) : (
                <div className="detail-intro">
                  <div className="intro-symbol">
                    <FlaskConical size={29} strokeWidth={1.4} />
                  </div>
                  <h3>
                    Uma pergunta.
                    <br />
                    Múltiplas conexões.
                  </h3>
                  <p>
                    Selecione um elemento no grafo ou na lista para examinar
                    suas entradas, hipóteses e evidências.
                  </p>
                  <div className="intro-step">
                    <span>01</span>Explore o modelo
                  </div>
                  <div className="intro-step">
                    <span>02</span>Verifique as relações
                  </div>
                  <div className="intro-step">
                    <span>03</span>Investigue as lacunas
                  </div>
                </div>
              )}
              {run && !selectedCheck && findings.length > 0 && (
                <div className="findings-list">
                  <h4>Precisa de atenção</h4>
                  {findings.map((check) => (
                    <button key={check.id} onClick={() => selectCheck(check)}>
                      <StatusIcon status={check.status} />
                      {check.title}
                      <ArrowRight size={14} />
                    </button>
                  ))}
                </div>
              )}
              <div className="scope-note">
                <ShieldCheck size={17} />
                <div>
                  <strong>Conhecimento com contexto</strong>
                  <p>
                    Um achado é um convite à investigação. As verificações não
                    provam que o modelo está completo.
                  </p>
                </div>
              </div>
            </aside>
          </div>
          <footer className="page-footer">
            <span>
              <Check size={13} /> Dados sintéticos · modelo educacional
            </span>
            <span>
              {run
                ? `Motor ${run.engine_version} · revisão ${run.model_revision.slice(0, 10)}`
                : "Sem execução nesta revisão"}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
