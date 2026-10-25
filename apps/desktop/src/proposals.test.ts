import { expect,test } from "vitest";
import {differences,parseProposal,sameContent} from "./proposals";
import type {Model} from "./types";
const base:Model={schema_version:1,id:"p",title:"Project",description:"Synthetic",variables:[{id:"x",label:"x",unit:"1",value:1,source:"Synthetic"}],equations:[],assumptions:[],requirements:[],observations:[]};
test("proposal content comparison ignores key order but preserves operand order and repetitions",()=>{
  expect(sameContent({a:1,b:2},{b:2,a:1})).toBe(true);
  expect(sameContent(["x","x","y"],["x","y","x"])).toBe(false);
});
test("proposal difference includes source/value changes without altering the input",()=>{
  const next=structuredClone(base);next.variables[0].value=2;next.variables[0].source="New";
  const changes=differences(base,next);
  expect(changes).toHaveLength(1);expect(changes[0].id).toBe("x");expect(base.variables[0].value).toBe(1);
});
test("proposal rejects unknown fields, cross-project candidates and oversized input",()=>{
  const p={format:"nexo-change-proposal",version:1,project_id:"p",author:"Synthetic",reason:"Test",base_revision:"a".repeat(64),target_revision:"b".repeat(64),base_model:base,candidate_model:base};
  expect(parseProposal(JSON.stringify(p)).author).toBe("Synthetic");
  expect(()=>parseProposal(JSON.stringify({...p,path:"private"}))).toThrow();
  expect(()=>parseProposal(JSON.stringify({...p,candidate_model:{...base,id:"other"}}))).toThrow();
  expect(()=>parseProposal(" ".repeat(600001))).toThrow("600 KB");
});
