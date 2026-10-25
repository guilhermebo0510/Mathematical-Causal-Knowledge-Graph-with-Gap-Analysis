import {expect,test} from "vitest";
import {inferModule,instantiateModule,groupedGraph,groupContext,groupFlaggedNodes,validateGroups} from "./modules";
import {projectGraph} from "./modelMutator";
import type {Model} from "./types";
const model:Model={schema_version:1,id:"p",title:"Circuit",description:"Synthetic",variables:[{id:"I",label:"Current",unit:"A",value:2,source:"Control"},{id:"R",label:"Resistance",unit:"ohm",value:3,source:"Control"},{id:"V",label:"Voltage",unit:"V",value:null,source:null}],equations:[{id:"law",label:"Ohm",lhs:"V",rhs:{var:null,op:"mul",args:[{var:"I",op:null,args:[]},{var:"R",op:null,args:[]}]},assumption_ids:["steady"],source:"Synthetic"}],assumptions:[{id:"steady",label:"Steady",justification:"Control"}],requirements:[{id:"required",label:"Required",equation_id:"law",exclusion_reason:null}],observations:[{id:"reference",label:"Reference",variable_id:"V",value:6,unit:"V",tolerance:0.01,source:"Synthetic"}]};
test("long project names produce bounded module labels without truncating the model or splitting Unicode",()=>{
  const title="X".repeat(118)+"🔬"+" projeto".repeat(20),source={...structuredClone(model),title};
  const template=inferModule(source,title);
  expect(template.label).toBe("X".repeat(118)+"…");expect(template.label.length).toBeLessThanOrEqual(120);expect(template.model.title).toBe(title);expect(source.title).toBe(title);
  expect(inferModule(model,"  Circuit  ").label).toBe("Circuit");
});
test("module instantiation preserves the AST, units, evidence and all dependency kinds",()=>{
  const template=inferModule(model,"Circuit");const result=instantiateModule(model,template,"m1",{I:"I"});
  expect(template.inputs).toEqual(["I","R"]);expect(template.outputs).toEqual(["V"]);
  expect(result.model.variables.find(v=>v.id==="m1_I")).toBeUndefined();
  expect(result.model.equations[1].rhs.args.map(e=>e.var)).toEqual(["I","m1_R"]);
  expect(result.model.equations[1].assumption_ids).toEqual(["m1_steady"]);
  expect(result.model.requirements[1].equation_id).toBe("m1_law");
  expect(result.model.observations[1]).toEqual({...model.observations[0],id:"m1_reference",variable_id:"m1_V"});
  expect(model.variables).toHaveLength(3);expect(template.model).toEqual(model);
  expect(()=>instantiateModule(result.model,template,"m1",{})).toThrow("conflito");
  expect(()=>instantiateModule(model,template,"m2",{I:"R"})).toThrow("unidade");
  expect(()=>instantiateModule(model,template,"m2",{V:"V"})).toThrow("porta");
});
test("group collapse bundles only matching relation types without mutating scientific content",()=>{
  const graph=projectGraph(model),original=JSON.stringify(graph);
  const groups=[{id:"inputs",label:"Inputs",nodeIds:["I","R"],collapsed:true}];validateGroups(groups,model);
  const result=groupedGraph(graph,groups);expect(result.nodes).toHaveLength(graph.nodes.length-1);
  const flagged=new Set(["I"]);expect([...groupFlaggedNodes(result,flagged)]).toEqual(["I","@group:inputs"]);expect([...flagged]).toEqual(["I"]);
  const bundles=result.edges.filter(e=>e.bundle);expect(bundles).toHaveLength(1);expect(bundles[0].bundle).toHaveLength(2);
  expect(bundles[0].relation).toBe("INPUT_TO");expect(bundles[0].target).toBe("law");
  expect(JSON.stringify(graph)).toBe(original);expect(groupedGraph(graph,[{...groups[0],collapsed:false}])).toEqual(graph);
  const context=groupContext(graph,groups,"inputs");expect(context.nodes.map(n=>n.id)).toEqual(["I","R","law"]);expect(context.edges).toHaveLength(2);expect(context.preserveIds).toContain("@group:inputs");
  expect(()=>validateGroups([...groups,{id:"overlap",label:"Bad",nodeIds:["I"],collapsed:false}],model)).toThrow();
});

test("valid IDs that match Object prototype names are real quantities, not implicit bindings",()=>{
  const source:Model={...model,variables:[{id:"constructor",label:"Constructor",unit:"1",value:7,source:"Synthetic"}],equations:[],assumptions:[],requirements:[],observations:[]};
  const template=inferModule(source,"Prototype ID control");
  const first=instantiateModule(model,template,"p1",{}),second=instantiateModule(model,template,"p2",{});
  expect(first.model.variables.find(v=>v.id==="p1_constructor")?.value).toBe(7);
  expect(first.group.id).not.toBe(second.group.id);expect(first.group.id).not.toBe("p1");
  expect(()=>instantiateModule(source,template,"p3",{constructor:"constructor"})).toThrow("elementos próprios");
});

test("incompatible or undeclared bindings refuse composition without changing either model",()=>{
  const template=inferModule(model,"Circuit");const targetBefore=structuredClone(model),templateBefore=structuredClone(template);
  const invalidBindings:Record<string,string>[]=[{I:"R"},{I:"missing"},{missing:"I"},{V:"V"}];
  for(const bindings of invalidBindings){
    expect(()=>instantiateModule(model,template,"bad",bindings)).toThrow();
    expect(model).toEqual(targetBefore);expect(template).toEqual(templateBefore);
  }
  const sameDimensionDifferentSpelling={...model,variables:model.variables.map(v=>v.id==="I"?{...v,unit:"ampere"}:v)};
  expect(()=>instantiateModule(sameDimensionDifferentSpelling,template,"strict",{I:"I"})).toThrow("unidade");
});

test("composition accepts exact scientific list budgets and refuses the next element atomically",()=>{
  const template=inferModule(model,"Circuit");
  for(const [key,limit]of [["variables",100],["equations",50],["assumptions",30],["requirements",30],["observations",30]] as const){
    const target={...structuredClone(model),[key]:[...model[key],...Array.from({length:limit-model[key].length-1},(_,i)=>({...model[key][0],id:`extra_${i}`}))]};
    expect(instantiateModule(target,template,"at_limit",{I:"I",R:"R"}).model[key]).toHaveLength(limit);
    target[key].push({...model[key][0],id:"one_more"} as never);
    const before=structuredClone(target);expect(()=>instantiateModule(target,template,"too_many",{I:"I",R:"R"})).toThrow(`limite de ${limit}`);expect(target).toEqual(before);
  }
});
