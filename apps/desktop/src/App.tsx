import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {ModulesPanel} from "./ModulesPanel";
import {GroupsPanel} from "./GroupsPanel";
import {groupContext,type ModuleTemplate,type ModelGroup} from "./modules";
import {boundedRevisions,emptyRevisions,revisionEvent,type RevisionHistory} from "./revisionHistory";
import {RevisionHistoryView} from "./RevisionHistoryView";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Hand,
  MousePointer2,
  Map,
  FolderOpen,
  ArrowDownToLine,
  ArrowRight,
  ArrowLeft,
  FileUp,
  Focus,
  Layers3,
  LoaderCircle,
  Network,
  Search,
  ShieldCheck,
  TriangleAlert,
  X,
  Save,
  FilePlus2,
  Undo2,
  Redo2,
  CircleHelp,
  HardDrive,
  Pencil,
  Play,
  Plus,
  Sigma,
  FunctionSquare,
  FileText,
  Database,
  CheckCircle2,
  Clock,
  Info,
  LayoutGrid,
  List,
  Settings,
  Trash2,
  Sliders,
  Palette,
  Monitor,
  Cpu,
  BookOpen,
  Sparkles,
  Layers,
  Scissors,
  Copy,
  ClipboardPaste,
  Keyboard,
  Bug,
  RefreshCw,
  CheckSquare,
} from "lucide-react";
import { engine } from "./engine";
import { isTauri } from "@tauri-apps/api/core";
import { applyAppearance, readPreferences, savePreferences } from "./preferences";
import { SettingsPanel } from "./SettingsPanel";
import { useRecovery } from "./useRecovery";
import { useRunHistory } from "./useRunHistory";
import { I18nProvider, useI18n, type MessageValues } from "./i18n";
import type { Preferences } from "./preferences";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { GraphView, type GraphHandle } from "./GraphView";
import { Inspector } from "./Inspector";
import { ResultsDock, type ExecutionLogEntry } from "./ResultsDock";
import {
  download,
  parseProject,
  projectFiles,
  serializeProject,
  type ViewState,
} from "./project";
import {
  connectNodes,
  createNodeInModel,
  createConfiguredNode,
  deleteNodeFromModel,
  disconnectEdge,
  updateNodeInModel,
  projectGraph,
  type NodeUpdatePatch,
  type RelationType,
} from "./modelMutator";
import { formatExpr } from "./expression";
import { ProposalReview } from "./ProposalReview";
import { NativeCancellationError } from "./engine";
import type {
  Check as VerificationCheck,
  Example,
  Kind,
  LoadedModel,
  Run,
  Model,
  Graph,
  GraphNode,
} from "./types";

const KIND: Record<Kind, string> = {
  variable: "Variável",
  equation: "Equação",
  assumption: "Hipótese",
  requirement: "Requisito",
  observation: "Observação",
};
const KIND_PLURAL: Record<Kind, string> = {
  variable: "Variáveis",
  equation: "Equações",
  assumption: "Hipóteses",
  requirement: "Requisitos",
  observation: "Observações",
};
const KIND_ICONS: Record<Kind, React.ComponentType<{ size?: number; className?: string }>> = {
  variable: Sigma,
  equation: FunctionSquare,
  assumption: FileText,
  requirement: ShieldCheck,
  observation: Database,
};
// StrictMode replays mount effects. Share bootstrap requests, and never replace
// a live edited model when Fast Refresh reruns the initialization effect.
let initialRequest: Promise<[Example[], LoadedModel]> | null = null;
function loadInitialModel() {
  return (initialRequest ??= Promise.all([
    engine.examples(),
    engine.load("complete"),
  ]).catch((error) => {
    initialRequest = null;
    throw error;
  }));
}
function Splitter({
  label,
  value,
  onChange,
  reverse = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  reverse?: boolean;
}) {
  const { t, language, locale, number: formatNumber, date: formatDate } = useI18n();
  const start = useRef<{ x: number; value: number } | null>(null);
  const update = (value: number) =>
    onChange(Math.max(180, Math.min(420, value)));
  return (
    <div
      className="panel-splitter"
      role="separator"
      aria-label={t(label)}
      aria-orientation="vertical"
      aria-valuenow={value}
      aria-valuemin={180}
      aria-valuemax={420}
      tabIndex={0}
      onPointerDown={(event) => {
        start.current = { x: event.clientX, value };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (start.current)
          update(
            start.current.value +
              (event.clientX - start.current.x) * (reverse ? -1 : 1),
          );
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onLostPointerCapture={() => {
        start.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          update(
            value +
              (event.key === "ArrowRight" ? 16 : -16) * (reverse ? -1 : 1),
          );
        }
      }}
    />
  );
}

export function App() {
  const [preferences, setPreferences] = useState(readPreferences);
  return <I18nProvider language={preferences.language}>
    <Workspace appSettings={preferences} setAppSettings={setPreferences} />
  </I18nProvider>;
}

function Workspace({ appSettings, setAppSettings }: {
  appSettings: Preferences; setAppSettings: (value: Preferences) => void;
}) {
  const { t, language, locale, number: formatNumber, date: formatDate } = useI18n();
  const [examples, setExamples] = useState<Example[]>([]);
  const [exampleId, setExampleId] = useState("complete");
  const [loaded, setLoaded] = useState<LoadedModel | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedCheck, setSelectedCheck] = useState<VerificationCheck | null>(
    null,
  );
  const [operation, setOperation] = useState<"load" | "open" | "save" | "analyze" | "recover" | null>("load");
  const busy = operation !== null;
  const operationLabel = operation === "analyze" ? "Verificando modelo…" :
    operation === "open" ? "Abrindo projeto…" : operation === "save" ? "Salvando projeto…" :
    operation === "recover" ? "Restaurando projeto…" : "Preparando o modelo…";
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"graph" | "elements">("graph");
  const [focus, setFocus] = useState<"all" | "findings">("all");
  const [search, setSearch] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorWidth, setInspectorWidth] = useState(312);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [navigatorCollapsed, setNavigatorCollapsed] = useState(false);
  const [navigatorTarget, setNavigatorTarget] = useState<HTMLElement | null>(
    null,
  );
  const [resultsVisible, setResultsVisible] = useState(true);
  const [resultsExpanded, setResultsExpanded] = useState(false);
  const [resultsHeight, setResultsHeight] = useState(210);
  const archive = useRunHistory();
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [projectSearch, setProjectSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const projectSearchInput = useRef<HTMLInputElement>(null);
  const viewMenu = useRef<HTMLDetailsElement>(null);
  const graphRef = useRef<GraphHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState("Ainda não salvo");
  const [documentKey, setDocumentKey] = useState(0);
  const [initialView, setInitialView] = useState<ViewState | null>(null);
  const [hint, setHint] = useState(
    "Viewport · Arraste: selecionar · Espaço: pan · Roda: zoom · F: enquadrar",
  );
  const [dialog, setDialog] = useState<
    | "origin"
    | "help"
    | "settings"
    | "shortcuts"
    | "docs"
    | "feedback"
    | "updates"
    | "about"
    | null
  >(null);
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [feedbackCopied, setFeedbackCopied] = useState(false);
  const clipboardRef = useRef<
    Array<{ kind: Kind; patch: Partial<NodeUpdatePatch> }> | null
  >(null);
  const [renaming, setRenaming] = useState(false);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const [projectName, setProjectName] = useState("");
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    nodeIds: string[];
    labels: string[];
    connections: {
      fromId: string;
      toId: string;
      label: string;
      direction: "entrada" | "saída";
      relation: string;
    }[];
  } | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [subgraphPath, setSubgraphPath] = useState<string[]>([]);
  const [subgraphViewMode, setSubgraphViewMode] = useState<"graph" | "spec">("graph");
  const [specPreviewMode, setSpecPreviewMode] = useState<"rendered" | "editor">("rendered");
  const [nodeArchitectures, setNodeArchitectures] = useState<Record<string, "atomic" | "composite">>({});
  const [subgraphInternalNodes, setSubgraphInternalNodes] = useState<
    Record<
      string,
      Array<{
        id: string;
        label: string;
        kind: Kind;
        expr?: string;
        value?: number | string;
        unit?: string;
      }>
    >
  >({
  });
  const [newSubNodeModal, setNewSubNodeModal] = useState(false);
  const [newSubNodeDraft, setNewSubNodeDraft] = useState({
    id: "",
    label: "",
    kind: "variable" as Kind,
    expr: "",
    unit: "W",
  });

  const [executingNodeId, setExecutingNodeId] = useState<string | null>(null);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLogEntry[]>([]);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [executionMessage, setExecutionMessage] = useState<{ key: string; values?: MessageValues }>({ key: "" });
  const executingStepDescription = t(executionMessage.key, executionMessage.values);
  const setExecutingStepDescription = (key: string, values?: MessageValues) => setExecutionMessage({ key, values });
  const [dockTab, setDockTab] = useState<"terminal" | "checks" | "runs">("terminal");
  const abortControllerRef = useRef<AbortController | null>(null);
  const [settingsTab, setSettingsTab] = useState<"general" | "appearance" | "viewport" | "nodes" | "engine">("general");
  const [kindColors, setKindColors] = useState<Record<Kind, string>>({
    variable: "#2196f3",
    equation: "#00897b",
    assumption: "#7e57c2",
    requirement: "#f4511e",
    observation: "#43a047",
  });

  useEffect(() => {
    applyAppearance(appSettings);
    if (!savePreferences(appSettings)) setError("Preferências aplicadas, mas não foi possível salvá-las neste dispositivo.");
    if (isTauri()) {
      document.documentElement.dataset.nativeTheme = "pending";
      void getCurrentWindow().setTheme(appSettings.theme).then(() => {
        document.documentElement.dataset.nativeTheme = "applied";
      }).catch(() => {
        document.documentElement.dataset.nativeTheme = "unavailable";
        console.warn("Não foi possível aplicar o tema à barra nativa da janela.");
      });
    }
  }, [appSettings]);
  const [newCatalogModalOpen, setNewCatalogModalOpen] = useState(false);
  const [catalogDraft, setCatalogDraft] = useState<{
    kind: Kind;
    id: string;
    label: string;
    unit: string;
    value: string;
    expr: string;
    doc: string;
  }>({
    kind: "variable",
    id: "",
    label: "",
    unit: "W",
    value: "",
    expr: "",
    doc: "",
  });
  const [libraryCategory, setLibraryCategory] = useState<"all" | Kind>("all");
  const [libraryViewMode, setLibraryViewMode] = useState<"grid" | "list">("grid");
  const [undoStack, setUndoStack] = useState<LoadedModel[]>([]);
  const [redoStack, setRedoStack] = useState<LoadedModel[]>([]);
  const [revisions,setRevisions]=useState<RevisionHistory>(emptyRevisions);
  const [moduleTemplates,setModuleTemplates]=useState<ModuleTemplate[]>([]);
  const [modelGroups,setModelGroups]=useState<ModelGroup[]>([]);
  const [activeGroup,setActiveGroup]=useState<string|null>(null);
  const displayGraph=useMemo(()=>loaded?groupContext(loaded.graph,modelGroups,activeGroup):null,[loaded?.graph,modelGroups,activeGroup]);
  useEffect(()=>{if(activeGroup&&!modelGroups.find(g=>g.id===activeGroup)?.nodeIds.some(id=>loaded?.graph.nodes.some(n=>n.id===id)))setActiveGroup(null);},[activeGroup,modelGroups,loaded?.graph]);
  function changeGroups(groups:ModelGroup[]){setModelGroups(groups);setDirty(true);setSaveMessage("Alterações não salvas");}
  function saveModules(templates:ModuleTemplate[]){setModuleTemplates(templates);setDirty(true);setSaveMessage("Alterações não salvas");}
  function extensions(){
    const models=[loaded?.model,...revisions.undo,...revisions.redo].filter((m):m is Model=>!!m);
    const present=new Set(models.flatMap(m=>[...m.variables,...m.equations,...m.assumptions,...m.requirements,...m.observations].map(n=>n.id)));
    return {modules:moduleTemplates,groups:modelGroups.map(g=>({...g,nodeIds:g.nodeIds.filter(id=>present.has(id))})).filter(g=>g.nodeIds.length)};
  }
  const createdAt = useRef(new Date().toISOString());
  const latestLoaded = useRef(loaded);
  latestLoaded.current = loaded;
  const fileMenu = useRef<HTMLDetailsElement>(null);
  const editMenu = useRef<HTMLDetailsElement>(null);
  const helpMenu = useRef<HTMLDetailsElement>(null);
  const pendingAction = useRef<null | (() => void)>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const closeState = useRef({ dirty, busy });
  closeState.current = { dirty, busy };
  const recovery = useRecovery({
    active: dirty && !busy,
    capture: () => loaded ? serializeProject(loaded.model, {
      viewport: graphRef.current?.captureView() ?? initialView,
      explorer: false, inspector: inspectorOpen, navigator: navigatorOpen, results: resultsVisible,
      activeGroup: modelGroups.some(g=>g.id===activeGroup&&g.nodeIds.some(id=>loaded?.graph.nodes.some(n=>n.id===id)))?activeGroup:null,
    }, createdAt.current,revisions,extensions()) : null,
  });

  useEffect(() => {
    if (!projectFiles.native()) return;
    let disposed = false,
      unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested((event) => {
        if (closeState.current.busy) {
          event.preventDefault();
          setError("Aguarde a operação atual antes de fechar o projeto.");
          return;
        }
        if (closeState.current.dirty) {
          event.preventDefault();
          pendingAction.current = () => {
            void getCurrentWindow().destroy();
          };
          setConfirmReplace(true);
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() =>
        setError("Não foi possível registrar a proteção de fechamento."),
      );
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  function guarded(action: () => void) {
    if (busy) return;
    if (dirty) {
      pendingAction.current = action;
      setConfirmReplace(true);
    } else action();
  }
  function commit(data: LoadedModel) {
    if (busy) return;
    if (loaded && JSON.stringify(loaded.model) === JSON.stringify(data.model))
      return;
    if(loaded){
      const next=boundedRevisions({...revisions,undo:[...undoStack.map(e=>e.model),loaded.model],redo:[],events:[...revisions.events,revisionEvent("edit",loaded.model,data.model)]});
      setRevisions(next);setUndoStack(next.undo.map(model=>({model,graph:projectGraph(model)})));setRedoStack([]);
    }
    setLoaded(data);
    setRun(null);
    setSelectedCheck(null);
    setDirty(true);
    setSaveMessage("Alterações não salvas");
    setError(null);
  }
  function undo(redo = false) {
    if (busy || !loaded) return;
    const stack = redo ? redoStack : undoStack;
    if (!stack.length) return;
    const previous = stack[stack.length - 1];
    const next=boundedRevisions({...revisions,
      undo:redo?[...undoStack.map(e=>e.model),loaded.model]:undoStack.slice(0,-1).map(e=>e.model),
      redo:redo?redoStack.slice(0,-1).map(e=>e.model):[...redoStack.map(e=>e.model),loaded.model],
      events:[...revisions.events,revisionEvent(redo?"redo":"undo",loaded.model,previous.model)]});
    setRevisions(next);setUndoStack(next.undo.map(model=>({model,graph:projectGraph(model)})));setRedoStack(next.redo.map(model=>({model,graph:projectGraph(model)})));
    setLoaded(previous);
    setRun(null);
    setSelectedCheck(null);
    setSelected(null);
    setDirty(true);
    setSaveMessage("Alterações não salvas");
  }
  function applyTitle() {
    const next = renamingTitle.trim();
    if (next && loaded && next !== loaded.model.title) {
      commit({
        ...loaded,
        model: { ...loaded.model, title: next },
      });
    }
    setRenaming(false);
  }
  useEffect(() => {
    const title = loaded?.model?.title
      ? `${loaded.model.title} — Nexo`
      : t("Nexo — Laboratório de Conhecimento");
    document.title = title;
    if (projectFiles.native())
      void getCurrentWindow()
        .setTitle(title)
        .catch(() => {});
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty && !projectFiles.native()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty, loaded?.model.title, language]);

  useEffect(() => {
    if (latestLoaded.current) return;
    let alive = true;
    loadInitialModel()
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
        if (alive) setOperation(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  function replaceModel(data: LoadedModel, preserveRecovery = false) {
    if (!preserveRecovery && !recovery.candidate) void recovery.discard();
    setLoaded(data);
    setRun(null);
    setSelected(null);
    setSelectedNodes([]);
    setSubgraphPath([]);
    setSelectedCheck(null);
    setFocus("all");
    setError(null);
    setUndoStack([]);
    setRedoStack([]);
    setRevisions(emptyRevisions());
    setModuleTemplates([]);setModelGroups([]);setActiveGroup(null);
    setProjectPath(null);
    setInitialView(null);
    setDirty(false);
    setSaveMessage("Ainda não salvo");
    setDocumentKey((key) => key + 1);
    createdAt.current = new Date().toISOString();
    setRenaming(false);
    setSearch("");
    setProjectSearch("");
  }

  async function changeExample(id: string) {
    setOperation("load");
    setError(null);
    try {
      const data = await engine.load(id);
      await projectFiles.forget();
      replaceModel(data);
      setExampleId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOperation(null);
    }
  }

  const formatLogTime = () => new Date().toISOString();

  const addLog = (
    level: ExecutionLogEntry["level"],
    message: string,
    nodeId?: string,
    values?: MessageValues,
  ) => {
    setExecutionLogs((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        timestamp: formatLogTime(),
        level,
        message,
        values,
        nodeId,
      },
    ]);
  };

  async function analyze() {
    if (!loaded || busy) return;
    setOperation("analyze");
    setRun(null);
    setSelectedCheck(null);
    setError(null);
    setResultsVisible(true);
    setResultsExpanded(true);
    setDockTab("terminal");
    setExecutionProgress(0);
    setExecutingStepDescription("Verificando modelo…");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setExecutionLogs([
      {
        id: crypto.randomUUID(),
        timestamp: formatLogTime(),
        level: "info",
        message: "Verificação iniciada: '{title}' ({id}).",
        values: { title: loaded.model.title, id: loaded.model.id },
      },
    ]);

    const startTime = performance.now();
    try {
      const result = await engine.analyze(loaded.model, controller.signal);
      controller.signal.throwIfAborted();
      if (latestLoaded.current !== loaded) return;

      const durationMs = performance.now() - startTime;
      setRun(result);
      void archive.capture(loaded.model, result);
      setExecutingNodeId(null);
      setExecutionProgress(100);
      setExecutingStepDescription(
        "Análise finalizada em {duration}s. {passed} consistentes, {failed} falhas, {inconclusive} inconclusivas.",
        { duration: Math.round(durationMs / 10) / 100, ...result.counts },
      );

      addLog("info", "--------------------------------------------------------");
      addLog(
        result.outcome === "consistent" ? "success" : "warn",
        "Concluído em {duration}s: {passed} regras atendidas, {failed} falhas, {inconclusive} inconclusivas.",
        undefined, { duration: Math.round(durationMs / 10) / 100, ...result.counts },
      );

      for (const check of result.checks) {
        addLog(
          check.status === "passed"
            ? "success"
            : check.status === "failed"
              ? "error"
              : "warn",
          check.status === "passed" ? "Regra {rule} ({title}): Atendido" : check.status === "failed" ? "Regra {rule} ({title}): Falha" : "Regra {rule} ({title}): Inconclusivo",
          check.node_ids[0], { rule: check.rule_id, title: check.title },
        );
      }

      const first = result.checks.find((c) => c.status === "failed") ?? result.checks.find((c) => c.status === "inconclusive") ?? null;
      setSelectedCheck(first);
      if (first?.node_ids[0]) {
        setSelected(first.node_ids[0]);
      }
      setDockTab("checks");
    } catch (e) {
      setExecutingNodeId(null);
      if (e instanceof NativeCancellationError) {
        addLog(e.state==="unconfirmed"?"error":"warn", e.message);
        setExecutingStepDescription(e.message);
        if(e.state==="unconfirmed") setError(e.message);
      } else if (controller.signal.aborted) {
        addLog("warn", "A execução foi cancelada pelo usuário.");
        setExecutingStepDescription("Execução cancelada.");
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        addLog("error", "Falha na execução: {message}", undefined, { message: msg });
        setExecutingStepDescription("Erro na execução do motor.");
      }
    } finally {
      abortControllerRef.current = null;
      setOperation(null);
      setExecutingNodeId(null);
    }
  }

  function handleCancelExecution() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setExecutingStepDescription("Cancelamento solicitado; aguardando liberação do motor…");
    }
  }

  async function importFile(file?: File) {
    if (!file) return;
    setOperation("open");
    setError(null);
    try {
      if (file.size > 2_000_000) throw new Error("Projeto excede 2 MB.");
      await openContent(await file.text(), file.name);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível importar o JSON.",
      );
    } finally {
      setOperation(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function openContent(text: string, path: string, recovering = false) {
    const parsed = parseProject(text);
    const data = await engine.import(parsed.model);
    const history=parsed.document?.revisionHistory??emptyRevisions();
    const normalizedUndo:LoadedModel[]=[],normalizedRedo:LoadedModel[]=[];
    for(const model of history.undo)normalizedUndo.push(await engine.import(model));
    for(const model of history.redo)normalizedRedo.push(await engine.import(model));
    await projectFiles.forget();
    replaceModel(data, recovering);
    setRevisions({...history,undo:normalizedUndo.map(e=>e.model),redo:normalizedRedo.map(e=>e.model)});
    setUndoStack(normalizedUndo);setRedoStack(normalizedRedo);
    setModuleTemplates(parsed.document?.modules??[]);setModelGroups(parsed.document?.groups??[]);
    setActiveGroup(parsed.document?.workspace.activeGroup??null);
    setExampleId("imported");
    if (parsed.document) {
      const doc = parsed.document;
      createdAt.current = doc.createdAt;
      setInitialView(doc.workspace.viewport);
      setInspectorOpen(doc.workspace.inspector);
      setNavigatorOpen(doc.workspace.navigator);
      setResultsVisible(doc.workspace.results);
      setProjectPath(path);
      setSaveMessage("Projeto aberto · reexecute as verificações");
    } else setSaveMessage("Modelo importado · salve como projeto");
  }
  async function restoreRecovery() {
    if (busy || !recovery.candidate) return;
    setOperation("recover");
    setError(null);
    try {
      await openContent(JSON.stringify(recovery.candidate.project), "", true);
      setProjectPath(null);
      setDirty(true);
      setSaveMessage("Projeto recuperado · salve uma cópia");
      recovery.restored();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setOperation(null); }
  }
  async function openProject() {
    if (!projectFiles.native()) {
      fileInput.current?.click();
      return;
    }
    setOperation("open");
    setError(null);
    try {
      const file = await projectFiles.open(language);
      if (file) {
        await openContent(file.content, file.path);
        if (parseProject(file.content).document) await projectFiles.adopt();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOperation(null);
    }
  }
  function newProject() {
    const model: Model = {
      schema_version: 1,
      id: "project_" + crypto.randomUUID().replaceAll("-", "").slice(0, 16),
      title: t("Novo projeto"),
      description:
        t("Projeto em elaboração. Domínio, fontes e critérios a definir."),
      variables: [
        {
          id: "x",
          label: t("Quantidade inicial"),
          unit: "1",
          value: null,
          source: null,
        },
      ],
      equations: [],
      assumptions: [],
      requirements: [],
      observations: [],
    };
    void projectFiles.forget();
    replaceModel({ model, graph: projectGraph(model) });
    setExampleId("imported");
    setDirty(true);
    setSaveMessage("Alterações não salvas");
  }
  async function saveProject(saveAs = false): Promise<boolean> {
    if (!loaded || busy) return false;
    setOperation("save");
    setError(null);
    try {
      const text = serializeProject(
        loaded.model,
        {
          viewport: graphRef.current?.captureView() ?? null,
          explorer: false, // Reserved v1 field; retired panel is never reopened.
          inspector: inspectorOpen,
          navigator: navigatorOpen,
          results: resultsVisible,
          activeGroup: modelGroups.some(g=>g.id===activeGroup&&g.nodeIds.some(id=>loaded.graph.nodes.some(n=>n.id===id)))?activeGroup:null,
        },
        createdAt.current,
        revisions,
        extensions(),
      );
      await engine.import(loaded.model);
      if (projectFiles.native()) {
        const path = await projectFiles.save(text, loaded.model.title, saveAs, language);
        if (!path) return false;
        setProjectPath(path);
        setSaveMessage("Salvo neste computador");
        if(!recovery.candidate)await recovery.discard();
      } else {
        download(text, loaded.model.id + ".nexo");
        setSaveMessage("Download do projeto solicitado");
      }
      setDirty(false);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setOperation(null);
    }
  }

  function exportModel() {
    if (!loaded || busy) return;
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

  function handleConnect(
    fromId: string,
    toId: string,
    fromPortKind?: number,
    toPortKind?: number,
    preferredRelation?: RelationType,
  ) {
    if (!loaded || busy) return;
    const result = connectNodes(
      loaded.model,
      fromId,
      toId,
      fromPortKind,
      toPortKind,
      preferredRelation,
    );
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    commit({ model: result.model, graph: result.graph });
  }

  function handleDisconnect(edge: {
    source: string;
    target: string;
    relation: string;
  }) {
    if (!loaded || busy) return;
    const result = disconnectEdge(loaded.model, edge);
    commit({ model: result.model, graph: result.graph });
  }

  function attachCreatedNodes(graph:Graph){
    if(!activeGroup||!loaded)return;const existing=new Set(loaded.graph.nodes.map(n=>n.id));const added=graph.nodes.filter(n=>!existing.has(n.id)).map(n=>n.id);
    if(added.length)setModelGroups(groups=>groups.map(group=>group.id===activeGroup?{...group,nodeIds:[...new Set([...group.nodeIds,...added])]}:group));
  }
  function handleCreateNode(kind: Kind, template?: Partial<NodeUpdatePatch>) {
    if (!loaded || busy) return null;
    try {
      const result = createNodeInModel(loaded.model, kind);
      let finalModel = result.model;
      let finalGraph = result.graph;
      if (template && Object.keys(template).length > 0) {
        const updated = updateNodeInModel(result.model, result.nodeId, {
          ...template,
          ...(["variable", "equation", "observation"].includes(kind) && !template.source
            ? { source: "Exemplo sintético do catálogo; revise os dados e a fonte." } : {}),
        });
        finalModel = updated.model;
        finalGraph = updated.graph;
      }
      commit({ model: finalModel, graph: finalGraph });
      attachCreatedNodes(finalGraph);
      setInspectorOpen(true);
      setSelected(result.nodeId);
      setSelectedNodes([result.nodeId]);
      setSelectedCheck(null);
      setRun(null);
      return result.nodeId;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  function handleUpdateNode(nodeId: string, patch: NodeUpdatePatch) {
    if (!loaded || busy) return false;
    try {
      const result = updateNodeInModel(loaded.model, nodeId, patch);
      commit({ model: result.model, graph: result.graph });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  function handleDeleteNode(nodeId: string) {
    if (!loaded || busy) return;
    try {
      const result = deleteNodeFromModel(loaded.model, nodeId);
      commit({ model: result.model, graph: result.graph });
      if (selected === nodeId || selectedNodes.includes(nodeId)) {
        setSelected(null);
        setSelectedNodes((list) => list.filter((id) => id !== nodeId));
        setSelectedCheck(null);
      }
      setRun(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function openNodeEditor(kind: Kind, template?: Partial<NodeUpdatePatch>) {
    if (!loaded || busy) return;
    let created;
    try { created = createNodeInModel(loaded.model, kind); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return; }
    setError(null);
    setCatalogDraft({ kind, id: created.nodeId, label: template?.label ?? "",
      unit: template?.unit ?? "1", value: template?.value == null ? "" : String(template.value),
      expr: template?.expression ?? "", doc: template?.source ?? template?.justification ?? "" });
    setNewCatalogModalOpen(true);
  }

  function handleCreateCatalogElement() {
    if (!loaded || busy) return;
    try {
      const { kind, id, label, unit, value, expr, doc } = catalogDraft;
      const patch: NodeUpdatePatch = { label: label.trim() };
      if (kind === "variable" || kind === "observation") {
        patch.unit = unit.trim() || "1";
        if (kind === "observation" && !value.trim())
          throw new Error("Informe o valor da referência; zero não será presumido.");
        patch.value = value.trim() ? Number(value) : null;
      }
      if (kind === "equation" && expr.trim()) patch.expression = expr.trim();
      if (kind === "assumption" && doc.trim()) patch.justification = doc.trim();
      if (doc.trim() && ["variable", "equation", "observation"].includes(kind)) patch.source = doc.trim();
      const result = createConfiguredNode(loaded.model, kind, id.trim(), patch);
      commit({ model: result.model, graph: result.graph });
      attachCreatedNodes(result.graph);
      setNewCatalogModalOpen(false);
      setInspectorOpen(true);
      setSelected(result.nodeId);
      setSelectedNodes([result.nodeId]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleDeleteNodes(nodeIds: string[]) {
    if (!loaded || busy || nodeIds.length === 0) return;
    try {
      let currentModel = loaded.model;
      for (const id of nodeIds) {
        currentModel = deleteNodeFromModel(currentModel, id).model;
      }
      commit({ model: currentModel, graph: projectGraph(currentModel) });
      attachCreatedNodes(projectGraph(currentModel));
      setSelected(null);
      setSelectedNodes([]);
      setSelectedCheck(null);
      setDeleteConfirm(null);
      setRun(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function requestDeleteNodes(targetIds: string[]) {
    if (!loaded || busy || targetIds.length === 0) return;
    const targetSet = new Set(targetIds);
    const incidentEdges = loaded.graph.edges.filter(
      (e) => targetSet.has(e.source) || targetSet.has(e.target),
    );
    if (incidentEdges.length === 0 || !appSettings.confirmDeleteWithConnections) {
      handleDeleteNodes(targetIds);
    } else {
      const nodeLabels = targetIds.map((id) => {
        const n = loaded.graph.nodes.find((item) => item.id === id);
        return n?.label ?? id;
      });
      setDeleteConfirm({
        nodeIds: targetIds,
        labels: nodeLabels,
        connections: incidentEdges.map((e) => {
          const isSource = targetSet.has(e.source);
          const otherId = isSource ? e.target : e.source;
          const otherNode = loaded.graph.nodes.find((n) => n.id === otherId);
          return {
            fromId: e.source,
            toId: e.target,
            label: otherNode?.label ?? otherId,
            direction: isSource ? "saída" : "entrada",
            relation: e.relation,
          };
        }),
      });
    }
  }

  function requestDeleteNode(nodeId: string) {
    requestDeleteNodes([nodeId]);
  }

  function requestDeleteSelection() {
    const targets =
      selectedNodes.length > 0 ? selectedNodes : selected ? [selected] : [];
    if (targets.length > 0) {
      requestDeleteNodes(targets);
    }
  }

  function copySelection() {
    if (!loaded) return;
    const targetIds =
      selectedNodes.length > 0 ? selectedNodes : selected ? [selected] : [];
    if (targetIds.length === 0) return;
    const items: Array<{ kind: Kind; patch: Partial<NodeUpdatePatch> }> = [];
    for (const id of targetIds) {
      const node = loaded.graph.nodes.find((n) => n.id === id);
      if (!node) continue;
      const patch: Partial<NodeUpdatePatch> = { label: `${node.label} (cópia)` };
      if (node.kind === "variable") {
        const v = loaded.model.variables.find((item) => item.id === id);
        if (v) {
          patch.value = v.value;
          patch.unit = v.unit;
          if (v.source) patch.source = v.source;
        }
      } else if (node.kind === "equation") {
        const eq = loaded.model.equations.find((item) => item.id === id);
        if (eq) {
          patch.lhs = eq.lhs;
          patch.expression = formatExpr(eq.rhs);
        }
      } else if (node.kind === "assumption") {
        const a = loaded.model.assumptions.find((item) => item.id === id);
        if (a) patch.justification = a.justification;
      } else if (node.kind === "requirement") {
        const r = loaded.model.requirements.find((item) => item.id === id);
        if (r && r.equation_id) patch.equation_id = r.equation_id;
      } else if (node.kind === "observation") {
        const o = loaded.model.observations.find((item) => item.id === id);
        if (o) {
          patch.value = o.value;
          patch.unit = o.unit;
          if (o.source) patch.source = o.source;
          patch.tolerance = o.tolerance;
        }
      }
      items.push({ kind: node.kind, patch });
    }
    if (items.length > 0) {
      clipboardRef.current = items;
      setHint(`${items.length} elemento(s) copiado(s). Use Ctrl+V para colar.`);
    }
  }

  function cutSelection() {
    copySelection();
    requestDeleteSelection();
  }

  function pasteSelection() {
    if (!clipboardRef.current || clipboardRef.current.length === 0 || !loaded || busy) return;
    for (const item of clipboardRef.current) {
      handleCreateNode(item.kind, item.patch);
    }
    setHint(`${clipboardRef.current.length} elemento(s) colado(s) com sucesso.`);
  }

  function selectAll() {
    if (!loaded) return;
    const allIds = loaded.graph.nodes.map((n) => n.id);
    setSelectedNodes(allIds);
    if (allIds[0]) setSelected(allIds[0]);
  }

  function selectNode(id: string | null) {
    if (id) {
      if(activeGroup&&!displayGraph?.nodes.some(node=>node.id===id))setActiveGroup(null);
      if(modelGroups.some(g=>g.collapsed&&g.nodeIds.includes(id)))changeGroups(modelGroups.map(g=>g.nodeIds.includes(id)?{...g,collapsed:false}:g));
      setInspectorOpen(true);
      setInspectorCollapsed(false);
      setSelected(id);
      setSelectedNodes([id]);
    } else {
      setSelected(null);
      setSelectedNodes([]);
    }
    setSelectedCheck(null);
  }
  function selectCheck(check: VerificationCheck) {
    if(activeGroup&&check.node_ids.some(id=>!displayGraph?.nodes.some(node=>node.id===id)))setActiveGroup(null);
    if(modelGroups.some(g=>g.collapsed&&g.nodeIds.some(id=>check.node_ids.includes(id))))changeGroups(modelGroups.map(g=>g.nodeIds.some(id=>check.node_ids.includes(id))?{...g,collapsed:false}:g));
    setInspectorOpen(true);
    setInspectorCollapsed(false);
    setSelectedCheck(check);
    setSelected(check.node_ids[0] ?? null);
  }

  const nodes = loaded?.graph.nodes ?? [];
  const current = nodes.find((n) => n.id === selected);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        projectSearchInput.current?.focus();
        setSearchOpen(true);
      } else if (event.key === "Escape") {
        if (operation === "analyze") {
          event.preventDefault();
          handleCancelExecution();
          return;
        }
        setDialog(null);
        setDeleteConfirm(null);
        setConfirmReplace(false);
        pendingAction.current = null;
        closeAllMenus();
        setProjectMenuOpen(false);
        setSearchOpen(false);
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "o"
      ) {
        event.preventDefault();
        guarded(() => void openProject());
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();
        void saveProject(event.shiftKey);
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest("input,textarea,[contenteditable]")
        )
      ) {
        event.preventDefault();
        undo(event.shiftKey);
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "c" &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest("input,textarea,[contenteditable]")
        )
      ) {
        event.preventDefault();
        copySelection();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "x" &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest("input,textarea,[contenteditable]")
        )
      ) {
        event.preventDefault();
        cutSelection();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "v" &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest("input,textarea,[contenteditable]")
        )
      ) {
        event.preventDefault();
        pasteSelection();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "a" &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest("input,textarea,[contenteditable]")
        )
      ) {
        event.preventDefault();
        selectAll();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key === ","
      ) {
        event.preventDefault();
        setDialog("settings");
      } else if (
        (event.key === "Delete" || event.key === "Del") &&
        (selected || selectedNodes.length > 0) &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest("input,textarea,[contenteditable]")
        )
      ) {
        event.preventDefault();
        requestDeleteSelection();
      } else if (event.key === "Escape") {
        if (busy) {
          event.preventDefault();
          handleCancelExecution();
        } else if (deleteConfirm) {
          setDeleteConfirm(null);
        } else if (newCatalogModalOpen) {
          setNewCatalogModalOpen(false);
        } else if (newSubNodeModal) {
          setNewSubNodeModal(false);
        } else if (selected || selectedNodes.length > 0) {
          setSelected(null);
          setSelectedNodes([]);
        }
      } else if (event.key === "F5") {
        event.preventDefault();
        void analyze();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    busy,
    loaded,
    dirty,
    undoStack,
    redoStack,
    selected,
    selectedNodes,
    deleteConfirm,
    newCatalogModalOpen,
    newSubNodeModal,
    inspectorOpen,
    navigatorOpen,
    resultsVisible,
    recovery.candidate,
    language,
    appSettings,
  ]);

  function locate(id: string) {
    setTab("graph");
    selectNode(id);
    setSearchOpen(false);
    requestAnimationFrame(() => graphRef.current?.focusNode(id));
  }
  function restoreLayout() {
    setInspectorOpen(true);
    setNavigatorOpen(false);
    setNavigatorCollapsed(false);
    setResultsVisible(true);
    setResultsExpanded(false);
    setInspectorWidth(312);
    setResultsHeight(210);
    if (viewMenu.current) viewMenu.current.open = false;
  }
  function closeAllMenus() {
    setActiveMenu(null);
    if (fileMenu.current) fileMenu.current.open = false;
    if (editMenu.current) editMenu.current.open = false;
    if (viewMenu.current) viewMenu.current.open = false;
    if (helpMenu.current) helpMenu.current.open = false;
  }
  function openMenu(name: string) {
    setActiveMenu(name);
    if (fileMenu.current) fileMenu.current.open = name === "file";
    if (editMenu.current) editMenu.current.open = name === "edit";
    if (viewMenu.current) viewMenu.current.open = name === "view";
    if (helpMenu.current) helpMenu.current.open = name === "help";
  }
  function handleMenuHover(name: string) {
    if (activeMenu && activeMenu !== name) {
      openMenu(name);
    }
  }
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".app-menu-bar")) {
        closeAllMenus();
      }
      if (!target.closest(".project-search")) {
        setSearchOpen(false);
      }
      if (!target.closest(".status-project-container")) {
        setProjectMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  function getNodeDetail(node: Graph["nodes"][number]): string {
    if (!loaded?.model) return "";
    if (node.kind === "variable") {
      const v = loaded.model.variables.find((item) => item.id === node.id);
      return v && v.value !== null ? `${v.value} ${v.unit}` : "";
    }
    if (node.kind === "equation") {
      const eq = loaded.model.equations.find((e) => e.id === node.id);
      return eq ? `${eq.lhs} = ${formatExpr(eq.rhs)}` : "";
    }
    if (node.kind === "observation") {
      const o = loaded.model.observations.find((item) => item.id === node.id);
      return o ? `${o.value} ${o.unit}` : "";
    }
    return "";
  }

  const searchMatches = nodes
    .filter((node) => {
      const q = projectSearch.trim().toLocaleLowerCase();
      if (!q) return false;
      const idMatch = node.id.toLocaleLowerCase().includes(q);
      const labelMatch = node.label.toLocaleLowerCase().includes(q);
      const kindMatch = (t(KIND[node.kind]) ?? "").toLocaleLowerCase(locale).includes(q);
      const detailStr = getNodeDetail(node);
      const detailMatch = detailStr.toLowerCase().includes(q);
      let modelMatch = false;
      if (loaded?.model) {
        if (node.kind === "equation") {
          const eq = loaded.model.equations.find((e) => e.id === node.id);
          if (
            eq &&
            (eq.lhs.toLowerCase().includes(q) ||
              formatExpr(eq.rhs).toLowerCase().includes(q))
          ) {
            modelMatch = true;
          }
        } else if (node.kind === "variable") {
          const v = loaded.model.variables.find((item) => item.id === node.id);
          if (
            v &&
            ((v.unit && v.unit.toLowerCase().includes(q)) ||
              (v.source && v.source.toLowerCase().includes(q)))
          ) {
            modelMatch = true;
          }
        } else if (node.kind === "assumption") {
          const a = loaded.model.assumptions.find((item) => item.id === node.id);
          if (a && a.justification && a.justification.toLowerCase().includes(q)) {
            modelMatch = true;
          }
        }
      }
      return idMatch || labelMatch || kindMatch || detailMatch || modelMatch;
    })
    .sort((a,b)=>{
      const q=projectSearch.trim().toLocaleLowerCase(locale);
      const rank=(node:GraphNode)=>{
        const id=node.id.toLocaleLowerCase(locale),label=node.label.toLocaleLowerCase(locale);
        return id===q?0:label===q?1:id.startsWith(q)?2:label.startsWith(q)?3:4;
      };
      return rank(a)-rank(b);
    })
    .slice(0, 15);
  const libraryNodes = nodes.filter((node) => {
    const matchesCategory =
      libraryCategory === "all" || node.kind === libraryCategory;
    const matchesSearch =
      !search.trim() ||
      `${node.label} ${node.id}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase());
    return matchesCategory && matchesSearch;
  });

  const resultsDockNode = resultsVisible ? (
    <ResultsDock
      run={run}
      historyEntries={archive.entries.filter(entry => entry.model.id === loaded?.model.id)}
      historyError={archive.error}
      historySaving={archive.saving}
      historyEvicted={archive.evicted}
      onRetryHistory={() => void archive.retry()}
      expanded={resultsExpanded}
      onExpand={setResultsExpanded}
      onClose={() => setResultsVisible(false)}
      height={resultsHeight}
      onHeight={setResultsHeight}
      onSelect={selectCheck}
      activeTab={dockTab}
      onTabChange={setDockTab}
      executionLogs={executionLogs}
      executionProgress={executionProgress}
      executingStepDescription={executingStepDescription}
      busy={operation === "analyze"}
      onCancelExecution={handleCancelExecution}
      onSelectNode={locate}
    />
  ) : null;

  return (
    <div
      className="app-shell"
      onFocusCapture={(event) => {
        if ((event.target as HTMLElement).closest(".node-editor"))
          setHint(
            "Propriedades · Edite os campos e aplique · Ctrl+S: salvar projeto · F5: verificar revisão",
          );
        else if ((event.target as HTMLElement).closest(".project-search"))
          setHint(
            "Pesquisa · Digite nome ou identificador · Enter: localizar · Esc: fechar",
          );
      }}
    >
      <header className="project-bar">
        <nav className="app-menu-bar" aria-label={t("Menu principal")}>
          <details
            className="file-menu menu-dropdown"
            ref={fileMenu}
            onToggle={(e) => {
              if (e.currentTarget.open) {
                setActiveMenu("file");
                if (editMenu.current) editMenu.current.open = false;
                if (viewMenu.current) viewMenu.current.open = false;
                if (helpMenu.current) helpMenu.current.open = false;
              } else if (activeMenu === "file") {
                setActiveMenu(null);
              }
            }}
          >
            <summary
              onMouseEnter={() => handleMenuHover("file")}
              onClick={(e) => {
                if (fileMenu.current?.open) {
                  e.preventDefault();
                  closeAllMenus();
                }
              }}
            >{t("Arquivo")}</summary>
            <div className="toolbar-popover">
              <button
                disabled={busy}
                onClick={() => {
                  closeAllMenus();
                  guarded(newProject);
                }}
              >
                <FilePlus2 size={14} />{t("Novo projeto")}</button>
              <button
                disabled={busy}
                onClick={() => {
                  closeAllMenus();
                  guarded(() => void openProject());
                }}
              >
                <FolderOpen size={14} />{t("Abrir projeto… ")}<kbd>Ctrl+O</kbd>
              </button>
              <button
                aria-label={t("Salvar projeto")}
                disabled={!loaded || busy}
                onClick={() => {
                  closeAllMenus();
                  void saveProject();
                }}
              >
                <Save size={14} />{t("Salvar ")}<kbd>Ctrl+S</kbd>
              </button>
              <button
                disabled={!loaded || busy}
                onClick={() => {
                  closeAllMenus();
                  void saveProject(true);
                }}
              >{t("Salvar como… ")}<kbd>Ctrl+Shift+S</kbd>
              </button>
              <hr />
              <button
                disabled={busy}
                onClick={() => {
                  closeAllMenus();
                  guarded(() => fileInput.current?.click());
                }}
              >
                <FileUp size={14} />{t("Importar projeto Nexo / modelo JSON")}</button>
              <ProposalReview scopeKey={documentKey} disabled={!loaded || busy} getCurrent={()=>latestLoaded.current}
                closeMenu={closeAllMenus} apply={data=>{
                  if(closeState.current.busy) return false;
                  commit(data); setSelected(null); setSelectedNodes([]); return true;
                }}/>
              <ModulesPanel getCurrent={()=>latestLoaded.current} templates={moduleTemplates} setTemplates={saveModules} disabled={!loaded||busy} closeMenu={closeAllMenus} apply={(data,group)=>{if(closeState.current.busy)return false;if(modelGroups.length>=60)throw Error("Grupos inválidos.");commit(data);changeGroups([...modelGroups.filter(g=>g.id!==group.id),group]);setActiveGroup(null);requestAnimationFrame(()=>requestAnimationFrame(()=>graphRef.current?.fitAll()));return true;}}/>
              <GroupsPanel groups={modelGroups} nodeIds={loaded?.graph.nodes.map(n=>n.id)??[]} change={changeGroups} selection={selectedNodes} disabled={!loaded||busy} closeMenu={closeAllMenus} enter={setActiveGroup} locate={id=>{setActiveGroup(null);selectNode(id);requestAnimationFrame(()=>requestAnimationFrame(()=>graphRef.current?.focusNode(id)));}}/>
              <button
                disabled={!loaded || busy}
                onClick={() => {
                  closeAllMenus();
                  exportModel();
                }}
              >
                <ArrowDownToLine size={14} />{t("Exportar modelo JSON")}</button>
              <hr />
                <label className="example-picker">{t("Exemplos sintéticos")}<select
                    aria-label={t("Balanço térmico")}
                    value={exampleId}
                    disabled={busy}
                    onChange={(e) => {
                      const id = e.target.value;
                      closeAllMenus();
                      guarded(() => void changeExample(id));
                    }}
                  >
                    {examples.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                    {exampleId === "imported" && (
                      <option value="imported">{t("Projeto atual")}</option>
                    )}
                  </select>
                </label>
            </div>
          </details>

          <details
            className="edit-menu menu-dropdown"
            ref={editMenu}
            onToggle={(e) => {
              if (e.currentTarget.open) {
                setActiveMenu("edit");
                if (fileMenu.current) fileMenu.current.open = false;
                if (viewMenu.current) viewMenu.current.open = false;
                if (helpMenu.current) helpMenu.current.open = false;
              } else if (activeMenu === "edit") {
                setActiveMenu(null);
              }
            }}
          >
            <summary
              onMouseEnter={() => handleMenuHover("edit")}
              onClick={(e) => {
                if (editMenu.current?.open) {
                  e.preventDefault();
                  closeAllMenus();
                }
              }}
            >{t("Editar")}</summary>
            <div className="toolbar-popover">
              <button
                aria-label={t("Desfazer edição")}
                disabled={busy || !undoStack.length}
                onClick={() => {
                  closeAllMenus();
                  undo();
                }}
              >
                <Undo2 size={14} />{t("Desfazer ")}<kbd>Ctrl+Z</kbd>
              </button>
              <RevisionHistoryView history={revisions} closeMenu={closeAllMenus}/>
              <button
                disabled={busy || !redoStack.length}
                onClick={() => {
                  closeAllMenus();
                  undo(true);
                }}
              >
                <Redo2 size={14} />{t("Refazer ")}<kbd>Ctrl+Shift+Z</kbd>
              </button>
              <hr />
              <button
                disabled={busy || (!selected && selectedNodes.length === 0)}
                onClick={() => {
                  closeAllMenus();
                  cutSelection();
                }}
              >
                <Scissors size={14} />{t("Recortar ")}<kbd>Ctrl+X</kbd>
              </button>
              <button
                disabled={busy || (!selected && selectedNodes.length === 0)}
                onClick={() => {
                  closeAllMenus();
                  copySelection();
                }}
              >
                <Copy size={14} />{t("Copiar ")}<kbd>Ctrl+C</kbd>
              </button>
              <button
                disabled={busy || !clipboardRef.current || clipboardRef.current.length === 0}
                onClick={() => {
                  closeAllMenus();
                  pasteSelection();
                }}
              >
                <ClipboardPaste size={14} />{t("Colar ")}<kbd>Ctrl+V</kbd>
              </button>
              <hr />
              <button
                disabled={busy || !loaded}
                onClick={() => {
                  closeAllMenus();
                  selectAll();
                }}
              >
                <CheckSquare size={14} />{t("Selecionar tudo ")}<kbd>Ctrl+A</kbd>
              </button>
              <button
                disabled={busy || (!selected && selectedNodes.length === 0)}
                onClick={() => {
                  closeAllMenus();
                  requestDeleteSelection();
                }}
              >
                <Trash2 size={14} />{t("Excluir seleção ")}<kbd>Del</kbd>
              </button>
              <hr />
              <button
                aria-pressed={tool === "select"}
                onClick={() => {
                  closeAllMenus();
                  setTool("select");
                }}
              >
                <MousePointer2 size={14} />{t("Modo seleção ")}<kbd>V</kbd>
              </button>
              <button
                aria-pressed={tool === "pan"}
                onClick={() => {
                  closeAllMenus();
                  setTool("pan");
                }}
              >
                <Hand size={14} />{t("Mover viewport (Pan) ")}<kbd>H</kbd>
              </button>
              <hr />
              <button
                onClick={() => {
                  closeAllMenus();
                  setDialog("settings");
                }}
              >
                <Settings size={14} />{t("Preferências / Configurações ")}<kbd>Ctrl+,</kbd>
              </button>
            </div>
          </details>

          <details
            className="view-menu menu-dropdown"
            ref={viewMenu}
            onToggle={(e) => {
              if (e.currentTarget.open) {
                setActiveMenu("view");
                if (fileMenu.current) fileMenu.current.open = false;
                if (editMenu.current) editMenu.current.open = false;
                if (helpMenu.current) helpMenu.current.open = false;
              } else if (activeMenu === "view") {
                setActiveMenu(null);
              }
            }}
          >
            <summary
              onMouseEnter={() => handleMenuHover("view")}
              onClick={(e) => {
                if (viewMenu.current?.open) {
                  e.preventDefault();
                  closeAllMenus();
                }
              }}
            >{t("Exibir")}</summary>
            <div className="toolbar-popover">
              <strong>{t("Painéis")}</strong>
              {[
                [
                  "Propriedades",
                  inspectorOpen,
                  () => setInspectorOpen(!inspectorOpen),
                ],
                [
                  "Navegador do grafo",
                  navigatorOpen,
                  () => setNavigatorOpen(!navigatorOpen),
                ],
                [
                  "Resultados",
                  resultsVisible,
                  () => setResultsVisible(!resultsVisible),
                ],
              ].map(([label, value, action]) => (
                <button
                  role="menuitemcheckbox"
                  aria-label={t(label as string)}
                  aria-checked={value as boolean}
                  key={label as string}
                  onClick={action as () => void}
                >
                  <span className="menu-check" aria-hidden="true">
                    {value ? "✓" : ""}
                  </span>
                  {t(label as string)}
                </button>
              ))}
              <hr />
              <button
                onClick={() => {
                  closeAllMenus();
                  restoreLayout();
                }}
              >{t("Restaurar disposição inicial")}</button>
              <hr />
              <button
                onClick={() => {
                  closeAllMenus();
                  graphRef.current?.fitAll();
                }}
              >
                <Focus size={14} />{t("Enquadrar modelo ")}<kbd>Home</kbd>
              </button>
            </div>
          </details>

          <details
            className="help-menu menu-dropdown"
            ref={helpMenu}
            onToggle={(e) => {
              if (e.currentTarget.open) {
                setActiveMenu("help");
                if (fileMenu.current) fileMenu.current.open = false;
                if (editMenu.current) editMenu.current.open = false;
                if (viewMenu.current) viewMenu.current.open = false;
              } else if (activeMenu === "help") {
                setActiveMenu(null);
              }
            }}
          >
            <summary
              onMouseEnter={() => handleMenuHover("help")}
              onClick={(e) => {
                if (helpMenu.current?.open) {
                  e.preventDefault();
                  closeAllMenus();
                }
              }}
            >{t("Ajuda")}</summary>
            <div className="toolbar-popover">
              <button
                onClick={() => {
                  closeAllMenus();
                  setDialog("shortcuts");
                }}
              >
                <Keyboard size={14} />{t("Personalizar atalhos de teclado…")}</button>
              <button
                onClick={() => {
                  closeAllMenus();
                  setDialog("docs");
                }}
              >
                <BookOpen size={14} />{t("Documentação técnica e guias…")}</button>
              <button
                onClick={() => {
                  closeAllMenus();
                  setDialog("feedback");
                }}
              >
                <Bug size={14} />{t("Relatório de diagnósticos & feedback…")}</button>
              <hr />
              <button
                onClick={() => {
                  closeAllMenus();
                  setDialog("updates");
                }}
              >
                <RefreshCw size={14} />{t("Atualizações…")}</button>
              <button
                onClick={() => {
                  closeAllMenus();
                  setDialog("about");
                }}
              >
                <Info size={14} />{t("Sobre o Nexo…")}</button>
              <hr />
              <button
                onClick={() => {
                  closeAllMenus();
                  setDialog("origin");
                }}
              >
                <HardDrive size={14} />{t("Origem dos dados e execução offline")}</button>
            </div>
          </details>
          <div className="header-menu-divider" />
          <div className="header-view-switch" role="tablist" aria-label={t("Visualização do modelo")}>
            <button
              role="tab"
              className={"header-tab-btn " + (tab === "graph" ? "active" : "")}
              aria-selected={tab === "graph"}
              onClick={() => setTab("graph")}
            >
              <Network size={13} />
              <span>{t("Grafo")}</span>
            </button>
            <button
              role="tab"
              className={"header-tab-btn " + (tab === "elements" ? "active" : "")}
              aria-selected={tab === "elements"}
              onClick={() => setTab("elements")}
            >
              <Layers3 size={13} />
              <span>{t("Elementos")}</span>
            </button>
          </div>
        </nav>

        <div className="project-bar-right">
          <button
            className="run-tool-prominent header-run-btn"
            disabled={busy}
            aria-label={t("Executar verificação")}
            title={t("Executar verificação (F5)")}
            onClick={() => void analyze()}
          >
            {operation === "analyze" ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Play size={14} fill="currentColor" />
            )}
            <span>{t("Executar")}</span>
          </button>
          <div className="header-right-divider" />
          <div className={"project-search" + (projectSearch.trim().length > 0 ? " has-value" : "")}>
            <Search size={15} />
            <input
              ref={projectSearchInput}
              aria-label={t("Pesquisar no projeto")}
              placeholder={t("Pesquisar no projeto…")}
              value={projectSearch}
              onFocus={() => setSearchOpen(true)}
              onChange={(event) => {
                setProjectSearch(event.target.value);
                setSearchOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchMatches[0]) {
                  locate(searchMatches[0].id);
                  setSearchOpen(false);
                  projectSearchInput.current?.blur();
                }
              }}
            />
            <kbd>Ctrl+K</kbd>
            {searchOpen && projectSearch.trim().length > 0 && (
              <div className="search-results" aria-label={t("Resultados da pesquisa")}>
                {searchMatches.length ? (
                  searchMatches.map((node) => {
                    const detail = getNodeDetail(node);
                    return (
                      <button key={node.id} onClick={() => locate(node.id)}>
                        <i className={"kind-dot " + node.kind} />
                        <span className="search-result-label">{node.label}</span>
                        <code>{node.id}</code>
                        {detail && (
                          <small className="search-result-detail">{detail}</small>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <p>{t("Nenhum elemento encontrado.")}</p>
                )}
              </div>
            )}
          </div>
          <button
            className="origin-control"
            title={t("Origem dos dados e local de execução")}
            aria-label={t("Origem e execução")}
            onClick={() => setDialog("origin")}
          >
            <HardDrive size={15} />
            <span>{t("Local")}</span>
          </button>
        </div>
      </header>
      {!loaded && busy && (
        <div className="startup-splash" role="status" aria-live="polite">
          <img src={appSettings.theme === "dark" ? "/brand/wordmark-dark.svg" : "/brand/wordmark.svg"} alt={t("Nexo")} />
          <p>{t("Laboratório de conhecimento")}</p>
          <div className="startup-progress">
            <LoaderCircle size={16} aria-hidden="true" />
            <span>{t("Carregando modelo e motor local…")}</span>
          </div>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".nexo,.json,.nexo.json,application/json"
        className="visually-hidden"
        aria-label={t("Arquivo do modelo")}
        onChange={(event) => void importFile(event.target.files?.[0])}
      />
      {(recovery.candidate || recovery.error) && (
        <div className="recovery-banner" role="status" aria-label={t("Recuperação local")}>
          <HardDrive size={16} aria-hidden="true" />
          <div>
            <strong>{recovery.error ? t("Não foi possível atualizar a recuperação local.") :
              t("Recuperar projeto: {p0}", {p0: recovery.candidate!.project.model.title})}</strong>
            <small>{recovery.error ? t("A recuperação está indisponível. Salve o projeto manualmente.") :
              t("Cópia de {p0}. O arquivo original permanece separado.", {p0: formatDate(recovery.candidate!.capturedAt)})}</small>
          {recovery.error && <details><summary>{t("Detalhes da recuperação")}</summary><code>{recovery.error}</code></details>}
          </div>
          {recovery.candidate && <button disabled={busy} onClick={() => guarded(() => void restoreRecovery())}>
            <Undo2 size={14} />{t("Restaurar cópia")}</button>}
          <button disabled={busy} onClick={() => void recovery.discard()}>{t("Descartar cópia")}</button>
        </div>
      )}
      {error && (
        <div role="alert" className="error-banner">
          <TriangleAlert size={16} />
          <span>{t(error)}</span>
          <button onClick={() => setError(null)} aria-label={t("Fechar erro")}>
            <X size={15} />
          </button>
        </div>
      )}
      <div
        className="workbench"
        style={
          {
            "--inspector-width": inspectorWidth + "px",
          } as CSSProperties
        }
      >
        <main className="workspace">
          <div className="workspace-content">
            <div
              className={"graph-surface" + (tab !== "graph" ? " inactive" : "")}
            >
              {subgraphPath.length > 0 && (
                <div className="subgraph-breadcrumb-bar">
                  <button
                    className="subgraph-back-btn"
                    aria-label={t("Subir nível")}
                    title={t("Voltar ao nível anterior")}
                    onClick={() => setSubgraphPath((path) => path.slice(0, -1))}
                  >
                    <ArrowLeft size={14} />
                    <span>{t("Subir nível")}</span>
                  </button>
                  <div className="subgraph-breadcrumbs">
                    <button
                      className="crumb-btn root-crumb"
                      onClick={() => setSubgraphPath([])}
                    >{t("Grafo Principal")}</button>
                    {subgraphPath.map((nodeId, idx) => {
                      const n = nodes.find((item) => item.id === nodeId);
                      const isLast = idx === subgraphPath.length - 1;
                      return (
                        <span key={nodeId} className="crumb-segment">
                          <ChevronRight size={12} className="crumb-separator" />
                          <span
                            className={"kind-dot " + (n?.kind ?? "variable")}
                          />
                          <button
                            className={"crumb-btn" + (isLast ? " active" : "")}
                            disabled={isLast}
                            onClick={() =>
                              setSubgraphPath((path) => path.slice(0, idx + 1))
                            }
                          >
                            <strong>{n?.label ?? nodeId}</strong>
                            <code>({nodeId})</code>
                          </button>
                        </span>
                      );
                    })}
                  </div>
                  <div className="subgraph-mode-toggle" role="tablist">
                    <button
                      role="tab"
                      className={subgraphViewMode === "graph" ? "active" : ""}
                      aria-selected={subgraphViewMode === "graph"}
                      onClick={() => setSubgraphViewMode("graph")}
                    >
                      <Network size={13} />
                      <span>{t("Subgrafo Interno")}</span>
                    </button>
                    <button
                      role="tab"
                      className={subgraphViewMode === "spec" ? "active" : ""}
                      aria-selected={subgraphViewMode === "spec"}
                      onClick={() => setSubgraphViewMode("spec")}
                    >
                      <FileText size={13} />
                      <span>{t("Ficha Técnica & Catálogo")}</span>
                    </button>
                  </div>
                </div>
              )}
              {subgraphPath.length > 0 && subgraphViewMode === "spec" ? (
                (() => {
                  const activeId = subgraphPath[subgraphPath.length - 1];
                  const activeNode = nodes.find((n) => n.id === activeId);
                  const variable = loaded?.model.variables.find(
                    (v) => v.id === activeId,
                  );
                  const equation = loaded?.model.equations.find(
                    (e) => e.id === activeId,
                  );
                  const assumption = loaded?.model.assumptions.find(
                    (a) => a.id === activeId,
                  );
                  const requirement = loaded?.model.requirements.find(
                    (r) => r.id === activeId,
                  );
                  const observation = loaded?.model.observations.find(
                    (o) => o.id === activeId,
                  );
                  return (
                    <div className="node-technical-sheet">
                      <div className="sheet-header">
                        <div className="sheet-identity">
                          <span
                            className={
                              "kind-badge " + (activeNode?.kind ?? "variable")
                            }
                          >
                            {t(KIND[activeNode?.kind ?? "variable"])}
                          </span>
                          <h2>{activeNode?.label ?? activeId}</h2>
                          <code>{activeId}</code>
                        </div>
                        <div className="sheet-actions">
                          <button onClick={() => locate(activeId)}>
                            <Focus size={13} />{t(" Localizar no grafo")}</button>
                        </div>
                      </div>
                      <div className="sheet-body">
                        <div className="sheet-params">
                          <h3>{t("Parâmetros e Configuração Científica")}</h3>
                          {variable && (
                            <div className="sheet-param-row">
                              <span>{t("Unidade: ")}<strong>{variable.unit}</strong>
                              </span>
                              <span>{t("Valor:")}{" "}
                                <strong>
                                  {variable.value !== null
                                    ? variable.value
                                    : t("Entrada livre")}
                                </strong>
                              </span>
                              <span>{t("Fonte:")}{" "}
                                <em>{variable.source ?? t("Não informada")}</em>
                              </span>
                            </div>
                          )}
                          {equation && (
                            <div className="sheet-param-row">
                              <span>{t("LHS: ")}<code>{equation.lhs}</code>
                              </span>
                              <span>{t("Expressão: ")}<code>{formatExpr(equation.rhs)}</code>
                              </span>
                              <span>{t("Fonte:")}{" "}
                                <em>
                                  {equation.source ?? t("Dedução analítica")}
                                </em>
                              </span>
                            </div>
                          )}
                          {assumption && (
                            <div className="sheet-param-row">
                              <span>{t("Condição / Hipótese:")}{" "}
                                <strong>{assumption.label}</strong>
                              </span>
                              <span>{t("Justificativa:")}{" "}
                                <em>
                                  {assumption.justification ?? t("Critério de projeto")}
                                </em>
                              </span>
                            </div>
                          )}
                          {requirement && (
                            <div className="sheet-param-row">
                              <span>{t("Requisito Técnico:")}{" "}
                                <strong>{requirement.label}</strong>
                              </span>
                              <span>{t("Equação vinculada:")}{" "}
                                <code>
                                  {requirement.equation_id}
                                </code>
                              </span>
                            </div>
                          )}
                          {observation && (
                            <div className="sheet-param-row">
                              <span>{t("Valor de Referência:")}{" "}
                                <strong>
                                  {observation.value} {observation.unit}
                                </strong>
                              </span>
                              <span>{t("Tolerância:")}{" "}
                                <strong>{observation.tolerance}</strong>
                              </span>
                              <span>{t("Fonte:")}{" "}
                                <em>
                                  {observation.source ?? t("Ensaio empírico")}
                                </em>
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="sheet-markdown">
                          <div className="sheet-md-header">
                            <div className="sheet-md-title">
                              <BookOpen size={15} />
                              <h3>{t("Documentação Técnica & Catálogo em Markdown")}</h3>
                            </div>
                            <div className="spec-view-toggle" role="tablist">
                              <button
                                type="button"
                                className={specPreviewMode === "rendered" ? "active" : ""}
                                onClick={() => setSpecPreviewMode("rendered")}
                              >{t("Visualização Técnica")}</button>
                              <button
                                type="button"
                                className={specPreviewMode === "editor" ? "active" : ""}
                                onClick={() => setSpecPreviewMode("editor")}
                              >{t("Consultar fonte")}</button>
                            </div>
                          </div>

                          {specPreviewMode === "rendered" && (
                            <div className="sheet-rendered-preview">
                              <div className="rendered-math-card">
                                <span className="math-badge">{t("Fórmula Constitutiva")}</span>
                                <div className="rendered-math-formula">
                                  {equation
                                    ? t("$${p0} = {p1}$$", {p0: equation.lhs, p1: formatExpr(equation.rhs)})
                                    : variable
                                      ? t("$${p0} = {p1} \\text{ [{p2}]}$$", {p0: variable.id, p1: variable.value ?? "\\text{livre}", p2: variable.unit})
                                      : "—"}
                                </div>
                              </div>
                              <div className="rendered-spec-section">
                                <h4>{t("Premissas de Contorno & Hipóteses")}</h4>
                                <ul>
                                  {equation?.assumption_ids.length ? equation.assumption_ids.map(id => <li key={id}>{loaded?.model.assumptions.find(item => item.id === id)?.label ?? id}</li>) : <li>{t("Nenhuma hipótese vinculada a esta equação.")}</li>}
                                </ul>
                              </div>
                            </div>
                          )}

                          <div style={{ display: specPreviewMode === "editor" ? "block" : "block" }}>
                            <p className="sheet-md-description">{t("Fonte do modelo, somente leitura. Este protótipo de subsistema não executa nem salva componentes internos.")}</p>
                            <textarea
                              className="sheet-markdown-editor"
                              rows={8}
                              placeholder={t("Descreva as equações constitutivas, limites de validade e referências bibliográficas...")}
                              aria-label={t("Fonte do elemento (somente leitura)")}
                              readOnly
                              value={equation?.source ?? variable?.source ?? ""}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : subgraphPath.length > 0 && subgraphViewMode === "graph" ? (
                (() => {
                  const activeId = subgraphPath[subgraphPath.length - 1];
                  const activeNode = nodes.find((n) => n.id === activeId);
                  const nodeArch = nodeArchitectures[activeId] ?? "composite";
                  const internalNodes = subgraphInternalNodes[activeId] ?? [];
                  const incoming = loaded
                    ? loaded.graph.edges.filter((e) => e.target === activeId)
                    : [];
                  const outgoing = loaded
                    ? loaded.graph.edges.filter((e) => e.source === activeId)
                    : [];

                  return (
                    <div className="subsystem-builder-view">
                      <div className="subsystem-architecture-bar">
                        <div className="arch-selector">
                          <span className="arch-label">{t("Arquitetura deste Nó:")}</span>
                          <button
                            type="button"
                            className={"arch-btn" + (nodeArch === "composite" ? " active" : "")}
                            onClick={() =>
                              setNodeArchitectures((prev) => ({
                                ...prev,
                                [activeId]: "composite",
                              }))
                            }
                          >
                            <Layers size={13} />
                            <span>{t("Nó Composto (Subgrafo Interno)")}</span>
                          </button>
                          <button
                            type="button"
                            className={"arch-btn" + (nodeArch === "atomic" ? " active" : "")}
                            onClick={() =>
                              setNodeArchitectures((prev) => ({
                                ...prev,
                                [activeId]: "atomic",
                              }))
                            }
                          >
                            <FileText size={13} />
                            <span>{t("Nó Atômico (Especificação Direta)")}</span>
                          </button>
                        </div>

                        {nodeArch === "composite" && (
                          <button
                            type="button"
                            className="add-subnode-btn"
                            onClick={() => {
                              setNewSubNodeDraft({
                                id: `sub_${internalNodes.length + 1}`,
                                label: `Componente Interno ${internalNodes.length + 1}`,
                                kind: "variable",
                                expr: "",
                                unit: "W",
                              });
                              setNewSubNodeModal(true);
                            }}
                          >
                            <Plus size={13} />
                            <span>{t("Adicionar Nó Interno")}</span>
                          </button>
                        )}
                      </div>

                      {nodeArch === "atomic" ? (
                        <div className="atomic-node-info-card">
                          <Info size={24} className="atomic-icon" />
                          <h3>{t("Nó Terminal / Atômico")}</h3>
                          <p>{t("Este elemento é uma especificação analítica terminal direta. Ele não encapsula subgrafos adicionais e tem seus parâmetros matemáticos e fontes declarados diretamente.")}</p>
                          <button
                            type="button"
                            className="btn-switch-spec"
                            onClick={() => setSubgraphViewMode("spec")}
                          >
                            <FileText size={14} />
                            <span>{t("Abrir Ficha Técnica & Catálogo em Markdown")}</span>
                          </button>
                        </div>
                      ) : (
                        <div className="subsystem-flow-canvas">
                          {/* Column 1: Ingress Ports from outer graph */}
                          <div className="subsystem-col ingress-col">
                            <div className="col-header">
                              <span className="col-badge">{t("Entradas")}</span>
                              <h4>{t("Portas Externas (")}{incoming.length})</h4>
                            </div>
                            <div className="col-cards">
                              {incoming.length === 0 ? (
                                <p className="chain-empty">{t("Nenhuma entrada direta do grafo pai.")}</p>
                              ) : (
                                incoming.map((e, idx) => {
                                  const srcNode = nodes.find((n) => n.id === e.source);
                                  return (
                                    <div key={idx} className={"ingress-card " + (srcNode?.kind ?? "variable")}>
                                      <div className="ingress-header">
                                        <span className={"kind-dot " + (srcNode?.kind ?? "variable")} />
                                        <strong>{srcNode?.label ?? e.source}</strong>
                                      </div>
                                      <code>{e.source}</code>
                                      <span className="socket-dot output" title={t("Alimenta o subgrafo interno")} />
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          {/* Column 2: Internal Subgraph Network */}
                          <div className="subsystem-col internal-network-col">
                            <div className="col-header">
                              <span className="col-badge highlight">{t("Rede Interna")}</span>
                              <h4>{t("Subgrafo de Componentes (")}{internalNodes.length})</h4>
                            </div>
                            <div className="internal-nodes-grid">
                              {internalNodes.length === 0 ? (
                                <div className="subgraph-zero-state">
                                  <Layers size={22} />
                                  <p>{t("Nenhum sub-nó interno cadastrado ainda.")}</p>
                                  <button
                                    type="button"
                                    className="add-subnode-btn inline"
                                    onClick={() => setNewSubNodeModal(true)}
                                  >
                                    <Plus size={13} />
                                    <span>{t("Adicionar primeiro sub-nó")}</span>
                                  </button>
                                </div>
                              ) : (
                                internalNodes.map((sub, sIdx) => (
                                  <div
                                    key={sub.id}
                                    className={"subnode-card " + sub.kind}
                                    onDoubleClick={() => {
                                      // Deep nesting into subnode!
                                      setSubgraphPath((prev) => [...prev, sub.id]);
                                    }}
                                  >
                                    <div className="subnode-card-header">
                                      <span className={"kind-badge " + sub.kind}>{t(KIND[sub.kind])}</span>
                                      <strong>{sub.label}</strong>
                                      <code>{sub.id}</code>
                                    </div>
                                    {sub.expr && (
                                      <div className="subnode-expr">
                                        <span>{t("Fórmula:")}</span> <code>{sub.expr}</code>
                                      </div>
                                    )}
                                    <div className="subnode-footer">
                                      {sub.value !== undefined && (
                                        <span className="subnode-val">
                                          {sub.value} {sub.unit ?? ""}
                                        </span>
                                      )}
                                      <div className="subnode-card-actions">
                                        <button
                                          type="button"
                                          className="subnode-enter-btn"
                                          title={t("Entrar neste sub-nó (recursão)")}
                                          onClick={() => setSubgraphPath((prev) => [...prev, sub.id])}
                                        >{t("Entrar ")}<ArrowRight size={11} />
                                        </button>
                                        <button
                                          type="button"
                                          className="subnode-del-btn"
                                          title={t("Remover nó do subgrafo")}
                                          onClick={() => {
                                            setSubgraphInternalNodes((prev) => ({
                                              ...prev,
                                              [activeId]: (prev[activeId] ?? []).filter((_, idx) => idx !== sIdx),
                                            }));
                                          }}
                                        >
                                          <Trash2 size={11} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Column 3: Egress Port consolidating to parent graph */}
                          <div className="subsystem-col egress-col">
                            <div className="col-header">
                              <span className="col-badge">{t("Saída Consolidada")}</span>
                              <h4>{t("Resultado para o Grafo")}</h4>
                            </div>
                            <div className="col-cards">
                              <div className={"egress-card " + (activeNode?.kind ?? "variable")}>
                                <span className="socket-dot input" title={t("Recebe dados dos sub-nós internos")} />
                                <div className="egress-header">
                                  <span className={"kind-badge " + (activeNode?.kind ?? "variable")}>
                                    {t(KIND[activeNode?.kind ?? "variable"])}
                                  </span>
                                  <strong>{activeNode?.label ?? activeId}</strong>
                                </div>
                                <code>{activeId}</code>
                                <p className="egress-desc">{t("Saída consolidada do subsistema causal entregue ao grafo principal do projeto.")}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : loaded ? (
                <GraphView
                  ref={graphRef}
                  documentKey={documentKey}
                  initialView={initialView}
                  onViewChange={() => {
                    setDirty(true);
                    setSaveMessage("Alterações não salvas");
                  }}
                  onHint={setHint}
                  graph={displayGraph??loaded.graph}
                  groupContext={modelGroups.find(g=>g.id===activeGroup)}
                  exitGroup={()=>setActiveGroup(null)}
                  model={loaded.model}
                  run={run}
                  selected={selected}
                  selectedNodes={selectedNodes}
                  focus={focus}
                  onFocusChange={setFocus}
                  onSelect={id=>{if(id?.startsWith("@group:")){changeGroups(modelGroups.map(g=>g.id===id.slice(7)?{...g,collapsed:false}:g));return;}selectNode(id);}}
                  onSelectNodes={(ids) => {
                    ids=ids.filter(id=>!id.startsWith("@"));
                    setSelectedNodes(ids);
                    setSelected(ids[0] ?? null);
                    if (ids.length > 0) {
                      setInspectorOpen(true);
                      setInspectorCollapsed(false);
                    }
                  }}
                  onEnterNode={(id) => {
                    if(id.startsWith("@group:")){setActiveGroup(id.slice(7));return;}
                    const group=modelGroups.find(g=>g.nodeIds.includes(id));if(group){setActiveGroup(group.id);return;}
                    selectNode(id);setInspectorOpen(true);
                  }}
                  onRun={() => void analyze()}
                  onConnectNodes={handleConnect}
                  onDisconnectEdge={handleDisconnect}
                  preferences={appSettings}
                  onCreateNode={handleCreateNode}
                  onNewNode={openNodeEditor}
                  onDeleteNode={requestDeleteNode}
                  busy={busy}
                  executingNodeId={executingNodeId}
                  tool={tool}
                  onToolChange={setTool}
                  active={tab === "graph"}
                  navigatorTarget={navigatorTarget}
                  inspectorOpen={inspectorOpen}
                  onToggleInspector={() => setInspectorOpen((open) => !open)}
                  onToggleResults={() => setResultsVisible((value) => !value)}
                  onOpenSettings={() => setDialog("settings")}
                  bottomDock={tab === "graph" ? resultsDockNode : null}
                />
              ) : (
                <div className="loading-model">
                  <LoaderCircle className="spin" size={20} />
                  {busy ? t(operationLabel) : t("Modelo indisponível.")}
                </div>
              )}
            </div>
            {tab === "elements" && (
              <div className="elements-workbench-view">
                <div
                  className="elements-library"
                  role="region"
                  aria-label={t("Biblioteca de elementos")}
                >
                <aside
                  className="library-sidebar"
                  aria-label={t("Categorias da biblioteca")}
                >
                  <div className="library-sidebar-header">
                    <h3>{t("Biblioteca")}</h3>
                    <span className="library-total-badge">{nodes.length}</span>
                  </div>
                  <nav className="library-categories">
                    <button
                      className={
                        libraryCategory === "all"
                          ? "category-btn active"
                          : "category-btn"
                      }
                      onClick={() => setLibraryCategory("all")}
                    >
                      <Layers3 size={15} />
                      <span>{t("Todos")}</span>
                      <span className="cat-count">{nodes.length}</span>
                    </button>
                    <div className="cat-divider" />
                    {(
                      [
                        ["variable", Sigma],
                        ["equation", FunctionSquare],
                        ["assumption", FileText],
                        ["requirement", ShieldCheck],
                        ["observation", Database],
                      ] as const
                    ).map(([kind, Icon]) => {
                      const count = nodes.filter(
                        (n) => n.kind === kind,
                      ).length;
                      return (
                        <div key={kind} className="category-item-row">
                          <button
                            className={
                              libraryCategory === kind
                                ? `category-btn active ${kind}`
                                : `category-btn ${kind}`
                            }
                            onClick={() => setLibraryCategory(kind)}
                          >
                            <Icon size={15} style={{ color: kindColors[kind] }} />
                            <span>{t(KIND_PLURAL[kind])}</span>
                            <span className="cat-count">{count}</span>
                          </button>
                          <input
                            type="color"
                            className="category-color-swatch"
                            aria-label={t("Cor do tipo {p0}", {p0: t(KIND_PLURAL[kind])})}
                            title={t("Personalizar cor de {p0}", {p0: t(KIND_PLURAL[kind])})}
                            value={kindColors[kind]}
                            onChange={(e) => {
                              e.stopPropagation();
                              const newColor = e.target.value;
                              setKindColors((prev) => ({
                                ...prev,
                                [kind]: newColor,
                              }));
                            }}
                          />
                        </div>
                      );
                    })}
                  </nav>
                </aside>

                <section className="library-main">
                  <header className="library-toolbar">
                    <label className="library-search">
                      <Search size={15} />
                      <input
                        aria-label={t("Buscar elemento")}
                        placeholder={t("Pesquisar elementos por nome, ID ou expressão…")}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                      {search && (
                        <button
                          className="search-clear-btn"
                          aria-label={t("Limpar busca")}
                          onClick={() => setSearch("")}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </label>
                    <div className="library-meta">
                      <span>
                        {libraryNodes.length}{" "}
                        {libraryNodes.length === 1
                          ? t("elemento")
                          : t("elementos")}
                      </span>
                    </div>
                    <button
                      className="btn-create-catalog-element"
                      aria-label={t("Novo Elemento no Catálogo")}
                      onClick={() => openNodeEditor(libraryCategory === "all" ? "variable" : libraryCategory)}
                    >
                      <Plus size={14} />
                      <span>{t("Novo Elemento no Catálogo")}</span>
                    </button>
                    <div
                      className="library-view-toggle"
                      role="group"
                      aria-label={t("Modo de visualização")}
                    >
                      <button
                        className={
                          libraryViewMode === "grid"
                            ? "view-toggle-btn active"
                            : "view-toggle-btn"
                        }
                        aria-label={t("Visualização em miniaturas")}
                        aria-pressed={libraryViewMode === "grid"}
                        title={t("Miniaturas")}
                        onClick={() => setLibraryViewMode("grid")}
                      >
                        <LayoutGrid size={15} />
                      </button>
                      <button
                        className={
                          libraryViewMode === "list"
                            ? "view-toggle-btn active"
                            : "view-toggle-btn"
                        }
                        aria-label={t("Visualização em lista")}
                        aria-pressed={libraryViewMode === "list"}
                        title={t("Lista")}
                        onClick={() => setLibraryViewMode("list")}
                      >
                        <List size={15} />
                      </button>
                    </div>
                  </header>

                  <div className="library-content">
                    {libraryNodes.length === 0 ? (
                      <div className="library-empty">
                        <Search size={24} />
                        <p>{t("Nenhum elemento encontrado nesta categoria.")}</p>
                      </div>
                    ) : libraryViewMode === "grid" ? (
                      <div className="library-grid" role="list">
                        {libraryNodes.map((node) => {
                          const isSel = selected === node.id;
                          const edgesCount =
                            loaded?.graph.edges.filter(
                              (e) =>
                                e.source === node.id || e.target === node.id,
                            ).length ?? 0;
                          const variable = loaded?.model.variables.find(
                            (v) => v.id === node.id,
                          );
                          const equation = loaded?.model.equations.find(
                            (e) => e.id === node.id,
                          );
                          const assumption = loaded?.model.assumptions.find(
                            (a) => a.id === node.id,
                          );
                          const requirement = loaded?.model.requirements.find(
                            (r) => r.id === node.id,
                          );
                          const observation = loaded?.model.observations.find(
                            (o) => o.id === node.id,
                          );

                          const KindIcon = KIND_ICONS[node.kind];

                          return (
                            <button
                              key={node.id}
                              role="button"
                              className={
                                "asset-card " +
                                node.kind +
                                (isSel ? " selected" : "")
                              }
                              onClick={() => selectNode(node.id)}
                            >
                              <div className="asset-card-top">
                                <span className={"kind-badge " + node.kind}>
                                  <i className={"kind-dot " + node.kind} />
                                  {t(KIND[node.kind])}
                                </span>
                                <code>{node.id}</code>
                              </div>
                              <div
                                className={"visual-node-thumb " + node.kind}
                                aria-hidden="true"
                              >
                                <span className="thumb-port left" title={t("Entrada")} />
                                <span className="thumb-port right" title={t("Saída")} />
                                <div className="thumb-center">
                                  {KindIcon && <KindIcon size={16} className="thumb-icon" />}
                                  <span className="thumb-ports-hint">
                                    {node.kind === "assumption"
                                      ? t("HIP")
                                      : node.kind === "requirement"
                                        ? t("REQ")
                                        : node.kind === "observation"
                                          ? t("VAL")
                                          : t("E · S")}
                                  </span>
                                </div>
                              </div>
                              <h4 className="asset-card-title">{node.label}</h4>
                              <div className="asset-card-body">
                                {variable && (
                                  <span className="asset-value">
                                    {variable.value !== null
                                      ? t("{p0} {p1}", {p0: variable.value, p1: variable.unit})
                                      : t("Entrada livre")}
                                  </span>
                                )}
                                {equation && (
                                  <span
                                    className="asset-expr"
                                    title={equation.source}
                                  >
                                    {equation.lhs} = …
                                  </span>
                                )}
                                {assumption && (
                                  <span
                                    className="asset-desc"
                                    title={assumption.justification}
                                  >
                                    {assumption.justification ||
                                      t("Hipótese de modelo")}
                                  </span>
                                )}
                                {requirement && (
                                  <span className="asset-desc">{t("Exige eq. ")}{requirement.equation_id}
                                  </span>
                                )}
                                {observation && (
                                  <span className="asset-value">{t("Ref: ")}{observation.value} {observation.unit}{" "}
                                    (±{observation.tolerance})
                                  </span>
                                )}
                              </div>
                              <div className="asset-card-footer">
                                <span
                                  className="asset-edges"
                                  title={t("{p0} conexões", {p0: edgesCount})}
                                >
                                  <Network size={11} />
                                  {edgesCount}{" "}
                                  {edgesCount === 1 ? t("vínculo") : t("vínculos")}
                                </span>
                                <span
                                  className="asset-locate"
                                  title={t("Localizar no grafo")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    locate(node.id);
                                  }}
                                >
                                  <Focus size={13} />
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="library-list" role="list">
                        {libraryNodes.map((node) => {
                          const isSel = selected === node.id;
                          const edgesCount =
                            loaded?.graph.edges.filter(
                              (e) =>
                                e.source === node.id || e.target === node.id,
                            ).length ?? 0;
                          const variable = loaded?.model.variables.find(
                            (v) => v.id === node.id,
                          );
                          const equation = loaded?.model.equations.find(
                            (e) => e.id === node.id,
                          );
                          const observation = loaded?.model.observations.find(
                            (o) => o.id === node.id,
                          );

                          return (
                            <button
                              key={node.id}
                              role="button"
                              className={
                                "library-row " +
                                node.kind +
                                (isSel ? " selected" : "")
                              }
                              onClick={() => selectNode(node.id)}
                            >
                              <span className={"kind-dot " + node.kind} />
                              <div className="library-row-main">
                                <strong>{node.label}</strong>
                                <code>{node.id}</code>
                              </div>
                              <span className="library-row-kind">
                                {t(KIND[node.kind])}
                              </span>
                              <div className="library-row-detail">
                                {variable &&
                                  (variable.value !== null
                                    ? `${variable.value} ${variable.unit}`
                                    : "Entrada livre")}
                                {equation && `${equation.lhs} = …`}
                                {observation &&
                                  `Ref: ${observation.value} ${observation.unit}`}
                              </div>
                              <span className="library-row-edges">
                                <Network size={11} /> {edgesCount}
                              </span>
                              <span
                                className="asset-locate"
                                title={t("Localizar no grafo")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  locate(node.id);
                                }}
                              >
                                <Focus size={13} />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              </div>
              {resultsDockNode}
            </div>
          )}
          </div>
        </main>
        {(inspectorOpen || navigatorOpen) && (
          <>
            {!inspectorCollapsed && inspectorOpen && (
              <Splitter
                label={t("Largura do inspetor")}
                value={inspectorWidth}
                onChange={setInspectorWidth}
                reverse
              />
            )}
            <div
              className={
                "right-panels" +
                (inspectorCollapsed && !navigatorOpen ? " collapsed-dock" : "")
              }
            >
              {inspectorOpen &&
                (inspectorCollapsed ? (
                  <div className="inspector-docked-strip">
                    <button
                      className="inspector-docked-btn"
                      aria-label={t("Expandir painel de propriedades")}
                      title={t("Expandir propriedades")}
                      onClick={() => setInspectorCollapsed(false)}
                    >
                      <ChevronLeft size={14} />
                      <span className="docked-text">{t("Propriedades")}</span>
                    </button>
                  </div>
                ) : (
                  <Inspector
                    model={loaded?.model ?? null}
                    run={run}
                    node={current}
                    check={selectedCheck}
                    onClose={() => {
                      setInspectorOpen(false);
                      setInspectorCollapsed(false);
                    }}
                    onCollapse={() => setInspectorCollapsed(true)}
                    busy={busy}
                    onLocate={(id) => {
                      if (id ?? selected) {
                        locate((id ?? selected)!);
                        setNavigatorOpen(true);
                      }
                    }}
                    onUpdateNode={handleUpdateNode}
                    onDisconnectEdge={handleDisconnect}
                    onConnectNodes={handleConnect}
                    onDeleteNode={requestDeleteNode}
                    selectedNodes={selectedNodes}
                    onDeleteNodes={requestDeleteNodes}
                    onClearSelection={() => {
                      setSelected(null);
                      setSelectedNodes([]);
                    }}
                  />
                ))}
              {navigatorOpen && (
                <section
                  className="navigator-panel"
                  aria-label={t("Navegador do grafo")}
                >
                  <div className="pane-heading">
                    <h2>{t("Navegador do grafo")}</h2>
                    <div>
                      <button
                        aria-label={
                          navigatorCollapsed
                            ? t("Expandir navegador")
                            : t("Recolher navegador")
                        }
                        onClick={() =>
                          setNavigatorCollapsed(!navigatorCollapsed)
                        }
                      >
                        {navigatorCollapsed ? (
                          <ChevronRight size={15} />
                        ) : (
                          <ChevronDown size={15} />
                        )}
                      </button>
                      <button
                        aria-label={t("Fechar navegador")}
                        onClick={() => setNavigatorOpen(false)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                  {!navigatorCollapsed && (
                    <div
                      ref={setNavigatorTarget}
                      className="navigator-target"
                    />
                  )}
                  <button
                    className="navigator-fit"
                    onClick={() => graphRef.current?.fitAll()}
                  >
                    <Focus size={13} />{t("Enquadrar modelo")}</button>
                </section>
              )}
            </div>
          </>
        )}
      </div>
      {dialog && (
        <div className="modal-backdrop" onClick={() => setDialog(null)}>
          <section
            className={
              "app-dialog " +
              (dialog === "origin"
                ? "origin-dialog"
                : dialog === "settings"
                  ? "settings-dialog"
                  : dialog === "shortcuts" || dialog === "docs" || dialog === "feedback"
                    ? "help-dialog large-dialog"
                    : "help-dialog")
            }
            role="dialog"
            aria-modal="true"
            aria-label={
              dialog === "origin"
                ? t("Origem e execução")
                : dialog === "settings"
                  ? t("Configurações")
                  : dialog === "shortcuts"
                    ? t("Personalizar atalhos de teclado")
                    : dialog === "docs"
                      ? t("Documentação técnica e guias")
                      : dialog === "feedback"
                        ? t("Relatório de diagnósticos e feedback")
                        : dialog === "updates"
                          ? t("Verificar atualizações")
                          : dialog === "about"
                            ? t("Sobre o Nexo")
                            : t("Ajuda e atalhos")
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pane-heading">
              <h2>
                {dialog === "origin"
                  ? t("Origem dos dados e execução")
                  : dialog === "settings"
                    ? t("Configurações")
                    : dialog === "shortcuts"
                      ? t("Personalizar atalhos de teclado")
                      : dialog === "docs"
                        ? t("Documentação técnica e guias")
                        : dialog === "feedback"
                          ? t("Relatório de diagnósticos e feedback")
                          : dialog === "updates"
                            ? t("Verificar atualizações")
                            : dialog === "about"
                              ? t("Sobre o Nexo")
                              : t("Ajuda e atalhos")}
              </h2>
              <button
                aria-label={t("Fechar diálogo")}
                onClick={() => setDialog(null)}
              >
                <X size={16} />
              </button>
            </div>
            {dialog === "origin" ? (
              <div className="dialog-content">
                <HardDrive size={25} />
                <h3>{t("Localização do projeto e execução")}</h3>
                <p>{t("O projeto e os cálculos matemáticos são processados 100% neste computador pelo motor Python offline, sem tráfego de dados para serviços externos ou nuvem.")}</p>
                <dl className="context-table">
                  <div>
                    <dt>{t("Arquivo em disco")}</dt>
                    <dd>
                      {projectPath ? (
                        <code>{projectPath}</code>
                      ) : (
                        <em>{t("Projeto em memória (ainda não salvo em disco).")}</em>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("Pasta do projeto")}</dt>
                    <dd>
                      {projectPath ? (
                        <code>
                          {projectPath.replace(/[\\/][^\\/]+$/, "")}
                        </code>
                      ) : (
                        <span>{t("Use ")}<strong>{t("Salvar projeto")}</strong>{t(" (Ctrl+S) ou")}{" "}
                          <strong>{t("Salvar como…")}</strong>{t(" no menu Arquivo para definir a pasta no computador.")}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("Formato")}</dt>
                    <dd>{t("Projeto Nexo (.nexo.json) · JSON versionado")}</dd>
                  </div>
                  <div>
                    <dt>{t("Motor científico")}</dt>
                    <dd>{t("Processo local Python 3.12 (IPC via subprocesso isolado)")}</dd>
                  </div>
                </dl>
                <h3>{t("GitHub · planejado")}</h3>
                <p>{t("Um repositório será uma origem de arquivos, com revisão/commit identificado. Executar na nuvem será uma escolha separada. Esta versão ainda não importa repositórios nem executa análise remota.")}</p>
              </div>
            ) : dialog === "settings" ? (
            <SettingsPanel value={appSettings} onChange={setAppSettings} tab={settingsTab} onTabChange={setSettingsTab} />
          ) : dialog === "shortcuts" ? (
            <div className="dialog-content shortcuts-dialog-content">
              <p>{t("Visualize os atalhos de teclado do Nexo. Todos os comandos operam globalmente na interface gráfica.")}</p>
              <div className="shortcuts-groups">
                <div className="shortcuts-group">
                  <h4>{t("Geral & Arquivo")}</h4>
                  <dl className="context-table">
                    {[
                      ["Ctrl+S", "Salvar projeto (.nexo)"],
                      ["Ctrl+Shift+S", "Salvar como outro arquivo"],
                      ["Ctrl+O", "Abrir projeto ou modelo JSON"],
                      ["F5", "Executar as regras do modelo"],
                      ["Ctrl+K", "Buscar nó ou elemento no projeto"],
                      ["Ctrl+,", "Abrir configurações e preferências"],
                      ["Esc", "Fechar janelas ou cancelar execução"],
                    ].map(([k, desc]) => (
                      <div key={k}>
                        <dt><kbd>{t(k)}</kbd></dt>
                        <dd>{t(desc)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="shortcuts-group">
                  <h4>{t("Edição de Elementos")}</h4>
                  <dl className="context-table">
                    {[
                      ["Ctrl+Z", "Desfazer alteração"],
                      ["Ctrl+Shift+Z", "Refazer alteração"],
                      ["Ctrl+X", "Recortar nós selecionados"],
                      ["Ctrl+C", "Copiar nós selecionados"],
                      ["Ctrl+V", "Colar nós da área de transferência"],
                      ["Ctrl+A", "Selecionar todos os nós do grafo"],
                      ["Del / Delete", "Excluir nós selecionados"],
                    ].map(([k, desc]) => (
                      <div key={k}>
                        <dt><kbd>{t(k)}</kbd></dt>
                        <dd>{t(desc)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="shortcuts-group">
                  <h4>{t("Viewport & Navegação")}</h4>
                  <dl className="context-table">
                    {[
                      ["V", "Ativar ferramenta de seleção"],
                      ["H / Espaço", "Mover viewport (Pan)"],
                      ["Home / F", "Enquadrar todo o modelo"],
                      ["Roda do mouse", "Zoom fluido no cursor"],
                      ["Duplo clique", "Inspecionar ou abrir subsistema, conforme preferência"],
                      ["Shift + Clique", "Seleção múltipla de nós"],
                    ].map(([k, desc]) => (
                      <div key={k}>
                        <dt><kbd>{t(k)}</kbd></dt>
                        <dd>{t(desc)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>
          ) : dialog === "docs" ? (
            <div className="dialog-content docs-dialog-content">
              <div className="docs-section">
                <h3>{t("Modelo, regras e limites")}</h3>
                <p>{t("O ")}<strong>{t("Nexo")}</strong>{t(" representa modelos e dependências computacionais. As verificações são limitadas às regras implementadas; não constituem prova formal ou inferência causal.")}</p>
                <ul className="docs-list">
                  <li>
                    <strong>{t("Variáveis:")}</strong>{t(" Entidades que representam grandezas físicas (com unidades do SI), parâmetros e valores livres.")}</li>
                  <li>
                    <strong>{t("Equações:")}</strong>{t(" Expressões restritas de adição, subtração e multiplicação entre variáveis. A saída precisa ser uma quantidade derivada.")}</li>
                  <li>
                    <strong>{t("Hipóteses:")}</strong>{t(" Premissas fundamentais que justificam o domínio de validade ou simplificações da formulação física.")}</li>
                  <li>
                    <strong>{t("Requisitos:")}</strong>{t(" Contratos de cobertura: exigem uma equação ou uma justificativa de exclusão. Desigualdades gerais ainda não são verificadas.")}</li>
                  <li>
                    <strong>{t("Referências / Observações:")}</strong>{t(" Valores de referência com unidade, tolerância absoluta e fonte. Os exemplos incluídos são sintéticos.")}</li>
                </ul>
              </div>

              <div className="docs-section">
                <h3>{t("Portas Tipadas e Ligações")}</h3>
                <p>{t("A coerência do grafo é validada através de soquetes de conexão com papéis bem definidos:")}</p>
                <ul className="docs-list">
                  <li><strong style={{ color: "#0284c7" }}>{t("E (Entrada):")}</strong>{t(" Conexão para variáveis independentes de cálculo.")}</li>
                  <li><strong style={{ color: "#16a34a" }}>{t("S (Saída):")}</strong>{t(" Produz o resultado calculado pela equação.")}</li>
                  <li><strong style={{ color: "#d97706" }}>{t("HIP:")}</strong>{t(" Vincula justificativas físicas à equação.")}</li>
                  <li><strong style={{ color: "#dc2626" }}>{t("REQ:")}</strong>{t(" Vincula um contrato de cobertura a uma equação.")}</li>
                  <li><strong style={{ color: "#16a34a" }}>{t("VAL:")}</strong>{t(" Conecta dados de referência empírica para comparação de desvio.")}</li>
                </ul>
              </div>

              <div className="docs-section">
                <h3>{t("Motor Científico Offline")}</h3>
                <p>{t("O motor opera 100% no computador via Python 3.12, SymPy e álgebra simbólica, sem envio de dados a servidores remotos.")}</p>
              </div>
            </div>
          ) : dialog === "feedback" ? (
            <div className="dialog-content feedback-dialog-content">
              <p>{t("Gere um pacote de diagnóstico e contexto para relatar bugs, comportamentos inesperados ou sugerir melhorias.")}</p>

              <div className="feedback-sysinfo">
                <h4>{t("Ambiente Atual")}</h4>
                <div className="feedback-meta-grid">
                  <div><span className="meta-lbl">{t("Aplicativo:")}</span>{t(" Nexo Desktop v0.1.0")}</div>
                  <div><span className="meta-lbl">{t("Renderizador:")}</span>{t(" Rust WebAssembly + WebGL2 (GPU)")}</div>
                  <div><span className="meta-lbl">{t("Motor Científico:")}</span>{t(" Python 3.12 Offline")}</div>
                  <div><span className="meta-lbl">{t("Modelo Carregado:")}</span> {loaded?.model.title ?? t("Nenhum")} ({loaded?.graph.nodes.length ?? 0}{t(" nós, ")}{loaded?.graph.edges.length ?? 0}{t(" ligações)")}</div>
                  <div><span className="meta-lbl">{t("Última Execução:")}</span> {run ? t("{p0} ({p1} achados)", {p0: run.outcome, p1: run.counts.failed}) : t("Ocioso")}</div>
                  <div><span className="meta-lbl">{t("Logs Registrados:")}</span> {executionLogs.length}{t(" entradas")}</div>
                </div>
              </div>

              <div className="feedback-input-group">
                <label htmlFor="feedback-text">
                  <strong>{t("O que ocorreu ou qual é a sugestão?")}</strong>
                </label>
                <textarea
                  id="feedback-text"
                  rows={4}
                  placeholder={t("Descreva o que aconteceu, passos para reproduzir ou o que gostaria de ver melhorado...")}
                  value={feedbackNotes}
                  onChange={(e) => setFeedbackNotes(e.target.value)}
                />
              </div>

              <div className="feedback-actions">
                <button
                  type="button"
                  className="feedback-copy-btn"
                  onClick={() => {
                    const payload = {
                      timestamp: new Date().toISOString(),
                      app: "Nexo Desktop",
                      version: "0.1.0",
                      userNotes: feedbackNotes,
                      model: loaded?.model
                        ? { id: loaded.model.id, title: loaded.model.title, nodesCount: loaded.graph.nodes.length, edgesCount: loaded.graph.edges.length }
                        : null,
                      runStatus: run?.outcome ?? "none",
                      recentLogs: executionLogs.slice(-20),
                      environment: {
                        userAgent: navigator.userAgent,
                        platform: navigator.platform,
                        viewport: `${window.innerWidth}x${window.innerHeight}`,
                      },
                    };
                    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).catch(() => {});
                    setFeedbackCopied(true);
                    setTimeout(() => setFeedbackCopied(false), 3000);
                  }}
                >
                  <Copy size={14} />
                  {feedbackCopied ? t("Diagnóstico copiado para área de transferência!") : t("Copiar pacote de diagnóstico (JSON)")}
                </button>
                <button
                  type="button"
                  className="feedback-save-btn"
                  onClick={() => {
                    const payload = {
                      timestamp: new Date().toISOString(),
                      app: "Nexo Desktop",
                      version: "0.1.0",
                      userNotes: feedbackNotes,
                      model: loaded?.model,
                      run: run,
                      executionLogs: executionLogs,
                    };
                    download(JSON.stringify(payload, null, 2), `nexo-diagnostico-${Date.now()}.json`);
                  }}
                >
                  <ArrowDownToLine size={14} />{t("Exportar arquivo de diagnóstico (.json)")}</button>
              </div>
            </div>
          ) : dialog === "updates" ? (
            <div className="dialog-content updates-dialog-content">
              <div className="updates-hero">
                <Sparkles size={32} className="updates-icon" />
                <h3>{t("Atualizações não configuradas")}</h3>
                <div className="version-pill">{t("Nexo Desktop v0.1.0")}</div>
              </div>
              <p>{t("O Nexo opera em modo ")}<strong>{t("Desktop Soberano Offline")}</strong>{t(". Não realiza chamadas para a internet, consultas remotas ou telemetria em segundo plano.")}</p>
              <div className="update-details-box">
                <dl className="context-table">
                  <div>
                    <dt>{t("Canal de distribuição")}</dt>
                    <dd>{t("Compilação local Windows x64")}</dd>
                  </div>
                  <div>
                    <dt>{t("Versão atual")}</dt>
                    <dd>{t("v0.1.0")}</dd>
                  </div>
                  <div>
                    <dt>{t("Formato nativo")}</dt>
                    <dd>{t("Projeto Nexo (.nexo / .nexo.json)")}</dd>
                  </div>
                  <div>
                    <dt>{t("Renderizador gráfico")}</dt>
                    <dd>{t("Rust WebAssembly + GPU WebGL2")}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : dialog === "about" ? (
            <div className="dialog-content about-dialog-content">
              <div className="about-brand">
                <Network size={36} className="about-logo" />
                <div>
                  <h3>{t("Nexo")}</h3>
                  <p className="about-subtitle">{t("Laboratório de Conhecimento Matemático-Causal com Análise de Lacunas")}</p>
                </div>
              </div>
              <p>{t("Ambiente de engenharia computacional para modelagem, validação causal e análise de consistência dimensional em sistemas complexos.")}</p>
              <dl className="context-table">
                <div>
                  <dt>{t("Versão")}</dt>
                  <dd>{t("0.1.0 Desktop")}</dd>
                </div>
                <div>
                  <dt>{t("Arquitetura")}</dt>
                  <dd>{t("Tauri 2 · Rust WebAssembly · Python 3.12 · React 19")}</dd>
                </div>
                <div>
                  <dt>{t("Privacidade")}</dt>
                  <dd>{t("Processamento 100% local · Sem tráfego externo")}</dd>
                </div>
                <div>
                  <dt>{t("Finalidade")}</dt>
                  <dd>{t("Pesquisa e desenvolvimento em engenharia e ciências exatas")}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="dialog-content">
              <p>{t("Defina quantidades e fontes, escreva expressões, ligue hipóteses e requisitos e compare resultados com referências.")}</p>
              <dl className="context-table">
                {[
                  ["Ctrl+O", "Abrir projeto"],
                  ["Ctrl+S", "Salvar projeto"],
                  ["Ctrl+Shift+S", "Salvar como"],
                  ["Ctrl+Z / Ctrl+Shift+Z", "Desfazer / refazer edição"],
                  ["Ctrl+K", "Pesquisar no projeto"],
                  ["Del / Delete", "Excluir nó selecionado"],
                  ["F5", "Verificar modelo"],
                  ["F / Home", "Enquadrar seleção / modelo"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <dt>
                      <kbd>{t(key)}</kbd>
                    </dt>
                    <dd>{t(label)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          </section>
        </div>
      )}
      {deleteConfirm && (
        <div className="modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <section
            className="app-dialog delete-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("Confirmar exclusão de elemento conectado")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pane-heading">
              <h2>
                <TriangleAlert size={18} className="warning-icon" />{t("Confirmar exclusão")}</h2>
              <button
                aria-label={t("Fechar diálogo")}
                onClick={() => setDeleteConfirm(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="dialog-content">
              {deleteConfirm.nodeIds.length > 1 ? (
                <p>{t("Os ")}<strong>{deleteConfirm.nodeIds.length}{t(" elementos selecionados")}</strong>{t(" possuem")}{" "}
                  <strong>{deleteConfirm.connections.length}{t(" ligação(ões)")}</strong>{t(" com o restante do modelo:")}</p>
              ) : (
                <p>{t("O elemento ")}<strong>{deleteConfirm.labels[0]}</strong> (
                  <code>{deleteConfirm.nodeIds[0]}</code>{t(") possui")}{" "}
                  <strong>{deleteConfirm.connections.length}{t(" ligação(ões)")}</strong>{t(" com outros elementos do modelo:")}</p>
              )}
              <ul className="delete-connections-list">
                {deleteConfirm.connections.map((c, i) => (
                  <li key={i}>
                    <span className={"kind-badge-dir " + c.direction}>
                      {c.direction === "saída"
                        ? t("Alimenta")
                        : t("Depende de")}
                    </span>
                    <strong>{c.label}</strong>
                    <code>({c.relation})</code>
                  </li>
                ))}
              </ul>
              <p className="dialog-note">{t("Ao excluir, essas relações serão desfeitas e a integridade do modelo será recalculada.")}</p>
              <div className="dialog-actions">
                <button onClick={() => setDeleteConfirm(null)}>{t("Cancelar")}</button>
                <button
                  className="danger-button"
                  autoFocus
                  onClick={() => {
                    const ids = deleteConfirm.nodeIds;
                    setDeleteConfirm(null);
                    handleDeleteNodes(ids);
                  }}
                >
                  <Trash2 size={14} />{t("Excluir ")}{deleteConfirm.nodeIds.length > 1 ? t("{p0} elementos", {p0: deleteConfirm.nodeIds.length}) : t("mesmo assim")}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {confirmReplace && (
        <div className="modal-backdrop">
          <section
            className="app-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("Alterações não salvas")}
          >
            <div className="dialog-content">
              <h3>{t("Salvar antes de continuar?")}</h3>
              <p>{t("O projeto atual contém alterações não salvas.")}</p>
              <div className="dialog-actions">
                <button
                  onClick={() => {
                    setConfirmReplace(false);
                    pendingAction.current = null;
                  }}
                >{t("Cancelar")}</button>
                <button
                  onClick={() => {
                    setConfirmReplace(false);
                    pendingAction.current?.();
                    pendingAction.current = null;
                  }}
                >{t("Continuar sem salvar")}</button>
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (await saveProject()) {
                      setConfirmReplace(false);
                      pendingAction.current?.();
                      pendingAction.current = null;
                    }
                  }}
                >{t("Salvar e continuar")}</button>
              </div>
            </div>
          </section>
        </div>
      )}
      {newCatalogModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setNewCatalogModalOpen(false)}
        >
          <section
            className="app-dialog new-catalog-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("Novo Elemento no Catálogo")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pane-heading">
              <h2>
                <Plus size={16} />{t("Novo Elemento no Catálogo")}</h2>
              <button
                aria-label={t("Fechar diálogo")}
                onClick={() => setNewCatalogModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <form
              className="dialog-content"
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateCatalogElement();
              }}
            >
              {error && <p role="alert" className="error-banner">{t(error)}</p>}
              <div className="editor-field">
                <span>{t("Tipo de elemento")}</span>
                <select
                  aria-label={t("Tipo de elemento")}
                  value={catalogDraft.kind}
                  onChange={(e) => {
                    const k = e.target.value as Kind;
                    openNodeEditor(k);
                  }}
                >
                  {(Object.entries(KIND) as [Kind, string][]).map(
                    ([kind, label]) => (
                      <option key={kind} value={kind}>
                        {t(label)}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div className="editor-pair">
                <div className="editor-field">
                  <span>{t("Identificador (ID único)")}</span>
                  <input
                    aria-label={t("Identificador do elemento")}
                    value={catalogDraft.id}
                    required
                    onChange={(e) =>
                      setCatalogDraft((d) => ({ ...d, id: e.target.value }))
                    }
                    placeholder={t("ex: Q_rad")}
                  />
                </div>
                <div className="editor-field">
                  <span>{t("Nome / Rótulo")}</span>
                  <input
                    aria-label={t("Rótulo do elemento")}
                    value={catalogDraft.label}
                    required
                    onChange={(e) =>
                      setCatalogDraft((d) => ({ ...d, label: e.target.value }))
                    }
                    placeholder={t("ex: Radiação solar incidente")}
                  />
                </div>
              </div>

              {catalogDraft.kind === "variable" && (
                <div className="editor-pair">
                  <div className="editor-field">
                    <span>{t("Unidade de medida (SI)")}</span>
                    <input
                      aria-label={t("Unidade")}
                      value={catalogDraft.unit}
                      onChange={(e) =>
                        setCatalogDraft((d) => ({ ...d, unit: e.target.value }))
                      }
                      placeholder={t("W, m, kg, K...")}
                    />
                  </div>
                  <div className="editor-field">
                    <span>{t("Valor inicial (opcional)")}</span>
                    <input
                      aria-label={t("Valor inicial")}
                      type="number"
                      step="any"
                      value={catalogDraft.value}
                      onChange={(e) =>
                        setCatalogDraft((d) => ({
                          ...d,
                          value: e.target.value,
                        }))
                      }
                      placeholder={t("Livre / Entrada")}
                    />
                  </div>
                </div>
              )}

              {catalogDraft.kind === "equation" && (
                <div className="editor-field">
                  <span>{t("Expressão matemática")}</span>
                  <input
                    aria-label={t("Expressão da equação")}
                    value={catalogDraft.expr}
                    onChange={(e) =>
                      setCatalogDraft((d) => ({ ...d, expr: e.target.value }))
                    }
                    placeholder={t("ex: U * A * (T_ext - T_int)")}
                  />
                </div>
              )}

              {catalogDraft.kind === "observation" && (
                <div className="editor-pair">
                  <div className="editor-field">
                    <span>{t("Valor de referência")}</span>
                    <input
                      aria-label={t("Valor de referência")}
                      type="number"
                      step="any"
                      required
                      value={catalogDraft.value}
                      onChange={(e) =>
                        setCatalogDraft((d) => ({
                          ...d,
                          value: e.target.value,
                        }))
                      }
                      placeholder={t("ex: 1250")}
                    />
                  </div>
                  <div className="editor-field">
                    <span>{t("Unidade de referência")}</span>
                    <input
                      aria-label={t("Unidade")}
                      value={catalogDraft.unit}
                      onChange={(e) =>
                        setCatalogDraft((d) => ({ ...d, unit: e.target.value }))
                      }
                      placeholder={t("W")}
                    />
                  </div>
                </div>
              )}

              <div className="editor-field">
                <span>{t("Documentação / Fonte técnica (Markdown)")}</span>
                <textarea
                  aria-label={t("Documentação técnica")}
                  rows={3}
                  value={catalogDraft.doc}
                  onChange={(e) =>
                    setCatalogDraft((d) => ({ ...d, doc: e.target.value }))
                  }
                  placeholder={t("Fonte bibliográfica, formulação e limites de aplicação...")}
                />
              </div>

              <div className="dialog-actions">
                <button
                  type="button"
                  onClick={() => setNewCatalogModalOpen(false)}
                >{t("Cancelar")}</button>
                <button type="submit">{t("Criar e Adicionar ao Catálogo")}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {newSubNodeModal && (
        <div
          className="modal-backdrop"
          onClick={() => setNewSubNodeModal(false)}
        >
          <section
            className="app-dialog new-subnode-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("Adicionar Componente ao Subgrafo")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pane-heading">
              <h2>
                <Plus size={16} />{t("Novo Componente Interno no Subgrafo")}</h2>
              <button
                aria-label={t("Fechar diálogo")}
                onClick={() => setNewSubNodeModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            <form
              className="dialog-content"
              onSubmit={(e) => {
                e.preventDefault();
                const activeId = subgraphPath[subgraphPath.length - 1];
                if (!activeId) return;
                const trimmedId = newSubNodeDraft.id.trim();
                const trimmedLabel = newSubNodeDraft.label.trim() || trimmedId;
                if (!trimmedId) return;
                setSubgraphInternalNodes((prev) => ({
                  ...prev,
                  [activeId]: [
                    ...(prev[activeId] ?? []),
                    {
                      id: trimmedId,
                      label: trimmedLabel,
                      kind: newSubNodeDraft.kind,
                      expr: newSubNodeDraft.expr.trim() || undefined,
                      unit: newSubNodeDraft.unit.trim() || undefined,
                    },
                  ],
                }));
                setNewSubNodeModal(false);
              }}
            >
              <div className="editor-field">
                <span>{t("Tipo do componente interno")}</span>
                <div className="kind-selector">
                  {(["variable", "equation"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={
                        "kind-chip " +
                        (newSubNodeDraft.kind === k ? "selected " + k : "")
                      }
                      onClick={() =>
                        setNewSubNodeDraft((d) => ({ ...d, kind: k }))
                      }
                    >
                      {k === "variable" ? (
                        <Sigma size={13} />
                      ) : (
                        <FunctionSquare size={13} />
                      )}
                      {t(KIND[k])}
                    </button>
                  ))}
                </div>
              </div>

              <div className="editor-grid">
                <div className="editor-field">
                  <span>{t("Identificador")}</span>
                  <input
                    aria-label={t("Identificador do componente")}
                    required
                    value={newSubNodeDraft.id}
                    onChange={(e) =>
                      setNewSubNodeDraft((d) => ({ ...d, id: e.target.value }))
                    }
                    placeholder={t("ex: dT_parede")}
                  />
                </div>
                <div className="editor-field">
                  <span>{t("Rótulo")}</span>
                  <input
                    aria-label={t("Rótulo do componente")}
                    required
                    value={newSubNodeDraft.label}
                    onChange={(e) =>
                      setNewSubNodeDraft((d) => ({
                        ...d,
                        label: e.target.value,
                      }))
                    }
                    placeholder={t("ex: Diferencial Térmico da Parede")}
                  />
                </div>
              </div>

              <div className="editor-grid">
                <div className="editor-field">
                  <span>{t("Expressão de cálculo / Fórmula")}</span>
                  <input
                    aria-label={t("Expressão interna")}
                    value={newSubNodeDraft.expr}
                    onChange={(e) =>
                      setNewSubNodeDraft((d) => ({
                        ...d,
                        expr: e.target.value,
                      }))
                    }
                    placeholder={t("ex: T_ext - T_int")}
                  />
                </div>
                <div className="editor-field">
                  <span>{t("Unidade dimensional")}</span>
                  <input
                    aria-label={t("Unidade do componente")}
                    value={newSubNodeDraft.unit}
                    onChange={(e) =>
                      setNewSubNodeDraft((d) => ({
                        ...d,
                        unit: e.target.value,
                      }))
                    }
                    placeholder={t("ex: W, K, m²")}
                  />
                </div>
              </div>

              <div className="dialog-actions">
                <button
                  type="button"
                  className="dialog-btn secondary"
                  onClick={() => setNewSubNodeModal(false)}
                >{t("Cancelar")}</button>
                <button type="submit" className="dialog-btn primary">{t("Inserir no Subgrafo")}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      <footer className="status-bar">
        <div className="status-bar-left">
          <span className="status-engine-pill">
            {busy ? (
              <>
                <LoaderCircle size={12} className="spin" />
                <span>{t(operationLabel)}</span>
              </>
            ) : error ? (
              <>
                <span className="warning-dot" />
                <span>{t("Operação não concluída")}</span>
              </>
            ) : (
              <>
                <span className="local-dot" />
                <span>{t("Motor pronto")}</span>
              </>
            )}
          </span>
          {run && run.counts.failed > 0 && (
            <span className="status-findings">
              <TriangleAlert size={12} />
              {run.counts.failed} {run.counts.failed === 1 ? t("achado") : t("achados")}
            </span>
          )}
          {dirty && recovery.savedAt && !recovery.error && !recovery.candidate &&
          <span className="recovery-indicator" title={t("Cópia local de {p0}", {p0: formatDate(recovery.savedAt)})} aria-label={t("Recuperação atualizada")}>
            <HardDrive size={13} aria-hidden="true" />
          </span>}
        <span className="context-help" aria-label={t("Ajuda contextual")}>
            <Info size={12} className="hint-icon" />
            <span>{t(hint)}</span>
          </span>
        </div>

        <div className="status-project-center">
          {renaming ? (
            <input
              ref={titleInput}
              aria-label={t("Nome do projeto")}
              className="status-project-input"
              value={renamingTitle}
              onChange={(e) => setRenamingTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  applyTitle();
                } else if (e.key === "Escape") {
                  setRenaming(false);
                }
              }}
              onBlur={applyTitle}
              autoFocus
            />
          ) : (
            <div className="status-project-container">
              <button
                type="button"
                className="status-project-name"
                data-testid="status-project-name"
                aria-label={t("Projeto: {p0}", {p0: loaded?.model.title ?? "Sem projeto"})}
                title={t("{p0} · Clique com botão direito para Renomear ou Salvar como", {p0: projectPath ?? t(saveMessage)})}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setProjectMenuOpen(true);
                }}
              >
                <h1 className="status-project-title">
                  {loaded?.model.title ?? t("Carregando modelo…")}
                </h1>
                <span className="status-project-badge">
                  {dirty ? "● " : ""}
                  {t(saveMessage)}
                </span>
              </button>
              {projectMenuOpen && (
                <div
                  className="project-context-menu toolbar-popover"
                  role="menu"
                  aria-label={t("Opções do projeto")}
                >
                  <button
                    role="menuitem"
                    onClick={() => {
                      setProjectMenuOpen(false);
                      setRenamingTitle(loaded?.model.title ?? "");
                      setRenaming(true);
                    }}
                  >
                    <Pencil size={13} />
                    <span>{t("Renomear projeto")}</span>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setProjectMenuOpen(false);
                      void saveProject(true);
                    }}
                  >
                    <Save size={13} />
                    <span>{t("Salvar como…")}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="status-bar-right">
          <span className="status-stat-pill" title={t("Total de nós no grafo")}>
            <Network size={12} />
            <strong>{nodes.length}</strong>{t(" nós")}</span>
          <span
            className={"status-stat-pill" + (run ? "" : " text-muted")}
            title={
              run
                ? t("Revisão calculada: {p0}", {p0: run.model_revision})
                : t("Nenhuma verificação executada nesta revisão")
            }
          >
            {run ? (
              <>
                <CheckCircle2 size={12} className="stat-ok-icon" />
                <span>{t("Revisão ")}{run.model_revision.slice(0, 8)}</span>
              </>
            ) : (
              <>
                <Clock size={12} />
                <span>{t("Sem execução")}</span>
              </>
            )}
          </span>
        </div>
      </footer>
    </div>
  );
}
