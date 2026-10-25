import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Kind, Model } from "./types";
import {parseRevisions,type RevisionHistory} from "./revisionHistory";
import {validateModule,validateGroups,type ModuleTemplate,type ModelGroup} from "./modules";

export const PROJECT_LIMIT = 2_000_000;
export interface ViewState {
  positions: { id: string; x: number; y: number }[];
  camera: { x: number; y: number; zoom: number };
  visibility: Record<Kind, boolean>;
}
export interface WorkspaceState {
  activeGroup?:string|null;
  viewport: ViewState | null;
  /** Reserved v1 compatibility field. The redundant explorer panel is retired. */
  explorer: boolean;
  inspector: boolean;
  navigator: boolean;
  results: boolean;
}
export interface ProjectDocument {
  format: "nexo-project";
  version: 1;
  createdAt: string;
  updatedAt: string;
  model: Model;
  workspace: WorkspaceState;
  revisionHistory?: RevisionHistory;
  modules?:ModuleTemplate[];
  groups?:ModelGroup[];
}
const kinds: Kind[] = [
  "variable",
  "equation",
  "assumption",
  "requirement",
  "observation",
];
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const bounded = (n: unknown, limit: number): n is number =>
  typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= limit;

// Validate envelope/view here; the scientific engine validates the model separately.
export function parseProject(text: string): {
  model: unknown;
  document: ProjectDocument | null;
} {
  if (new TextEncoder().encode(text).length > PROJECT_LIMIT)
    throw new Error("Projeto excede 2 MB.");
  const raw: unknown = JSON.parse(text);
  if (!record(raw)) throw new Error("Arquivo inválido.");
  if (!("format" in raw)) return { model: raw, document: null };
  if (raw.format !== "nexo-project" || raw.version !== 1)
    throw new Error("Formato ou versão de projeto não suportado.");
  if (
    typeof raw.createdAt !== "string" ||
    !Number.isFinite(Date.parse(raw.createdAt)) ||
    typeof raw.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(raw.updatedAt))
  )
    throw new Error("Datas do projeto inválidas.");
  const workspace = raw.workspace;
  if (
    !record(workspace) ||
    ["explorer", "inspector", "navigator", "results"].some(
      (key) => typeof workspace[key] !== "boolean",
    )
  )
    throw new Error("Configuração de painéis inválida.");
  const view = workspace.viewport;
  if(workspace.activeGroup!==undefined&&workspace.activeGroup!==null&&(typeof workspace.activeGroup!=="string"||!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(workspace.activeGroup)))throw Error("Grupo ativo inválido.");
  if (view !== null) {
    if (
      !record(view) ||
      !Array.isArray(view.positions) ||
      view.positions.length > 300 ||
      !record(view.camera) ||
      !record(view.visibility)
    )
      throw new Error("Vista do projeto inválida.");
    if (
      !bounded(view.camera.x, 1e8) ||
      !bounded(view.camera.y, 1e8) ||
      !bounded(view.camera.zoom, 4) ||
      view.camera.zoom < 0.1
    )
      throw new Error("Câmera inválida.");
    const ids = new Set<string>();
    for (const p of view.positions) {
      if (
        !record(p) ||
        typeof p.id !== "string" ||
        p.id.length > 64 ||
        ids.has(p.id) ||
        !bounded(p.x, 1e7) ||
        !bounded(p.y, 1e7)
      )
        throw new Error("Posições inválidas.");
      ids.add(p.id);
    }
    if (
      kinds.some(
        (kind) =>
          typeof (view.visibility as Record<string, unknown>)[kind] !==
          "boolean",
      )
    )
      throw new Error("Visibilidade inválida.");
  }
  if(raw.revisionHistory!==undefined)parseRevisions(raw.revisionHistory,(raw.model as Model)?.id);
  if(raw.modules!==undefined){if(!Array.isArray(raw.modules)||raw.modules.length>10||new TextEncoder().encode(JSON.stringify(raw.modules)).length>600000)throw Error("Módulo inválido.");raw.modules.forEach(validateModule);if(new Set(raw.modules.map(m=>m.id)).size!==raw.modules.length)throw Error("Módulo inválido.");}
  if(raw.groups!==undefined){const current=raw.model as Model;const h=raw.revisionHistory as RevisionHistory|undefined;const models=[current,...(h?.undo??[]),...(h?.redo??[])];
    validateGroups(raw.groups,{...current,variables:models.flatMap(m=>m.variables),equations:models.flatMap(m=>m.equations),assumptions:models.flatMap(m=>m.assumptions),requirements:models.flatMap(m=>m.requirements),observations:models.flatMap(m=>m.observations)});}
  if(workspace.activeGroup&&!(raw.groups as ModelGroup[]|undefined)?.some(g=>g.id===workspace.activeGroup))throw Error("Grupo ativo inválido.");
  return { model: raw.model, document: raw as unknown as ProjectDocument };
}

export function serializeProject(
  model: Model,
  workspace: WorkspaceState,
  createdAt: string,
  revisionHistory?:RevisionHistory,
  extensions?:{modules:ModuleTemplate[];groups:ModelGroup[]},
): string {
  const document: ProjectDocument = {
    format: "nexo-project",
    version: 1,
    createdAt,
    updatedAt: new Date().toISOString(),
    model,
    workspace,
    ...(revisionHistory?{revisionHistory}:{}),
    ...extensions,
  };
  const text = JSON.stringify(document, null, 2);
  parseProject(text);
  return text;
}

export function download(text: string, name: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const projectFiles = {
  native: isTauri,
  open: (language: "pt-BR" | "en" = "pt-BR") =>
    invoke<{ path: string; content: string } | null>("open_project_file", { language }),
  save: (content: string, name: string, saveAs: boolean, language: "pt-BR" | "en" = "pt-BR") =>
    invoke<string | null>("save_project_file", { content, name, saveAs, language }),
  forget: () =>
    isTauri() ? invoke<void>("forget_project_file") : Promise.resolve(),
  adopt: () => invoke<void>("adopt_open_project"),
};
