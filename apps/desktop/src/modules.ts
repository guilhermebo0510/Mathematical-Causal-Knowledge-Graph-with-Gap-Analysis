import type {Expr,Model,Graph} from "./types";
export interface ModuleTemplate {format:"nexo-module";version:1;id:string;label:string;model:Model;inputs:string[];outputs:string[]}
export interface ModelGroup {id:string;label:string;nodeIds:string[];collapsed:boolean;moduleId?:string}
const keys=["variables","equations","assumptions","requirements","observations"] as const;
const id=(s:unknown):s is string=>typeof s==="string"&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(s);
export function validateModule(value:unknown):asserts value is ModuleTemplate {
  const t=value as ModuleTemplate;
  if(!t||Object.keys(t).sort().join()!=="format,id,inputs,label,model,outputs,version"||t.format!=="nexo-module"||t.version!==1||!id(t.id)||typeof t.label!=="string"||!t.label.trim()||t.label.length>120||
    !t.model||keys.some(k=>!Array.isArray(t.model[k]))||![t.inputs,t.outputs].every(a=>Array.isArray(a)&&a.every(id)&&new Set(a).size===a.length)||new TextEncoder().encode(JSON.stringify(t)).length>600000)throw Error("Módulo inválido.");
  const vars=new Set(t.model.variables.map(v=>v.id));const all=keys.flatMap(k=>t.model[k].map(n=>n.id));
  if(!all.length||new Set(all).size!==all.length||all.some(s=>!id(s))||t.inputs.some(s=>!vars.has(s)||t.model.equations.some(e=>e.lhs===s))||
    t.outputs.some(s=>!vars.has(s)||t.model.equations.filter(e=>e.lhs===s).length!==1)||t.inputs.some(s=>t.outputs.includes(s)))throw Error("Portas de módulo inválidas.");
}
export function inferModule(model:Model,label:string):ModuleTemplate {
  const produced=new Set(model.equations.map(e=>e.lhs));
  let name=label.trim();
  if(name.length>120)name=name.slice(0,119).replace(/[\uD800-\uDBFF]$/,"")+"…";
  const t:ModuleTemplate={format:"nexo-module",version:1,id:"module_"+crypto.randomUUID().replaceAll("-","").slice(0,12),label:name,model:structuredClone(model),inputs:model.variables.filter(v=>!produced.has(v.id)).map(v=>v.id),outputs:[...produced]};
  validateModule(t);return t;
}
export function instantiateModule(target:Model,template:ModuleTemplate,prefix:string,bindings:Record<string,string>):{model:Model;group:ModelGroup}{
  validateModule(template);if(!id(prefix)||prefix.length>20)throw Error("Prefixo de módulo inválido.");
  const targetVars=new Map(target.variables.map(v=>[v.id,v]));
  const bindingMap=new Map(Object.entries(bindings));
  for(const [input,external]of Object.entries(bindings)){
    const variable=template.model.variables.find(v=>v.id===input);const actual=targetVars.get(external);
    if(!template.inputs.includes(input)||!variable||!actual||actual.unit!==variable.unit)throw Error("Ligação de módulo exige porta de entrada e unidade idêntica.");
  }
  const mapping=new Map(keys.flatMap(k=>template.model[k].map(n=>[n.id,bindingMap.get(n.id)??`${prefix}_${n.id}`] as const)));
  const occupied=new Set(keys.flatMap(k=>target[k].map(n=>n.id)));
  for(const [old,next]of mapping)if(!bindingMap.has(old)&&(!id(next)||occupied.has(next)))throw Error("Identificador de módulo em conflito.");
  const ref=(s:string)=>{const mapped=mapping.get(s);if(!mapped)throw Error("Dependência de módulo ausente.");return mapped;};
  const expr=(e:Expr):Expr=>({var:e.var===null?null:ref(e.var),op:e.op,args:e.args.map(expr)});
  const m=structuredClone(target),source=template.model;
  m.variables.push(...source.variables.filter(v=>!bindingMap.has(v.id)).map(v=>({...v,id:ref(v.id)})));
  m.equations.push(...source.equations.map(e=>({...e,id:ref(e.id),lhs:ref(e.lhs),rhs:expr(e.rhs),assumption_ids:e.assumption_ids.map(ref)})));
  m.assumptions.push(...source.assumptions.map(n=>({...n,id:ref(n.id)})));
  m.requirements.push(...source.requirements.map(n=>({...n,id:ref(n.id),equation_id:ref(n.equation_id)})));
  m.observations.push(...source.observations.map(n=>({...n,id:ref(n.id),variable_id:ref(n.variable_id)})));
  const limits={variables:100,equations:50,assumptions:30,requirements:30,observations:30};
  const limitErrors={variables:"Módulo excede o limite de 100 variáveis.",equations:"Módulo excede o limite de 50 equações.",assumptions:"Módulo excede o limite de 30 hipóteses.",requirements:"Módulo excede o limite de 30 requisitos.",observations:"Módulo excede o limite de 30 observações."};
  for(const key of keys)if(m[key].length>limits[key])throw Error(limitErrors[key]);
  if(keys.reduce((n,k)=>n+m[k].length,0)>240)throw Error("Módulo excede o limite de 240 elementos.");
  const nodeIds=[...mapping].filter(([old])=>!bindingMap.has(old)).map(([,next])=>next);
  if(!nodeIds.length)throw Error("O módulo não adiciona elementos próprios.");
  return {model:m,group:{id:"g_"+crypto.randomUUID().replaceAll("-","").slice(0,16),label:`${template.label.slice(0,95)} · ${prefix}`,nodeIds,collapsed:false,moduleId:template.id}};
}
export function validateGroups(groups:unknown,model:Model):asserts groups is ModelGroup[]{
  const all=new Set(keys.flatMap(k=>model[k].map(n=>n.id)));const claimed=new Set<string>();const groupIds=new Set<string>();
  if(!Array.isArray(groups)||groups.length>60)throw Error("Grupos inválidos.");
  for(const g of groups){if(!g||!id(g.id)||groupIds.has(g.id)||typeof g.label!=="string"||!g.label.trim()||g.label.length>120||typeof g.collapsed!=="boolean"||!Array.isArray(g.nodeIds)||!g.nodeIds.length||
      new Set(g.nodeIds).size!==g.nodeIds.length||g.nodeIds.some((n:unknown)=>typeof n!=="string"||!all.has(n)||claimed.has(n)))throw Error("Grupos inválidos.");
    groupIds.add(g.id);for(const n of g.nodeIds)claimed.add(n);
  }
}
export function groupedGraph(graph:Graph,groups:ModelGroup[]):Graph {
  const present=new Set(graph.nodes.map(n=>n.id));const owner=new Map<string,string>();
  const active=groups.filter(g=>g.collapsed&&g.nodeIds.some(id=>present.has(id)));
  for(const group of active)for(const member of group.nodeIds)if(present.has(member))owner.set(member,`@group:${group.id}`);
  const nodes=[...graph.nodes.filter(n=>!owner.has(n.id)),...active.map(g=>({id:`@group:${g.id}`,kind:"assumption" as const,label:g.label,group:{id:g.id,members:g.nodeIds.filter(id=>present.has(id))}}))];
  const bundled=new Map<string,Graph["edges"][number]>();
  for(const edge of graph.edges){const source=owner.get(edge.source)??edge.source,target=owner.get(edge.target)??edge.target;
    if(source===target)continue;
    if(source===edge.source&&target===edge.target){bundled.set(edge.id,edge);continue;}
    const key=JSON.stringify([source,target,edge.relation]);const existing=bundled.get(key);
    if(existing)existing.bundle!.push(edge.id);else bundled.set(key,{id:`@bundle:${key}`,source,target,relation:edge.relation,bundle:[edge.id]});
  }
  return {nodes,edges:[...bundled.values()]};
}
export function groupContext(graph:Graph,groups:ModelGroup[],activeId:string|null):Graph {
  const group=groups.find(g=>g.id===activeId);
  if(!group)return groupedGraph(graph,groups);
  const members=new Set(group.nodeIds.filter(id=>graph.nodes.some(n=>n.id===id)));
  if(!members.size)return groupedGraph(graph,groups);
  const boundary=new Set<string>();for(const e of graph.edges)if(members.has(e.source)!==members.has(e.target)){boundary.add(e.source);boundary.add(e.target);}
  return {nodes:graph.nodes.filter(n=>members.has(n.id)||boundary.has(n.id)),edges:graph.edges.filter(e=>members.has(e.source)||members.has(e.target)),preserveIds:[...graph.nodes.map(n=>n.id),...groups.map(g=>`@group:${g.id}`)]};
}
export function groupFlaggedNodes(graph:Graph,flagged:Set<string>):Set<string>{
  const result=new Set(flagged);for(const node of graph.nodes)if(node.group?.members.some(id=>flagged.has(id)))result.add(node.id);return result;
}
