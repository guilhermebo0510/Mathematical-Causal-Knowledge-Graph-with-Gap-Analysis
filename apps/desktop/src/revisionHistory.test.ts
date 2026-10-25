import {expect,test} from "vitest";
import {boundedRevisions,emptyRevisions,parseRevisions,revisionEvent} from "./revisionHistory";
import {parseProject,serializeProject} from "./project";
import {makeRecovery,parseRecovery} from "./recovery";
import type {Model} from "./types";
const model:Model={schema_version:1,id:"p",title:"Control",description:"Synthetic",variables:[],equations:[],assumptions:[],requirements:[],observations:[]};
const workspace={viewport:null,explorer:false,inspector:true,navigator:false,results:true};
test("saved project and recovery preserve both branches and real edit/undo/redo events",()=>{
  const after={...model,title:"Changed"};
  const h={...emptyRevisions(),undo:[model],redo:[after],events:[revisionEvent("edit",model,after),revisionEvent("undo",after,model)]};
  const saved=serializeProject(model,workspace,new Date().toISOString(),h);
  expect(parseProject(saved).document?.revisionHistory).toEqual(h);
  expect(parseRecovery(makeRecovery(saved)).project.revisionHistory).toEqual(h);
  expect(JSON.parse(saved).run).toBeUndefined();
});
test("history rejects foreign projects and malformed states instead of replacing current project",()=>{
  expect(()=>parseRevisions({...emptyRevisions(),undo:[{...model,id:"other"}]},"p")).toThrow();
  expect(()=>parseRevisions({...emptyRevisions(),redo:[null]},"p")).toThrow();
  expect(()=>parseRevisions({...emptyRevisions(),events:[{kind:"applied"}]},"p")).toThrow();
});
test("retention is bounded and explicit while preserving the newest undo state",()=>{
  const models=Array.from({length:35},(_,i)=>({...model,title:String(i),description:"x".repeat(21000)}));
  const h=boundedRevisions({...emptyRevisions(),undo:models,events:models.map(m=>revisionEvent("edit",model,m))});
  expect(h.evicted).toBeGreaterThan(5);expect(new TextEncoder().encode(JSON.stringify(h)).length).toBeLessThanOrEqual(600000);
  expect(h.undo.at(-1)?.title).toBe("34");expect(models).toHaveLength(35);
  expect(parseRevisions(h,"p")).toEqual(h);
});
