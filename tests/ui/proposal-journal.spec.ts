import {expect,test} from "@playwright/test";
import {ready} from "./workspace-helpers";

test("proposal journal failure blocks mutation first, and confirmation retry never reapplies",async({page},info)=>{
  test.setTimeout(120000);
  await ready(page);
  await page.evaluate(()=>localStorage.setItem("nexo.proposal-journal.v1",JSON.stringify({format:"nexo-proposal-journal",version:1,evicted:0,entries:[]})));
  const response=await page.request.post("/__engine",{data:{protocol_version:1,id:"journal-fixture",operation:"load_example",example_id:"complete"}});
  const base=(await response.json()).data.model;
  const next=structuredClone(base);next.title="Proposta sintética de auditoria";
  const proposal={format:"nexo-change-proposal",version:1,project_id:base.id,author:"Synthetic",reason:"Storage fault control",base_revision:"a".repeat(64),target_revision:"b".repeat(64),base_model:base,candidate_model:next};
  await page.getByLabel("Arquivo de proposta").setInputFiles({name:"proposal.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(proposal))});
  const dialog=page.getByRole("dialog",{name:"Revisar proposta",exact:true});
  await expect(dialog.getByRole("checkbox")).toBeVisible({timeout:20000});
  await dialog.getByRole("checkbox").check();
  await page.evaluate(()=>{
    const actual=Storage.prototype.setItem;
    (window as any).journalFault="all";
    Storage.prototype.setItem=function(key,value){
      const mode=(window as any).journalFault;
      if(key==="nexo.proposal-journal.v2"&&(mode==="all"||(mode==="finish"&&JSON.parse(value).entries[0].state==="applied"))) throw new Error("Synthetic disk full");
      return actual.call(this,key,value);
    };
  });
  await dialog.getByRole("button",{name:"Aplicar proposta"}).click();
  await expect(dialog.getByRole("alert")).toContainText("Synthetic disk full");
  await expect(page.locator("h1")).toHaveText(base.title);
  await page.evaluate(()=>(window as any).journalFault="finish");
  await dialog.getByRole("button",{name:"Aplicar proposta"}).click();
  await expect(dialog.getByRole("alert")).toContainText("confirmação do registro falhou");
  await expect(page.locator("h1")).toHaveText(next.title);
  await expect(dialog.getByRole("button",{name:"Aplicar proposta"})).toBeDisabled();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("nexo.proposal-journal.v2")!).entries[0].state)).toBe("pending");
  await page.screenshot({path:info.outputPath("journal-confirmation-failure.png")});
  await page.evaluate(()=>(window as any).journalFault="none");
  await dialog.getByRole("button",{name:"Confirmar registro novamente"}).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("nexo.proposal-journal.v2")!).entries[0].state)).toBe("applied");
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("nexo.proposal-journal.v1")!))).toEqual({format:"nexo-proposal-journal",version:1,evicted:0,entries:[]});
  await page.keyboard.press("Control+z");
  await expect(page.locator("h1")).toHaveText(base.title); // One undo: retry never applied twice.
  await page.keyboard.press("Control+,");
  await page.getByRole("button",{name:"Geral",exact:true}).click();
  await page.locator("#settings-language").selectOption("en");
  await page.keyboard.press("Escape");
  await page.locator(".file-menu > summary").click();
  await page.getByRole("button",{name:"Proposal journal…",exact:true}).click();
  const journal=page.getByRole("dialog",{name:"Proposal journal",exact:true});
  await expect(journal.getByTestId("proposal-decision")).toContainText("Application recorded");
  await journal.getByTestId("proposal-decision").locator("summary").first().click();
  await expect(journal.getByText("Storage fault control",{exact:true})).toBeVisible();
  await expect(journal.getByRole("button",{name:"Export record",exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath("journal-english.png")});
});

test("corrupt proposal journal remains intact while its error is displayed",async({page})=>{
  await ready(page);
  await page.evaluate(()=>localStorage.setItem("nexo.proposal-journal.v2","broken journal"));
  await page.locator(".file-menu > summary").click();
  await page.getByRole("button",{name:"Registro de propostas…",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Registro de propostas",exact:true});
  await expect(dialog.getByRole("alert")).toContainText("arquivo foi preservado");
  expect(await page.evaluate(()=>localStorage.getItem("nexo.proposal-journal.v2"))).toBe("broken journal");
  await expect(page.locator("h1")).toHaveText("Balanço térmico de uma sala");
});

test("a full pending journal refuses application and preserves the model and all intentions",async({page})=>{
  test.setTimeout(90000);await ready(page);
  const response=await page.request.post("/__engine",{data:{protocol_version:1,id:"capacity-fixture",operation:"load_example",example_id:"complete"}});
  const base=(await response.json()).data.model;
  const candidate=structuredClone(base);candidate.title="Must not apply";
  const proposal={format:"nexo-change-proposal",version:1,project_id:base.id,author:"Synthetic",reason:"Capacity control",base_revision:"a".repeat(64),target_revision:"b".repeat(64),base_model:base,candidate_model:candidate};
  const stored=JSON.stringify({format:"nexo-proposal-journal",version:2,evicted:0,entries:Array.from({length:20},(_,i)=>({id:`pending${i}`,createdAt:"2026-10-24T10:00:00.000Z",updatedAt:"2026-10-24T10:00:00.000Z",state:"pending",proposal}))});
  await page.evaluate(raw=>localStorage.setItem("nexo.proposal-journal.v2",raw),stored);
  await page.getByLabel("Arquivo de proposta").setInputFiles({name:"capacity.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(proposal))});
  const review=page.getByRole("dialog",{name:"Revisar proposta",exact:true});
  await expect(review.getByRole("checkbox")).toBeVisible({timeout:20000});await review.getByRole("checkbox").check();
  await review.getByRole("button",{name:"Aplicar proposta",exact:true}).click();
  await expect(review.getByRole("alert")).toContainText("Registro cheio de decisões pendentes");
  await expect(page.locator("h1")).toHaveText(base.title);
  expect(await page.evaluate(()=>localStorage.getItem("nexo.proposal-journal.v2"))).toBe(stored);
  await review.getByRole("button",{name:"Cancelar",exact:true}).click();
  await page.locator(".file-menu > summary").click();await page.getByRole("button",{name:"Registro de propostas…",exact:true}).click();
  const journal=page.getByRole("dialog",{name:"Registro de propostas",exact:true});
  const first=journal.getByTestId("proposal-decision").first();await first.locator("summary").first().click();
  await expect(first.getByRole("button",{name:"Encerrar sem confirmação",exact:true})).toBeDisabled();
  await first.getByRole("checkbox").check();await first.getByRole("button",{name:"Encerrar sem confirmação",exact:true}).click();
  await expect(first).toHaveAttribute("data-state","unconfirmed");await expect(page.locator("h1")).toHaveText(base.title);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("nexo.proposal-journal.v2")!));
  expect(saved.entries).toHaveLength(20);expect(saved.entries[0].state).toBe("unconfirmed");expect(saved.entries.filter((e:any)=>e.state==="pending")).toHaveLength(19);
});
