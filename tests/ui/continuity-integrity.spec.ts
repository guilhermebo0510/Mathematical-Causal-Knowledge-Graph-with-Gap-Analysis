import { test, expect } from "@playwright/test";
import { ready } from "./workspace-helpers";
import type { RustViewportDebugApi } from "../../apps/desktop/src/GraphView";

test("one pointer drag creates one node at the release point after zoom and pan", async ({ page }) => {
  await ready(page);
  const canvas = page.locator('[data-testid="graph-canvas"] canvas');
  await page.getByRole("button", { name: "Zoom real 100%" }).click();
  await page.getByRole("button", { name: "Aumentar zoom", exact: true }).click();
  // Pan using the actual canvas tool, then return to selection.
  await page.getByRole("button", { name: "Mover viewport", exact: true }).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 100, box.y + 90);
  await page.mouse.down();
  await page.mouse.move(box.x + 170, box.y + 130, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Selecionar elementos", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar variável", exact: true }).click();
  const drawer = page.getByTestId("node-library-drawer");
  await expect(drawer.getByRole("button", { name: "Inserir", exact: true })).toHaveCount(0);
  const card = drawer.locator(".drawer-card").first();
  await card.click();
  const state = () => canvas.evaluate(el => (el as HTMLCanvasElement & { __nexoViewport: RustViewportDebugApi }).__nexoViewport);
  expect((await state()).nodeCount).toBe(16);
  const before = await state();
  const target = { x: box.x + 230, y: box.y + 200 };
  await card.hover();
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 15 });
  await expect(page.locator(".library-drag-ghost")).toBeVisible();
  await page.mouse.up();
  await expect.poll(async () => (await state()).nodeCount).toBe(17);
  const after = await state();
  const node = after.nodes.find(n => n.id === "var_1")!;
  const rect = (await canvas.boundingBox())!;
  expect(node.screenX + rect.x).toBeCloseTo(target.x, 0);
  expect(node.screenY + rect.y).toBeCloseTo(target.y, 0);
  expect(after.zoom).toBeCloseTo(before.zoom);
  await expect(page.locator(".library-drag-ghost")).toHaveCount(0);
  // Returning to the floating drawer must not create a node behind that panel.
  const cardBox = (await card.boundingBox())!;
  await card.hover();
  await page.mouse.down();
  await page.mouse.move(cardBox.x + 10, cardBox.y + 10, { steps: 8 });
  await page.mouse.up();
  expect((await state()).nodeCount).toBe(17);
  // Cancelled drags outside the viewport do not add another node.
  await card.hover();
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 10 });
  await page.mouse.up();
  expect((await state()).nodeCount).toBe(17);
  await card.hover();
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await state()).nodeCount).toBe(17);
});

test("New opens the active category editor; an invalid expression is never silently replaced", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Adicionar equação", exact: true }).click();
  await page.getByRole("button", { name: "Novo", exact: true }).click();
  const dialog = page.locator(".new-catalog-dialog");
  await expect(dialog.getByLabel("Tipo de elemento")).toHaveValue("equation");
  await expect(dialog.getByLabel("Identificador do elemento")).toHaveValue("eq_1");
  await dialog.getByLabel("Rótulo do elemento").fill("Teste de expressão");
  await dialog.getByLabel("Expressão da equação").fill("U * inexistente");
  await dialog.getByRole("button", { name: "Criar e Adicionar ao Catálogo" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Expressão da equação").fill("U * (A - A)");
  await dialog.getByRole("button", { name: "Criar e Adicionar ao Catálogo" }).click();
  await expect(dialog).toBeHidden();
  const inspector = page.getByLabel("Detalhes da investigação");
  await expect(inspector.getByLabel("Expressão", { exact: true })).toHaveValue("(U * (A - A))");
});

test("waiting for the engine never advertises completed nodes or a fabricated percentage", async ({ page }) => {
  await ready(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/__engine", async route => {
    if (route.request().postDataJSON().operation === "analyze") await gate;
    await route.continue();
  });
  await page.keyboard.press("F5");
  const dock = page.locator(".results-dock");
  try {
    await expect(dock.getByRole("progressbar")).toBeVisible();
    await expect(dock.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    await expect(dock.locator(".terminal-line.success")).toHaveCount(0);
    await expect(dock).not.toContainText("computado com sucesso");
    await expect(dock).not.toContainText("dimensionalidade validadas");
  } finally { release(); }
  await expect(dock.locator(".result-content")).toBeVisible({ timeout: 15000 });
  await dock.getByRole("tab", { name: "Console de Execução" }).click();
  await expect(dock).toContainText("Concluído em");
});


test("a cyclic model is logged as inconclusive rather than as a detected failure", async ({ page }) => {
  await ready(page);
  const model = {
    schema_version: 1, id: "cycle_test", title: "Ciclo sintético", description: "Caso controlado sem solver de sistemas.",
    variables: ["a", "b"].map(id => ({ id, label: id, unit: "1", value: null, source: "Teste sintético" })),
    equations: [
      { id: "eq_a", label: "a depende de b", lhs: "a", rhs: { var: "b", op: null, args: [] }, assumption_ids: [], source: "Teste sintético" },
      { id: "eq_b", label: "b depende de a", lhs: "b", rhs: { var: "a", op: null, args: [] }, assumption_ids: [], source: "Teste sintético" },
    ], assumptions: [], requirements: [], observations: [],
  };
  await page.getByLabel("Arquivo do modelo").setInputFiles({ name: "ciclo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(model)) });
  await expect(page.locator("h1")).toHaveText("Ciclo sintético");
  await page.keyboard.press("F5");
  const dock = page.locator(".results-dock");
  await expect(dock.locator(".result-content")).toBeVisible({ timeout: 15000 });
  await dock.getByRole("tab", { name: "Console de Execução" }).click();
  await expect(dock.locator(".terminal-line.warn").filter({ hasText: "Inconclusivo" }).first()).toBeVisible();
  await expect(dock).not.toContainText("Divergência detectada");
  await expect(dock).not.toContainText("divergência formal");
});
