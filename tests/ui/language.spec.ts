import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { ready } from "./workspace-helpers";
import type { RustViewportDebugApi } from "../../apps/desktop/src/GraphView";
import type { Run } from "../../apps/desktop/src/types";

test.setTimeout(90000);
async function language(page: Page, value: "en" | "pt-BR") {
  await page.keyboard.press("Control+,");
  await page.getByRole("button", { name: /^(General|Geral)$/ }).click();
  await page.locator("#settings-language").selectOption(value);
  await page.keyboard.press("Escape");
}
async function analyze(page: Page): Promise<Run> {
  const response = page.waitForResponse(r => r.url().endsWith("/__engine") && r.request().postDataJSON()?.operation === "analyze");
  await page.keyboard.press("F5");
  const result = await (await response).json();
  await expect(page.locator(".result-content")).toBeVisible({ timeout: 20000 });
  return result.data as Run;
}
async function save(page: Page) {
  const downloading = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  return JSON.parse(await readFile((await (await downloading).path())!, "utf8"));
}

test("switching language preserves project data, scientific results and GPU camera", async ({ page }) => {
  await ready(page);
  await page.getByTestId("status-project-name").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Renomear projeto" }).click();
  // This project title deliberately equals a translated UI message.
  await page.getByLabel("Nome do projeto").fill("Salvar projeto");
  await page.keyboard.press("Enter");
  const run = await analyze(page);
  const before = await save(page);
  const canvas = page.locator('[data-testid="graph-canvas"] canvas');
  const position = () => canvas.evaluate(el => {
    const api = (el as HTMLCanvasElement & { __nexoViewport: RustViewportDebugApi }).__nexoViewport;
    return { zoom: api.zoom, nodes: api.nodes.map(n => [n.id, n.screenX, n.screenY]) };
  });
  const camera = await position();
  let additionalAnalyses = 0;
  page.on("request", request => { if (request.url().endsWith("/__engine") && request.postDataJSON()?.operation === "analyze") additionalAnalyses++; });
  await language(page, "en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".file-menu > summary")).toHaveText("File");
  await expect(page.getByRole("button", { name: "Run verification", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Properties", exact: true })).toBeVisible();
  await expect(page.locator("h1")).toHaveText("Salvar projeto");
  await page.locator(".view-menu:not(.file-menu) > summary").click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Properties", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitemcheckbox", { name: "Graph navigator", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitemcheckbox", { name: "Explorer", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".result-content")).toContainText("Requirement met");
  await expect(page.locator(`.status-bar [title="Calculated revision: ${run.model_revision}"]`)).toBeVisible();
  expect(await position()).toEqual(camera);
  expect(additionalAnalyses).toBe(0);
  const after = await save(page);
  expect(after.model).toEqual(before.model);
  expect(after.workspace.viewport).toEqual(before.workspace.viewport);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".file-menu > summary")).toHaveText("File");
  await expect(page.locator("h1")).toHaveText("Balanço térmico de uma sala", { timeout: 20000 });
  await language(page, "pt-BR");
  await expect(page.locator(".file-menu > summary")).toHaveText("Arquivo");
});

test("English UI can build and verify arithmetic with a valid reference and a controlled defect", async ({ page }) => {
  await ready(page);
  await language(page, "en");
  await page.locator(".file-menu > summary").click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("New project");
  await page.keyboard.press("Control+k");
  await page.getByLabel("Search project", { exact: true }).fill("x");
  await page.keyboard.press("Enter");
  const inspector = page.getByLabel("Investigation details", { exact: true });
  await inspector.getByLabel("Value", { exact: true }).fill("12.5");
  await inspector.getByLabel("Source / provenance").fill("Synthetic arithmetic input.");
  await inspector.getByRole("button", { name: "Apply changes" }).click();
  async function create(kind: string, id: string, label: string, value?: string, expression?: string) {
    await page.getByRole("button", { name: `Add ${kind}`, exact: true }).click();
    await page.getByRole("button", { name: "New", exact: true }).click();
    const dialog = page.locator(".new-catalog-dialog");
    await dialog.getByLabel("Element identifier", { exact: true }).fill(id);
    await dialog.getByLabel("Element label", { exact: true }).fill(label);
    if (value !== undefined) await dialog.getByLabel("Reference value", { exact: true }).fill(value);
    if (expression !== undefined) await dialog.getByLabel("Equation expression").fill(expression);
    await dialog.getByLabel("Documentation", { exact: true }).fill("Synthetic test; no empirical measurement.");
    await dialog.getByRole("button", { name: "Create and add to catalog" }).click();
  }
  await create("variable", "result", "Resultado escrito pelo usuário");
  await create("equation", "eq_calc", "Arithmetic check", undefined, "(x * x) - x");
  await inspector.getByLabel("Calculated output", { exact: true }).selectOption("result");
  await inspector.getByRole("button", { name: "Apply changes" }).click();
  await create("reference", "reference_check", "Expected result", "143.75");
  await inspector.getByLabel("Observed quantity").selectOption("result");
  await inspector.getByLabel("Absolute tolerance").fill("0.0001");
  await inspector.getByRole("button", { name: "Apply changes" }).click();
  const valid = await analyze(page);
  expect(valid.values.result.value).toBe(143.75);
  expect(valid.counts.failed).toBe(0);
  expect(valid.counts.inconclusive).toBe(0);
  await inspector.getByLabel("Value", { exact: true }).fill("143");
  await inspector.getByRole("button", { name: "Apply changes" }).click();
  const defect = await analyze(page);
  expect(defect.model_revision).not.toBe(valid.model_revision);
  expect(defect.checks.some(check => check.rule_id === "residual" && check.status === "failed")).toBe(true);
  await expect(page.locator(".result-content")).toContainText("Prediction differs from reference");
  const document = await save(page);
  expect(document.model.variables.find((v: { id: string }) => v.id === "result").label).toBe("Resultado escrito pelo usuário");
  expect(document.model.equations[0].rhs.op).toBe("sub");
});

// Browser IPC stub: verifies shortcut arguments, not a native dialog or filesystem.
test("file shortcuts use the current language immediately after changing preferences", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const runtime = window as unknown as { isTauri: boolean; __TAURI_INTERNALS__: { metadata: { currentWindow: { label: string } }; invoke: (command: string, args: unknown) => Promise<null> }; __fileCalls: unknown[] };
    runtime.isTauri = true;
    runtime.__fileCalls = [];
    runtime.__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: "main" } }, invoke: async (command, args) => {
      if (command === "open_project_file" || command === "save_project_file") runtime.__fileCalls.push({ command, args });
      return null;
    } };
  });
  await language(page, "en");
  await page.keyboard.press("Control+o");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fileCalls: unknown[] }).__fileCalls)).toEqual([
    { command: "open_project_file", args: { language: "en" } }
  ]);
  await language(page, "pt-BR");
  await page.keyboard.press("Control+o");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fileCalls: unknown[] }).__fileCalls)).toEqual([
    { command: "open_project_file", args: { language: "en" } },
    { command: "open_project_file", args: { language: "pt-BR" } }
  ]);
});
