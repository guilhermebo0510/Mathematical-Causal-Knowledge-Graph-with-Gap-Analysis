import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileUp, X } from "lucide-react";
import { useI18n } from "./i18n";
import { engine } from "./engine";
import { projectFiles } from "./project";
import { parseProposal, reviewProposal, sameContent, type ReviewedProposal } from "./proposals";
import type { LoadedModel } from "./types";
import { proposalJournal, type Decision } from "./proposalJournal";
import { ProposalJournalView } from "./ProposalJournalView";
import { DesktopProposalInbox, type Delivery } from "./DesktopProposalInbox";

export function ProposalReview({getCurrent,apply,disabled,closeMenu,scopeKey}: {
  getCurrent:()=>LoadedModel|null; apply:(model:LoadedModel)=>boolean; disabled:boolean; closeMenu:()=>void;scopeKey:number;
}) {
  const {t,language}=useI18n();
  const input=useRef<HTMLInputElement>(null);
  const dialog=useRef<HTMLElement>(null);
  const [review,setReview]=useState<ReviewedProposal|null>(null);
  const [error,setError]=useState("");
  const [open,setOpen]=useState(false);
  const [working,setWorking]=useState(false);
  const [ack,setAck]=useState(false);
  const [delivery,setDelivery]=useState<Delivery|null>(null);
  const [pendingReceipt,setPendingReceipt]=useState<{id:string;state:"applied"|"failed"|"rejected";delivery:Delivery|null}|null>(null);
  const currentScope=useRef(scopeKey),reviewScope=useRef(scopeKey);
  currentScope.current=scopeKey;
  useEffect(()=>{setOpen(false);setReview(null);setDelivery(null);},[scopeKey]);
  useEffect(()=>{if(open) dialog.current?.focus();},[open]);
  async function read(text:string,incoming:Delivery|null=null) {
    reviewScope.current=currentScope.current;
    setDelivery(incoming);
    setOpen(true); setWorking(true); setError(""); setReview(null); setAck(false); setPendingReceipt(null);
    try {
      const current=getCurrent(); if(!current) return;
      const p=parseProposal(text);
      const reviewed=await reviewProposal(p,current.model);
      if(getCurrent()!==current) throw new Error("O modelo mudou durante a revisão. Reabra a proposta.");
      setReview(reviewed);
    } catch(e) {
      const message=e instanceof Error?e.message:String(e);setError(message);
      await incoming?.resolve(message.includes("modelo atual")||message.includes("modelo mudou")?"conflict":"failed").catch(()=>{});
    }
    finally { setWorking(false); }
  }
  async function choose() {
    closeMenu();
    if(projectFiles.native()) {
      try { const file=await projectFiles.open(language); if(file) await read(file.content); }
      catch(e) { setError(String(e)); setOpen(true); }
    } else input.current?.click();
  }
  async function accept() {
    if(!review || !ack || disabled || working) return;
    setWorking(true); setError("");
    try {
      const current=getCurrent(); if(!current) return;
      if(reviewScope.current!==currentScope.current)throw new Error("O modelo mudou durante a revisão. Reabra a proposta.");
      const normalized=await engine.import(current.model);
      if(getCurrent()!==current || reviewScope.current!==currentScope.current || !sameContent(normalized.model,review.base))
        throw new Error("O modelo mudou durante a revisão. Reabra a proposta.");
      const now=new Date().toISOString();
      const entry:Decision={id:crypto.randomUUID(),createdAt:now,updatedAt:now,state:"pending",proposal:review.proposal,...(delivery?{delivery:delivery.source}:{})};
      // Persist intent first. A crash here must never look like a completed application.
      await proposalJournal.start(entry);
      let applied=false;
      try { await delivery?.begin(entry.id);if(getCurrent()===current&&reviewScope.current===currentScope.current) applied=apply(review.candidate); }
      finally {
        const receipt={id:entry.id,state:applied?"applied" as const:"failed" as const,delivery};
        setPendingReceipt(receipt);setReview(null);
        try { await proposalJournal.finish(receipt.id,receipt.state);await delivery?.resolve(receipt.state,receipt.id);setPendingReceipt(null); }
        catch { await delivery?.resolve("unconfirmed",receipt.id).catch(()=>{});throw new Error("O modelo foi processado, mas a confirmação do registro falhou. Tente registrar novamente; não reaplique a proposta."); }
      }
      if(!applied) throw new Error("Não foi possível aplicar a proposta.");
      setOpen(false); setReview(null);
    } catch(e) { setError(e instanceof Error?e.message:String(e)); }
    finally { setWorking(false); }
  }
  async function retryReceipt(){
    if(!pendingReceipt)return;
    setWorking(true);setError("");
    try{if(pendingReceipt.state!=="rejected")await proposalJournal.finish(pendingReceipt.id,pendingReceipt.state);await pendingReceipt.delivery?.resolve(pendingReceipt.state,pendingReceipt.id);setPendingReceipt(null);setOpen(false);}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{setWorking(false);}
  }
  async function reject(){
    if(!review||working||disabled)return;
    setWorking(true);setError("");
    const now=new Date().toISOString();
    try{
      const id=crypto.randomUUID();await proposalJournal.start({id,createdAt:now,updatedAt:now,state:"rejected",proposal:review.proposal,...(delivery?{delivery:delivery.source}:{})});
      setReview(null);setPendingReceipt({id,state:"rejected",delivery});await delivery?.resolve("rejected",id);setPendingReceipt(null);setOpen(false);
    }
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{setWorking(false);}
  }
  return <>
    <button disabled={disabled} onClick={()=>void choose()}><FileUp size={14}/>{t("Revisar proposta…")}</button>
    <ProposalJournalView projectId={getCurrent()?.model.id} closeMenu={closeMenu}/>
    <DesktopProposalInbox scopeKey={scopeKey} getCurrent={getCurrent} review={read} disabled={disabled||working||open} closeMenu={closeMenu}/>
    <input className="visually-hidden" type="file" accept=".json,application/json" ref={input} aria-label={t("Arquivo de proposta")}
      onChange={e=>{const file=e.target.files?.[0]; e.target.value=""; if(file) {
        if(file.size>600000) {setOpen(true);setError("Proposta excede 600 KB.");setReview(null);}
        else void file.text().then(read).catch(e=>{setOpen(true);setError(String(e));});
      }}}/>
    {open && createPortal(<div className="modal-backdrop"><section ref={dialog} tabIndex={-1} className="app-dialog proposal-review" role="dialog" aria-modal="true" aria-label={t("Revisar proposta")}
      onKeyDown={e=>{
        if(e.key==="Escape") {e.stopPropagation();if(!working)setOpen(false);}
        if(e.key==="Tab") {
          const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),summary'));
          const first=items[0],last=items.at(-1);
          if(e.shiftKey && (document.activeElement===first || document.activeElement===dialog.current)) {e.preventDefault();last?.focus();}
          else if(!e.shiftKey && document.activeElement===last) {e.preventDefault();first?.focus();}
        }
      }}>
      <header><h2>{t("Revisar proposta")}</h2><button disabled={working} aria-label={t("Fechar")} onClick={()=>setOpen(false)}><X size={18}/></button></header>
      {working && <p role="status">{t("Validando proposta…")}</p>}
      {error && <p role="alert">{t(error)}</p>}
      {pendingReceipt&&<button disabled={working} onClick={()=>void retryReceipt()}>{t("Confirmar registro novamente")}</button>}
      {review && <>
        <p><strong>{review.proposal.author}</strong> · {review.proposal.reason}</p>
        <p>{t("Comparação pelo conteúdo completo. A proposta não é uma análise aprovada.")}</p>
        <div className="proposal-differences">{review.differences.map(d=><details key={`${d.kind}:${d.id}`}>
          <summary>{d.id} · {t(d.before===null?"Adicionado":d.after===null?"Removido":"Alterado")}</summary>
          <div className="proposal-columns"><div><strong>{t("Antes")}</strong><pre>{JSON.stringify(d.before,null,2)}</pre></div><div><strong>{t("Depois")}</strong><pre>{JSON.stringify(d.after,null,2)}</pre></div></div>
        </details>)}</div>
        <label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>{t("Revisei as mudanças. Campos ainda não aplicados no editor serão substituídos.")}</label>
        <p>{t("Aplicar permite Desfazer, invalida a análise atual e não salva o arquivo automaticamente.")}</p>
      </>}
      <footer><button disabled={working} onClick={()=>setOpen(false)}>{t("Cancelar")}</button><button disabled={!review||working||disabled} onClick={()=>void reject()}>{t("Rejeitar proposta")}</button><button disabled={!review || !ack || working || disabled || !review.differences.length} onClick={()=>void accept()}>{t("Aplicar proposta")}</button></footer>
    </section></div>,document.body)}
  </>;
}
