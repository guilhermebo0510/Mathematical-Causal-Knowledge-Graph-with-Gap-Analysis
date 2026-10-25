import { useEffect, useRef, useState } from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";
import { createPortal } from "react-dom";
import { Download, History, RefreshCw, X } from "lucide-react";
import { useI18n } from "./i18n";
import { download } from "./project";
import { differences } from "./proposals";
import { proposalJournal, type ProposalJournal, type DecisionState } from "./proposalJournal";

const labels:Record<DecisionState,string>={pending:"Aplicação não confirmada",applied:"Aplicação registrada",rejected:"Rejeitada",failed:"Não aplicada",unconfirmed:"Encerrada sem confirmação"};
export function ProposalJournalView({projectId,closeMenu}:{projectId?:string;closeMenu:()=>void}) {
  const {t,date}=useI18n();
  const [open,setOpen]=useState(false);
  const [journal,setJournal]=useState<ProposalJournal|null>(null);
  const [error,setError]=useState("");
  const [errorMode,setErrorMode]=useState<"read"|"receipt">("read");
  const [loading,setLoading]=useState(false);
  const [receiptStatus,setReceiptStatus]=useState("");
  async function syncReceipt(entry: import("./proposalJournal").Decision){
    if(!entry.delivery||entry.state==="pending")return;setLoading(true);setError("");setErrorMode("receipt");setReceiptStatus("");
    try{await invoke("proposal_session",{action:"saved_resolve",sessionId:entry.delivery.sessionId,value:{id:entry.delivery.id,state:entry.state==="unconfirmed"?"closed":entry.state,decisionId:entry.id}});setReceiptStatus(t("Recibo sincronizado. O modelo não foi alterado."));}
    catch(e){setError(String(e));}finally{setLoading(false);}
  }
  const [acknowledged,setAcknowledged]=useState<Record<string,boolean>>({});
  async function closeUnconfirmed(id:string){
    setLoading(true);setError("");setErrorMode("receipt");
    try{
      const updated=await proposalJournal.closeUnconfirmed(id);setJournal(updated);
      const entry=updated.entries.find(e=>e.id===id);
      if(isTauri()&&entry?.delivery){
        const saved=await invoke<{sessionId:string;id:string}[]>("proposal_session",{action:"saved_list",value:{projectId:entry.proposal.project_id}});
        if(saved.some(record=>record.sessionId===entry.delivery!.sessionId&&record.id===entry.delivery!.id))await invoke("proposal_session",{action:"saved_resolve",sessionId:entry.delivery.sessionId,value:{id:entry.delivery.id,state:"closed",decisionId:id}});
      }
    }catch(e){setError(String(e));}finally{setLoading(false);}
  }
  const dialog=useRef<HTMLElement>(null);
  useEffect(()=>{if(open)dialog.current?.focus();},[open]);
  async function refresh(){
    setLoading(true);setError("");setErrorMode("read");setReceiptStatus("");
    try{setJournal(await proposalJournal.read());}catch(e){setError(e instanceof Error?e.message:String(e));setJournal(null);}finally{setLoading(false);}
  }
  const entries=journal?.entries.filter(e=>!projectId || e.proposal.project_id===projectId)??[];
  return <>
    <button onClick={()=>{closeMenu();setOpen(true);void refresh();}}><History size={14}/>{t("Registro de propostas…")}</button>
    {open&&createPortal(<div className="modal-backdrop"><section ref={dialog} tabIndex={-1} className="app-dialog proposal-review" role="dialog" aria-modal="true" aria-label={t("Registro de propostas")}
      onKeyDown={e=>{
        if(e.key==="Escape"){e.stopPropagation();setOpen(false);}
        if(e.key==="Tab"){
          const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),summary'));
          const first=items[0],last=items.at(-1);
          if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}
          else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
        }
      }}>
      <header><h2>{t("Registro de propostas")}</h2><button aria-label={t("Fechar")} onClick={()=>setOpen(false)}><X size={18}/></button></header>
      <p>{t("Registro local, sem assinatura. Autor e revisões são declarados pelo remetente. Não comprova análise científica nem o estado atual do projeto.")}</p>
      {loading&&<p role="status">{t("Carregando…")}</p>}
      {error&&<p role="alert">{t(errorMode==="read"?"Não foi possível ler o registro. O arquivo foi preservado.":"Não foi possível confirmar o recibo.")}<br/><code>{t(error)}</code></p>}
      {receiptStatus&&<p role="status">{receiptStatus}</p>}
      {!!journal?.evicted&&<p>{t("Retenção aplicada")}: {journal.evicted}</p>}
      {!loading&&!error&&!entries.length&&<p>{t("Nenhuma decisão registrada neste projeto.")}</p>}
      <div className="proposal-differences">{entries.map(e=><details key={e.id} data-testid="proposal-decision" data-state={e.state}>
        <summary>{t(labels[e.state])} · {e.proposal.author} · {date(e.createdAt)}</summary>
        <p>{e.proposal.reason}</p><code>{e.id}</code>
        {e.delivery&&<p><strong>{t("Entrega local")}</strong> · <code>{e.delivery.id}</code></p>}
        {isTauri()&&e.delivery&&e.state!=="pending"&&<button disabled={loading} onClick={()=>void syncReceipt(e)}>{t("Sincronizar recibo")}</button>}
        {e.state==="pending"&&<p>{t("O registro foi iniciado, mas não há confirmação persistida da aplicação. Confira o projeto; não reaplique automaticamente.")}</p>}
        {["pending","unconfirmed"].includes(e.state)&&<><label><input type="checkbox" checked={!!acknowledged[e.id]} onChange={event=>setAcknowledged({...acknowledged,[e.id]:event.target.checked})}/>{t("Revisei o projeto. Encerrar mantém a aplicação desconhecida e permite retenção futura deste registro.")}</label>
          <button disabled={loading||!acknowledged[e.id]} onClick={()=>void closeUnconfirmed(e.id)}>{t("Encerrar sem confirmação")}</button></>}
        {e.state==="applied"&&<p>{t("Aplicada naquela sessão. Desfazer ou abrir outro projeto pode ter mudado o modelo desde então.")}</p>}
        {differences(e.proposal.base_model,e.proposal.candidate_model).map(d=><details key={`${d.kind}:${d.id}`}>
          <summary>{d.id} · {t(d.before===null?"Adicionado":d.after===null?"Removido":"Alterado")}</summary>
          <div className="proposal-columns"><pre>{JSON.stringify(d.before,null,2)}</pre><pre>{JSON.stringify(d.after,null,2)}</pre></div>
        </details>)}
        <button onClick={()=>download(JSON.stringify({format:"nexo-proposal-decision",version:2,record:e},null,2),`${e.id}.nexo-decision.json`)}><Download size={14}/>{t("Exportar registro")}</button>
      </details>)}</div>
      <footer><small>{t("Até 20 decisões e 8 MB por perfil.")}</small><button disabled={loading} onClick={()=>void refresh()}><RefreshCw size={14}/>{t("Atualizar")}</button></footer>
    </section></div>,document.body)}
  </>;
}
