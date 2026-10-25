import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {History,X} from "lucide-react";
import {useI18n} from "./i18n";
import type {RevisionHistory} from "./revisionHistory";
import {differences} from "./proposals";
export function RevisionHistoryView({history,closeMenu}:{history:RevisionHistory;closeMenu:()=>void}){
  const {t,date}=useI18n();const[open,setOpen]=useState(false);const dialog=useRef<HTMLElement>(null);
  useEffect(()=>{if(open)dialog.current?.focus();},[open]);
  return <><button onClick={()=>{closeMenu();setOpen(true);}}><History size={14}/>{t("Histórico de edições…")}</button>
    {open&&createPortal(<div className="modal-backdrop"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("Histórico de edições")} className="app-dialog proposal-review"
      onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();setOpen(false);}if(e.key==="Tab"){
        const controls=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button,summary'));
        if(e.shiftKey&&(document.activeElement===controls[0]||document.activeElement===dialog.current)){e.preventDefault();controls.at(-1)?.focus();}
        else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus();}
      }}}>
      <header><h2>{t("Histórico de edições")}</h2><button aria-label={t("Fechar")} onClick={()=>setOpen(false)}><X size={18}/></button></header>
      <p>{t("Edições locais, sem assinatura ou aprovação científica. Persistem ao salvar o projeto ou restaurar sua cópia.")}</p>
      {!!history.evicted&&<p>{t("Retenção aplicada")}: {history.evicted}</p>}
      {!history.events.length&&<p>{t("Nenhuma edição registrada.")}</p>}
      <div className="proposal-differences">{[...history.events].reverse().map(event=><details key={event.id} data-testid="revision-event">
        <summary>{t(event.kind==="edit"?"Edição":event.kind==="undo"?"Desfazer":"Refazer")} · {date(event.at)}</summary>
        {event.before.title!==event.after.title&&<p>{event.before.title} → {event.after.title}</p>}
        {differences(event.before,event.after).map(d=><details key={`${d.kind}:${d.id}`}><summary>{d.id} · {t(d.before===null?"Adicionado":d.after===null?"Removido":"Alterado")}</summary><div className="proposal-columns"><pre>{JSON.stringify(d.before,null,2)}</pre><pre>{JSON.stringify(d.after,null,2)}</pre></div></details>)}
      </details>)}</div>
    </section></div>,document.body)}</>;
}
