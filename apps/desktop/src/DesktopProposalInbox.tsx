import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {invoke,isTauri} from "@tauri-apps/api/core";
import {Link2,Unplug,X} from "lucide-react";
import {engine} from "./engine";
import {useI18n} from "./i18n";
import type {LoadedModel} from "./types";

interface Connection {id:string;code:string;projectId:string}
interface Incoming {id:string;state:string;author:string;reason:string}
interface Saved extends Incoming {sessionId:string}
export interface Delivery { source:{sessionId:string;id:string};begin:(decisionId:string)=>Promise<void>;resolve:(state:"applied"|"rejected"|"conflict"|"failed"|"unconfirmed",decisionId?:string)=>Promise<void> }
export function DesktopProposalInbox({scopeKey,getCurrent,review,disabled,closeMenu}:{
  scopeKey:number;getCurrent:()=>LoadedModel|null;review:(text:string,delivery:Delivery)=>Promise<void>;disabled:boolean;closeMenu:()=>void;
}) {
  const {t}=useI18n();
  const [open,setOpen]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState("");
  const [connection,setConnection]=useState<Connection|null>(null),[entries,setEntries]=useState<Incoming[]>([]);
  const [remaining,setRemaining]=useState(0);
  const [saved,setSaved]=useState<Saved[]>([]);
  const dialog=useRef<HTMLElement>(null),active=useRef<Connection|null>(null),scope=useRef(scopeKey);
  scope.current=scopeKey;
  useEffect(()=>{
    if(!open||!isTauri())return;let disposed=false;
    const projectId=getCurrent()?.model.id;
    void invoke<Saved[]>("proposal_session",{action:"saved_list",value:{projectId}})
      .then(records=>{if(!disposed)setSaved(Array.isArray(records)?records:[]);})
      .catch(e=>{if(!disposed)setError(String(e));});
    return()=>{disposed=true;};
  },[open,scopeKey,connection?.id]);
  useEffect(()=>{if(open&&!dialog.current?.contains(document.activeElement))dialog.current?.focus();},[open,connection,working]);
  useEffect(()=>{
    setConnection(null);setEntries([]);setSaved([]);setOpen(false);setError("");
    return()=>{const c=active.current;active.current=null;if(c)void invoke("proposal_session",{action:"stop",sessionId:c.id}).catch(()=>{});};
  },[scopeKey]);
  async function refresh(c:Connection){
    try {
      const snapshot=await invoke<{id:string;entries:Incoming[];remainingSeconds:number}>("proposal_session",{action:"read",sessionId:c.id});
      if(active.current?.id!==c.id)return;
      setEntries(snapshot.entries);setRemaining(snapshot.remainingSeconds);
    }catch(e){if(active.current?.id===c.id){active.current=null;setConnection(null);setEntries([]);setError(e instanceof Error?e.message:String(e));}}
  }
  useEffect(()=>{if(!connection)return;void refresh(connection);const timer=setInterval(()=>void refresh(connection),1000);return()=>clearInterval(timer);},[connection]);
  async function connect(){
    setWorking(true);setError("");const capturedScope=scope.current;
    try{
      const current=getCurrent();if(!current)return;
      const normalized=await engine.import(current.model);
      if(scope.current!==capturedScope||getCurrent()!==current)throw new Error("O modelo mudou durante a revisão. Reabra a proposta.");
      const c=await invoke<Connection>("proposal_session",{action:"start",value:normalized.model});
      if(scope.current!==capturedScope||getCurrent()!==current){await invoke("proposal_session",{action:"stop",sessionId:c.id});return;}
      active.current=c;setConnection(c);setEntries([]);setRemaining(15*60);
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setWorking(false);}
  }
  async function disconnect(){
    const c=active.current;if(!c)return;setWorking(true);
    try{await invoke("proposal_session",{action:"stop",sessionId:c.id});active.current=null;setConnection(null);setEntries([]);}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{setWorking(false);}
  }
  async function inspect(entry:Incoming,storedSession?:string){
    const c=storedSession?{id:storedSession}:active.current;if(!c)return;setWorking(true);setError("");
    try{
      const proposal=await invoke("proposal_session",{action:storedSession?"saved_get":"get",sessionId:c.id,value:{id:entry.id}});
      const update=async()=>{const live=active.current;if(live?.id===c.id)await refresh(live);};
      const delivery:Delivery={source:{sessionId:c.id,id:entry.id},begin:async decisionId=>{await invoke("proposal_session",{action:storedSession?"saved_resolve":"resolve",sessionId:c.id,value:{id:entry.id,state:"reviewing",decisionId}});await update();},resolve:async(state,decisionId)=>{
        await invoke("proposal_session",{action:storedSession?"saved_resolve":"resolve",sessionId:c.id,value:{id:entry.id,state,decisionId}});await update();
      }};
      setOpen(false);await review(JSON.stringify(proposal),delivery);
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setWorking(false);}
  }
  if(!isTauri())return null;
  const queued=entries.filter(e=>e.state==="queued").length;
  const labels:Record<string,string>={queued:"Aguardando revisão",reviewing:"Aplicação em andamento",applied:"Aplicação registrada",rejected:"Rejeitada",conflict:"Base em conflito",failed:"Não aplicada",unconfirmed:"Aplicação não confirmada",closed:"Encerrada sem confirmação"};
  return <>
    <button disabled={disabled||working} onClick={()=>{closeMenu();setOpen(true);}}><Link2 size={14}/>{t("Propostas locais…")}{queued>0&&<span>{queued}</span>}</button>
    {open&&createPortal(<div className="modal-backdrop"><section ref={dialog} tabIndex={-1} className="app-dialog proposal-review" role="dialog" aria-modal="true" aria-label={t("Propostas locais")}
      onKeyDown={e=>{
        if(e.key==="Escape"){e.stopPropagation();if(!working)setOpen(false);}
        if(e.key==="Tab"){
          const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled)'));
          const first=items[0],last=items.at(-1);
          if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}
          else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
        }
      }}>
      <header><h2>{t("Propostas locais")}</h2><button disabled={working} aria-label={t("Fechar")} onClick={()=>setOpen(false)}><X size={18}/></button></header>
      <p>{t("Canal local Windows. Receber não aplica, executa ou salva o projeto.")}</p>
      <p>{t("Base capturada ao conectar. Após editar, reconecte para enviar propostas contra a nova base.")}</p>
      <p>{t("A conexão expira. Entregas gravadas permanecem disponíveis para revisão, sem reconexão automática.")}</p>
      {error&&<p role="alert">{t(error)}</p>}
      {!!saved.filter(e=>e.sessionId!==connection?.id).length&&<div className="proposal-differences">
        <h3>{t("Entregas recuperadas")}</h3>
        {saved.filter(e=>e.sessionId!==connection?.id).map(e=><div key={`${e.sessionId}:${e.id}`} data-testid="saved-proposal">
          <strong>{e.author}</strong><p>{e.reason}</p><small>{t(labels[e.state]??"Aplicação não confirmada")} · {e.id}</small>
          {e.state==="queued"&&<button disabled={disabled||working} onClick={()=>void inspect(e,e.sessionId)}>{t("Revisar entrega")}</button>}
          {["reviewing","unconfirmed"].includes(e.state)&&<p>{t("Consulte o registro de propostas antes de qualquer nova aplicação.")}</p>}
        </div>)}
      </div>}
      {!connection?<button disabled={disabled||working} onClick={()=>void connect()}><Link2 size={14}/>{t("Conectar este projeto")}</button>:<>
        <p>{t("Conexão temporária")}: {connection.projectId} · {Math.ceil(remaining/60)} min</p>
        <label>{t("Código para o cliente MCP")}<textarea readOnly rows={3} value={connection.code} aria-label={t("Código para o cliente MCP")}/></label>
        <p>{t("Compartilhe somente com seu cliente local. O código expira e não é salvo no projeto.")}</p>
        <div className="proposal-differences">{entries.map(e=><div className="incoming-proposal" key={e.id} data-testid="incoming-proposal" data-state={e.state}>
          <strong>{e.author}</strong><p>{e.reason}</p><small>{t(labels[e.state]??"Não aplicada")} · {e.id}</small>
          {e.state==="queued"&&<button disabled={disabled||working} onClick={()=>void inspect(e)}>{t("Revisar entrega")}</button>}
        </div>)}</div>
        {!entries.length&&<p>{t("Nenhuma proposta recebida nesta conexão.")}</p>}
        <footer><small>{t("Até 8 pendentes, 32 entregas e 2 MB por conexão. Prazo de 15 minutos.")}</small><button disabled={working} onClick={()=>void disconnect()}><Unplug size={14}/>{t("Desconectar")}</button></footer>
      </>}
    </section></div>,document.body)}
  </>;
}
