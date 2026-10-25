import { expect, test } from "@playwright/test";
import { ready } from "./workspace-helpers";
import { RECOVERY_KEY } from "../../apps/desktop/src/recovery";

test.setTimeout(90000);
test("recovers an unsaved model and camera after interruption without restoring saved verdicts", async ({ page }) => {
  await ready(page);
  await page.getByTestId("status-project-name").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Renomear projeto" }).click();
  await page.getByLabel("Nome do projeto").fill("Modelo não salvo – recuperação");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+k");
  await page.getByLabel("Pesquisar no projeto").fill("U");
  await page.keyboard.press("Enter");
  const inspector = page.getByLabel("Detalhes da investigação");
  await inspector.getByLabel("Valor", { exact: true }).fill("0.7");
  await inspector.getByLabel("Fonte / procedência").fill("Entrada sintética para recuperação.");
  await inspector.getByRole("button", { name: "Aplicar alterações" }).click();
  await page.getByRole("button", { name: "Zoom real 100%" }).click();
  await page.getByRole("button", { name: "Aumentar zoom", exact: true }).click();
  await expect.poll(async () => {
    const text = await page.evaluate(key => localStorage.getItem(key), RECOVERY_KEY);
    return text ? JSON.parse(text).project.workspace.viewport?.camera.zoom : null;
  }).toBe(1.25);
  const before = JSON.parse((await page.evaluate(key => localStorage.getItem(key), RECOVERY_KEY))!);
  // A malicious extra verdict in local data must never become a current analysis.
  before.project.run = { outcome: "consistent", model_revision: "fake" };
  await page.evaluate(({ key, text }) => localStorage.setItem(key, text), { key: RECOVERY_KEY, text: JSON.stringify(before) });
  await page.reload();
  const banner = page.getByRole("status", { name: "Recuperação local" });
  await expect(banner).toContainText("Modelo não salvo – recuperação");
  await expect(page.locator("h1")).toHaveText("Balanço térmico de uma sala", { timeout: 20000 });
  let analyses = 0;
  page.on("request", request => { if (request.url().endsWith("/__engine") && request.postDataJSON()?.operation === "analyze") analyses++; });
  await banner.getByRole("button", { name: "Restaurar cópia" }).click();
  await expect(page.locator("h1")).toHaveText("Modelo não salvo – recuperação", { timeout: 20000 });
  await expect(page.getByTestId("zoom-level")).toHaveText("125%");
  await expect(page.getByTestId("finding-count")).toHaveText("—");
  expect(analyses).toBe(0);
  await page.keyboard.press("Control+k");
  await page.getByLabel("Pesquisar no projeto").fill("U");
  await page.keyboard.press("Enter");
  await expect(inspector.getByLabel("Valor", { exact: true })).toHaveValue("0.7");
  await expect(inspector.getByLabel("Fonte / procedência")).toHaveValue("Entrada sintética para recuperação.");
  await page.keyboard.press("F5");
  await expect(page.getByTestId("finding-count")).toHaveText("1", { timeout: 20000 });
  await page.keyboard.press("Control+k");
  await page.getByLabel("Pesquisar no projeto").fill("P_total");
  await page.keyboard.press("Enter");
  await expect(inspector).toContainText("2.600");
});

test("corrupt recovery is retained and a write failure is visible without losing the model", async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, "corrupt"), RECOVERY_KEY);
  await ready(page);
  const banner = page.getByRole("status", { name: "Recuperação local" });
  await expect(banner).toContainText("Não foi possível atualizar");
  expect(await page.evaluate(key => localStorage.getItem(key), RECOVERY_KEY)).toBe("corrupt");
  await banner.getByRole("button", { name: "Descartar cópia" }).click();
  await expect(banner).toBeHidden();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key: string, value: string) {
      if (key === "nexo.recovery.v1") throw new DOMException("Test quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.getByTestId("status-project-name").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Renomear projeto" }).click();
  await page.getByLabel("Nome do projeto").fill("Projeto preservado após falha");
  await page.keyboard.press("Enter");
  await expect(banner).toContainText("Não foi possível atualizar", { timeout: 10000 });
  await expect(page.locator("h1")).toHaveText("Projeto preservado após falha");
});


test("opening a file reports file IO without a fake analysis or cancellation control", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const runtime = window as unknown as { isTauri: boolean; __finishOpen: () => void;
      __TAURI_INTERNALS__: { metadata: { currentWindow: { label: string } }; invoke: (command: string) => Promise<null> } };
    runtime.isTauri = true;
    runtime.__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: "main" } }, invoke: command => {
      if (command === "open_project_file") return new Promise(resolve => { runtime.__finishOpen = () => resolve(null); });
      return Promise.resolve(null);
    } };
  });
  await page.keyboard.press("Control+o");
  await expect(page.locator(".status-engine-pill")).toHaveText("Abrindo projeto…");
  await expect(page.getByRole("button", { name: "Cancelar", exact: true })).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __finishOpen: () => void }).__finishOpen());
  await expect(page.locator(".status-engine-pill")).toHaveText("Motor pronto");
  await expect(page.getByTestId("finding-count")).toHaveText("—");
});
