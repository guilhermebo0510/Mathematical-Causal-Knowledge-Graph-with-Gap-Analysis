// UI integration with mocked native IPC. Actual Windows pipe/SDK is validated separately.
import {expect,test,type Page} from "@playwright/test";
import {readFile} from "node:fs/promises";
import {ready} from "./workspace-helpers";

async function nativeUi(page:Page){
  await page.addInitScript(()=>{
    const w=window as any;w.isTauri=true;
    const mock={base:null as any,entries:[] as any[],saved:[] as any[],active:false,stops:0,resolutions:[] as string[],receipts:[] as any[]};
    w.__inboxMock=mock;
    let journal={format:"nexo-proposal-journal",version:2,evicted:0,entries:[] as any[]};
    let history={format:"nexo-run-history",version:1,evicted:0,entries:[] as any[]};
    w.__TAURI_INTERNALS__={metadata:{currentWindow:{label:"main"},currentWebview:{label:"main"}},transformCallback:()=>1,unregisterCallback:()=>{},invoke:async(cmd:string,args:any={})=>{
      if(cmd==="engine_request"){
        const response=await(await fetch("/__engine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(args.request)})).json();
        if(args.request.operation==="analyze"&&response.ok)mock.receipts.push({model:args.request.model,run:response.data});
        return response;
      }
      if(cmd==="history_read")return history;
      if(cmd==="archive_run"){history={...history,entries:[...mock.receipts.filter(e=>e.run.run_id===args.runId),...history.entries]};return history;}
      if(cmd==="proposal_journal"){
        if(args.action==="start")journal.entries.unshift(structuredClone(args.value));
        if(args.action==="finish"){const e=journal.entries.find(e=>e.id===args.value.id);Object.assign(e,args.value);}
        return structuredClone(journal);
      }
      if(cmd==="proposal_session"){
        if(args.action==="saved_list")return structuredClone(mock.saved);
        if(args.action==="start"){mock.active=true;mock.base=structuredClone(args.value);return{id:"test-session",code:"synthetic-connection-code",projectId:args.value.id};}
        if(args.action==="stop"){mock.active=false;mock.stops++;return{closed:true};}
        if(!mock.active&&!args.action.startsWith("saved_"))throw new Error("Sessão encerrada ou expirada.");
        if(args.action==="read")return{id:"test-session",remainingSeconds:900,entries:mock.entries.map(({proposal,...e})=>({...e,author:proposal.author,reason:proposal.reason}))};
        const e=(args.action.startsWith("saved_")?mock.saved:mock.entries).find(e=>e.id===args.value.id);
        if(["get","saved_get"].includes(args.action))return structuredClone(e.proposal);
        if(["resolve","saved_resolve"].includes(args.action)){
          const {state,decisionId}=args.value;
          if(["reviewing","applied","rejected"].includes(state)){
            const record=journal.entries.find(record=>record.id===decisionId);
            if(!record||record.state!==(state==="reviewing"?"pending":state)||record.delivery?.id!==e.id||record.delivery?.sessionId!==args.sessionId||JSON.stringify(record.proposal)!==JSON.stringify(e.proposal))throw new Error("Mismatched persisted receipt");
            e.decision_id=decisionId;
          }
          if((mock as any).failFinal&&state==="applied")throw new Error("Synthetic acknowledgement failure");
          e.state=state;mock.resolutions.push(e.state);return{id:e.id,state:e.state,...(e.decision_id?{decision_id:e.decision_id}:{})};
        }
      }
      return null;
    }};
  });
  await ready(page);
}
async function openInbox(page:Page){
  await page.locator(".file-menu > summary").click();
  await page.getByRole("button",{name:/^Propostas locais…/}).click();
  return page.getByRole("dialog",{name:"Propostas locais",exact:true});
}
async function send(page:Page){
  await page.evaluate(()=>{
    const m=(window as any).__inboxMock;
    const candidate=structuredClone(m.base);candidate.observations[0].value=2300;
    m.entries.push({id:"ui-delivery",state:"queued",proposal:{format:"nexo-change-proposal",version:1,project_id:m.base.id,base_revision:"a".repeat(64),target_revision:"b".repeat(64),author:"Synthetic SDK",reason:"Known defect",base_model:structuredClone(m.base),candidate_model:candidate}});
  });
}

test("native inbox UI receives without mutation, reviews once, records decision and revokes on reopening same ID",async({page})=>{
  test.setTimeout(120000);
  await nativeUi(page);
  await page.keyboard.press("F5");await expect(page.getByTestId("finding-count")).toHaveText("0",{timeout:20000});
  let inbox=await openInbox(page);
  await inbox.getByRole("button",{name:"Conectar este projeto"}).click();
  await expect(inbox.getByLabel("Código para o cliente MCP")).toHaveValue("synthetic-connection-code",{timeout:20000});
  await send(page);
  await expect(inbox.getByTestId("incoming-proposal")).toHaveCount(1);
  await expect(page.getByTestId("finding-count")).toHaveText("0");
  await inbox.getByRole("button",{name:"Revisar entrega"}).click();
  const review=page.getByRole("dialog",{name:"Revisar proposta",exact:true});
  await expect(review.getByRole("checkbox")).toBeVisible({timeout:20000});
  await review.getByRole("button",{name:"Cancelar",exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__inboxMock.entries[0].state)).toBe("queued");
  inbox=await openInbox(page);await inbox.getByRole("button",{name:"Revisar entrega"}).click();
  await review.getByRole("checkbox").check();await review.getByRole("button",{name:"Aplicar proposta"}).click();
  await expect(review).toBeHidden({timeout:20000});
  expect(await page.evaluate(()=>(window as any).__inboxMock.resolutions)).toEqual(["reviewing","applied"]);
  expect(await page.evaluate(()=>(window as any).__inboxMock.entries[0].decision_id)).toMatch(/^[a-zA-Z0-9_-]{1,80}$/);
  await expect(page.getByTestId("finding-count")).toHaveText("—");
  await page.keyboard.press("F5");await expect(page.getByTestId("finding-count")).toHaveText("1",{timeout:20000});
  await page.keyboard.press("Control+z");await page.keyboard.press("F5");
  await expect(page.getByTestId("finding-count")).toHaveText("0",{timeout:20000});
  await page.locator(".file-menu > summary").click();
  await page.getByRole("button",{name:"Registro de propostas…",exact:true}).click();
  const audit=page.getByRole("dialog",{name:"Registro de propostas",exact:true});
  await audit.getByTestId("proposal-decision").locator("summary").first().click();
  await expect(audit.getByText("ui-delivery",{exact:true})).toBeVisible();
  const downloaded=page.waitForEvent("download");
  await audit.getByRole("button",{name:"Exportar registro",exact:true}).click();
  const record=JSON.parse(await readFile((await(await downloaded).path())!,"utf8"));
  expect(record.format).toBe("nexo-proposal-decision");expect(record.version).toBe(2);
  expect(record.record.delivery).toEqual({sessionId:"test-session",id:"ui-delivery"});
  expect(record.record.id).toBe(await page.evaluate(()=>(window as any).__inboxMock.entries[0].decision_id));
  expect(JSON.stringify(record)).not.toContain("synthetic-connection-code");
  await audit.getByRole("button",{name:"Fechar",exact:true}).click();
  const base=await page.evaluate(()=>(window as any).__inboxMock.base);
  await page.getByLabel("Arquivo do modelo").setInputFiles({name:"same-id.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(base))});
  await expect.poll(()=>page.evaluate(()=>(window as any).__inboxMock.stops)).toBeGreaterThan(0);
  inbox=await openInbox(page);await expect(inbox.getByRole("button",{name:"Conectar este projeto"})).toBeVisible();
  await expect(inbox.getByLabel("Código para o cliente MCP")).toHaveCount(0);
});

test("native inbox UI marks a stale base as conflict after an in-session edit",async({page})=>{
  test.setTimeout(60000);
  await nativeUi(page);let inbox=await openInbox(page);
  await inbox.getByRole("button",{name:"Conectar este projeto"}).click();
  await expect(inbox.getByLabel("Código para o cliente MCP")).toBeVisible({timeout:20000});
  await inbox.getByRole("button",{name:"Fechar",exact:true}).click();
  await page.getByTestId("status-project-name").click({button:"right"});
  await page.getByRole("menuitem",{name:"Renomear projeto"}).click();
  await page.getByLabel("Nome do projeto").fill("Base modificada");await page.keyboard.press("Enter");
  await send(page);inbox=await openInbox(page);
  await expect(inbox.getByTestId("incoming-proposal")).toHaveCount(1);
  await inbox.getByRole("button",{name:"Revisar entrega"}).click();
  const review=page.getByRole("dialog",{name:"Revisar proposta",exact:true});
  await expect(review.getByRole("alert")).toContainText("não corresponde",{timeout:20000});
  expect(await page.evaluate(()=>(window as any).__inboxMock.entries[0].state)).toBe("conflict");
  await expect(page.locator("h1")).toHaveText("Base modificada");
});

test("lost final native acknowledgement reserves the delivery and retries receipt without applying twice",async({page})=>{
  test.setTimeout(90000);
  await nativeUi(page);const inbox=await openInbox(page);
  await inbox.getByRole("button",{name:"Conectar este projeto"}).click();
  await expect(inbox.getByLabel("Código para o cliente MCP")).toBeVisible({timeout:20000});
  await send(page);
  await page.evaluate(()=>{const m=(window as any).__inboxMock;m.failFinal=true;m.entries[0].proposal.candidate_model.title="Recebida por MCP";});
  await expect(inbox.getByTestId("incoming-proposal")).toHaveCount(1);
  await inbox.getByRole("button",{name:"Revisar entrega"}).click();
  const review=page.getByRole("dialog",{name:"Revisar proposta",exact:true});
  await expect(review.getByRole("checkbox")).toBeVisible({timeout:20000});await review.getByRole("checkbox").check();
  await review.getByRole("button",{name:"Aplicar proposta"}).click();
  await expect(review.getByRole("alert")).toContainText("confirmação do registro falhou",{timeout:20000});
  await expect(page.locator("h1")).toHaveText("Recebida por MCP");
  expect(await page.evaluate(()=>(window as any).__inboxMock.entries[0].state)).toBe("unconfirmed");
  await expect(review.getByRole("button",{name:"Aplicar proposta"})).toBeDisabled();
  await page.evaluate(()=>(window as any).__inboxMock.failFinal=false);
  await review.getByRole("button",{name:"Confirmar registro novamente"}).click();await expect(review).toBeHidden();
  expect(await page.evaluate(()=>(window as any).__inboxMock.resolutions)).toEqual(["reviewing","unconfirmed","applied"]);
  await page.keyboard.press("Control+z");await expect(page.locator("h1")).toHaveText("Balanço térmico de uma sala");
});

test("disconnect restores dialog keyboard focus so Escape closes the inbox",async({page})=>{
  await nativeUi(page);const inbox=await openInbox(page);
  await inbox.getByRole("button",{name:"Conectar este projeto"}).click();
  await expect(inbox.getByLabel("Código para o cliente MCP")).toBeVisible({timeout:20000});
  await inbox.getByRole("button",{name:"Desconectar",exact:true}).click();
  await expect(inbox.getByRole("button",{name:"Conectar este projeto"})).toBeVisible();
  await page.keyboard.press("Escape");await expect(inbox).toBeHidden();
});

test("saved queued delivery can be reviewed without restoring an expired connection",async({page})=>{
  test.setTimeout(90000);await nativeUi(page);
  const response=await page.request.post("/__engine",{data:{protocol_version:1,id:"saved-fixture",operation:"load_example",example_id:"complete"}});
  const base=(await response.json()).data.model;
  await page.evaluate(base=>{
    const next=structuredClone(base);next.title="Retomada explícita";
    (window as any).__inboxMock.saved=[{id:"saved-delivery",sessionId:"expired-session",state:"queued",author:"Synthetic saved",reason:"Restart control",proposal:{format:"nexo-change-proposal",version:1,project_id:base.id,base_revision:"a".repeat(64),target_revision:"b".repeat(64),author:"Synthetic saved",reason:"Restart control",base_model:base,candidate_model:next}}];
  },base);
  const inbox=await openInbox(page);
  await expect(inbox.getByTestId("saved-proposal")).toContainText("saved-delivery");
  await expect(inbox.getByLabel("Código para o cliente MCP")).toHaveCount(0);
  await inbox.getByRole("button",{name:"Revisar entrega",exact:true}).click();
  const review=page.getByRole("dialog",{name:"Revisar proposta",exact:true});
  await expect(review.getByRole("checkbox")).toBeVisible({timeout:20000});await review.getByRole("checkbox").check();
  await review.getByRole("button",{name:"Aplicar proposta",exact:true}).click();await expect(review).toBeHidden();
  await expect(page.locator("h1")).toHaveText("Retomada explícita");
  expect(await page.evaluate(()=>(window as any).__inboxMock.saved[0].state)).toBe("applied");
  expect(await page.evaluate(()=>(window as any).__inboxMock.active)).toBe(false);
  await page.keyboard.press("Control+z");await expect(page.locator("h1")).toHaveText(base.title);
});

test("persisted final decision can reconcile a lost inbox receipt after connection loss without reapplying",async({page})=>{
  test.setTimeout(120000);await nativeUi(page);const inbox=await openInbox(page);
  await inbox.getByRole("button",{name:"Conectar este projeto"}).click();await expect(inbox.getByLabel("Código para o cliente MCP")).toBeVisible({timeout:20000});
  await send(page);await page.evaluate(()=>(window as any).__inboxMock.failFinal=true);
  await expect(inbox.getByTestId("incoming-proposal")).toHaveCount(1);await inbox.getByRole("button",{name:"Revisar entrega",exact:true}).click();
  const review=page.getByRole("dialog",{name:"Revisar proposta",exact:true});await expect(review.getByRole("checkbox")).toBeVisible({timeout:20000});await review.getByRole("checkbox").check();await review.getByRole("button",{name:"Aplicar proposta",exact:true}).click();
  await expect(review.getByRole("alert")).toContainText("confirmação do registro falhou",{timeout:20000});
  await review.getByRole("button",{name:"Cancelar",exact:true}).click();
  await page.evaluate(()=>{const m=(window as any).__inboxMock;m.saved=[{...m.entries[0],sessionId:"test-session"}];m.active=false;m.failFinal=false;});
  await page.locator(".file-menu > summary").click();await page.getByRole("button",{name:"Registro de propostas…",exact:true}).click();
  const journal=page.getByRole("dialog",{name:"Registro de propostas",exact:true});const record=journal.getByTestId("proposal-decision");await expect(record).toHaveAttribute("data-state","applied");
  await record.locator("summary").first().click();await record.getByRole("button",{name:"Sincronizar recibo",exact:true}).click();
  await expect(journal.getByRole("status")).toContainText("Recibo sincronizado");
  expect(await page.evaluate(()=>(window as any).__inboxMock.saved[0].state)).toBe("applied");
  await journal.getByRole("button",{name:"Fechar",exact:true}).click();await page.keyboard.press("Control+z");
  await page.keyboard.press("F5");await expect(page.getByTestId("finding-count")).toHaveText("0",{timeout:30000});
});
