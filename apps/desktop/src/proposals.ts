import { engine } from "./engine";
import type { LoadedModel, Model } from "./types";

export interface Proposal {
  format: "nexo-change-proposal"; version: 1; project_id: string;
  author: string; reason: string; base_revision: string; target_revision: string;
  base_model: Model; candidate_model: Model;
}
export interface Difference { id: string; kind: string; before: unknown; after: unknown }
export interface ReviewedProposal { proposal: Proposal; base: Model; candidate: LoadedModel; differences: Difference[] }
const keys = ["format", "version", "project_id", "author", "reason", "base_revision", "target_revision", "base_model", "candidate_model"];
export function parseProposal(text: string): Proposal {
  if (new TextEncoder().encode(text).length > 600_000) throw new Error("Proposta excede 600 KB.");
  const p = JSON.parse(text);
  if (!p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).some(k=>!keys.includes(k)) ||
      p.format !== "nexo-change-proposal" || p.version !== 1 ||
      !["project_id", "author", "reason"].every(k=>typeof p[k]==="string" && p[k].length>0 && p[k].length<=300) ||
      ![p.base_revision,p.target_revision].every(v=>typeof v==="string" && /^[a-f0-9]{64}$/.test(v)) ||
      !p.base_model || !p.candidate_model || p.base_model.id!==p.project_id || p.candidate_model.id!==p.project_id)
    throw new Error("Proposta inválida.");
  return p;
}
// Compare complete normalized content; do not trust a sender's hash or verdict.
export function sameContent(a: unknown, b: unknown): boolean {
  function canonical(value: any): any {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value==="object") return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
    return value;
  }
  return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
}
export function differences(base: Model, next: Model): Difference[] {
  const result: Difference[]=[];
  if (base.title!==next.title || base.description!==next.description)
    result.push({id:base.id,kind:"project",before:{title:base.title,description:base.description},after:{title:next.title,description:next.description}});
  for (const kind of ["variables","equations","assumptions","requirements","observations"] as const) {
    const before=new Map(base[kind].map(n=>[n.id,n]));
    const after=new Map(next[kind].map(n=>[n.id,n]));
    for (const id of new Set([...before.keys(),...after.keys()]))
      if (!sameContent(before.get(id),after.get(id))) result.push({id,kind,before:before.get(id)??null,after:after.get(id)??null});
  }
  return result;
}
export async function reviewProposal(proposal: Proposal, current: Model): Promise<ReviewedProposal> {
  // Use the existing engine import contract, including in the packaged Windows host.
  const base=await engine.import(proposal.base_model);
  const candidate=await engine.import(proposal.candidate_model);
  const active=await engine.import(current);
  if (!sameContent(base.model,active.model)) throw new Error("A proposta não corresponde ao modelo atual. Exporte uma nova base.");
  return {proposal,base:base.model,candidate,differences:differences(base.model,candidate.model)};
}
