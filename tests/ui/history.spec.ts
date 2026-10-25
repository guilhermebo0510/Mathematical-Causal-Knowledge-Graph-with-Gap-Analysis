import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { ready } from "./workspace-helpers";
import { HISTORY_KEY } from "../../apps/desktop/src/history";
import type { Run } from "../../apps/desktop/src/types";

test.setTimeout(90000);
async function analyze(page: import("@playwright/test").Page): Promise<Run> {
  const response = page.waitForResponse(r => r.url().endsWith("/__engine") && r.request().postDataJSON()?.operation === "analyze");
  await page.keyboard.press("F5");
  const run = (await (await response).json()).data as Run;
  await expect(page.getByTestId("finding-count")).toHaveText(String(run.counts.failed), {timeout:20000});
  return run;
}
async function history(page: import("@playwright/test").Page) {
  await page.getByRole("tab", {name:"Histórico de Execuções",exact:true}).click();
}
test("persistent history preserves revisions and input evidence without replacing current analysis", async ({ page }) => {
  await ready(page);
  const first = await analyze(page);
  await history(page);
  await expect(page.getByTestId("archive-entry")).toHaveCount(1);
  await page.keyboard.press("Control+k");
  await page.getByLabel("Pesquisar no projeto").fill("U");
  await page.keyboard.press("Enter");
  const inspector=page.getByLabel("Detalhes da investigação");
  await inspector.getByLabel("Valor",{exact:true}).fill("0.7");
  await inspector.getByLabel("Fonte / procedência").fill("Alteração sintética para nova revisão.");
  await inspector.getByRole("button",{name:"Aplicar alterações"}).click();
  const second=await analyze(page);
  expect(second.model_revision).not.toBe(first.model_revision);
  expect(second.values.P_total.value).toBe(2600);
  await history(page);
  await expect(page.getByTestId("archive-entry")).toHaveCount(2);
  let additionalAnalyses=0;
  page.on("request",request=>{if(request.url().endsWith("/__engine")&&request.postDataJSON()?.operation==="analyze") additionalAnalyses++;});
  await page.locator(`[data-testid="archive-entry"][data-revision="${first.model_revision}"]`).click();
  const evidence=page.getByRole("article",{name:"Evidência arquivada"});
  await expect(evidence).toContainText(first.model_revision);
  await expect(page.getByTestId("finding-count")).toHaveText("1");
  await expect(page.locator(`.status-bar [title="Revisão calculada: ${second.model_revision}"]`)).toBeVisible();
  const downloading=page.waitForEvent("download");
  await evidence.getByRole("button",{name:"Exportar evidência"}).click();
  const exported=JSON.parse(await readFile((await(await downloading).path())!,"utf8"));
  expect(exported.record.run.values.P_total.value).toBe(2200);
  expect(exported.record.model.variables.find((v:{id:string})=>v.id==="U").value).toBe(0.5);
  expect(exported.record.run.model_revision).toBe(first.model_revision);
  expect(additionalAnalyses).toBe(0);
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Balanço térmico de uma sala",{timeout:20000});
  await expect(page.getByTestId("finding-count")).toHaveText("—");
  await history(page);
  await expect(page.getByTestId("archive-entry")).toHaveCount(2);
  await expect(page.locator(".execution-row")).toContainText(["Arquivada","Arquivada"]);
});

test("a corrupt history stays intact, scientific results remain visible, and a retry can archive the actual response", async ({ page }) => {
  await page.addInitScript(key=>localStorage.setItem(key,"corrupt"),HISTORY_KEY);
  await ready(page);
  await analyze(page);
  await expect(page.getByTestId("finding-count")).toHaveText("0");
  await history(page);
  await expect(page.getByRole("alert")).toContainText("A análise atual foi preservada");
  expect(await page.evaluate(key=>localStorage.getItem(key),HISTORY_KEY)).toBe("corrupt");
  await page.evaluate(key=>localStorage.removeItem(key),HISTORY_KEY);
  await page.getByRole("button",{name:"Tentar novamente"}).click();
  await expect(page.getByTestId("archive-entry")).toHaveCount(1);
  await expect(page.getByRole("alert")).toBeHidden();
});
