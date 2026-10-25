import { useI18n } from "./i18n";
import {groupFlaggedNodes} from "./modules";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  Maximize2,
  LocateFixed,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Play,
  Plus,
  Trash2,
  Unlink,
  LoaderCircle,
  PanelRight,
  PanelBottom,
  TriangleAlert,
  Focus,
  CheckSquare,
  Sigma,
  FunctionSquare,
  FileText,
  ShieldCheck,
  Database,
  X,
  MousePointer2,
  Hand,
  Settings,
  Search,
} from "lucide-react";
import type { NodeUpdatePatch } from "./modelMutator";
import { formatExpr } from "./expression";
import { DEFAULT_PREFERENCES, type Preferences } from "./preferences";
import type { Graph, Kind, Model, Run } from "./types";
import type { ViewState } from "./project";
import { GraphNavigator, type MapSnapshot } from "./GraphNavigator";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  RustGpuViewport,
  buildNodeSummaries,
  loadViewportWasm,
  type NodeVisualSummary,
} from "./viewportEngine";
import {
  RELATION_LABELS,
  resolveConnection,
  type RelationType,
} from "./modelMutator";

export interface GraphHandle {
  focusNode: (id: string) => void;
  fitAll: () => void;
  captureView: () => ViewState | null;
}

interface Props {
  groupContext?:{id:string;label:string};
  exitGroup?:()=>void;
  preferences?: Preferences;
  initialView?: ViewState | null;
  documentKey?: number;
  onViewChange?: () => void;
  onHint?: (hint: string) => void;
  graph: Graph;
  model: Model;
  run: Run | null;
  selected: string | null;
  selectedNodes?: Set<string> | string[];
  focus: "all" | "findings";
  onFocusChange: (focus: "all" | "findings") => void;
  onSelect: (id: string | null) => void;
  onSelectNodes?: (ids: string[]) => void;
  onEnterNode?: (id: string) => void;
  onRun: () => void;
  onConnectNodes?: (
    fromId: string,
    toId: string,
    fromPortKind?: number,
    toPortKind?: number,
  ) => void;
  onDisconnectEdge?: (edge: {
    source: string;
    target: string;
    relation: string;
  }) => void;
  onCreateNode?: (kind: Kind, template?: Partial<NodeUpdatePatch>) => string | null;
  onNewNode?: (kind: Kind, template?: Partial<NodeUpdatePatch>) => void;
  onDeleteNode?: (id: string) => void;
  busy: boolean;
  tool: "select" | "pan";
  onToolChange?: (tool: "select" | "pan") => void;
  active: boolean;
  navigatorTarget: HTMLElement | null;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  onToggleResults: () => void;
  executingNodeId?: string | null;
  onOpenSettings?: () => void;
  bottomDock?: ReactNode;
}

const KINDS: Record<Kind, string> = {
  variable: "Variáveis",
  equation: "Equações",
  assumption: "Hipóteses",
  requirement: "Requisitos",
  observation: "Referências",
};

const CATALOG_TEMPLATES: Record<
  Kind,
  Array<{
    id: string;
    label: string;
    detail: string;
    patch: Partial<NodeUpdatePatch>;
  }>
> = {
  variable: [
    {
      id: "T_ext",
      label: "Temperatura Externa (T_ext)",
      detail: "308.15 K (35°C) · Ambiente exterior",
      patch: { label: "Temperatura Externa (T_ext)", unit: "K", value: 308.15 },
    },
    {
      id: "T_int",
      label: "Temperatura Interna (T_int)",
      detail: "297.15 K (24°C) · Conforto térmico",
      patch: { label: "Temperatura Interna (T_int)", unit: "K", value: 297.15 },
    },
    {
      id: "dT_sala",
      label: "Diferencial Térmico (ΔT)",
      detail: "11 K · Gradiente térmico",
      patch: { label: "Diferencial de Temperatura (ΔT)", unit: "K", value: 11 },
    },
    {
      id: "U_parede",
      label: "Coeficiente Global U",
      detail: "1.5 W/m²·K · Envoltória",
      patch: { label: "Coeficiente Global U", unit: "W/(m^2*K)", value: 1.5 },
    },
    {
      id: "A_envoltoria",
      label: "Área da Envoltória (A)",
      detail: "45 m² · Superfície de troca",
      patch: { label: "Área da Envoltória (A)", unit: "m^2", value: 45 },
    },
    {
      id: "m_dot_ar",
      label: "Vazão Mássica de Ar (ṁ)",
      detail: "0.12 kg/s · Renovação de ar",
      patch: { label: "Vazão Mássica de Ar (ṁ)", unit: "kg/s", value: 0.12 },
    },
    {
      id: "cp_ar",
      label: "Calor Específico do Ar (cp)",
      detail: "1005 J/kg·K · Propriedade térmica",
      patch: { label: "Calor Específico do Ar (cp)", unit: "J/(kg*K)", value: 1005 },
    },
    {
      id: "Q_equipamentos",
      label: "Carga de Equipamentos (Q_eq)",
      detail: "850 W · Dissipação interna",
      patch: { label: "Carga de Equipamentos (Q_eq)", unit: "W", value: 850 },
    },
  ],
  equation: [
    {
      id: "eq_transmissao",
      label: "Condução Térmica Envoltória",
      detail: "Q_trans = U · A · ΔT",
      patch: { label: "Condução Térmica Envoltória", expression: "U * A * delta_T" },
    },
    {
      id: "eq_ventilacao",
      label: "Ventilação e Renovação de Ar",
      detail: "P_air = ρ · vazão · cp · ΔT",
      patch: { label: "Ventilação e Renovação de Ar", expression: "rho * flow * cp * delta_T" },
    },
    {
      id: "eq_balanco",
      label: "Balanço Térmico Total",
      detail: "P_total = P_wall + P_air",
      patch: { label: "Balanço Térmico Total", expression: "P_wall + P_air" },
    },

  ],
  assumption: [
    {
      id: "hip_regime_perm",
      label: "Regime Permanente (dT/dt = 0)",
      detail: "Variações dinâmicas de calor desprezíveis.",
      patch: { label: "Regime Permanente (dT/dt = 0)", justification: "Operação térmica em regime estacionário contínuo." },
    },
    {
      id: "hip_prop_const",
      label: "Propriedades Térmicas Constantes",
      detail: "cp e massa específica uniformes no ar.",
      patch: { label: "Propriedades Térmicas Constantes", justification: "Faixa de temperatura estreita (20 a 35°C)." },
    },
    {
      id: "hip_sem_infiltracao",
      label: "Infiltração de Ar Desprezível",
      detail: "Esquadrias e portas com vedação dupla.",
      patch: { label: "Infiltração de Ar Desprezível", justification: "Sala com controle de vedação para ensaios laboratoriais." },
    },
  ],
  requirement: [
    {
      id: "req_transmissao",
      label: "Cobertura da transmissão",
      detail: "Requer uma equação de transmissão.",
      patch: { label: "Cobertura da transmissão" },
    },
    {
      id: "req_balanco",
      label: "Cobertura do balanço",
      detail: "Requer uma equação de balanço.",
      patch: { label: "Cobertura do balanço" },
    },
    {
      id: "req_renovacao",
      label: "Cobertura da renovação de ar",
      detail: "Requer uma equação de renovação.",
      patch: { label: "Cobertura da renovação de ar" },
    },
  ],
  observation: [
    {
      id: "obs_ensaio_lab",
      label: "Temperatura de referência",
      detail: "Exemplo sintético · 296,8 K ± 0,005 K",
      patch: { label: "Temperatura de referência (sintética)", value: 296.8, unit: "K", tolerance: 0.005, source: "Exemplo sintético; não é uma medição real." },
    },
    {
      id: "obs_catalogo_fab",
      label: "Potência de referência",
      detail: "Exemplo sintético · 4.800 W ± 0,02 W",
      patch: { label: "Potência de referência (sintética)", value: 4800, unit: "W", tolerance: 0.02, source: "Exemplo sintético; não representa um fabricante." },
    },
  ],
};

export interface RustViewportDebugNode {
  id: string;
  kind: Kind;
  visible: boolean;
  flagged: boolean;
  selected: boolean;
  executing?: boolean;
  textVisible: boolean;
  title: string;
  detail: string;
  unit: string;
  portCount: number;
  screenX: number;
  screenY: number;
  moreScreenX: number;
  moreScreenY: number;
}

export interface RustViewportDebugApi {
  renderer: "rust-wasm-webgl2";
  nodeCount: number;
  edgeCount: number;
  vertexFloatCount: number;
  textVertexFloatCount: number;
  zoom: number;
  nodes: RustViewportDebugNode[];
  benchmarkNodes: (
    nodeCount: number,
    edgeCount: number,
  ) => { layoutMs: number; frameMs: number; vertexFloatCount: number };
}

function computeMutedSet(
  graph: Graph,
  focus: "all" | "findings",
  flagged: Set<string>,
): Set<string> {
  const muted = new Set<string>();
  if (focus !== "findings" || flagged.size === 0) return muted;

  const nearby = new Set<string>(flagged);
  for (const edge of graph.edges) {
    if (flagged.has(edge.source)) nearby.add(edge.target);
    if (flagged.has(edge.target)) nearby.add(edge.source);
  }
  for (const node of graph.nodes) {
    if (!nearby.has(node.id)) muted.add(node.id);
  }
  return muted;
}

export const GraphView = forwardRef<GraphHandle, Props>(function GraphView(
  {
    graph,
    groupContext,
    exitGroup,
    initialView,
    documentKey,
    onViewChange,
    onHint,
    model,
    run,
    selected,
    selectedNodes,
    focus,
    onFocusChange,
    onSelect,
    onSelectNodes,
    onEnterNode,
    onRun,
    onConnectNodes,
    onDisconnectEdge,
    preferences = DEFAULT_PREFERENCES,
    onCreateNode,
    onNewNode,
    onDeleteNode,
    busy,
    tool,
    onToolChange,
    active,
    navigatorTarget,
    inspectorOpen,
    onToggleInspector,
    onToggleResults,
    executingNodeId,
    onOpenSettings,
    bottomDock,
  },
  ref,
) {
  const { t, language, locale, number: formatNumber, date: formatDate } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<RustGpuViewport | null>(null);
  const summariesRef = useRef<NodeVisualSummary[]>([]);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const pendingPlacement = useRef<{ id: string; x: number; y: number } | null>(null);
  const libraryDrag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [libraryGhost, setLibraryGhost] = useState<{ x: number; y: number; label: string } | null>(null);

  function dropTemplate(kind: Kind, patch: Partial<NodeUpdatePatch>, clientX: number, clientY: number) {
    const vp = viewportRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!vp || !rect || busy || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
    // Floating drawers cover part of the canvas rectangle. A release on a panel
    // must not instantiate a graph node behind it (pointer capture hides targets).
    if (document.elementFromPoint(clientX, clientY) !== canvasRef.current) return;
    // A node's Rust position is its centre. Preserve pan and zoom at release.
    const point = { x: (clientX - rect.left - vp.panX()) / vp.zoom(),
      y: (clientY - rect.top - vp.panY()) / vp.zoom() };
    const id = onCreateNode?.(kind, patch);
    if (id) pendingPlacement.current = { id, ...point };
  }
  const fitOnReveal = useRef(false);

  const visibilityMenu = useRef<HTMLDetailsElement>(null);
  const newNodeMenu = useRef<HTMLDetailsElement>(null);
  const nodeMenu = useRef<HTMLDivElement>(null);
  const wireMenu = useRef<HTMLDivElement>(null);
  const canvasMenu = useRef<HTMLDivElement>(null);

  const [wasmReady, setWasmReady] = useState(false);
  const [viewportError, setViewportError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [visibility, setVisibility] = useState<Record<Kind, boolean>>({
    variable: true,
    equation: true,
    assumption: true,
    requirement: true,
    observation: true,
  });
  const [legend, setLegend] = useState(false);
  const [context, setContext] = useState<string | null>(null);
  const [wirePopover, setWirePopover] = useState<{
    x: number;
    y: number;
    edge: { source: string; target: string; relation: string };
  } | null>(null);
  const [map, setMap] = useState<MapSnapshot | null>(null);
  const [drawerCategory, setDrawerCategory] = useState<Kind | null>(null);
  const [drawerFilter, setDrawerFilter] = useState("");
  const [drawerWidth, setDrawerWidth] = useState(320);

  const handleDrawerResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = drawerWidth;

    const onPointerMove = (ev: PointerEvent) => {
      const delta = startX - ev.clientX;
      const nextWidth = Math.min(650, Math.max(220, startWidth + delta));
      setDrawerWidth(nextWidth);
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };
  const [hoverCursor, setHoverCursor] = useState<"default" | "pointer">(
    "default",
  );
  const syncViewportRef = useRef(() => {});

  const [canvasContextMenu, setCanvasContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const isSpaceRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest("input,textarea,[contenteditable]")
        )
      ) {
        if (!isSpaceRef.current) {
          e.preventDefault();
          isSpaceRef.current = true;
          setIsSpacePressed(true);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpaceRef.current = false;
        setIsSpacePressed(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const dragRef = useRef<
    | {
        pointerId: number;
        mode: "pan";
        startX: number;
        startY: number;
        originX: number;
        originY: number;
        moved: boolean;
      }
    | {
        pointerId: number;
        mode: "node";
        nodeIndex: number;
        nodeOrigins: Map<number, { x: number; y: number }>;
        startX: number;
        startY: number;
        originX: number;
        originY: number;
        moved: boolean;
      }
    | {
        pointerId: number;
        mode: "wire";
        fromNodeIndex: number;
        fromPortIndex: number;
        fromPortKind: number;
        startX: number;
        startY: number;
        moved: boolean;
      }
    | {
        pointerId: number;
        mode: "box";
        startX: number;
        startY: number;
        moved: boolean;
      }
    | null
  >(null);

  const flagged = groupFlaggedNodes(graph,new Set(
    run?.checks
      .filter((check) => check.status !== "passed")
      .flatMap((check) => check.node_ids),
  ));

  function syncUiFromViewport() {
    const vp = viewportRef.current;
    if (!vp) return;
    vp.render();
    setZoom(Math.round(vp.zoom() * 100));
    if (navigatorTarget) {
      setMap(vp.mapSnapshot(graphRef.current, visibility, flagged));
    }
    publishDebugApi(vp);
  }
  syncViewportRef.current = syncUiFromViewport;

  function publishDebugApi(vp: RustGpuViewport) {
    const canvas = canvasRef.current as
      | (HTMLCanvasElement & { __nexoViewport?: RustViewportDebugApi })
      | null;
    if (!canvas) return;
    const z = vp.zoom();
    const summaries = summariesRef.current;
    const labels = preferences.alwaysShowLabels || z >= 0.36 ? vp.labelIdsInFrame() : new Set<string>();
    const nodes: RustViewportDebugNode[] = summaries.map((s, idx) => {
      const pos = vp.nodeScreenPosition(idx);
      const moreX = pos.x + (CARD_WIDTH * 0.5 - 18) * z;
      const moreY = pos.y + (-CARD_HEIGHT * 0.5 + 15) * z;
      return {
        id: s.id,
        kind: s.kind,
        visible: visibility[s.kind],
        flagged: s.flagged,
        selected: selectedNodes
          ? selectedNodes instanceof Set
            ? selectedNodes.has(s.id)
            : selectedNodes.includes(s.id)
          : selected === s.id,
        executing: executingNodeId === s.id,
        textVisible: labels.has(s.id),
        title: s.title,
        detail: s.detail,
        unit: s.unit,
        portCount: vp.nodePortCount(idx),
        screenX: pos.x,
        screenY: pos.y,
        moreScreenX: moreX,
        moreScreenY: moreY,
      };
    });
    canvas.__nexoViewport = {
      renderer: "rust-wasm-webgl2",
      nodeCount: summaries.length,
      edgeCount: graphRef.current.edges.length,
      vertexFloatCount: vp.wasm.vp_vertices_len(vp.ptr),
      textVertexFloatCount: vp.wasm.vp_text_vertices_len(vp.ptr),
      zoom: z,
      nodes,
      benchmarkNodes(nodeCount: number, edgeCount: number) {
        const wasm = vp.wasm;
        const benchPtr = wasm.vp_new();
        try {
          wasm.vp_resize(benchPtr, 1440, 900, 1);
          const t0 = performance.now();
          wasm.vp_begin_model(benchPtr, nodeCount, edgeCount, 0);
          for (let i = 0; i < nodeCount; i++) {
            wasm.vp_set_node(
              benchPtr,
              i,
              i % 5,
              i % 3 === 0 ? 1 : 0,
              1,
              i * 1.5 + 10,
              100,
              10,
              i % 17 === 0 ? 1 : 0,
              1,
              0,
              i === 0 ? 1 : 0,
            );
          }
          for (let e = 0; e < edgeCount; e++) {
            const src = e % Math.max(1, nodeCount - 1);
            const dst = (src + 1 + Math.floor(e / nodeCount)) % nodeCount;
            if (src < dst) {
              wasm.vp_add_edge(benchPtr, src, dst, e % 5);
            }
          }
          wasm.vp_finish_model(benchPtr, 1);
          const layoutMs = performance.now() - t0;

          const t1 = performance.now();
          wasm.vp_build_frame(benchPtr);
          const frameMs = performance.now() - t1;
          const vertexFloatCount = wasm.vp_vertices_len(benchPtr);
          return { layoutMs, frameMs, vertexFloatCount };
        } finally {
          wasm.vp_free(benchPtr);
        }
      },
    };
  }

  function focusNode(id: string) {
    const vp = viewportRef.current;
    const idx = graph.nodes.findIndex((node) => node.id === id);
    const kind = graph.nodes[idx]?.kind;
    if (!vp || idx < 0 || !kind) return;
    const nextVis = { ...visibility, [kind]: true };
    setVisibility(nextVis);
    if (container.current) {
      vp.resize(container.current.clientWidth, container.current.clientHeight);
    }
    const summaries = buildNodeSummaries(graph, model, run, flagged, language);
    summariesRef.current = summaries;
    const muted = computeMutedSet(graph, focus, flagged);
    vp.updateStates(summaries, nextVis, muted, id);
    vp.focusNode(idx);
    vp.render();
    setZoom(Math.round(vp.zoom() * 100));
    if (navigatorTarget) {
      setMap(vp.mapSnapshot(graph, nextVis, flagged));
    }
    publishDebugApi(vp);
    setContext(null);
  }

  useImperativeHandle(
    ref,
    () => ({
      focusNode,
      captureView: () => viewportRef.current?.captureView(visibility) ?? null,
      fitAll: () => {
        const vp = viewportRef.current;
        if (!vp) return;
        vp.fitAll();
        syncUiFromViewport();
      },
    }),
    [graph, model, run, visibility, focus, selected, navigatorTarget, language],
  );

  // Initialize Rust WASM + WebGL2 engine on the persistent canvas
  useEffect(() => {
    let alive = true;
    const canvas = canvasRef.current;
    const host = container.current;
    if (!canvas || !host) return;

    loadViewportWasm()
      .then((wasm) => {
        if (!alive) return;
        const vp = new RustGpuViewport(canvas, wasm);
        if (host.clientWidth && host.clientHeight) {
          vp.resize(host.clientWidth, host.clientHeight);
        }
        viewportRef.current = vp;
        setWasmReady(true);
      })
      .catch((err) => {
        if (alive) {
          setViewportError(err instanceof Error ? err.message : String(err));
        }
      });

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      const vp = viewportRef.current;
      if (rect && rect.width > 0 && rect.height > 0 && vp) {
        vp.resize(rect.width, rect.height);
        if (fitOnReveal.current) {
          vp.fitAll();
          fitOnReveal.current = false;
        }
        syncViewportRef.current();
      }
    });
    observer.observe(host);

    return () => {
      alive = false;
      observer.disconnect();
      viewportRef.current?.destroy();
      viewportRef.current = null;
    };
  }, []);

  const previousModelId = useRef<string | null>(null);
  const previousGroup=useRef("");
  const groupCameras=useRef(new Map<string,{x:number;y:number;zoom:number}>());

  // Load new model/graph topology into Rust WASM and compute dependency layout
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !wasmReady) return;
    if (container.current?.clientWidth && container.current?.clientHeight) {
      vp.resize(container.current.clientWidth, container.current.clientHeight);
    } else {
      fitOnReveal.current = true;
    }
    const summaries = buildNodeSummaries(graph, model, run, flagged, language);
    summariesRef.current = summaries;
    const muted = computeMutedSet(graph, focus, flagged);
    const key = `${documentKey ?? 0}:${model.id}`;
    const preservePositions = previousModelId.current === key;
    const nextGroup=groupContext?.id??"";
    const changingGroup=preservePositions&&nextGroup!==previousGroup.current;
    if(!preservePositions){groupCameras.current.clear();previousGroup.current="";}
    if(changingGroup)groupCameras.current.set(previousGroup.current,{x:vp.panX(),y:vp.panY(),zoom:vp.zoom()});
    previousModelId.current = key;
    vp.setModel(
      graph,
      summaries,
      visibility,
      muted,
      selected,
      preservePositions,
    );
    if (!preservePositions && initialView) {
      vp.restoreView(initialView);
      setVisibility(initialView.visibility);
    }
    if(changingGroup){const camera=groupCameras.current.get(nextGroup);if(camera){vp.zoomAt(camera.zoom,0,0);vp.panBy(camera.x-vp.panX(),camera.y-vp.panY());}else vp.fitAll();}
    previousGroup.current=nextGroup;
    const placement = pendingPlacement.current;
    if (placement) {
      const index = graph.nodes.findIndex((node) => node.id === placement.id);
      if (index >= 0) vp.moveNode(index, placement.x, placement.y);
      pendingPlacement.current = null;
      onViewChange?.();
    }
    setContext(null);
    setWirePopover(null);
    syncUiFromViewport();
  }, [graph, wasmReady, documentKey,groupContext?.id]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !wasmReady) return;
    vp.setAppearance(preferences);
    syncUiFromViewport();
  }, [preferences, wasmReady]);

  // Update visual states, values, ports & embedded charts in Rust WITHOUT resetting layout or camera
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !wasmReady) return;
    const summaries = buildNodeSummaries(graph, model, run, flagged, language);
    summariesRef.current = summaries;
    const muted = computeMutedSet(graph, focus, flagged);
    const activeSelection =
      selectedNodes &&
      (selectedNodes instanceof Set
        ? selectedNodes.size > 0
        : selectedNodes.length > 0)
        ? selectedNodes
        : selected;
    vp.updateStates(summaries, visibility, muted, activeSelection);
    syncUiFromViewport();
  }, [
    model,
    run,
    focus,
    visibility,
    selected,
    selectedNodes,
    navigatorTarget,
    language,
    wasmReady,
  ]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const idx = executingNodeId
      ? graph.nodes.findIndex((n) => n.id === executingNodeId)
      : -1;
    vp.setExecutingNode(idx >= 0 ? idx : null);
    vp.render();
    syncUiFromViewport();
  }, [executingNodeId, graph.nodes]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      for (const menu of [
        visibilityMenu.current,
        newNodeMenu.current,
      ]) {
        if (menu && !menu.contains(event.target as Node)) menu.open = false;
      }
      if (
        nodeMenu.current &&
        !nodeMenu.current.contains(event.target as Node)
      ) {
        setContext(null);
      }
      if (
        wireMenu.current &&
        !wireMenu.current.contains(event.target as Node)
      ) {
        setWirePopover(null);
      }
      if (
        canvasMenu.current &&
        !canvasMenu.current.contains(event.target as Node)
      ) {
        setCanvasContextMenu(null);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        libraryDrag.current = null;
        setLibraryGhost(null);
        if (dragRef.current?.mode === "wire") {
          dragRef.current = null;
          viewportRef.current?.clearDraftWire();
          viewportRef.current?.render();
        }
        setContext(null);
        setWirePopover(null);
        setCanvasContextMenu(null);
        setMarqueeBox(null);
        setDrawerCategory(null);
        if (visibilityMenu.current) visibilityMenu.current.open = false;
        if (newNodeMenu.current) newNodeMenu.current.open = false;
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  function zoomTo(value: number) {
    const vp = viewportRef.current;
    const host = container.current;
    if (vp && host) {
      vp.zoomAt(value, host.clientWidth * 0.5, host.clientHeight * 0.5);
      syncUiFromViewport();
    }
    setContext(null);
    setWirePopover(null);
  }

  const vp = viewportRef.current;
  const contextIdx = context
    ? graph.nodes.findIndex((n) => n.id === context)
    : -1;
  const menuPosition =
    contextIdx >= 0 && vp ? vp.nodeScreenPosition(contextIdx) : null;

  return (
    <div className={"graph-workspace" + (active ? "" : " inactive")}>
      <div className="graph-main-area" hidden={!active}>
        {groupContext&&<nav className="group-context" aria-label={t("Navegação do grupo")}><button onClick={exitGroup}>{t("Modelo completo")}</button><ChevronRight size={13}/><strong>{groupContext.label}</strong><small title={t("Análise continua no modelo completo.")}>{t("Contexto")}</small></nav>}
        <nav className="viewport-left-rail" aria-label={t("Ferramentas do viewport")}>
          <button
            className={"rail-btn " + (tool === "select" ? "active" : "")}
            aria-label={t("Selecionar elementos")}
            title={t("Selecionar e mover elementos (V)")}
            aria-pressed={tool === "select"}
            onClick={() => onToolChange?.("select")}
          >
            <MousePointer2 size={18} />
          </button>
          <button
            className={"rail-btn " + (tool === "pan" ? "active" : "")}
            aria-label={t("Mover viewport")}
            title={t("Pan: mover viewport (H / segure Espaço)")}
            aria-pressed={tool === "pan"}
            onClick={() => onToolChange?.("pan")}
          >
            <Hand size={18} />
          </button>
          <span className="rail-divider" />
          <button className="rail-btn" aria-label={t("Organizar grafo visível")} title={t("Organizar grafo visível")} disabled={busy} onClick={()=>{const vp=viewportRef.current;if(vp){vp.arrange();vp.fitAll();syncUiFromViewport();onViewChange?.();}}}><RotateCcw size={18}/></button>
          <button
            className="rail-btn"
            aria-label={t("Enquadrar")}
            title={t("Enquadrar modelo (F)")}
            onClick={() => {
              if (viewportRef.current) {
                viewportRef.current.fitAll();
                syncUiFromViewport();
              }
            }}
          >
            <Maximize2 size={18} />
          </button>
          <button
            className="rail-btn"
            aria-label={t("Enquadrar seleção")}
            title={t("Enquadrar seleção e vínculos")}
            disabled={!selected}
            onClick={() => selected && focusNode(selected)}
          >
            <LocateFixed size={18} />
          </button>
          <span className="rail-divider" />
          <button
            className="rail-btn"
            aria-label={t("Aumentar zoom")}
            title={t("Aumentar zoom (+)")}
            onClick={() => zoomTo((vp?.zoom() ?? 1) * 1.25)}
          >
            <ZoomIn size={18} />
          </button>
          <button
            className="rail-btn zoom-level-btn"
            aria-label={t("Zoom real 100%")}
            data-testid="zoom-level"
            onClick={() => zoomTo(1)}
            title={t("Escala real 100% (0)")}
          >
            <span>{zoom}%</span>
          </button>
          <button
            className="rail-btn"
            aria-label={t("Diminuir zoom")}
            title={t("Diminuir zoom (-)")}
            onClick={() => zoomTo((vp?.zoom() ?? 1) / 1.25)}
          >
            <ZoomOut size={18} />
          </button>
          <span className="rail-divider" />
          <details className="toolbar-menu visibility-menu rail-menu" ref={visibilityMenu}>
            <summary role="button" aria-label={t("Visibilidade")} title={t("Camadas e visibilidade")}>
              <Eye size={18} />
            </summary>
            <div className="toolbar-popover">
              <strong>{t("Visibilidade")}</strong>
              {(Object.entries(KINDS) as [Kind, string][]).map(
                ([kind, label]) => (
                  <label key={kind}>
                    <input
                      type="checkbox"
                      checked={visibility[kind]}
                      onChange={(event) =>
                        setVisibility((current) => ({
                          ...current,
                          [kind]: event.target.checked,
                        }))
                      }
                    />
                    {t(label)}
                  </label>
                ),
              )}
              <hr />
              <label>
                <input
                  type="checkbox"
                  checked={focus === "findings"}
                  onChange={(event) =>
                    onFocusChange(event.target.checked ? "findings" : "all")
                  }
                  disabled={!flagged.size}
                />{t("Destacar achados")}</label>
              <label>
                <input
                  type="checkbox"
                  checked={legend}
                  onChange={(event) => setLegend(event.target.checked)}
                />{t("Legenda no canvas")}</label>
            </div>
          </details>
          <span className="rail-spacer" />
          {onOpenSettings && (
            <button
              className="rail-btn settings-rail-btn"
              aria-label={t("Configurações")}
              title={t("Configurações")}
              onClick={onOpenSettings}
            >
              <Settings size={18} />
            </button>
          )}
        </nav>

        <div className="viewport-center-area">
          {viewportError && (
            <div role="alert" className="error-banner">
              <TriangleAlert size={16} />
              <span>{viewportError}</span>
            </div>
          )}

      <div
        ref={surface}
        hidden={!active}
        className={
          "viewport tool-" +
          (isSpacePressed ? "pan is-space" : tool) +
          (dragRef.current?.mode === "pan" ? " is-panning" : "") +
          (hoverCursor === "pointer" && !isSpacePressed && tool !== "pan" ? " cursor-pointer" : "")
        }
        data-testid="graph-viewport"
        tabIndex={0}
        aria-label={t("Viewport do grafo")}
        onPointerDown={(event) => {
          if (
            !(event.target as HTMLElement).closest(
              "button,.node-menu,.wire-menu",
            )
          )
            event.currentTarget.focus({ preventScroll: true });
        }}
        onKeyDown={(event) => {
          if (
            event.target !== event.currentTarget ||
            event.ctrlKey ||
            event.metaKey ||
            !vp
          )
            return;
          const key = event.key.toLowerCase();
          if (key === "v") {
            event.preventDefault();
            onToolChange?.("select");
            return;
          }
          if (key === "h") {
            event.preventDefault();
            onToolChange?.("pan");
            return;
          }
          if (
            ![
              "f",
              "home",
              "0",
              "+",
              "=",
              "-",
              "arrowup",
              "arrowdown",
              "arrowleft",
              "arrowright",
            ].includes(key)
          )
            return;
          event.preventDefault();
          if (key === "f" || key === "home") {
            vp.fitAll();
            syncUiFromViewport();
          } else if (key === "0") {
            zoomTo(1);
          } else if (key === "+" || key === "=") {
            zoomTo(vp.zoom() * 1.25);
          } else if (key === "-") {
            zoomTo(vp.zoom() / 1.25);
          } else {
            vp.panBy(
              key === "arrowleft" ? 60 : key === "arrowright" ? -60 : 0,
              key === "arrowup" ? 60 : key === "arrowdown" ? -60 : 0,
            );
            syncUiFromViewport();
          }
        }}
      >
        <div
          ref={container}
          className="graph-canvas"
          data-testid="graph-canvas"
          role="img"
          aria-label={t("Grafo interativo em Rust e WebGL2 de equações, variáveis e evidências")}
        >
          <canvas
            ref={canvasRef}
            className="rust-gpu-canvas"
            onWheel={(event) => {
              event.preventDefault();
              const engine = viewportRef.current;
              if (!engine) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const sx = event.clientX - rect.left;
              const sy = event.clientY - rect.top;
              const factor = event.deltaY < 0 ? 1.14 : 1 / 1.14;
              engine.zoomAt(engine.zoom() * factor, sx, sy);
              setContext(null);
              setWirePopover(null);
              syncUiFromViewport();
            }}
            onPointerDown={(event) => {
              const engine = viewportRef.current;
              if (!engine || event.button !== 0) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const sx = event.clientX - rect.left;
              const sy = event.clientY - rect.top;
              const hit = engine.hitTest(sx, sy);
              setCanvasContextMenu(null);

              const isPanMode =
                tool === "pan" || isSpacePressed || isSpaceRef.current || (preferences.panMode === "free" && hit.kind === "none");
              if (isPanMode) {
                onHint?.(
                  "Pan (Espaço) · Arraste para mover a câmera · Roda: zoom no cursor",
                );
                dragRef.current = {
                  pointerId: event.pointerId,
                  mode: "pan",
                  startX: sx,
                  startY: sy,
                  originX: engine.panX(),
                  originY: engine.panY(),
                  moved: false,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                return;
              }

              // 1. Clicked node options button (⋯)
              if(graph.nodes[hit.nodeIndex]?.group){onEnterNode?.(graph.nodes[hit.nodeIndex].id);return;}
              if (hit.kind === "more" && graph.nodes[hit.nodeIndex]) {
                event.stopPropagation();
                const id = graph.nodes[hit.nodeIndex].id;
                selectRef.current(id);
                onSelectNodes?.([id]);
                setContext((prev) => (prev === id ? null : id));
                setWirePopover(null);
                return;
              }

              // 2. Clicked a connection wire
              if (hit.kind === "wire" && graph.edges[hit.edgeIndex]) {
                onHint?.(
                  "Ligação · Ver origem e destino · Desconectar pelo menu · Esc: fechar",
                );
                event.stopPropagation();
                const edge = graph.edges[hit.edgeIndex];
                if(edge.bundle){onHint?.(t("Feixe visual: {count} ligações. Expanda o grupo para editar.",{count:edge.bundle.length}));return;}
                setWirePopover({ x: sx, y: sy, edge });
                setContext(null);
                return;
              }

              setContext(null);
              setWirePopover(null);

              // 3. Clicked a Port -> Initiate live wire dragging
              if (hit.kind === "port" && graph.nodes[hit.nodeIndex]) {
                if (busy) return;
                onHint?.(
                  "Porta · Arraste até uma porta compatível · Esc: cancelar ligação",
                );
                const id = graph.nodes[hit.nodeIndex].id;
                selectRef.current(id);
                onSelectNodes?.([id]);
                const port = engine.portInfo(hit.nodeIndex, hit.portIndex);
                dragRef.current = {
                  pointerId: event.pointerId,
                  mode: "wire",
                  fromNodeIndex: hit.nodeIndex,
                  fromPortIndex: hit.portIndex,
                  fromPortKind: port.kind,
                  startX: sx,
                  startY: sy,
                  moved: false,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                return;
              }

              // 4. Clicked a Node card body -> Move node in select tool mode
              if (hit.kind === "node" && graph.nodes[hit.nodeIndex]) {
                onHint?.(
                  preferences.doubleClickAction === "inspect"
                    ? "Nó · Arraste: mover · Shift/Ctrl: seleção múltipla · 2x: propriedades · F: enquadrar"
                    : "Nó · Arraste: mover · Shift/Ctrl: seleção múltipla · 2x: subsistema experimental · F: enquadrar",
                );
                const clickedId = graph.nodes[hit.nodeIndex].id;
                const isMultiKey = event.shiftKey || event.ctrlKey;
                const currentList = selectedNodes
                  ? Array.from(selectedNodes)
                  : selected
                    ? [selected]
                    : [];
                let nextList: string[];
                if (isMultiKey) {
                  if (currentList.includes(clickedId)) {
                    nextList = currentList.filter((id) => id !== clickedId);
                  } else {
                    nextList = [...currentList, clickedId];
                  }
                } else {
                  if (currentList.includes(clickedId) && currentList.length > 1) {
                    nextList = currentList;
                  } else {
                    nextList = [clickedId];
                  }
                }
                if (nextList.length <= 1) {
                  selectRef.current(nextList[0] ?? null);
                }
                onSelectNodes?.(nextList);

                const nodeOrigins = new Map<number, { x: number; y: number }>();
                for (const sId of nextList) {
                  const idx = graph.nodes.findIndex((n) => n.id === sId);
                  if (idx >= 0) nodeOrigins.set(idx, engine.nodeWorldPosition(idx));
                }
                if (!nodeOrigins.has(hit.nodeIndex)) {
                  nodeOrigins.set(hit.nodeIndex, engine.nodeWorldPosition(hit.nodeIndex));
                }
                const originPos = nodeOrigins.get(hit.nodeIndex)!;
                dragRef.current = {
                  pointerId: event.pointerId,
                  mode: "node",
                  nodeIndex: hit.nodeIndex,
                  nodeOrigins,
                  startX: sx,
                  startY: sy,
                  originX: originPos.x,
                  originY: originPos.y,
                  moved: false,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                return;
              }

              // 5. Clicked canvas background -> Marquee box selection
              onHint?.(
                "Caixa de seleção · Arraste para selecionar múltiplos nós · Espaço: mover câmera",
              );
              if (!event.shiftKey && !event.ctrlKey) {
                selectRef.current(null);
                onSelectNodes?.([]);
              }
              dragRef.current = {
                pointerId: event.pointerId,
                mode: "box",
                startX: sx,
                startY: sy,
                moved: false,
              };
              setMarqueeBox({ x1: sx, y1: sy, x2: sx, y2: sy });
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const engine = viewportRef.current;
              if (!engine) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const sx = event.clientX - rect.left;
              const sy = event.clientY - rect.top;
              const drag = dragRef.current;

              if (drag && drag.pointerId === event.pointerId) {
                const dx = sx - drag.startX;
                const dy = sy - drag.startY;
                if (Math.hypot(dx, dy) > 2) drag.moved = true;

                if (drag.mode === "wire") {
                  // Live GPU draft wire rendering
                  const z = engine.zoom();
                  const wx = (sx - engine.panX()) / z;
                  const wy = (sy - engine.panY()) / z;
                  const srcPort = engine.portInfo(
                    drag.fromNodeIndex,
                    drag.fromPortIndex,
                  );
                  const targetHit = engine.hitTest(sx, sy);
                  let valid = false;
                  let targetWx = wx;
                  let targetWy = wy;
                  let targetNx = -srcPort.nx;
                  let targetNy = -srcPort.ny;

                  if (
                    (targetHit.kind === "port" || targetHit.kind === "node") &&
                    targetHit.nodeIndex !== drag.fromNodeIndex &&
                    graph.nodes[targetHit.nodeIndex]
                  ) {
                    const fromId = graph.nodes[drag.fromNodeIndex]?.id;
                    const toId = graph.nodes[targetHit.nodeIndex]?.id;
                    const toPortKind =
                      targetHit.kind === "port"
                        ? engine.portInfo(
                            targetHit.nodeIndex,
                            targetHit.portIndex,
                          ).kind
                        : undefined;
                    const check = resolveConnection(
                      model,
                      fromId,
                      toId,
                      drag.fromPortKind,
                      toPortKind,
                    );
                    valid = check.ok;

                    if (targetHit.kind === "port") {
                      const dstPort = engine.portInfo(
                        targetHit.nodeIndex,
                        targetHit.portIndex,
                      );
                      targetWx = dstPort.x;
                      targetWy = dstPort.y;
                      targetNx = dstPort.nx;
                      targetNy = dstPort.ny;
                    } else {
                      const dstNode = engine.nodeWorldPosition(
                        targetHit.nodeIndex,
                      );
                      targetWx = dstNode.x;
                      targetWy = dstNode.y;
                    }
                  }

                  engine.setDraftWire(
                    srcPort.x,
                    srcPort.y,
                    srcPort.nx,
                    srcPort.ny,
                    targetWx,
                    targetWy,
                    targetNx,
                    targetNy,
                    valid,
                  );
                  engine.setHovered(
                    targetHit.nodeIndex,
                    targetHit.kind === "port"
                      ? 3
                      : targetHit.kind === "node"
                        ? 1
                        : 0,
                    targetHit.portIndex,
                  );
                  setHoverCursor(valid ? "pointer" : "default");
                  engine.render();
                  return;
                }

                if (drag.mode === "box") {
                  drag.moved = true;
                  setMarqueeBox({
                    x1: drag.startX,
                    y1: drag.startY,
                    x2: sx,
                    y2: sy,
                  });
                  const minX = Math.min(drag.startX, sx);
                  const maxX = Math.max(drag.startX, sx);
                  const minY = Math.min(drag.startY, sy);
                  const maxY = Math.max(drag.startY, sy);
                  const z = engine.zoom();
                  const panX = engine.panX();
                  const panY = engine.panY();
                  const worldMinX = (minX - panX) / z;
                  const worldMaxX = (maxX - panX) / z;
                  const worldMinY = (minY - panY) / z;
                  const worldMaxY = (maxY - panY) / z;
                  const halfW = CARD_WIDTH * 0.5;
                  const halfH = CARD_HEIGHT * 0.5;

                  const boxed: string[] = [];
                  graph.nodes.forEach((n, idx) => {
                    const pos = engine.nodeWorldPosition(idx);
                    const inBox = !(
                      pos.x + halfW < worldMinX ||
                      pos.x - halfW > worldMaxX ||
                      pos.y + halfH < worldMinY ||
                      pos.y - halfH > worldMaxY
                    );
                    if (inBox) boxed.push(n.id);
                  });
                  onSelectNodes?.(boxed);
                  return;
                }

                if (drag.mode === "node") {
                  const z = engine.zoom();
                  const dxWorld = dx / z;
                  const dyWorld = dy / z;
                  for (const [idx, orig] of drag.nodeOrigins.entries()) {
                    engine.moveNode(idx, orig.x + dxWorld, orig.y + dyWorld);
                  }
                } else if (drag.mode === "pan") {
                  engine.panBy(
                    drag.originX + dx - engine.panX(),
                    drag.originY + dy - engine.panY(),
                  );
                }
                syncUiFromViewport();
                return;
              }

              const hit = engine.hitTest(sx, sy);
              const code =
                hit.kind === "more"
                  ? 2
                  : hit.kind === "port"
                    ? 3
                    : hit.kind === "node"
                      ? 1
                      : hit.kind === "wire"
                        ? 4
                        : 0;
              const idx = hit.kind === "wire" ? hit.edgeIndex : hit.nodeIndex;
              onHint?.(
                tool === "pan"
                  ? "Pan · Arraste para mover a câmera · Roda: zoom no cursor"
                  : hit.kind === "port"
                    ? "Porta · Arraste para conectar · Clique: ver a ligação desta porta"
                    : hit.kind === "wire"
                      ? "Ligação · Clique para inspecionar origem e destino"
                      : hit.kind === "node" || hit.kind === "more"
                        ? "Nó · Clique: propriedades · Arraste: organizar · F: enquadrar"
                        : preferences.panMode === "free"
                          ? "Viewport · Arraste: pan · Roda: zoom · F: enquadrar"
                          : "Viewport · Arraste: selecionar · Espaço: pan · Roda: zoom · F: enquadrar",
              );
              engine.setHovered(idx, code, hit.portIndex);
              setHoverCursor(code > 0 ? "pointer" : "default");
              engine.render();
            }}
            onPointerUp={(event) => {
              const engine = viewportRef.current;
              const drag = dragRef.current;
              if (!engine || !drag || drag.pointerId !== event.pointerId)
                return;

              if (drag.mode === "wire") {
                engine.clearDraftWire();
                const rect = event.currentTarget.getBoundingClientRect();
                const sx = event.clientX - rect.left;
                const sy = event.clientY - rect.top;

                if (drag.moved) {
                  // Wire drag completed -> attempt connection
                  const targetHit = engine.hitTest(sx, sy);
                  if (
                    (targetHit.kind === "port" || targetHit.kind === "node") &&
                    targetHit.nodeIndex !== drag.fromNodeIndex &&
                    graph.nodes[targetHit.nodeIndex]
                  ) {
                    const fromId = graph.nodes[drag.fromNodeIndex]?.id;
                    const toId = graph.nodes[targetHit.nodeIndex]?.id;
                    const toPortKind =
                      targetHit.kind === "port"
                        ? engine.portInfo(
                            targetHit.nodeIndex,
                            targetHit.portIndex,
                          ).kind
                        : undefined;
                    onConnectNodes?.(
                      fromId,
                      toId,
                      drag.fromPortKind,
                      toPortKind,
                    );
                  }
                } else {
                  // Simple click on a port -> check if connected to offer disconnection
                  const fromId = graph.nodes[drag.fromNodeIndex]?.id;
                  const incident =
                    graph.edges[
                      engine.portEdgeIndex(
                        drag.fromNodeIndex,
                        drag.fromPortIndex,
                      )
                    ];
                  if (incident) {
                    setWirePopover({ x: sx, y: sy, edge: incident });
                  }
                }
              }

              if (drag.mode === "box") {
                setMarqueeBox(null);
              }
              dragRef.current = null;
              if (drag.moved && drag.mode === "node") onViewChange?.();
              syncUiFromViewport();
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              const engine = viewportRef.current;
              if (!engine) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const sx = event.clientX - rect.left;
              const sy = event.clientY - rect.top;
              const hit = engine.hitTest(sx, sy);
              if (hit.kind === "node" && graph.nodes[hit.nodeIndex]) {
                const id = graph.nodes[hit.nodeIndex].id;
                if(graph.nodes[hit.nodeIndex].group){onSelect(id);return;}
                selectRef.current(id);
                onSelectNodes?.([id]);
                setContext(id);
                setWirePopover(null);
                setCanvasContextMenu(null);
                return;
              }
              if (hit.kind === "wire" && graph.edges[hit.edgeIndex]) {
                const edge = graph.edges[hit.edgeIndex];
                if(edge.bundle){onHint?.(t("Feixe visual: {count} ligações. Expanda o grupo para editar.",{count:edge.bundle.length}));return;}
                setWirePopover({ x: sx, y: sy, edge });
                setContext(null);
                setCanvasContextMenu(null);
                return;
              }
              setContext(null);
              setWirePopover(null);
              setCanvasContextMenu({ x: sx, y: sy });
            }}
            onDoubleClick={(event) => {
              const engine = viewportRef.current;
              if (!engine) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const sx = event.clientX - rect.left;
              const sy = event.clientY - rect.top;
              const hit = engine.hitTest(sx, sy);
              if (hit.kind === "node" && graph.nodes[hit.nodeIndex]) {
                const id = graph.nodes[hit.nodeIndex].id;
                if (preferences.doubleClickAction === "inspect") onSelect(id);
                else onEnterNode?.(id);
              }
            }}
            onPointerLeave={() => {
              const engine = viewportRef.current;
              if (engine && !dragRef.current) {
                engine.setHovered(-1, 0);
                setHoverCursor("default");
                engine.render();
              }
            }}
            onPointerCancel={() => {
              dragRef.current = null;
              setMarqueeBox(null);
              viewportRef.current?.clearDraftWire();
              viewportRef.current?.render();
            }}
            onLostPointerCapture={() => {
              if (dragRef.current?.mode === "wire")
                viewportRef.current?.clearDraftWire();
              dragRef.current = null;
              setMarqueeBox(null);
              viewportRef.current?.render();
            }}
          />
          {marqueeBox && (
            <div
              className="selection-marquee"
              style={{
                left: Math.min(marqueeBox.x1, marqueeBox.x2),
                top: Math.min(marqueeBox.y1, marqueeBox.y2),
                width: Math.abs(marqueeBox.x2 - marqueeBox.x1),
                height: Math.abs(marqueeBox.y2 - marqueeBox.y1),
              }}
            />
          )}
        </div>

        {canvasContextMenu && (
          <div
            ref={canvasMenu}
            className="canvas-context-menu toolbar-popover"
            role="menu"
            aria-label={t("Opções do canvas")}
            style={{
              left: Math.max(
                8,
                Math.min(
                  canvasContextMenu.x,
                  (surface.current?.clientWidth ?? 400) - 210,
                ),
              ),
              top: Math.max(
                8,
                Math.min(
                  canvasContextMenu.y,
                  (surface.current?.clientHeight ?? 300) - 280,
                ),
              ),
            }}
          >
            <div className="canvas-menu-header">{t("Novo elemento")}</div>
            <button
              role="menuitem"
              onClick={() => {
                onNewNode?.("variable");
                setCanvasContextMenu(null);
              }}
            >
              <Sigma size={13} className="kind-icon variable" />
              <span>{t("Nova Variável")}</span>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                onNewNode?.("equation");
                setCanvasContextMenu(null);
              }}
            >
              <FunctionSquare size={13} className="kind-icon equation" />
              <span>{t("Nova Equação")}</span>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                onNewNode?.("assumption");
                setCanvasContextMenu(null);
              }}
            >
              <FileText size={13} className="kind-icon assumption" />
              <span>{t("Nova Hipótese")}</span>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                onNewNode?.("requirement");
                setCanvasContextMenu(null);
              }}
            >
              <ShieldCheck size={13} className="kind-icon requirement" />
              <span>{t("Novo Requisito")}</span>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                onNewNode?.("observation");
                setCanvasContextMenu(null);
              }}
            >
              <Database size={13} className="kind-icon observation" />
              <span>{t("Nova Observação")}</span>
            </button>
            <hr />
            <button
              role="menuitem"
              onClick={() => {
                const allIds = graph.nodes.map((n) => n.id);
                onSelectNodes?.(allIds);
                if (allIds[0]) selectRef.current(allIds[0]);
                setCanvasContextMenu(null);
              }}
            >
              <CheckSquare size={13} />
              <span>{t("Selecionar todos")}</span>
              <kbd>Ctrl+A</kbd>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                vp?.fitAll();
                syncUiFromViewport();
                setCanvasContextMenu(null);
              }}
            >
              <Focus size={13} />
              <span>{t("Enquadrar tudo")}</span>
              <kbd>Home</kbd>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                onRun();
                setCanvasContextMenu(null);
              }}
            >
              <Play size={13} />
              <span>{t("Executar verificação")}</span>
              <kbd>F5</kbd>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                onSelectNodes?.([]);
                selectRef.current(null);
                setCanvasContextMenu(null);
              }}
            >
              <X size={13} />
              <span>{t("Limpar seleção")}</span>
              <kbd>Esc</kbd>
            </button>
          </div>
        )}

        {wirePopover && (
          <div
            ref={wireMenu}
            className="wire-menu toolbar-popover"
            role="dialog"
            aria-label={t("Opções da ligação")}
            style={{
              left: Math.max(
                8,
                Math.min(
                  wirePopover.x - 90,
                  (surface.current?.clientWidth ?? 400) - 230,
                ),
              ),
              top: Math.max(
                8,
                Math.min(
                  wirePopover.y + 12,
                  (surface.current?.clientHeight ?? 300) - 100,
                ),
              ),
            }}
          >
            <div className="wire-popover-info">
              <strong>
                {wirePopover.edge.source} → {wirePopover.edge.target}
              </strong>
              <small>
                {t(RELATION_LABELS[wirePopover.edge.relation as RelationType] ?? wirePopover.edge.relation)}
              </small>
            </div>
            <button
              className="danger-item"
              onClick={() => {
                onDisconnectEdge?.(wirePopover.edge);
                setWirePopover(null);
              }}
            >
              <Unlink size={14} />{t("Desconectar ligação")}</button>
          </div>
        )}

        {context && menuPosition && (
          <div
            ref={nodeMenu}
            className="node-menu toolbar-popover"
            role="menu"
            style={{
              left: Math.max(
                8,
                Math.min(
                  menuPosition.x,
                  (surface.current?.clientWidth ?? 400) - 170,
                ),
              ),
              top: Math.max(
                8,
                Math.min(
                  menuPosition.y + 30,
                  (surface.current?.clientHeight ?? 300) - 140,
                ),
              ),
            }}
          >
            <button
              role="menuitem"
              aria-label={t("Inspecionar elemento")}
              title={t("Inspecionar elemento (Enter)")}
              onClick={() => {
                onSelect(context);
                setContext(null);
              }}
            >
              <Eye size={13} />
              <span>{t("Inspecionar")}</span>
              <kbd>Enter</kbd>
            </button>
            <button
              role="menuitem"
              aria-label={t("Entrar no subsistema do nó")}
              title={t("Entrar dentro do nó (Duplo clique)")}
              onClick={() => {
                onEnterNode?.(context);
                setContext(null);
              }}
            >
              <Maximize2 size={13} />
              <span>{t("Entrar no nó")}</span>
              <kbd>2x</kbd>
            </button>
            <button
              role="menuitem"
              aria-label={t("Enquadrar elemento e vínculos")}
              title={t("Enquadrar elemento e vínculos (F)")}
              onClick={() => {
                focusNode(context);
                setContext(null);
              }}
            >
              <Focus size={13} />
              <span>{t("Enquadrar")}</span>
              <kbd>F</kbd>
            </button>
            <button
              role="menuitem"
              className="danger-item"
              aria-label={t("Excluir elemento")}
              title={t("Excluir elemento (Del)")}
              onClick={() => {
                onDeleteNode?.(context);
                setContext(null);
              }}
            >
              <Trash2 size={13} />
              <span>{t("Excluir")}</span>
              <kbd>Del</kbd>
            </button>
          </div>
        )}
        {legend && (
          <div className="canvas-legend">
            {(Object.entries(KINDS) as [Kind, string][]).map(
              ([kind, label]) => (
                <span key={kind}>
                  <i className={"kind-dot " + kind} />
                  {t(label)}
                </span>
              ),
            )}
            <span className="legend-ports">{t("Portas: E (entrada) · S (saída) · HIP · REQ · VAL · Arraste para conectar")}</span>
          </div>
        )}
      </div>
          {bottomDock}
        </div>

        {libraryGhost && <div className="library-drag-ghost" aria-hidden="true"
          style={{ left: libraryGhost.x + 14, top: libraryGhost.y + 14 }}>
          <Plus size={14} />{libraryGhost.label}
        </div>}
        {drawerCategory && (() => {
          const templates = CATALOG_TEMPLATES[drawerCategory] ?? [];
          const filter = drawerFilter.trim().toLowerCase();

          let modelItems: Array<{ id: string; label: string; detail: string }> = [];
          if (drawerCategory === "variable") {
            modelItems = model.variables.map((v) => ({
              id: v.id,
              label: v.label,
              detail: `${v.value !== null && v.value !== undefined ? v.value : "?"} ${v.unit}`,
            }));
          } else if (drawerCategory === "equation") {
            modelItems = model.equations.map((e) => ({
              id: e.id,
              label: e.label,
              detail: `${e.lhs} = ${formatExpr(e.rhs)}`,
            }));
          } else if (drawerCategory === "assumption") {
            modelItems = model.assumptions.map((a) => ({
              id: a.id,
              label: a.label,
              detail: a.justification || "Sem justificativa",
            }));
          } else if (drawerCategory === "requirement") {
            modelItems = model.requirements.map((r) => ({
              id: r.id,
              label: r.label,
              detail: `Equação: ${r.equation_id}`,
            }));
          } else if (drawerCategory === "observation") {
            modelItems = model.observations.map((o) => ({
              id: o.id,
              label: o.label,
              detail: `${o.value} ${o.unit} · ${o.source}`,
            }));
          }

          const filteredTemplates = filter
            ? templates.filter(
                (t) =>
                  t.label.toLowerCase().includes(filter) ||
                  t.detail.toLowerCase().includes(filter),
              )
            : templates;

          const filteredModelItems = filter
            ? modelItems.filter(
                (m) =>
                  m.label.toLowerCase().includes(filter) ||
                  m.id.toLowerCase().includes(filter) ||
                  m.detail.toLowerCase().includes(filter),
              )
            : modelItems;

          const CategoryIcon =
            drawerCategory === "variable"
              ? Sigma
              : drawerCategory === "equation"
                ? FunctionSquare
                : drawerCategory === "assumption"
                  ? FileText
                  : drawerCategory === "requirement"
                    ? ShieldCheck
                    : Database;

          return (
            <aside
              className="node-library-drawer"
              data-testid="node-library-drawer"
              style={{ width: `${drawerWidth}px` }}
              aria-label={t("Biblioteca de {p0}", {p0: t(KINDS[drawerCategory])})}
            >
              <div
                className="drawer-resize-handle"
                onPointerDown={handleDrawerResizeStart}
                title={t("Arraste para redimensionar a largura da biblioteca")}
              />

              <div className="drawer-header">
                <div className="drawer-title">
                  <CategoryIcon size={16} className={"kind-icon " + drawerCategory} />
                  <strong>{t(KINDS[drawerCategory])}</strong>
                  <span className="drawer-count-badge">
                    {filteredTemplates.length}
                  </span>
                </div>
                <div className="drawer-actions">
                  <button
                    className="drawer-new-btn"
                    disabled={busy}
                    title={t("Criar novo nó de {p0} em branco", {p0: t(KINDS[drawerCategory])})}
                    onClick={() => onNewNode?.(drawerCategory)}
                  >
                    <Plus size={13} />
                    <span>{t("Novo")}</span>
                  </button>
                  <button
                    className="drawer-close-btn"
                    aria-label={t("Fechar painel de biblioteca")}
                    title={t("Fechar (Esc)")}
                    onClick={() => setDrawerCategory(null)}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              <div className="drawer-search-row">
                <Search size={13} className="drawer-search-icon" />
                <input
                  type="search"
                  className="drawer-search-input"
                  placeholder={t("Buscar em {p0}...", {p0: t(KINDS[drawerCategory])})}
                  value={drawerFilter}
                  onChange={(e) => setDrawerFilter(e.target.value)}
                />
                {drawerFilter && (
                  <button
                    className="drawer-search-clear"
                    onClick={() => setDrawerFilter("")}
                    title={t("Limpar busca")}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="drawer-hint">
                <span>{t("Exemplos sintéticos · Arraste para o grafo")}</span>
              </div>

              <div className="drawer-scroll-area">
                {filteredTemplates.length === 0 ? (
                  <div className="drawer-empty-state">{t("Nenhuma miniatura encontrada para o filtro.")}</div>
                ) : (
                  <div className="drawer-cards-grid">
                    {filteredTemplates.map((item) => (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        className={"drawer-card " + drawerCategory}
                        draggable={false}
                        title={t("{p0} ({p1}) — Arraste para o grafo · Enter para configurar", {p0: item.label, p1: item.detail})}

                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onNewNode?.(drawerCategory, item.patch);
                          }
                        }}
                        onPointerDown={(e) => {
                          if (busy || e.button !== 0) return;
                          e.currentTarget.setPointerCapture(e.pointerId);
                          libraryDrag.current = { x: e.clientX, y: e.clientY, moved: false };
                        }}
                        onPointerMove={(e) => {
                          const drag = libraryDrag.current;
                          if (!drag) return;
                          if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) drag.moved = true;
                          if (drag.moved) setLibraryGhost({ x: e.clientX, y: e.clientY, label: item.label });
                        }}
                        onPointerUp={(e) => {
                          const drag = libraryDrag.current;
                          libraryDrag.current = null;
                          setLibraryGhost(null);
                          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                          if (drag?.moved) dropTemplate(drawerCategory, item.patch, e.clientX, e.clientY);
                        }}
                        onPointerCancel={() => { libraryDrag.current = null; setLibraryGhost(null); }}
                        onLostPointerCapture={() => { libraryDrag.current = null; setLibraryGhost(null); }}
                      >
                        <div className="card-top">
                          <code className="card-id">{item.id}</code>

                        </div>
                        <div
                          className={"visual-node-thumb " + drawerCategory}
                          aria-hidden="true"
                        >
                          <span className="thumb-port left" title={t("Entrada")} />
                          <span className="thumb-port right" title={t("Saída")} />
                          <div className="thumb-center">
                            <CategoryIcon size={14} className="thumb-icon" />
                            <span className="thumb-id">{item.id}</span>
                          </div>
                        </div>
                        <strong className="card-label">{item.label}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          );
        })()}

        <nav className="viewport-right-rail" aria-label={t("Adicionar elementos")}>
          {(
            [
              ["variable", Sigma, "Biblioteca de Variáveis", "Adicionar variável"],
              ["equation", FunctionSquare, "Biblioteca de Equações", "Adicionar equação"],
              ["assumption", FileText, "Biblioteca de Hipóteses", "Adicionar hipótese"],
              ["requirement", ShieldCheck, "Biblioteca de Requisitos", "Adicionar requisito"],
              ["observation", Database, "Biblioteca de Referências", "Adicionar referência"],
            ] as const
          ).map(([kind, Icon, label, actionLabel]) => {
            const isOpen = drawerCategory === kind;
            return (
              <button
                key={kind}
                className={
                  "rail-btn node-add-btn " +
                  kind +
                  (isOpen ? " active drawer-open" : "")
                }
                disabled={busy}
                title={t(label)}
                aria-label={t(actionLabel)}
                aria-expanded={isOpen}
                data-testid={`rail-btn-${kind}`}
                onClick={() =>
                  setDrawerCategory((prev) => (prev === kind ? null : kind))
                }
              >
                <Icon size={18} />
              </button>
            );
          })}
        </nav>
      </div>
      {navigatorTarget &&
        map &&
        createPortal(
          <GraphNavigator
            snapshot={map}
            selected={selected}
            onSelect={(id) => {
              onSelect(id);
              focusNode(id);
            }}
            onMove={(x, y) => {
              if (vp) {
                vp.centerOnWorld(x, y);
                syncUiFromViewport();
              }
            }}
          />,
          navigatorTarget,
        )}
    </div>
  );
});
