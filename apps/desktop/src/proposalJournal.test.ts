import {expect,test} from "vitest";
import {emptyJournal,parseJournal,updateJournal,JournalStore,type Decision} from "./proposalJournal";
import type {Proposal} from "./proposals";
const model={schema_version:1 as const,id:"p",title:"Synthetic",description:"Control",variables:[],equations:[],assumptions:[],requirements:[],observations:[]};
const proposal:Proposal={format:"nexo-change-proposal",version:1,project_id:"p",author:"Synthetic",reason:"Test",base_revision:"a".repeat(64),target_revision:"b".repeat(64),base_model:model,candidate_model:model};
const entry=(id="decision",state:Decision["state"]="pending"):Decision=>({id,state,createdAt:"2026-10-24T10:00:00.000Z",updatedAt:"2026-10-24T10:00:00.000Z",proposal});
const finish=(id="decision",state="applied")=>({id,state,updatedAt:"2026-10-24T10:01:00.000Z"});

test("explicit uncertain closure preserves proposal and never becomes applied or failed",()=>{
  const before=updateJournal(emptyJournal(),"start",entry());
  const closed=updateJournal(before,"finish",finish("decision","unconfirmed"));
  expect(closed.entries[0].state).toBe("unconfirmed");expect(closed.entries[0].proposal).toEqual(proposal);
  expect(parseJournal(JSON.stringify(closed))).toEqual(closed);
  expect(()=>updateJournal(closed,"finish",finish())).toThrow();
  expect(()=>updateJournal(closed,"finish",finish("decision","failed"))).toThrow();
});

test("legacy journals migrate without inventing delivery links and credentials cannot enter v2",()=>{
  const legacy={...emptyJournal(),version:1,entries:[entry("legacy","rejected")]};
  expect(parseJournal(JSON.stringify(legacy))).toEqual({...legacy,version:2});
  const linked={...entry(),delivery:{sessionId:"session",id:"delivery"}};
  const journal=updateJournal(emptyJournal(),"start",linked);
  expect(parseJournal(JSON.stringify(journal)).entries[0].delivery).toEqual(linked.delivery);
  expect(()=>parseJournal(JSON.stringify({...journal,version:1}))).toThrow();
  expect(()=>updateJournal(emptyJournal(),"start",{...linked,delivery:{...linked.delivery,token:"secret"}})).toThrow();
  expect(updateJournal(journal,"finish",finish()).entries[0].delivery).toEqual(linked.delivery);
});
test("decision transitions survive restart, retry idempotently and refuse invented terminal starts",()=>{
  expect(()=>updateJournal(emptyJournal(),"start",entry("x","applied"))).toThrow();
  const pending=updateJournal(emptyJournal(),"start",entry());
  expect(parseJournal(JSON.stringify(pending)).entries[0].state).toBe("pending");
  const applied=updateJournal(pending,"finish",finish());
  expect(updateJournal(applied,"finish",finish())).toEqual(applied);
  expect(()=>updateJournal(applied,"finish",finish("decision","failed"))).toThrow();
  expect(()=>updateJournal(applied,"start",entry())).toThrow();
  expect(pending.entries[0].state).toBe("pending");
  expect(()=>updateJournal(pending,"finish",finish("missing"))).toThrow();
});
test("retention is explicit and malformed records cannot reach the viewer",()=>{
  let j=emptyJournal();for(let n=0;n<22;n++)j=updateJournal(j,"start",entry(`e${n}`,"rejected"));
  expect(j.entries).toHaveLength(20);expect(j.evicted).toBe(2);
  expect(()=>parseJournal(JSON.stringify({...j,entries:[entry(),entry()]}))).toThrow("duplicado");
  const malformed=structuredClone(entry());(malformed.proposal.base_model.variables as any)=[null];
  expect(()=>parseJournal(JSON.stringify({...emptyJournal(),entries:[malformed]}))).toThrow();
  expect(()=>parseJournal(" ".repeat(8000001))).toThrow("8 MB");
});
test("storage failure preserves a pending intent and queue can retry without reapplying",async()=>{
  let j=emptyJournal(),fail=false;
  const store=new JournalStore({request:async(action,value)=>{
    if(action==="read")return JSON.stringify(j);
    if(fail)throw new Error("disk full");
    j=updateJournal(j,action,value);return JSON.stringify(j);
  }});
  await store.start(entry());fail=true;
  await expect(store.finish("decision","applied")).rejects.toThrow("disk full");
  expect((await store.read()).entries[0].state).toBe("pending");
  fail=false;await store.finish("decision","applied");
  expect((await store.read()).entries[0].state).toBe("applied");
});
test("byte retention removes old proposals before the count budget is reached",()=>{
  let journal=emptyJournal();
  for(let n=0;n<20;n++) {
    const large=structuredClone(entry(`large${n}`,"rejected"));
    large.proposal.base_model.description="x".repeat(205000);
    large.proposal.candidate_model.description="y".repeat(205000);
    journal=updateJournal(journal,"start",large);
  }
  expect(journal.entries.length).toBeLessThan(20);expect(journal.evicted).toBeGreaterThan(0);
  expect(new TextEncoder().encode(JSON.stringify(journal)).length).toBeLessThanOrEqual(8000000);
  expect(journal.entries[0].id).toBe("large19");
});

test("count retention preserves pending intents and refuses a new record atomically when all are pending",()=>{
  let j=emptyJournal();
  for(let n=0;n<20;n++)j=updateJournal(j,"start",entry(`p${n}`));
  const before=JSON.stringify(j);
  for(const state of ["pending","rejected"] as const)expect(()=>updateJournal(j,"start",entry("blocked",state))).toThrow("pendentes");
  expect(JSON.stringify(j)).toBe(before);
  j=updateJournal(j,"finish",finish("p10"));
  j=updateJournal(j,"start",entry("new"));
  expect(j.entries).toHaveLength(20);expect(j.evicted).toBe(1);
  expect(j.entries.find(e=>e.id==="p0")?.state).toBe("pending");
  expect(j.entries.find(e=>e.id==="p10")).toBeUndefined();
  expect(j.entries[0].id).toBe("new");
});

test("byte pressure cannot remove pending evidence or falsely acknowledge a new rejection",()=>{
  let j=emptyJournal();
  const large=(id:string,state:Decision["state"]="pending")=>{
    const value=structuredClone(entry(id,state));
    value.proposal.base_model.description="x".repeat(280000);
    value.proposal.candidate_model.description="y".repeat(280000);return value;
  };
  for(let n=0;n<14;n++)j=updateJournal(j,"start",large(`large${n}`));
  const before=JSON.stringify(j);
  expect(()=>updateJournal(j,"start",large("blocked","rejected"))).toThrow("pendentes");
  expect(JSON.stringify(j)).toBe(before);expect(j.evicted).toBe(0);
  j=updateJournal(j,"finish",finish("large0"));
  j=updateJournal(j,"start",large("new","rejected"));
  expect(j.entries[0].id).toBe("new");expect(j.entries.some(e=>e.id==="large0")).toBe(false);
  expect(j.entries.filter(e=>e.state==="pending")).toHaveLength(13);
});
