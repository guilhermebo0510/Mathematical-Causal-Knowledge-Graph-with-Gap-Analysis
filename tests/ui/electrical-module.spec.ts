import {expect,test,type Page} from "@playwright/test";
import {readFile,writeFile} from "node:fs/promises";
import {ready,enterModuleForTest} from "./workspace-helpers";
async function save(page:Page){const pending=page.waitForEvent("download");await page.locator(".file-menu > summary").click();await page.getByRole("button",{name:"Salvar projeto",exact:true}).click();return readFile((await(await pending).path())!,"utf8");}
async function analyze(page:Page){const response=page.waitForResponse(r=>r.url().endsWith("/__engine")&&r.request().postDataJSON()?.operation==="analyze");await page.keyboard.press("F5");const run=(await(await response).json()).data;await expect(page.getByRole("button",{name:"Executar verificação",exact:true})).toBeEnabled();return run;}
async function select(page:Page,id:string){await page.keyboard.press("Control+k");await page.getByLabel("Pesquisar no projeto").fill(id);await page.keyboard.press("Enter");}
test("electrical module preserves shared input, synthetic evidence and explicit dimensional failures",async({page},info)=>{
  test.setTimeout(180000);await ready(page);const fixture=await readFile("examples/circuito-resistivo-sintetico.json","utf8");
  await page.getByLabel("Arquivo do modelo").setInputFiles({name:"circuit.json",mimeType:"application/json",buffer:Buffer.from(fixture)});
  await expect(page.locator("h1")).toHaveText("Circuito resistivo sintético");
  const base=await analyze(page);expect(base.counts).toEqual({passed:9,failed:0,inconclusive:0});expect(base.values.V.value).toBe(6);expect(base.values.P.value).toBe(12);
  await page.locator(".file-menu > summary").click();await page.getByRole("button",{name:"Módulos…",exact:true}).click();const dialog=page.getByRole("dialog",{name:"Módulos",exact:true});await dialog.getByRole("button",{name:"Guardar modelo como módulo",exact:true}).click();await expect(dialog.getByLabel("Entrada I",{exact:true})).toBeVisible({timeout:20000});await dialog.getByLabel("Entrada I",{exact:true}).selectOption("I");await dialog.getByRole("button",{name:"Instanciar módulo",exact:true}).click();await expect(dialog).toBeHidden({timeout:20000});
  const control=await analyze(page);expect(control.counts).toEqual({passed:17,failed:0,inconclusive:0});expect(control.values.m1_V.value).toBe(6);expect(control.values.m1_P.value).toBe(12);
  await enterModuleForTest(page);const canvas=page.locator('[data-testid="graph-canvas"] canvas');await expect(canvas).toHaveAttribute("data-renderer","rust-wasm-webgl2");
  const ids=await canvas.evaluate(el=>(el as any).__nexoViewport.nodes.map((n:any)=>n.id));expect(ids).toContain("I");expect(ids).not.toContain("m1_I");expect(ids).not.toContain("V");
  const inspector=page.getByLabel("Detalhes da investigação");await select(page,"I");await expect(page.getByRole("navigation",{name:"Navegação do grupo",exact:true})).toBeVisible();await inspector.getByLabel("Valor",{exact:true}).fill("3");await inspector.getByRole("button",{name:"Aplicar alterações",exact:true}).click();
  const residual=await analyze(page);expect(residual.counts).toEqual({passed:13,failed:4,inconclusive:0});for(const id of ["V","m1_V"])expect(residual.values[id].value).toBe(9);for(const id of ["P","m1_P"])expect(residual.values[id].value).toBe(27);
  expect(residual.checks.filter((c:any)=>c.status==="failed").every((c:any)=>c.rule_id==="residual")).toBe(true);
  expect(residual.checks.find((c:any)=>c.node_ids.includes("m1_obs_power")).evidence).toContain("tolerância: 0.01 W");
  await page.keyboard.press("Control+z");await select(page,"I");await expect(inspector.getByLabel("Valor",{exact:true})).toHaveValue("2");await expect(page.getByRole("navigation",{name:"Navegação do grupo",exact:true})).toBeVisible();
  await select(page,"R");await expect(inspector.getByLabel("Rótulo",{exact:true})).toHaveValue("Resistência");await expect(page.getByRole("navigation",{name:"Navegação do grupo",exact:true})).toBeHidden();await inspector.getByLabel("Unidade",{exact:true}).fill("s");await inspector.getByRole("button",{name:"Aplicar alterações",exact:true}).click();const dimensions=await analyze(page);
  expect(dimensions.counts).toEqual({passed:12,failed:2,inconclusive:2});expect(dimensions.values.V).toBeUndefined();expect(dimensions.values.P).toBeUndefined();expect(dimensions.values.m1_P.value).toBe(12);
  expect(dimensions.checks.some((c:any)=>c.rule_id==="dimensions"&&c.status==="failed"&&c.node_ids.includes("eq_voltage"))).toBe(true);expect(dimensions.checks.filter((c:any)=>c.rule_id==="residual"&&c.status==="inconclusive")).toHaveLength(2);
  const text=await save(page),saved=JSON.parse(text);expect(saved.model.observations).toContainEqual({...JSON.parse(fixture).observations[1],id:"m1_obs_power",variable_id:"m1_P"});expect(saved.run).toBeUndefined();
  await page.reload();await expect(page.locator("h1")).toBeVisible();await page.getByLabel("Arquivo do modelo").setInputFiles({name:"circuit.nexo",mimeType:"application/json",buffer:Buffer.from(text)});await expect(page.getByText("Projeto aberto · reexecute as verificações",{exact:true})).toBeVisible({timeout:40000});expect((await analyze(page)).counts).toEqual(dimensions.counts);
  await writeFile(info.outputPath("electrical-module.nexo"),text);await writeFile(info.outputPath("runs.json"),JSON.stringify({base,control,residual,dimensions},null,2));
});
