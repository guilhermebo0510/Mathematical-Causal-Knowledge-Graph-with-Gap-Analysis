import type {Model} from "./types";
export interface RevisionEvent {id:string;at:string;kind:"edit"|"undo"|"redo";before:Model;after:Model}
export interface RevisionHistory {version:1;undo:Model[];redo:Model[];events:RevisionEvent[];evicted:number}
export const emptyRevisions=():RevisionHistory=>({version:1,undo:[],redo:[],events:[],evicted:0});
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length;
export function parseRevisions(value:unknown,projectId:string):RevisionHistory {
  const h=value as RevisionHistory;
  if(!h||Object.keys(h).sort().join()!=="events,evicted,redo,undo,version"||h.version!==1||!Number.isSafeInteger(h.evicted)||h.evicted<0||
    ![h.undo,h.redo,h.events].every(a=>Array.isArray(a)&&a.length<=30)||bytes(h)>600000)throw Error("Histórico de revisões inválido.");
  const model=(m:Model)=>m&&m.id===projectId&&m.schema_version===1&&typeof m.title==="string"&&typeof m.description==="string"&&
    [m.variables,m.equations,m.assumptions,m.requirements,m.observations].every(a=>Array.isArray(a)&&a.length<=240&&a.every(n=>n&&typeof n.id==="string"));
  if(![...h.undo,...h.redo].every(model)||!h.events.every(e=>e&&Object.keys(e).sort().join()==="after,at,before,id,kind"&&typeof e.id==="string"&&
    typeof e.at==="string"&&Number.isFinite(Date.parse(e.at))&&["edit","undo","redo"].includes(e.kind)&&model(e.before)&&model(e.after)))throw Error("Histórico de revisões inválido.");
  return structuredClone(h);
}
export function boundedRevisions(history:RevisionHistory):RevisionHistory {
  const h=structuredClone(history);
  for(const key of ["undo","redo","events"] as const)while(h[key].length>30){h[key].shift();h.evicted++;}
  while(bytes(h)>600000){
    const list=h.events.length?h.events:h.undo.length?h.undo:h.redo;
    if(!list.length)throw Error("Histórico de revisões inválido.");list.shift();h.evicted++;
  }
  return h;
}
export function revisionEvent(kind:RevisionEvent["kind"],before:Model,after:Model):RevisionEvent {
  return {id:crypto.randomUUID(),at:new Date().toISOString(),kind,before:structuredClone(before),after:structuredClone(after)};
}
