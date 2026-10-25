import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Layers,Pencil,Trash2,Undo2,X} from "lucide-react";
import {useI18n} from "./i18n";
import {engine} from "./engine";
import {download} from "./project";
import {inferModule,instantiateModule,validateModule,type ModuleTemplate,type ModelGroup} from "./modules";
import type {LoadedModel} from "./types";
export function ModulesPanel({getCurrent,templates,setTemplates,apply,disabled,closeMenu}:{getCurrent:()=>LoadedModel|null;templates:ModuleTemplate[];setTemplates:(templates:ModuleTemplate[])=>void;apply:(data:LoadedModel,group:ModelGroup)=>boolean;disabled:boolean;closeMenu:()=>void}){
  const{t}=useI18n();const[open,setOpen]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState("");
  const[selected,setSelected]=useState(""),[prefix,setPrefix]=useState("m1"),[bindings,setBindings]=useState<Record<string,string>>({});
  const[removed,setRemoved]=useState<ModuleTemplate|null>(null);
  const[name,setName]=useState("");
  const file=useRef<HTMLInputElement>(null),dialog=useRef<HTMLElement>(null);const template=templates.find(m=>m.id===selected);
  useEffect(()=>{if(open)dialog.current?.focus();},[open]);
  useEffect(()=>{setName(template?.label??"");},[selected,template?.label]);
  function add(module:ModuleTemplate){
    if(templates.length>=10&&!templates.some(m=>m.id===module.id))throw Error("A biblioteca aceita até 10 módulos por projeto.");
    if(templates.some(m=>m.id===module.id))throw Error("Identificador de módulo em conflito.");
    const next=[...templates,module];if(new TextEncoder().encode(JSON.stringify(next)).length>600000)throw Error("Biblioteca de módulos excede 600 KB.");
    setTemplates(next);setSelected(module.id);setBindings({});
  }
  function remove(){if(!template||disabled||working)return;setRemoved(template);setTemplates(templates.filter(m=>m.id!==template.id));setSelected("");setBindings({});setError("");}
  function restore(){if(!removed||disabled||working)return;try{add(removed);setRemoved(null);setError("");}catch(e){setError(String(e));}}
  function rename(){if(!template||disabled||working)return;try{
    const updated={...template,label:name.trim()};validateModule(updated);
    const next=templates.map(m=>m.id===template.id?updated:m);if(new TextEncoder().encode(JSON.stringify(next)).length>600000)throw Error("Biblioteca de módulos excede 600 KB.");
    setTemplates(next);setError("");
  }catch(e){setError(String(e));}}
  async function capture(){
    setWorking(true);setError("");try{const current=getCurrent();if(!current)return;const normalized=await engine.import(current.model);if(getCurrent()!==current)throw Error("O modelo mudou durante a revisão. Reabra a proposta.");add(inferModule(normalized.model,current.model.title));}catch(e){setError(String(e));}finally{setWorking(false);}
  }
  async function importModule(text:string){setWorking(true);setError("");try{const current=getCurrent();const parsed=JSON.parse(text);validateModule(parsed);const normalized=await engine.import(parsed.model);if(getCurrent()!==current)throw Error("O modelo mudou durante a revisão. Reabra a proposta.");add({...parsed,model:normalized.model});}catch(e){setError(String(e));}finally{setWorking(false);}}
  async function insert(){if(!template)return;setWorking(true);setError("");try{
    const current=getCurrent();if(!current)return;const result=instantiateModule(current.model,template,prefix,bindings);const normalized=await engine.import(result.model);
    if(getCurrent()!==current)throw Error("O modelo mudou durante a revisão. Reabra a proposta.");if(!apply(normalized,result.group))throw Error("Não foi possível aplicar a proposta.");setOpen(false);
  }catch(e){setError(String(e));}finally{setWorking(false);}}
  return <><button disabled={disabled} onClick={()=>{closeMenu();setError("");setRemoved(null);setOpen(true);}}><Layers size={14}/>{t("Módulos…")}</button>
    <input className="visually-hidden" ref={file} type="file" accept=".json,.nexo-module" aria-label={t("Arquivo de módulo")} onChange={e=>{const f=e.target.files?.[0];e.target.value="";if(f){if(f.size>600000)setError(t("Módulo inválido."));else void f.text().then(importModule);}}}/>
    {open&&createPortal(<div className="modal-backdrop"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("Módulos")} className="app-dialog proposal-review modules-dialog" onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();if(!working)setOpen(false);}
      if(e.key==="Tab"){const cs=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input,select'));if(e.shiftKey&&(document.activeElement===cs[0]||document.activeElement===dialog.current)){e.preventDefault();cs.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===cs.at(-1)){e.preventDefault();cs[0]?.focus();}}}}>
      <header><h2>{t("Módulos")}</h2><button disabled={working} aria-label={t("Fechar")} onClick={()=>setOpen(false)}><X size={18}/></button></header>
      <p>{t("Módulos expandem em nós e relações reais. Importar não executa código nem aprova o modelo.")}</p>
      {error&&<p role="alert">{t(error.replace(/^Error: /,""))}</p>}
      {removed&&<div role="status"><span>{t("Definição removida. Instâncias preservadas.")}</span><button disabled={disabled||working} onClick={restore}><Undo2 size={14}/>{t("Restaurar definição")}</button></div>}
      <div className="module-library-actions"><button disabled={disabled||working} onClick={()=>void capture()}>{t("Guardar modelo como módulo")}</button><button disabled={working} onClick={()=>file.current?.click()}>{t("Importar módulo")}</button><small>{templates.length}/10</small></div>
      <label className="module-field">{t("Biblioteca")}<select aria-label={t("Biblioteca")} value={selected} onChange={e=>{setSelected(e.target.value);setBindings({});}}><option value="">—</option>{templates.map(m=><option value={m.id} key={m.id}>{templates.some(other=>other.id!==m.id&&other.label===m.label)?`${m.label} · ${m.id}`:m.label}</option>)}</select></label>
      {template&&<><div className="module-field"><label htmlFor="module-definition-name">{t("Nome do módulo")}</label><div className="module-name-editor"><input id="module-definition-name" maxLength={120} value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();rename();}}}/><button disabled={disabled||working||!name.trim()||name.trim()===template.label} aria-label={t("Renomear definição")} title={t("Renomear definição")} onClick={rename}><Pencil size={14}/></button></div></div><details><summary>{t("Definição do módulo")}</summary><p>{template.model.description}</p>{template.model.equations.map(eq=><p key={eq.id}><strong>{eq.id}</strong> · {eq.source}</p>)}{template.model.assumptions.map(a=><p key={a.id}><strong>{a.label}</strong> · {a.justification}</p>)}</details><div className="module-outputs"><span>{t("Saídas")}</span>{template.outputs.length?template.outputs.map(id=><code key={id}>{id} · {template.model.variables.find(v=>v.id===id)?.unit}</code>):"—"}</div><label className="module-field">{t("Prefixo da instância")}<input value={prefix} onChange={e=>setPrefix(e.target.value)}/></label>
        <fieldset className="module-port-grid"><legend>{t("Entradas")}</legend>{template.inputs.map(input=>{const v=template.model.variables.find(v=>v.id===input)!;return <label key={input}><span><code>{input}</code><small title={v.unit}>{v.unit}</small></span><select aria-label={`${t("Entrada")} ${input}`} value={bindings[input]??""} onChange={e=>setBindings(previous=>{const next={...previous};if(e.target.value)next[input]=e.target.value;else delete next[input];return next;})}><option value="">{t("Copiar valor do módulo")}</option>{getCurrent()?.model.variables.filter(n=>n.unit===v.unit).map(n=><option value={n.id} key={n.id}>{n.label} · {n.id}</option>)}</select></label>;})}</fieldset>
        <footer><button disabled={disabled||working} onClick={remove}><Trash2 size={14}/>{t("Remover definição")}</button><button disabled={working} onClick={()=>download(JSON.stringify(template,null,2),`${template.id}.nexo-module.json`)}>{t("Exportar módulo")}</button><button disabled={disabled||working} onClick={()=>void insert()}>{t("Instanciar módulo")}</button></footer></>}
    </section></div>,document.body)}</>;
}
