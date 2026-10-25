import { invoke, isTauri } from "@tauri-apps/api/core";
import { parseProposal, sameContent, type Proposal } from "./proposals";

export const JOURNAL_KEY = "nexo.proposal-journal.v2";
export const LEGACY_JOURNAL_KEY = "nexo.proposal-journal.v1";
export const JOURNAL_LIMIT = 8_000_000;
export const JOURNAL_RETAIN = 20;
export type DecisionState = "pending" | "applied" | "rejected" | "failed" | "unconfirmed";
export interface Decision {
  id: string; createdAt: string; updatedAt: string; state: DecisionState; proposal: Proposal;
  delivery?: {sessionId:string;id:string};
}
export interface ProposalJournal {
  format: "nexo-proposal-journal"; version: 2; evicted: number; entries: Decision[];
}
export const emptyJournal = (): ProposalJournal => ({format:"nexo-proposal-journal",version:2,evicted:0,entries:[]});
const size = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
export function validateDecision(value: unknown): asserts value is Decision {
  const e = value as Decision;
  const expected=e?.delivery===undefined?"createdAt,id,proposal,state,updatedAt":"createdAt,delivery,id,proposal,state,updatedAt";
  if (!e || typeof e !== "object" || Object.keys(e).sort().join() !== expected ||
      typeof e.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(e.id) ||
      ![e.createdAt,e.updatedAt].every(v => typeof v === "string" && Number.isFinite(Date.parse(v))) ||
      !["pending","applied","rejected","failed","unconfirmed"].includes(e.state)) throw new Error("Registro de proposta inválido.");
  if(e.delivery!==undefined && (!e.delivery || Object.keys(e.delivery).sort().join()!=="id,sessionId" ||
    ![e.delivery.id,e.delivery.sessionId].every(v=>typeof v==="string"&&/^[a-zA-Z0-9_-]{1,80}$/.test(v)))) throw new Error("Vínculo de entrega inválido.");
  parseProposal(JSON.stringify(e.proposal));
  for(const m of [e.proposal.base_model,e.proposal.candidate_model]) {
    if(typeof m.title!=="string" || typeof m.description!=="string" ||
      ["variables","equations","assumptions","requirements","observations"].some(k=>{
        const nodes=(m as any)[k];
        return !Array.isArray(nodes)||nodes.some(n=>!n||typeof n!=="object"||typeof n.id!=="string");
      })) throw new Error("Modelo do registro inválido.");
  }
}
export function parseJournal(raw: string): ProposalJournal {
  if (new TextEncoder().encode(raw).length > JOURNAL_LIMIT) throw new Error("Registro de propostas excede 8 MB.");
  const j = JSON.parse(raw);
  if (!j || Object.keys(j).sort().join()!=="entries,evicted,format,version" || j.format !== "nexo-proposal-journal" || ![1,2].includes(j.version) || !Number.isSafeInteger(j.evicted) || j.evicted < 0 ||
      !Array.isArray(j.entries) || j.entries.length > JOURNAL_RETAIN) throw new Error("Registro de propostas inválido.");
  const ids = new Set<string>();
  for (const e of j.entries) { validateDecision(e);if(j.version===1&&e.delivery!==undefined)throw new Error("Registro de propostas inválido."); if(ids.has(e.id)) throw new Error("Registro de proposta duplicado."); ids.add(e.id); }
  return {...j,version:2};
}
export function updateJournal(journal: ProposalJournal, action: "start"|"finish", value: unknown): ProposalJournal {
  const next = structuredClone(journal);
  if(action === "start") {
    validateDecision(value);
    if(!["pending","rejected"].includes(value.state)) throw new Error("Decisão inicial inválida.");
    const existing = next.entries.find(e => e.id === value.id);
    if(existing) {
      if(sameContent(existing,value)) return next;
      throw new Error("ID de decisão já utilizado.");
    }
    next.entries.unshift(structuredClone(value));
  } else {
    const change = value as {id:string;state:DecisionState;updatedAt:string};
    if(!change || !["applied","failed","unconfirmed"].includes(change.state) || typeof change.updatedAt!=="string" || !Number.isFinite(Date.parse(change.updatedAt)))
      throw new Error("Transição de proposta inválida.");
    const entry = next.entries.find(e => e.id === change.id);
    if(!entry) throw new Error("Decisão não encontrada.");
    if(entry.state === change.state) return next; // Safe retry after a lost reply.
    if(entry.state !== "pending") throw new Error("Decisão já finalizada.");
    entry.state=change.state; entry.updatedAt=change.updatedAt;
  }
  // An unresolved intent may be the only durable evidence after a lost acknowledgement.
  // Never evict it, or acknowledge a write after evicting the record being written.
  const protectedId=(value as {id:string}).id;
  while(next.entries.length > JOURNAL_RETAIN || size(next)>JOURNAL_LIMIT) {
    let index=next.entries.length-1;
    while(index>=0&&(next.entries[index].state==="pending"||next.entries[index].id===protectedId))index--;
    if(index<0)throw new Error("Registro cheio de decisões pendentes. Nenhuma decisão foi removida.");
    next.entries.splice(index,1);next.evicted++;
  }
  return next;
}
interface JournalBackend { request(action:"read"|"start"|"finish",value?:unknown):Promise<string> }
function backend():JournalBackend {
  if(isTauri()) return {request:async(action,value)=>JSON.stringify(await invoke("proposal_journal",{action,value:value??null}))};
  return {request:async(action,value)=>{
    const raw=localStorage.getItem(JOURNAL_KEY)??localStorage.getItem(LEGACY_JOURNAL_KEY);
    const current=raw===null?emptyJournal():parseJournal(raw);
    if(action==="read") return JSON.stringify(current);
    const next=updateJournal(current,action,value);
    localStorage.setItem(JOURNAL_KEY,JSON.stringify(next)); return JSON.stringify(next);
  }};
}
export class JournalStore {
  private queue:Promise<unknown>=Promise.resolve();
  constructor(private storage:JournalBackend=backend()) {}
  private request(action:"read"|"start"|"finish",value?:unknown) {
    const next=this.queue.then(async()=>parseJournal(await this.storage.request(action,value)));
    this.queue=next.catch(()=>{}); return next;
  }
  read(){return this.request("read");}
  start(entry:Decision){return this.request("start",structuredClone(entry));}
  finish(id:string,state:"applied"|"failed"){return this.request("finish",{id,state,updatedAt:new Date().toISOString()});}
  closeUnconfirmed(id:string){return this.request("finish",{id,state:"unconfirmed",updatedAt:new Date().toISOString()});}
}
export const proposalJournal = new JournalStore();
