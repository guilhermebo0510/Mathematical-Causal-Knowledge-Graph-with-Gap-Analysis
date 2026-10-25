import {expect,test,type Page} from "@playwright/test";
import {readFile,writeFile} from "node:fs/promises";
import {ready} from "./workspace-helpers";
import {createModuleForTest,enterModuleForTest} from "./workspace-helpers";
import {inferModule,instantiateModule} from "../../apps/desktop/src/modules";
async function save(page:Page){const pending=page.waitForEvent("download");await page.locator(".file-menu > summary").click();await page.getByRole("button",{name:"Salvar projeto",exact:true}).click();return await readFile((await(await pending).path())!,"utf8");}
async function fileMenu(page:Page,name:string){await page.locator(".file-menu > summary").click();await page.getByRole("button",{name,exact:true}).click();}

test("long project titles can be captured twice with distinguishable definitions and exported without model truncation",async({page},info)=>{
  test.setTimeout(120000);await ready(page);const title="Controle sintético – "+"nome longo do projeto ".repeat(10);
  await page.getByTestId("status-project-name").click({button:"right"});await page.getByRole("menuitem",{name:"Renomear projeto",exact:true}).click();await page.getByLabel("Nome do projeto",{exact:true}).fill(title);await page.keyboard.press("Enter");await expect(page.locator("h1")).toHaveText(title.trim());
  const before=JSON.parse(await save(page));await fileMenu(page,"Módulos…");const dialog=page.getByRole("dialog",{name:"Módulos",exact:true}),library=dialog.getByLabel("Biblioteca",{exact:true});
  await dialog.getByRole("button",{name:"Guardar modelo como módulo",exact:true}).click();await expect(library.locator("option")).toHaveCount(2,{timeout:20000});await dialog.getByRole("button",{name:"Guardar modelo como módulo",exact:true}).click();await expect(library.locator("option")).toHaveCount(3,{timeout:20000});
  const definitions=await library.locator('option:not([value=""])').evaluateAll(elements=>elements.map(el=>({id:(el as HTMLOptionElement).value,text:el.textContent!})));
  expect(definitions[0].text).not.toBe(definitions[1].text);for(const d of definitions)expect(d.text).toContain(d.id);
  const pending=page.waitForEvent("download");await dialog.getByRole("button",{name:"Exportar módulo",exact:true}).click();const portable=await readFile((await(await pending).path())!,"utf8"),exported=JSON.parse(portable);
  expect(exported.model.title).toBe(title.trim());expect(exported.label.length).toBeLessThanOrEqual(120);expect(exported.label.endsWith("…")).toBe(true);
  await page.getByLabel("Arquivo de módulo",{exact:true}).setInputFiles({name:"duplicate.nexo-module.json",mimeType:"application/json",buffer:Buffer.from(portable)});await expect(dialog.getByRole("alert")).toHaveText("Identificador de módulo em conflito.",{timeout:20000});await expect(library.locator("option")).toHaveCount(3);
  await dialog.getByLabel("Nome do módulo",{exact:true}).fill("   ");await expect(dialog.getByRole("button",{name:"Renomear definição",exact:true})).toBeDisabled();
  await dialog.getByLabel("Nome do módulo",{exact:true}).fill("Definição de referência");await dialog.getByRole("button",{name:"Renomear definição",exact:true}).click();await expect(library.locator("option:checked")).toHaveText("Definição de referência");const finalLabels=await library.locator('option:not([value=""])').allTextContents();
  await dialog.getByRole("button",{name:"Fechar",exact:true}).click();const text=await save(page),saved=JSON.parse(text);expect(saved.model).toEqual(before.model);expect(saved.revisionHistory).toEqual(before.revisionHistory);expect(saved.modules).toHaveLength(2);
  await page.reload();await expect(page.locator("h1")).toBeVisible({timeout:20000});await page.getByLabel("Arquivo do modelo").setInputFiles({name:"long-title.nexo",mimeType:"application/json",buffer:Buffer.from(text)});await expect(page.getByText("Projeto aberto · reexecute as verificações",{exact:true})).toBeVisible({timeout:40000});await fileMenu(page,"Módulos…");await expect(library.locator("option")).toHaveCount(3);expect(await library.locator('option:not([value=""])').allTextContents()).toEqual(finalLabels);
  await writeFile(info.outputPath("long-title.nexo"),text);await writeFile(info.outputPath("long-title.nexo-module.json"),portable);
});

test("module port editor stays readable in graphite and a narrow window",async({page},info)=>{
  test.setTimeout(90000);await ready(page);await fileMenu(page,"Módulos…");const dialog=page.getByRole("dialog",{name:"Módulos",exact:true});await dialog.getByRole("button",{name:"Guardar modelo como módulo",exact:true}).click();await expect(dialog.getByLabel("Entrada U",{exact:true})).toBeVisible({timeout:20000});await dialog.getByRole("button",{name:"Fechar",exact:true}).click();
  await page.getByRole("button",{name:"Configurações",exact:true}).click();const settings=page.getByRole("dialog",{name:"Configurações",exact:true});await settings.getByRole("button",{name:"Aparência",exact:true}).click();await settings.getByLabel("Tema visual").selectOption("dark");await page.keyboard.press("Escape");await page.setViewportSize({width:900,height:720});await fileMenu(page,"Módulos…");
  const grid=dialog.locator(".module-port-grid");await expect(grid.locator("label")).toHaveCount(6);
  const color=await grid.locator("label").first().evaluate(el=>getComputedStyle(el).backgroundColor);const channels=color.match(/\d+/g)!.slice(0,3).map(Number);expect(Math.max(...channels)).toBeLessThan(75);expect(Math.max(...channels)-Math.min(...channels)).toBeLessThan(4);
  const portBoxes=await grid.locator("label").evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));expect(portBoxes[0].y).toBe(portBoxes[1].y);expect(portBoxes[0].x+portBoxes[0].width).toBeLessThan(portBoxes[1].x);
  await page.screenshot({path:info.outputPath("module-ports-graphite.png")});await page.setViewportSize({width:500,height:720});
  const narrow=await grid.locator("label").evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));for(let i=1;i<narrow.length;i++){expect(narrow[i].x).toBe(narrow[0].x);expect(narrow[i].y).toBeGreaterThanOrEqual(narrow[i-1].y+narrow[i-1].height);}
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:info.outputPath("module-ports-narrow.png")});
});

test("removing module definitions frees a full library while preserving instances and scientific history",async({page},info)=>{
  test.setTimeout(150000);await ready(page);const project=JSON.parse(await save(page));const template={...inferModule(project.model,"Library capacity control"),id:"module_0"};
  const instance=instantiateModule(project.model,template,"kept",{});project.model=instance.model;project.groups=[instance.group];project.modules=Array.from({length:10},(_,i)=>({...structuredClone(template),id:`module_${i}`,label:`Definition ${i}`}));
  await page.reload();await expect(page.locator("h1")).toBeVisible({timeout:20000});await page.getByLabel("Arquivo do modelo").setInputFiles({name:"full-library.nexo",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(project))});
  await expect(page.getByText("Projeto aberto · reexecute as verificações",{exact:true})).toBeVisible({timeout:30000});await page.keyboard.press("F5");await expect(page.getByTestId("finding-count")).toHaveText("0",{timeout:30000});await expect(page.getByRole("button",{name:"Executar verificação",exact:true})).toBeEnabled();
  await fileMenu(page,"Módulos…");const dialog=page.getByRole("dialog",{name:"Módulos",exact:true}),library=dialog.getByLabel("Biblioteca",{exact:true});await library.selectOption("module_0");
  await dialog.getByRole("button",{name:"Guardar modelo como módulo",exact:true}).click();await expect(dialog.getByRole("alert")).toHaveText("A biblioteca aceita até 10 módulos por projeto.",{timeout:20000});
  await dialog.getByRole("button",{name:"Remover definição",exact:true}).click();await expect(library.locator("option")).toHaveCount(10);await expect(dialog.getByRole("status")).toContainText("Instâncias preservadas.");
  await dialog.getByRole("button",{name:"Restaurar definição",exact:true}).click();await expect(library.locator("option")).toHaveCount(11);await expect(library).toHaveValue("module_0");
  await dialog.getByRole("button",{name:"Remover definição",exact:true}).click();await dialog.getByRole("button",{name:"Guardar modelo como módulo",exact:true}).click();await expect(library.locator("option")).toHaveCount(11,{timeout:20000});
  await dialog.getByRole("button",{name:"Restaurar definição",exact:true}).click();await expect(dialog.getByRole("alert")).toHaveText("A biblioteca aceita até 10 módulos por projeto.");await expect(library.locator('option[value="module_0"]')).toHaveCount(0);
  await page.screenshot({path:info.outputPath("module-library.png")});await dialog.getByRole("button",{name:"Fechar",exact:true}).click();await expect(page.getByTestId("finding-count")).toHaveText("0");
  const text=await save(page),saved=JSON.parse(text);expect(saved.modules).toHaveLength(10);expect(saved.model).toEqual(project.model);expect(saved.groups).toEqual(project.groups);expect(saved.revisionHistory).toEqual(project.revisionHistory);expect(saved.groups[0].moduleId).toBe("module_0");expect(saved.modules.some((m:any)=>m.id==="module_0")).toBe(false);
  await page.reload();await expect(page.locator("h1")).toBeVisible({timeout:20000});await page.getByLabel("Arquivo do modelo").setInputFiles({name:"removed-definition.nexo",mimeType:"application/json",buffer:Buffer.from(text)});await expect(page.getByText("Projeto aberto · reexecute as verificações",{exact:true})).toBeVisible({timeout:30000});await page.keyboard.press("F5");await expect(page.getByTestId("finding-count")).toHaveText("0",{timeout:30000});
  await writeFile(info.outputPath("library-preserved-instances.nexo"),text);
});

test("large module project bounds edit history and reopens the most recent undo and redo",async({page},info)=>{
  test.setTimeout(240000);await ready(page);const project=JSON.parse(await save(page));const template=inferModule(project.model,"History scale control");
  const bindings=Object.fromEntries(template.inputs.map(id=>[id,id]));project.modules=[template];project.groups=[];
  for(let i=1;i<=14;i++){const next=instantiateModule(project.model,template,`h${i}`,bindings);project.model=next.model;project.groups.push(next.group);}
  await page.reload();await expect(page.locator("h1")).toBeVisible({timeout:20000});await page.getByLabel("Arquivo do modelo").setInputFiles({name:"history-scale.nexo",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(project))});
  await expect(page.getByText("Projeto aberto · reexecute as verificações",{exact:true})).toBeVisible({timeout:30000});
  for(let i=1;i<=32;i++){
    await page.getByTestId("status-project-name").click({button:"right"});await page.getByRole("menuitem",{name:"Renomear projeto",exact:true}).click();await page.getByLabel("Nome do projeto",{exact:true}).fill(`Scale revision ${i}`);await page.keyboard.press("Enter");await expect(page.locator("h1")).toHaveText(`Scale revision ${i}`);
  }
  const text=await save(page),saved=JSON.parse(text),history=saved.revisionHistory;
  expect(history.evicted).toBeGreaterThan(0);expect(history.undo.length).toBeGreaterThan(0);expect(history.undo.length).toBeLessThanOrEqual(30);expect(Buffer.byteLength(JSON.stringify(history))).toBeLessThanOrEqual(600000);expect(Buffer.byteLength(text)).toBeLessThanOrEqual(2000000);
  await page.reload();await expect(page.locator("h1")).toBeVisible({timeout:20000});await page.getByLabel("Arquivo do modelo").setInputFiles({name:"bounded-history.nexo",mimeType:"application/json",buffer:Buffer.from(text)});
  await expect(page.getByText("Projeto aberto · reexecute as verificações",{exact:true})).toBeVisible({timeout:60000});await page.keyboard.press("Control+z");await expect(page.locator("h1")).toHaveText("Scale revision 31");await page.keyboard.press("Control+Shift+z");await expect(page.locator("h1")).toHaveText("Scale revision 32");
  await writeFile(info.outputPath("bounded-history.nexo"),text);await writeFile(info.outputPath("retention-summary.json"),JSON.stringify({nodes:156,undo:history.undo.length,redo:history.redo.length,events:history.events.length,evicted:history.evicted,historyBytes:Buffer.byteLength(JSON.stringify(history)),projectBytes:Buffer.byteLength(text)},null,2));
});

test("fourteen shared thermal modules retain independent evidence and refuse the next list overflow",async({page},info)=>{
  test.setTimeout(180000);await ready(page);const project=JSON.parse(await save(page));const template=inferModule(project.model,"Thermal scale control");
  const bindings=Object.fromEntries(template.inputs.map(id=>[id,id]));project.modules=[template];project.groups=[];
  for(let i=1;i<=13;i++){const next=instantiateModule(project.model,template,`scale${i}`,bindings);project.model=next.model;project.groups.push(next.group);}
  await page.reload();await expect(page.locator("h1")).toBeVisible({timeout:20000});await page.getByLabel("Arquivo do modelo").setInputFiles({name:"scale.nexo",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(project))});
  await expect(page.getByText("Projeto aberto · reexecute as verificações",{exact:true})).toBeVisible({timeout:30000});
  async function openModule(prefix:string){await fileMenu(page,"Módulos…");const d=page.getByRole("dialog",{name:"Módulos",exact:true});await d.getByLabel("Biblioteca",{exact:true}).selectOption(template.id);await d.getByLabel("Prefixo da instância").fill(prefix);for(const input of template.inputs)await d.getByLabel(`Entrada ${input}`,{exact:true}).selectOption(input);return d;}
  let dialog=await openModule("scale14");await dialog.getByRole("button",{name:"Instanciar módulo",exact:true}).click();await expect(dialog).toBeHidden({timeout:20000});
  const response=page.waitForResponse(r=>r.url().endsWith("/__engine")&&r.request().postDataJSON()?.operation==="analyze");await page.keyboard.press("F5");const run=(await(await response).json()).data;
  expect(run.counts).toEqual({passed:136,failed:0,inconclusive:0});expect(run.values.P_total.value).toBe(2200);for(let i=1;i<=14;i++)expect(run.values[`scale${i}_P_total`].value).toBe(2200);
  const accepted=JSON.parse(await save(page));expect(accepted.groups).toHaveLength(14);expect(accepted.model.requirements).toHaveLength(30);
  dialog=await openModule("scale15");await dialog.getByRole("button",{name:"Instanciar módulo",exact:true}).click();await expect(dialog.getByRole("alert")).toHaveText("Módulo excede o limite de 30 requisitos.");await dialog.getByRole("button",{name:"Fechar",exact:true}).click();
  const unchanged=JSON.parse(await save(page));expect(unchanged.model).toEqual(accepted.model);expect(unchanged.revisionHistory).toEqual(accepted.revisionHistory);expect(unchanged.groups).toEqual(accepted.groups);
  await writeFile(info.outputPath("scale-14-modules.nexo"),JSON.stringify(unchanged,null,2));await writeFile(info.outputPath("scientific-run.json"),JSON.stringify(run,null,2));
});
test("shared module input propagates a planted fault and a finding reveals collapsed members",async({page})=>{
  test.setTimeout(180000);await ready(page);await fileMenu(page,"Módulos…");
  const modules=page.getByRole("dialog",{name:"Módulos",exact:true});
  await modules.getByRole("button",{name:"Guardar modelo como módulo",exact:true}).click();
  await expect(modules.getByLabel("Entrada U",{exact:true})).toBeVisible({timeout:20000});
  await expect(modules.getByLabel("Entrada U",{exact:true}).locator('option[value="A"]')).toHaveCount(0);
  await modules.getByLabel("Entrada U",{exact:true}).selectOption("U");
  await modules.getByRole("button",{name:"Instanciar módulo",exact:true}).click();await expect(modules).toBeHidden({timeout:20000});
  async function analyze(){const response=page.waitForResponse(r=>r.url().endsWith("/__engine")&&r.request().postDataJSON()?.operation==="analyze");await page.keyboard.press("F5");return (await(await response).json()).data;}
  const control=await analyze();expect(control.counts).toEqual({passed:19,failed:0,inconclusive:0});
  expect(control.values.P_total.value).toBe(2200);expect(control.values.m1_P_total.value).toBe(2200);
  const saved=JSON.parse(await save(page));expect(saved.model.variables.some((v:any)=>v.id==="m1_U")).toBe(false);expect(saved.groups[0].nodeIds).not.toContain("U");
  await page.keyboard.press("Control+k");await page.getByLabel("Pesquisar no projeto").fill("U");await page.keyboard.press("Enter");
  const inspector=page.getByLabel("Detalhes da investigação");await expect(inspector.getByLabel("Valor",{exact:true})).toHaveValue("0.5");
  await inspector.getByLabel("Valor",{exact:true}).fill("0.6");await inspector.getByRole("button",{name:"Aplicar alterações",exact:true}).click();
  const fault=await analyze();expect(fault.counts.failed).toBe(2);expect(fault.counts.inconclusive).toBe(0);expect(fault.values.P_total.value).toBe(2400);expect(fault.values.m1_P_total.value).toBe(2400);
  await fileMenu(page,"Grupos…");const groups=page.getByRole("dialog",{name:"Grupos",exact:true});await groups.getByTestId("model-group").locator("summary").click();await groups.getByRole("button",{name:"Recolher grupo",exact:true}).click();await groups.getByRole("button",{name:"Fechar",exact:true}).click();
  const canvas=page.locator('[data-testid="graph-canvas"] canvas');await expect.poll(()=>canvas.evaluate(el=>(el as any).__nexoViewport.nodeCount)).toBe(17);
  await page.getByRole("button",{name:"Ocultar propriedades para a direita",exact:true}).click();await expect(inspector).toBeHidden();
  await page.getByRole("tab",{name:"Resultados",exact:true}).click();await page.getByRole("button",{name:/Previsão diverge da referência/}).last().click();
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText("2400 W");await expect.poll(()=>canvas.evaluate(el=>(el as any).__nexoViewport.nodeCount)).toBe(31);
  const persisted=await save(page);expect(JSON.parse(persisted).groups[0].collapsed).toBe(false);
  await page.reload();await expect(page.locator("h1")).toBeVisible({timeout:20000});
  await page.getByLabel("Arquivo do modelo").setInputFiles({name:"shared-input.nexo",mimeType:"application/json",buffer:Buffer.from(persisted)});
  await expect(page.getByText("Projeto aberto · reexecute as verificações",{exact:true})).toBeVisible({timeout:40000});
  await enterModuleForTest(page);await expect.poll(()=>canvas.evaluate(el=>(el as any).__nexoViewport.nodeCount)).toBe(16);
  const members=await canvas.evaluate(el=>(el as any).__nexoViewport.nodes.map((n:any)=>n.id));expect(members).toContain("U");expect(members).not.toContain("m1_U");expect(members).not.toContain("P_total");
  await page.keyboard.press("Control+z");const undone=await analyze();expect(undone.counts.failed).toBe(0);expect(undone.values.m1_P_total.value).toBe(2200);
  await page.keyboard.press("Control+Shift+z");const redone=await analyze();expect(redone.counts.failed).toBe(2);expect(redone.values.P_total.value).toBe(2400);expect(redone.values.m1_P_total.value).toBe(2400);
  const final=JSON.parse(await save(page));expect(final.model.equations.find((e:any)=>e.id==="m1_eq_wall").rhs.args[0].var).toBe("U");
  expect(final.groups[0].nodeIds).not.toContain("U");expect(final.workspace.activeGroup).toBe(final.groups[0].id);
});

test("module group capacity refuses the whole edit and leaves a saveable project",async({page})=>{
  test.setTimeout(120000);await ready(page);const project=JSON.parse(await save(page));
  project.groups=Array.from({length:60},(_,i)=>({id:`g_limit_${i}`,label:`Group ${i}`,nodeIds:[`extra_${i}`],collapsed:false}));
  project.model.variables.push(...Array.from({length:60},(_,i)=>({id:`extra_${i}`,label:`Extra ${i}`,unit:"1",value:1,source:"Synthetic capacity control"})));
  project.modules=[{format:"nexo-module",version:1,id:"tiny",label:"Tiny",inputs:["x"],outputs:[],model:{...project.model,variables:[{id:"x",label:"x",unit:"1",value:1,source:"Synthetic"}],equations:[],assumptions:[],requirements:[],observations:[]}}];
  await page.reload();await expect(page.locator("h1")).toBeVisible({timeout:20000});await page.getByLabel("Arquivo do modelo").setInputFiles({name:"capacity.nexo",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(project))});
  await expect(page.getByText("Projeto aberto · reexecute as verificações",{exact:true})).toBeVisible({timeout:30000});
  await fileMenu(page,"Módulos…");const dialog=page.getByRole("dialog",{name:"Módulos",exact:true});await dialog.getByLabel("Biblioteca",{exact:true}).selectOption("tiny");await dialog.getByRole("button",{name:"Instanciar módulo",exact:true}).click();
  await expect(dialog.getByRole("alert")).toHaveText("Grupos inválidos.",{timeout:20000});await dialog.getByRole("button",{name:"Fechar",exact:true}).click();
  const unchanged=JSON.parse(await save(page));expect(unchanged.model).toEqual(project.model);expect(unchanged.groups).toEqual(project.groups);expect(unchanged.revisionHistory).toEqual(project.revisionHistory);
});
test("edit and undo history survives project reopening with redo and no saved approval",async({page})=>{
  test.setTimeout(150000);await ready(page);
  await page.getByTestId("status-project-name").click({button:"right"});await page.getByRole("menuitem",{name:"Renomear projeto"}).click();await page.getByLabel("Nome do projeto").fill("Revisão persistida");await page.keyboard.press("Enter");
  await page.keyboard.press("Control+z");const text=await save(page);const saved=JSON.parse(text);
  expect(saved.revisionHistory.events.map((e:any)=>e.kind)).toEqual(["edit","undo"]);expect(saved.revisionHistory.redo).toHaveLength(1);expect(saved.run).toBeUndefined();
  await page.reload();await expect(page.locator("h1")).toBeVisible({timeout:20000});
  await page.getByLabel("Arquivo do modelo").setInputFiles({name:"history.nexo",mimeType:"application/json",buffer:Buffer.from(text)});
  await expect(page.getByText("Projeto aberto · reexecute as verificações",{exact:true})).toBeVisible({timeout:30000});
  await expect(page.getByRole("button",{name:"Refazer ",exact:false})).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");await expect(page.locator("h1")).toHaveText("Revisão persistida",{timeout:30000});
  await page.getByText("Editar",{exact:true}).first().click();await page.getByRole("button",{name:"Histórico de edições…",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Histórico de edições",exact:true}).getByTestId("revision-event")).toHaveCount(3);
});
test("module creates real nodes and group collapse preserves analysis, saves and reopens",async({page},info)=>{
  test.setTimeout(180000);await ready(page);await fileMenu(page,"Módulos…");
  const modules=page.getByRole("dialog",{name:"Módulos",exact:true});await modules.getByRole("button",{name:"Guardar modelo como módulo",exact:true}).click();
  await expect(modules.getByLabel("Prefixo da instância")).toBeVisible({timeout:20000});await modules.getByRole("button",{name:"Instanciar módulo",exact:true}).click();
  await expect(modules).toBeHidden({timeout:20000});await page.keyboard.press("F5");await expect(page.getByTestId("finding-count")).toHaveText("0",{timeout:30000});
  const layout=await page.locator('[data-testid="graph-canvas"] canvas').evaluate(el=>(el as any).__nexoViewport);
  for(let i=0;i<layout.nodes.length;i++)for(let j=i+1;j<layout.nodes.length;j++){
    const a=layout.nodes[i],b=layout.nodes[j];expect(Math.abs(a.screenX-b.screenX)>=228*layout.zoom-1||Math.abs(a.screenY-b.screenY)>=96*layout.zoom-1).toBe(true);
  }
  await page.getByRole("button",{name:"Organizar grafo visível",exact:true}).click();await expect(page.getByTestId("finding-count")).toHaveText("0");
  const expanded=JSON.parse(await save(page));expect(expanded.model.variables.some((v:any)=>v.id==="m1_P_total")).toBe(true);expect(expanded.modules).toHaveLength(1);expect(expanded.groups).toHaveLength(1);
  await fileMenu(page,"Grupos…");const groups=page.getByRole("dialog",{name:"Grupos",exact:true});await groups.getByTestId("model-group").locator("summary").click();await groups.getByRole("button",{name:"Recolher grupo",exact:true}).click();await groups.getByRole("button",{name:"Fechar",exact:true}).click();
  await expect(page.getByTestId("finding-count")).toHaveText("0");const collapsedText=await save(page);const collapsed=JSON.parse(collapsedText);
  expect(collapsed.model).toEqual(expanded.model);expect(collapsed.groups[0].collapsed).toBe(true);expect(collapsed.workspace.viewport.positions.some((p:any)=>p.id.startsWith("@group:"))).toBe(true);
  for(const position of expanded.workspace.viewport.positions)expect(collapsed.workspace.viewport.positions.find((p:any)=>p.id===position.id)).toEqual(position);
  await page.screenshot({path:info.outputPath("collapsed-module.png")});
  await writeFile(info.outputPath("projeto-validado.nexo"),collapsedText,"utf8");
  const beforeContext=await page.locator('[data-testid="graph-canvas"] canvas').evaluate(el=>(el as any).__nexoViewport.zoom);
  await fileMenu(page,"Grupos…");await groups.getByTestId("model-group").locator("summary").click();await groups.getByRole("button",{name:"Entrar no grupo",exact:true}).click();
  await expect(page.getByRole("navigation",{name:"Navegação do grupo",exact:true})).toBeVisible();await page.getByRole("button",{name:"Modelo completo",exact:true}).click();await expect(page.getByRole("navigation",{name:"Navegação do grupo",exact:true})).toBeHidden();
  await expect.poll(()=>page.locator('[data-testid="graph-canvas"] canvas').evaluate(el=>(el as any).__nexoViewport.zoom)).toBeCloseTo(beforeContext,4);
  await page.reload();await expect(page.locator("h1")).toBeVisible({timeout:20000});await page.getByLabel("Arquivo do modelo").setInputFiles({name:"group.nexo",mimeType:"application/json",buffer:Buffer.from(collapsedText)});
  await fileMenu(page,"Grupos…");await expect(groups.getByTestId("model-group")).toHaveCount(1,{timeout:40000});await groups.getByTestId("model-group").locator("summary").click();await expect(groups.getByRole("button",{name:"Expandir grupo",exact:true})).toBeVisible();
});

test("a module cannot apply from a stale callback while a scientific analysis is active",async({page})=>{
  test.setTimeout(120000);await ready(page);await fileMenu(page,"Módulos…");
  const modules=page.getByRole("dialog",{name:"Módulos",exact:true});await modules.getByRole("button",{name:"Guardar modelo como módulo",exact:true}).click();
  await expect(modules.getByLabel("Prefixo da instância")).toBeVisible({timeout:20000});
  let releaseImport!:()=>void,releaseAnalysis!:()=>void;
  const importGate=new Promise<void>(resolve=>releaseImport=resolve),analysisGate=new Promise<void>(resolve=>releaseAnalysis=resolve);
  await page.route("**/__engine",async route=>{const op=route.request().postDataJSON().operation;if(op==="import_model")await importGate;if(op==="analyze")await analysisGate;await route.continue();});
  try{
    const pendingImport=page.waitForRequest(r=>r.url().endsWith("/__engine")&&r.postDataJSON()?.operation==="import_model");
    await modules.getByRole("button",{name:"Instanciar módulo",exact:true}).click();await pendingImport;
    const pendingAnalysis=page.waitForRequest(r=>r.url().endsWith("/__engine")&&r.postDataJSON()?.operation==="analyze");
    await page.keyboard.press("F5");await pendingAnalysis;releaseImport();
    await expect(modules.getByRole("alert")).toContainText("Não foi possível aplicar a proposta",{timeout:30000});
    await expect(page.locator('.status-stat-pill[title="Total de nós no grafo"] strong')).toHaveText("16");
    releaseAnalysis();await expect(page.getByTestId("finding-count")).toHaveText("0",{timeout:30000});
  }finally{releaseImport();releaseAnalysis();}
});

test("a component created inside a module context is real, grouped, undoable and persistent",async({page})=>{
  test.setTimeout(150000);await ready(page);await createModuleForTest(page);await enterModuleForTest(page);
  await page.getByRole("button",{name:"Adicionar variável",exact:true}).click();await page.getByRole("button",{name:"Novo",exact:true}).click();
  const editor=page.locator(".new-catalog-dialog");await editor.getByLabel("Identificador do elemento").fill("nested_extra");await editor.getByLabel("Rótulo do elemento").fill("Componente real");await editor.getByLabel("Valor inicial").fill("2");
  await editor.getByRole("button",{name:"Criar e Adicionar ao Catálogo",exact:true}).click();await expect(editor).toBeHidden();
  const canvas=page.locator('[data-testid="graph-canvas"] canvas');await expect.poll(()=>canvas.evaluate(el=>(el as any).__nexoViewport.nodeCount)).toBe(17);
  const text=await save(page),saved=JSON.parse(text);expect(saved.model.variables.find((v:any)=>v.id==="nested_extra").value).toBe(2);expect(saved.groups[0].nodeIds).toContain("nested_extra");
  expect(saved.workspace.activeGroup).toBe(saved.groups[0].id);
  await page.keyboard.press("Control+z");await expect.poll(()=>canvas.evaluate(el=>(el as any).__nexoViewport.nodeCount)).toBe(16);
  await page.keyboard.press("Control+Shift+z");await expect.poll(()=>canvas.evaluate(el=>(el as any).__nexoViewport.nodeCount)).toBe(17);
  await page.reload();await expect(page.locator("h1")).toBeVisible({timeout:20000});await page.getByLabel("Arquivo do modelo").setInputFiles({name:"component.nexo",mimeType:"application/json",buffer:Buffer.from(text)});
  await expect(page.getByText("Projeto aberto · reexecute as verificações",{exact:true})).toBeVisible({timeout:40000});await expect(page.getByRole("navigation",{name:"Navegação do grupo",exact:true})).toBeVisible();await expect.poll(()=>canvas.evaluate(el=>(el as any).__nexoViewport.nodeCount)).toBe(17);
});
