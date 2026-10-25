import type { Graph, Kind, Model, Run } from "./types";
import type { MapSnapshot } from "./GraphNavigator";
import type { ViewState } from "./project";
import { formatExpr } from "./expression";
import { DEFAULT_PREFERENCES, type Preferences } from "./preferences";
import { createTranslator, localeFor, type Language } from "./i18n";

export const CARD_WIDTH = 228;
export const CARD_HEIGHT = 96;
const FLOATS_PER_VERTEX = 9;
const FLOATS_PER_TEXT_VERTEX = 5;

export interface WasmViewportExports {
  memory: WebAssembly.Memory;
  vp_new(): number;
  vp_free(ptr: number): void;
  vp_begin_model(
    ptr: number,
    nodeCount: number,
    edgeCount: number,
    preservePositions: number,
  ): void;
  vp_set_node(
    ptr: number,
    index: number,
    kind: number,
    isDerived: number,
    hasValue: number,
    value: number,
    refValue: number,
    tolerance: number,
    flagged: number,
    visible: number,
    muted: number,
    selected: number,
  ): void;
  vp_update_node_state(
    ptr: number,
    index: number,
    isDerived: number,
    hasValue: number,
    value: number,
    refValue: number,
    tolerance: number,
    flagged: number,
    visible: number,
    muted: number,
    selected: number,
  ): void;
  vp_set_executing_node(ptr: number, index: number): void;
  vp_add_edge(
    ptr: number,
    source: number,
    target: number,
    relation: number,
  ): void;
  vp_finish_model(ptr: number, runLayout: number): void;
  vp_refresh_state(ptr: number): void;
  vp_set_appearance(ptr: number, dark: number, r: number, g: number, b: number, halo: number): void;
  vp_arrange(ptr: number): void;
  vp_resize(ptr: number, width: number, height: number, dpr: number): void;
  vp_fit_all(ptr: number): void;
  vp_focus_node(ptr: number, index: number): void;
  vp_zoom_at(
    ptr: number,
    targetZoom: number,
    screenX: number,
    screenY: number,
  ): void;
  vp_pan_by(ptr: number, dx: number, dy: number): void;
  vp_center_on_world(ptr: number, wx: number, wy: number): void;
  vp_move_node(
    ptr: number,
    index: number,
    worldX: number,
    worldY: number,
  ): void;
  vp_set_hovered(ptr: number, nodeIndex: number, hoverKind: number): void;
  vp_set_hovered_sub(ptr: number, subIndex: number): void;
  vp_hit_test(ptr: number, screenX: number, screenY: number): number;
  vp_hit_port_index(ptr: number, screenX: number, screenY: number): number;
  vp_set_draft_wire(
    ptr: number,
    sx: number,
    sy: number,
    snx: number,
    sny: number,
    tx: number,
    ty: number,
    tnx: number,
    tny: number,
    valid: number,
  ): void;
  vp_clear_draft_wire(ptr: number): void;
  vp_port_kind(ptr: number, nodeIndex: number, portIndex: number): number;
  vp_port_x(ptr: number, nodeIndex: number, portIndex: number): number;
  vp_port_y(ptr: number, nodeIndex: number, portIndex: number): number;
  vp_port_nx(ptr: number, nodeIndex: number, portIndex: number): number;
  vp_port_ny(ptr: number, nodeIndex: number, portIndex: number): number;
  vp_port_connected(ptr: number, nodeIndex: number, portIndex: number): number;
  vp_port_edge_index(ptr: number, nodeIndex: number, portIndex: number): number;
  vp_edge_screen_x(ptr: number, edgeIndex: number): number;
  vp_edge_screen_y(ptr: number, edgeIndex: number): number;
  vp_configure_atlas(ptr: number, cols: number, rows: number): void;
  vp_build_frame(ptr: number): void;
  vp_vertices_ptr(ptr: number): number;
  vp_vertices_len(ptr: number): number;
  vp_text_vertices_ptr(ptr: number): number;
  vp_text_vertices_len(ptr: number): number;
  vp_metrics_ptr(ptr: number): number;
  vp_zoom(ptr: number): number;
  vp_pan_x(ptr: number): number;
  vp_pan_y(ptr: number): number;
  vp_node_x(ptr: number, index: number): number;
  vp_node_y(ptr: number, index: number): number;
  vp_node_screen_x(ptr: number, index: number): number;
  vp_node_screen_y(ptr: number, index: number): number;
  vp_node_port_count(ptr: number, index: number): number;
}

let wasmModulePromise: Promise<WasmViewportExports> | null = null;

export function loadViewportWasm(): Promise<WasmViewportExports> {
  if (!wasmModulePromise) {
    wasmModulePromise = (async () => {
      const response = await fetch("/wasm/viewport_core.wasm?abi=appearance-1");
      if (!response.ok) {
        throw new Error(
          `Falha ao carregar o motor Rust/WASM do viewport (${response.status}).`,
        );
      }
      const bytes = await response.arrayBuffer();
      const instantiated = await WebAssembly.instantiate(bytes, {});
      const exports = instantiated.instance.exports as unknown as WasmViewportExports;
      if (typeof exports.vp_set_appearance !== "function")
        throw new Error("Viewport WASM desatualizado. Execute npm run viewport:build e recarregue a janela.");
      return exports;
    })();
  }
  return wasmModulePromise;
}

const KIND_ID: Record<Kind, number> = {
  variable: 0,
  equation: 1,
  assumption: 2,
  requirement: 3,
  observation: 4,
};

const RELATION_ID: Record<string, number> = {
  INPUT_TO: 0,
  PRODUCES: 1,
  ASSUMPTION_FOR: 2,
  REQUIRES: 3,
  VALIDATED_BY: 4,
};


export interface NodeVisualSummary {
  organizational?:boolean;
  id: string;
  kind: Kind;
  title: string;
  detail: string;
  unit: string;
  chartLabel: string;
  isDerived: boolean;
  hasValue: boolean;
  value: number;
  refValue: number;
  tolerance: number;
  flagged: boolean;
  inDataCount: number;
  outDataCount: number;
  hasAssumptionPort: boolean;
  hasRequirementPort: boolean;
  hasValidationPort: boolean;
}

export function buildNodeSummaries(
  graph: Graph,
  model: Model,
  run: Run | null,
  flaggedSet: Set<string>,
  language: Language = "pt-BR",
): NodeVisualSummary[] {
  const t = createTranslator(language);
  const numberFmt = new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: 3 });
  const inData = new Map<string, number>();
  const outData = new Map<string, number>();
  const hasAssump = new Set<string>();
  const hasReq = new Set<string>();
  const hasVal = new Set<string>();

  for (const edge of graph.edges) {
    if (edge.relation === "INPUT_TO" || edge.relation === "PRODUCES") {
      outData.set(edge.source, (outData.get(edge.source) ?? 0) + 1);
      inData.set(edge.target, (inData.get(edge.target) ?? 0) + 1);
    } else if (edge.relation === "ASSUMPTION_FOR") {
      outData.set(edge.source, (outData.get(edge.source) ?? 0) + 1);
      hasAssump.add(edge.target);
    } else if (edge.relation === "REQUIRES") {
      outData.set(edge.source, (outData.get(edge.source) ?? 0) + 1);
      hasReq.add(edge.target);
    } else if (edge.relation === "VALIDATED_BY") {
      hasVal.add(edge.source);
      hasVal.add(edge.target);
    }
  }

  return graph.nodes.map((node) => {
    const variable = model.variables.find((item) => item.id === node.id);
    const equation = model.equations.find((item) => item.id === node.id);
    const observation = model.observations.find((item) => item.id === node.id);
    const assumption = model.assumptions.find((item) => item.id === node.id);
    const requirement = model.requirements.find((item) => item.id === node.id);

    const runVal = run?.values[node.id]?.value;
    const rawValue = runVal ?? variable?.value ?? observation?.value ?? null;
    const unit =
      run?.values[node.id]?.unit ?? variable?.unit ?? observation?.unit ?? "";
    const isDerived = Boolean(
      variable && model.equations.some((item) => item.lhs === node.id),
    );
    const flagged = flaggedSet.has(node.id);

    const title = equation ? equation.label.split(":")[0] : node.label;

    const detail = equation
      ? `${equation.lhs} = ${formatExpr(equation.rhs)}`
      : observation
        ? `${numberFmt.format(observation.value)} ${observation.unit}`
        : assumption
          ? assumption.label
          : rawValue != null
            ? `${numberFmt.format(rawValue)}${unit ? " " + unit : ""}`
            : node.kind === "requirement"
              ? flagged
                ? t("Cobertura a investigar")
                : t("Requisito de cobertura")
              : t("Entrada sem valor");

    let refValue = 0;
    let tolerance = 0;
    let chartLabel = "";

    if (observation) {
      const targetVarVal =
        run?.values[observation.variable_id]?.value ??
        model.variables.find((v) => v.id === observation.variable_id)?.value ??
        null;
      refValue = targetVarVal ?? 0;
      tolerance = observation.tolerance;
      const comparable =
        run?.values[observation.variable_id]?.unit === observation.unit;
      if (targetVarVal != null && comparable) {
        const diff = Math.abs(targetVarVal - observation.value);
        chartLabel =
          diff <= observation.tolerance
            ? `±${numberFmt.format(observation.tolerance)} ${observation.unit}`
            : `Δ ${numberFmt.format(diff)} ${observation.unit}`;
      } else {
        chartLabel = `±${numberFmt.format(observation.tolerance)} ${observation.unit}`;
      }
    } else if (equation) {
      const inCount = inData.get(node.id) ?? 0;
      chartLabel = t("{count} entradas", { count: inCount });
    } else if (variable) {
      chartLabel = isDerived
        ? rawValue != null
          ? t("Derivada")
          : t("Pendente")
        : unit;
    } else if (requirement) {
      chartLabel = requirement.exclusion_reason
        ? t("Excluído")
        : flagged
          ? t("Investigar")
          : run
            ? t("Ver cobertura")
            : t("Não verificado");
    } else if (assumption) {
      chartLabel = t("Declarada");
    }

    return {
      id: node.id,
      kind: node.kind,
      title,
      detail,
      unit: variable && !isDerived ? variable.unit : chartLabel,
      chartLabel,
      isDerived,
      hasValue: rawValue != null,
      value: rawValue ?? 0,
      refValue,
      tolerance,
      flagged,
      inDataCount: inData.get(node.id) ?? 0,
      outDataCount: outData.get(node.id) ?? 0,
      hasAssumptionPort: hasAssump.has(node.id),
      hasRequirementPort: hasReq.has(node.id),
      hasValidationPort: hasVal.has(node.id),
      ...(node.group?{organizational:true,detail:t("{count} elementos · organização visual",{count:node.group.members.length}),unit:t("Grupo"),chartLabel:t("Grupo"),hasValue:false,isDerived:false,
        flagged:!!run?.checks.some(check=>check.status!=="passed"&&check.node_ids.some(id=>node.group!.members.includes(id)))}:{}),
    };
  });
}

const VERT_SHADER_SOLID = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec4 a_color;
layout(location = 3) in float a_mode;

uniform vec2 u_resolution;
uniform vec2 u_pan;
uniform float u_zoom;

out vec2 v_uv;
out vec4 v_color;
out float v_mode;

void main() {
  vec2 screen = a_pos * u_zoom + u_pan;
  vec2 clip = (screen / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color;
  v_mode = a_mode;
}
`;

const FRAG_SHADER_SOLID = `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_color;
in float v_mode;
out vec4 outColor;

void main() {
  float alpha = v_color.a;
  if (v_mode > 1.5) {
    // Mode 2.0: Anti-aliased circle SDF
    float dist = length(v_uv);
    float fw = max(fwidth(dist), 0.02);
    float cov = 1.0 - smoothstep(1.0 - fw, 1.0 + fw, dist);
    if (cov <= 0.001) discard;
    outColor = vec4(v_color.rgb, alpha * cov);
  } else if (v_mode > 0.5) {
    // Mode 1.0: Anti-aliased rounded rectangle SDF
    vec2 q = abs(v_uv) - vec2(0.88, 0.80);
    float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.12;
    float fw = max(fwidth(dist), 0.015);
    float cov = 1.0 - smoothstep(-fw, fw, dist);
    if (cov <= 0.001) discard;
    outColor = vec4(v_color.rgb, alpha * cov);
  } else {
    // Mode 0.0: Ribbon / triangle with edge AA along v_uv.y
    float edge = abs(v_uv.y);
    float fw = max(fwidth(edge), 0.04);
    float cov = 1.0 - smoothstep(1.0 - fw, 1.0 + fw, edge);
    outColor = vec4(v_color.rgb, alpha * cov);
  }
}
`;

const VERT_SHADER_TEXT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in float a_alpha;

uniform vec2 u_resolution;
uniform vec2 u_pan;
uniform float u_zoom;

out vec2 v_uv;
out float v_alpha;

void main() {
  vec2 screen = a_pos * u_zoom + u_pan;
  vec2 clip = (screen / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
  v_alpha = a_alpha;
}
`;

const FRAG_SHADER_TEXT = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_alpha;
uniform sampler2D u_atlas;
out vec4 outColor;

void main() {
  vec4 tex = texture(u_atlas, v_uv);
  if (tex.a <= 0.01) discard;
  outColor = vec4(tex.rgb, tex.a * v_alpha);
}
`;

function compileProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
): WebGLProgram {
  const compile = (type: number, src: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Não foi possível alocar shader WebGL2.");
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? "Erro desconhecido";
      gl.deleteShader(shader);
      throw new Error(`Erro ao compilar shader WebGL2: ${log}`);
    }
    return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);
  const prog = gl.createProgram();
  if (!prog) throw new Error("Não foi possível criar programa WebGL2.");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? "Erro desconhecido";
    gl.deleteProgram(prog);
    throw new Error(`Erro ao linkar programa WebGL2: ${log}`);
  }
  return prog;
}

export class RustGpuViewport {
  readonly wasm: WasmViewportExports;
  readonly ptr: number;
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;

  private solidProgram: WebGLProgram;
  private solidVao: WebGLVertexArrayObject;
  private solidVbo: WebGLBuffer;
  private uSolidRes: WebGLUniformLocation | null;
  private uSolidPan: WebGLUniformLocation | null;
  private uSolidZoom: WebGLUniformLocation | null;

  private textProgram: WebGLProgram;
  private textVao: WebGLVertexArrayObject;
  private textVbo: WebGLBuffer;
  private atlasTex: WebGLTexture;
  private uTextRes: WebGLUniformLocation | null;
  private uTextPan: WebGLUniformLocation | null;
  private uTextZoom: WebGLUniformLocation | null;

  private atlasCanvas: HTMLCanvasElement;
  private atlasCtx: CanvasRenderingContext2D;
  private lastCompactState = false;
  private appearance: Preferences = { ...DEFAULT_PREFERENCES };
  private currentSummaries: NodeVisualSummary[] = [];
  private positionCache=new Map<string,{x:number;y:number}>();

  constructor(canvas: HTMLCanvasElement, wasm: WasmViewportExports) {
    this.canvas = canvas;
    this.wasm = wasm;
    this.ptr = wasm.vp_new();

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      wasm.vp_free(this.ptr);
      throw new Error(
        "WebGL2 indisponível nesta WebView/navegador para o viewport Rust GPU.",
      );
    }
    this.gl = gl;
    canvas.setAttribute("data-renderer", "rust-wasm-webgl2");

    this.solidProgram = compileProgram(
      gl,
      VERT_SHADER_SOLID,
      FRAG_SHADER_SOLID,
    );
    const solidVao = gl.createVertexArray();
    const solidVbo = gl.createBuffer();
    if (!solidVao || !solidVbo) {
      throw new Error("Falha ao alocar buffers WebGL2 para geometria.");
    }
    this.solidVao = solidVao;
    this.solidVbo = solidVbo;

    gl.bindVertexArray(this.solidVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.solidVbo);
    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 32);

    this.uSolidRes = gl.getUniformLocation(this.solidProgram, "u_resolution");
    this.uSolidPan = gl.getUniformLocation(this.solidProgram, "u_pan");
    this.uSolidZoom = gl.getUniformLocation(this.solidProgram, "u_zoom");

    this.textProgram = compileProgram(gl, VERT_SHADER_TEXT, FRAG_SHADER_TEXT);
    const textVao = gl.createVertexArray();
    const textVbo = gl.createBuffer();
    const atlasTex = gl.createTexture();
    if (!textVao || !textVbo || !atlasTex) {
      throw new Error("Falha ao alocar buffers WebGL2 para atlas tipográfico.");
    }
    this.textVao = textVao;
    this.textVbo = textVbo;
    this.atlasTex = atlasTex;

    gl.bindVertexArray(this.textVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.textVbo);
    const tStride = FLOATS_PER_TEXT_VERTEX * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, tStride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, tStride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, tStride, 16);

    this.uTextRes = gl.getUniformLocation(this.textProgram, "u_resolution");
    this.uTextPan = gl.getUniformLocation(this.textProgram, "u_pan");
    this.uTextZoom = gl.getUniformLocation(this.textProgram, "u_zoom");

    gl.bindVertexArray(null);

    this.atlasCanvas = document.createElement("canvas");
    const ctx = this.atlasCanvas.getContext("2d");
    if (!ctx) {
      throw new Error("Contexto 2D indisponível para o atlas tipográfico.");
    }
    this.atlasCtx = ctx;
  }

  setAppearance(value: Preferences): void {
    const textStyleChanged = value.theme !== this.appearance.theme || value.language !== this.appearance.language;
    this.appearance = { ...value };
    const rgb = [1, 3, 5].map(start => parseInt(value.selectionColorHex.slice(start, start + 2), 16) / 255);
    this.wasm.vp_set_appearance(this.ptr, value.theme === "dark" ? 1 : 0, rgb[0], rgb[1], rgb[2], value.selectionHalo ? 1 : 0);
    this.canvas.dataset.theme = value.theme;
    if (textStyleChanged) this.rebuildTextAtlas(this.lastCompactState);
  }

  destroy(): void {
    const { gl } = this;
    gl.deleteBuffer(this.solidVbo);
    gl.deleteVertexArray(this.solidVao);
    gl.deleteProgram(this.solidProgram);
    gl.deleteTexture(this.atlasTex);
    gl.deleteBuffer(this.textVbo);
    gl.deleteVertexArray(this.textVao);
    gl.deleteProgram(this.textProgram);
    this.wasm.vp_free(this.ptr);
  }

  setModel(
    graph: Graph,
    summaries: NodeVisualSummary[],
    visibility: Record<Kind, boolean>,
    mutedSet: Set<string>,
    selectedId: string | null,
    preservePositions: boolean,
  ): void {
    const previousCamera={x:this.panX(),y:this.panY(),zoom:this.zoom()};
    const previousCenter=this.viewportCenterWorld();
    if(!preservePositions)this.positionCache.clear();
    const prevPositions = this.positionCache;
    if (this.currentSummaries && preservePositions) {
      for (let i = 0; i < this.currentSummaries.length; i++) {
        const id = this.currentSummaries[i].id;
        prevPositions.set(id, {
          x: this.wasm.vp_node_x(this.ptr, i),
          y: this.wasm.vp_node_y(this.ptr, i),
        });
      }
    }

    const retainedIds=new Set(graph.preserveIds??graph.nodes.flatMap(node=>[node.id,...(node.group?.members??[])]));
    for(const id of prevPositions.keys())if(!retainedIds.has(id))prevPositions.delete(id);

    this.currentSummaries = summaries;
    const indexById = new Map(graph.nodes.map((n, idx) => [n.id, idx]));

    this.wasm.vp_begin_model(
      this.ptr,
      graph.nodes.length,
      graph.edges.length,
      preservePositions ? 1 : 0,
    );

    summaries.forEach((s, idx) => {
      this.wasm.vp_set_node(
        this.ptr,
        idx,
        s.organizational?5:KIND_ID[s.kind],
        s.isDerived ? 1 : 0,
        s.hasValue ? 1 : 0,
        s.value,
        s.refValue,
        s.tolerance,
        s.flagged ? 1 : 0,
        s.organizational||visibility[s.kind] ? 1 : 0,
        mutedSet.has(s.id) ? 1 : 0,
        selectedId === s.id ? 1 : 0,
      );
    });

    for (const edge of graph.edges) {
      const src = indexById.get(edge.source);
      const dst = indexById.get(edge.target);
      if (src !== undefined && dst !== undefined) {
        this.wasm.vp_add_edge(
          this.ptr,
          src,
          dst,
          RELATION_ID[edge.relation] ?? 0,
        );
      }
    }

    // Lay out newly added components in Rust, then restore existing user positions.
    this.wasm.vp_finish_model(this.ptr, 1);

    if (preservePositions && prevPositions.size > 0) {
      const center = previousCenter;
      const singleNew=graph.nodes.filter(node=>!prevPositions.has(node.id)).length===1;
      const newIndexes=graph.nodes.map((node,index)=>!prevPositions.has(node.id)?index:-1).filter(index=>index>=0);
      const shiftX=!singleNew&&newIndexes.length?Math.max(...[...prevPositions.values()].map(p=>p.x))+316-Math.min(...newIndexes.map(index=>this.wasm.vp_node_x(this.ptr,index))):0;
      graph.nodes.forEach((n, idx) => {
        const pos = prevPositions.get(n.id);
        if (pos) {
          this.wasm.vp_move_node(this.ptr, idx, pos.x, pos.y);
        } else if(n.group){
          const members=n.group.members.map(id=>prevPositions.get(id)).filter((p):p is {x:number;y:number}=>!!p);
          this.wasm.vp_move_node(this.ptr,idx,members.length?members.reduce((sum,p)=>sum+p.x,0)/members.length:center.x,members.length?members.reduce((sum,p)=>sum+p.y,0)/members.length:center.y);
        } else if(singleNew) {
          this.wasm.vp_move_node(
            this.ptr,
            idx,
            center.x,
            center.y,
          );
        }else{
          this.wasm.vp_move_node(this.ptr,idx,this.wasm.vp_node_x(this.ptr,idx)+shiftX,this.wasm.vp_node_y(this.ptr,idx));
        }
      });
    }

    if(preservePositions){this.zoomAt(previousCamera.zoom,0,0);this.panBy(previousCamera.x-this.panX(),previousCamera.y-this.panY());}

    this.lastCompactState = this.zoom() < 0.36;
    this.rebuildTextAtlas(this.lastCompactState);
  }

  updateStates(
    summaries: NodeVisualSummary[],
    visibility: Record<Kind, boolean>,
    mutedSet: Set<string>,
    selectedIds: Set<string> | string[] | string | null,
  ): void {
    const isSelected = (id: string): boolean => {
      if (!selectedIds) return false;
      if (selectedIds instanceof Set) return selectedIds.has(id);
      if (Array.isArray(selectedIds)) return selectedIds.includes(id);
      return selectedIds === id;
    };
    const textChanged =
      JSON.stringify(this.currentSummaries) !== JSON.stringify(summaries);
    this.currentSummaries = summaries;
    summaries.forEach((s, idx) => {
      this.wasm.vp_update_node_state(
        this.ptr,
        idx,
        s.isDerived ? 1 : 0,
        s.hasValue ? 1 : 0,
        s.value,
        s.refValue,
        s.tolerance,
        s.flagged ? 1 : 0,
        s.organizational||visibility[s.kind] ? 1 : 0,
        mutedSet.has(s.id) ? 1 : 0,
        isSelected(s.id) ? 1 : 0,
      );
    });
    this.wasm.vp_refresh_state(this.ptr);
    this.lastCompactState = this.zoom() < 0.36;
    if (textChanged) this.rebuildTextAtlas(this.lastCompactState);
  }

  setExecutingNode(index: number | null): void {
    this.wasm.vp_set_executing_node(
      this.ptr,
      index !== null && index >= 0 ? index : -1,
    );
  }

  private rebuildTextAtlas(compact: boolean): void {
    const dark = this.appearance.theme === "dark";
    const count = this.currentSummaries.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(count, 1))));
    const rows = Math.max(1, Math.ceil(Math.max(count, 1) / cols));
    this.wasm.vp_configure_atlas(this.ptr, cols, rows);

    // Every node needs a label; the previous fixed 64-cell atlas silently omitted
    // all later nodes. Bound texture dimensions to the actual GPU capability.
    const maxTexture = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
    const scale = Math.min(
      count > 100 ? 1 : 2,
      maxTexture / (cols * CARD_WIDTH),
      maxTexture / (rows * CARD_HEIGHT),
    );
    const cellW = CARD_WIDTH * scale;
    const cellH = CARD_HEIGHT * scale;
    this.atlasCanvas.width = cols * cellW;
    this.atlasCanvas.height = rows * cellH;

    const ctx = this.atlasCtx;
    ctx.save();
    ctx.clearRect(0, 0, this.atlasCanvas.width, this.atlasCanvas.height);

    for (let i = 0; i < count; i++) {
      const s = this.currentSummaries[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const ox = col * cellW;
      const oy = row * cellH;

      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(scale, scale);

      if (compact) {
        // Overview mode: larger bold title & prominent value
        ctx.fillStyle = dark ? "#eeeeee" : "#142c46";
        ctx.font = '650 15.5px "Segoe UI", system-ui, sans-serif';
        drawClampedLines(ctx, s.title, 46, 34, 154, 18, 2);
        if (s.isDerived || s.kind === "observation") {
          ctx.fillStyle = dark ? "#a9d8e4" : "#0b557a";
          ctx.font = '650 14px "Segoe UI", system-ui, sans-serif';
          ctx.fillText(truncateText(ctx, s.detail, 160), 46, 76);
        }
      } else {
        // Full detail mode: Title, Value/Formula, Unit badge & Port tags
        ctx.fillStyle = dark ? "#eeeeee" : "#17324d";
        ctx.font = '650 12.5px "Segoe UI", system-ui, sans-serif';
        const linesUsed = drawClampedLines(ctx, s.title, 46, 23, 148, 14.5, 2);
        const detailY = linesUsed > 1 ? 56 : 46;

        if (s.isDerived || s.kind === "observation") {
          ctx.fillStyle = dark ? "#eeeeee" : "#122b44";
          ctx.font = '650 15px "Segoe UI", system-ui, sans-serif';
          ctx.fillText(truncateText(ctx, s.detail, 152), 46, detailY + 4);
        } else if (s.kind === "equation") {
          ctx.fillStyle = dark ? "#b1dfc8" : "#1f5a46";
          ctx.font = 'italic 12.5px Georgia, "Times New Roman", serif';
          ctx.fillText(truncateText(ctx, s.detail, 150), 46, detailY + 2);
        } else {
          ctx.fillStyle = dark ? (s.flagged ? "#f4c484" : "#c0c0c0") : (s.flagged ? "#9a4d08" : "#44637f");
          ctx.font = '500 11.5px "Segoe UI", system-ui, sans-serif';
          ctx.fillText(truncateText(ctx, s.detail, 152), 46, detailY + 2);
        }

        // Bottom-right unit / status pill
        if (s.unit) {
          ctx.font = '500 9.5px "Cascadia Code", Consolas, monospace';
          const badgeText = truncateText(ctx, s.unit, 64);
          const tw = ctx.measureText(badgeText).width;
          const bw = tw + 8;
          const bx = CARD_WIDTH - bw - 10;
          const by = CARD_HEIGHT - 21;
          ctx.fillStyle = dark ? (s.flagged ? "#483923" : "#262626") : (s.flagged ? "#fff1d6" : "#f2f8fd");
          ctx.strokeStyle = dark ? (s.flagged ? "#b08d52" : "#565656") : (s.flagged ? "#e2a24b" : "#bed4e6");
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, 14, 3);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = dark ? (s.flagged ? "#f4c484" : "#d0d0d0") : (s.flagged ? "#8c4600" : "#315674");
          ctx.fillText(badgeText, bx + 4, by + 10);
        }

        // Organized Port role indicators inside card perimeter
        ctx.font = '600 8px "Cascadia Code", Consolas, monospace';
        if (s.inDataCount > 0) {
          ctx.fillStyle = dark ? "#91c8ef" : "#186fa8";
          ctx.fillText(
            s.inDataCount > 1 ? `${this.appearance.language === "en" ? "IN" : "E"}×${s.inDataCount}` : this.appearance.language === "en" ? "IN" : "E",
            10,
            CARD_HEIGHT - 24,
          );
        }
        if (s.outDataCount > 0) {
          ctx.fillStyle = dark ? "#95d7b6" : "#156d54";
          ctx.fillText(this.appearance.language === "en" ? "OUT" : "S", CARD_WIDTH - (this.appearance.language === "en" ? 28 : 16), CARD_HEIGHT * 0.5 + 3);
        }
        if (s.hasAssumptionPort) {
          ctx.fillStyle = dark ? "#cfb0f5" : "#7a42cc";
          ctx.fillText(this.appearance.language === "en" ? "ASM" : "HIP", CARD_WIDTH * 0.5 - 24, 11);
        }
        if (s.hasRequirementPort) {
          ctx.fillStyle = dark ? "#eac78e" : "#a86810";
          ctx.fillText("REQ", CARD_WIDTH * 0.5 - 24, CARD_HEIGHT - 4);
        } else if (s.hasValidationPort) {
          ctx.fillStyle = dark ? "#9bcbd6" : "#1d6578";
          ctx.fillText(this.appearance.language === "en" ? "REF" : "VAL", CARD_WIDTH * 0.5 + 16, CARD_HEIGHT - 4);
        }
      }

      ctx.restore();
    }
    ctx.restore();

    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.atlasCanvas,
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  resize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelW = Math.max(1, Math.round(width * dpr));
    const pixelH = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
      this.canvas.width = pixelW;
      this.canvas.height = pixelH;
    }
    this.wasm.vp_resize(this.ptr, width, height, dpr);
  }

  render(): void {
    const currentZoom = this.zoom();
    const isCompact = currentZoom < 0.36;
    if (isCompact !== this.lastCompactState) {
      this.lastCompactState = isCompact;
      this.rebuildTextAtlas(isCompact);
    }

    this.wasm.vp_build_frame(this.ptr);

    const { gl, wasm } = this;
    const width = Math.max(1, this.canvas.clientWidth || this.canvas.width);
    const height = Math.max(1, this.canvas.clientHeight || this.canvas.height);
    const panX = wasm.vp_pan_x(this.ptr);
    const panY = wasm.vp_pan_y(this.ptr);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Pass 1: Vector Geometry (Wires, Arrowheads, Cards, Icons, Charts, Ports)
    const vLen = wasm.vp_vertices_len(this.ptr);
    if (vLen > 0) {
      const vPtr = wasm.vp_vertices_ptr(this.ptr);
      const vertices = new Float32Array(wasm.memory.buffer, vPtr, vLen);
      gl.useProgram(this.solidProgram);
      gl.uniform2f(this.uSolidRes, width, height);
      gl.uniform2f(this.uSolidPan, panX, panY);
      gl.uniform1f(this.uSolidZoom, currentZoom);
      gl.bindVertexArray(this.solidVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.solidVbo);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, vLen / FLOATS_PER_VERTEX);
    }

    // Pass 2: Crisp Typography Atlas Quads
    const tLen = wasm.vp_text_vertices_len(this.ptr);
    if (tLen > 0 && (this.appearance.alwaysShowLabels || currentZoom >= 0.36)) {
      const tPtr = wasm.vp_text_vertices_ptr(this.ptr);
      const textVertices = new Float32Array(wasm.memory.buffer, tPtr, tLen);
      gl.useProgram(this.textProgram);
      gl.uniform2f(this.uTextRes, width, height);
      gl.uniform2f(this.uTextPan, panX, panY);
      gl.uniform1f(this.uTextZoom, currentZoom);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
      gl.bindVertexArray(this.textVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.textVbo);
      gl.bufferData(gl.ARRAY_BUFFER, textVertices, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, tLen / FLOATS_PER_TEXT_VERTEX);
    }

    gl.bindVertexArray(null);
  }

  zoom(): number {
    return this.wasm.vp_zoom(this.ptr);
  }

  captureView(visibility: Record<Kind, boolean>): ViewState {
    this.currentSummaries.forEach((node,index)=>this.positionCache.set(node.id,this.nodeWorldPosition(index)));
    return {
      positions: [...this.positionCache].map(([id,p])=>({id,...p})),
      camera: { x: this.panX(), y: this.panY(), zoom: this.zoom() },
      visibility: { ...visibility },
    };
  }

  restoreView(view: ViewState): void {
    const positions = new Map(view.positions.map((p) => [p.id, p]));
    this.positionCache=new Map(view.positions.map(p=>[p.id,{x:p.x,y:p.y}]));
    this.currentSummaries.forEach((node, index) => {
      const p = positions.get(node.id);
      if (p) this.moveNode(index, p.x, p.y);
    });
    this.zoomAt(view.camera.zoom, 0, 0);
    this.panBy(view.camera.x - this.panX(), view.camera.y - this.panY());
  }

  panX(): number {
    return this.wasm.vp_pan_x(this.ptr);
  }

  panY(): number {
    return this.wasm.vp_pan_y(this.ptr);
  }

  arrange(): void {
    this.wasm.vp_arrange(this.ptr);
  }

  fitAll(): void {
    this.wasm.vp_fit_all(this.ptr);
  }

  focusNode(index: number): void {
    this.wasm.vp_focus_node(this.ptr, index);
  }

  zoomAt(targetZoom: number, screenX: number, screenY: number): void {
    this.wasm.vp_zoom_at(this.ptr, targetZoom, screenX, screenY);
  }

  panBy(dx: number, dy: number): void {
    this.wasm.vp_pan_by(this.ptr, dx, dy);
  }

  centerOnWorld(wx: number, wy: number): void {
    this.wasm.vp_center_on_world(this.ptr, wx, wy);
  }

  moveNode(index: number, worldX: number, worldY: number): void {
    this.wasm.vp_move_node(this.ptr, index, worldX, worldY);
  }

  portEdgeIndex(nodeIndex: number, portIndex: number): number {
    return this.wasm.vp_port_edge_index(this.ptr, nodeIndex, portIndex);
  }

  setHovered(nodeIndex: number, hoverKind: number, subIndex = -1): void {
    this.wasm.vp_set_hovered(this.ptr, nodeIndex, hoverKind);
    this.wasm.vp_set_hovered_sub(this.ptr, subIndex);
  }

  setDraftWire(
    sx: number,
    sy: number,
    snx: number,
    sny: number,
    tx: number,
    ty: number,
    tnx: number,
    tny: number,
    valid: boolean,
  ): void {
    this.wasm.vp_set_draft_wire(
      this.ptr,
      sx,
      sy,
      snx,
      sny,
      tx,
      ty,
      tnx,
      tny,
      valid ? 1 : 0,
    );
  }

  clearDraftWire(): void {
    this.wasm.vp_clear_draft_wire(this.ptr);
  }

  hitTest(
    screenX: number,
    screenY: number,
  ): {
    kind: "none" | "node" | "more" | "port" | "wire";
    nodeIndex: number;
    edgeIndex: number;
    portIndex: number;
  } {
    const packed = this.wasm.vp_hit_test(this.ptr, screenX, screenY);
    const code = packed & 0xff;
    const index = packed >>> 8;
    if (code === 1) {
      return { kind: "node", nodeIndex: index, edgeIndex: -1, portIndex: -1 };
    }
    if (code === 2) {
      return { kind: "more", nodeIndex: index, edgeIndex: -1, portIndex: -1 };
    }
    if (code === 3) {
      const portIndex = this.wasm.vp_hit_port_index(this.ptr, screenX, screenY);
      return { kind: "port", nodeIndex: index, edgeIndex: -1, portIndex };
    }
    if (code === 4) {
      return { kind: "wire", nodeIndex: -1, edgeIndex: index, portIndex: -1 };
    }
    return { kind: "none", nodeIndex: -1, edgeIndex: -1, portIndex: -1 };
  }

  portInfo(
    nodeIndex: number,
    portIndex: number,
  ): {
    kind: number;
    x: number;
    y: number;
    nx: number;
    ny: number;
    connected: boolean;
    screenX: number;
    screenY: number;
  } {
    const wasm = this.wasm;
    const x = wasm.vp_port_x(this.ptr, nodeIndex, portIndex);
    const y = wasm.vp_port_y(this.ptr, nodeIndex, portIndex);
    const nx = wasm.vp_port_nx(this.ptr, nodeIndex, portIndex);
    const ny = wasm.vp_port_ny(this.ptr, nodeIndex, portIndex);
    const kind = wasm.vp_port_kind(this.ptr, nodeIndex, portIndex);
    const connected =
      wasm.vp_port_connected(this.ptr, nodeIndex, portIndex) !== 0;
    const z = this.zoom();
    const panX = this.panX();
    const panY = this.panY();
    return {
      kind,
      x,
      y,
      nx,
      ny,
      connected,
      screenX: x * z + panX,
      screenY: y * z + panY,
    };
  }

  edgeScreenMidpoint(edgeIndex: number): { x: number; y: number } {
    return {
      x: this.wasm.vp_edge_screen_x(this.ptr, edgeIndex),
      y: this.wasm.vp_edge_screen_y(this.ptr, edgeIndex),
    };
  }

  viewportCenterWorld(): { x: number; y: number } {
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 600;
    const z = this.zoom() || 1;
    return {
      x: (w * 0.5 - this.panX()) / z,
      y: (h * 0.5 - this.panY()) / z,
    };
  }

  nodeScreenPosition(index: number): { x: number; y: number } {
    return {
      x: this.wasm.vp_node_screen_x(this.ptr, index),
      y: this.wasm.vp_node_screen_y(this.ptr, index),
    };
  }

  nodeWorldPosition(index: number): { x: number; y: number } {
    return {
      x: this.wasm.vp_node_x(this.ptr, index),
      y: this.wasm.vp_node_y(this.ptr, index),
    };
  }

  labelIdsInFrame(): Set<string> {
    const length = this.wasm.vp_text_vertices_len(this.ptr);
    const vertices = new Float32Array(
      this.wasm.memory.buffer,
      this.wasm.vp_text_vertices_ptr(this.ptr),
      length,
    );
    const key = (x: number, y: number) =>
      `${Math.round(x * 10)}:${Math.round(y * 10)}`;
    const centers = new Set<string>();
    for (let i = 0; i < length; i += 30)
      centers.add(
        key(vertices[i] + CARD_WIDTH / 2, vertices[i + 1] + CARD_HEIGHT / 2),
      );
    return new Set(
      this.currentSummaries
        .filter((_, index) => {
          const p = this.nodeWorldPosition(index);
          return centers.has(key(p.x, p.y));
        })
        .map((s) => s.id),
    );
  }

  nodePortCount(index: number): number {
    return this.wasm.vp_node_port_count(this.ptr, index);
  }

  mapSnapshot(
    graph: Graph,
    visibility: Record<Kind, boolean>,
    flaggedSet: Set<string>,
  ): MapSnapshot | null {
    const visibleNodes: MapSnapshot["nodes"] = [];
    const visibleSet = new Set<string>();
    graph.nodes.forEach((node, idx) => {
      if (!visibility[node.kind]) return;
      visibleSet.add(node.id);
      visibleNodes.push({
        id: node.id,
        x: this.wasm.vp_node_x(this.ptr, idx),
        y: this.wasm.vp_node_y(this.ptr, idx),
        kind: node.kind,
        flagged: flaggedSet.has(node.id),
      });
    });
    if (!visibleNodes.length) return null;

    const visibleEdges = graph.edges
      .filter((e) => visibleSet.has(e.source) && visibleSet.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }));

    const mPtr = this.wasm.vp_metrics_ptr(this.ptr);
    const m = new Float32Array(this.wasm.memory.buffer, mPtr, 8);
    return {
      nodes: visibleNodes,
      edges: visibleEdges,
      bounds: { x1: m[0], y1: m[1], w: m[2], h: m[3] },
      extent: { x1: m[4], y1: m[5], w: m[6], h: m[7] },
    };
  }
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (
    end > 1 &&
    ctx.measureText(text.slice(0, end) + "…").width > maxWidth
  ) {
    end--;
  }
  return text.slice(0, end) + "…";
}

function drawClampedLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  const count = Math.min(lines.length, maxLines);
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1 && lines.length > maxLines;
    const raw = isLast ? lines.slice(i).join(" ") : lines[i];
    ctx.fillText(truncateText(ctx, raw, maxWidth), x, y + i * lineHeight);
  }
  return count;
}
