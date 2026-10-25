import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Layers,X} from "lucide-react";
import {useI18n} from "./i18n";
import type {ModelGroup} from "./modules";
export function GroupsPanel({groups,nodeIds,change,selection,locate,enter,disabled,closeMenu}:{groups:ModelGroup[];nodeIds:string[];change:(groups:ModelGroup[])=>void;selection:string[];locate:(id:string)=>void;enter:(id:string)=>void;disabled:boolean;closeMenu:()=>void}){
  const{t}=useI18n();const[open,setOpen]=useState(false),[label,setLabel]=useState(""),[error,setError]=useState("");const dialog=useRef<HTMLElement>(null);
  useEffect(()=>{if(open)dialog.current?.focus();},[open]);
  const present=new Set(nodeIds);
  const available=selection.filter(id=>present.has(id)&&!groups.some(g=>g.nodeIds.includes(id)));
  function create(){if(!label.trim()||available.length<2)return;if(groups.length>=60){setError(t("Grupos inválidos."));return;}change([...groups,{id:"g_"+crypto.randomUUID().replaceAll("-","").slice(0,12),label:label.trim(),nodeIds:available,collapsed:false}]);setLabel("");}
  return <><button disabled={disabled} onClick={()=>{closeMenu();setOpen(true);}}><Layers size={14}/>{t("Grupos…")}</button>
    {open&&createPortal(<div className="modal-backdrop"><section ref={dialog} tabIndex={-1} className="app-dialog proposal-review" role="dialog" aria-modal="true" aria-label={t("Grupos")} onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();setOpen(false);}if(e.key==="Tab"){
      const controls=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input,summary'));if(e.shiftKey&&(document.activeElement===controls[0]||document.activeElement===dialog.current)){e.preventDefault();controls.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus();}}}}>
      <header><h2>{t("Grupos")}</h2><button aria-label={t("Fechar")} onClick={()=>setOpen(false)}><X size={18}/></button></header>
      <p>{t("Organização visual. Recolher reúne ligações por tipo sem mudar nós, equações ou resultados.")}</p>
      {error&&<p role="alert">{error}</p>}
      <label>{t("Nome do grupo")}<input value={label} maxLength={120} onChange={e=>setLabel(e.target.value)}/></label><button disabled={disabled||available.length<2||!label.trim()} onClick={create}>{t("Agrupar seleção")}</button>
      <div className="proposal-differences">{groups.filter(group=>group.nodeIds.some(id=>present.has(id))).map(group=><details key={group.id} data-testid="model-group"><summary>{group.label} · {group.nodeIds.filter(id=>present.has(id)).length}</summary>
        <button disabled={disabled} onClick={()=>{enter(group.id);setOpen(false);}}>{t("Entrar no grupo")}</button>
        <button disabled={disabled} onClick={()=>change(groups.map(g=>g.id===group.id?{...g,collapsed:!g.collapsed}:g))}>{t(group.collapsed?"Expandir grupo":"Recolher grupo")}</button>
        <button disabled={disabled} onClick={()=>change(groups.filter(g=>g.id!==group.id))}>{t("Desagrupar")}</button>
        {group.nodeIds.filter(id=>present.has(id)).map(id=><button key={id} onClick={()=>{change(groups.map(g=>g.id===group.id?{...g,collapsed:false}:g));locate(id);setOpen(false);}}>{id}</button>)}
      </details>)}</div>
    </section></div>,document.body)}</>;
}
