import { test, expect } from "@playwright/test";
import { ready } from "./workspace-helpers";
import type { RustViewportDebugApi } from "../../apps/desktop/src/GraphView";

test.setTimeout(60000);

test("theme covers settings and GPU cards, persists and preserves the camera and real results", async ({ page }) => {
  await ready(page);
  const canvas = page.locator('[data-testid="graph-canvas"] canvas');
  await page.getByRole("button", { name: "Zoom real 100%" }).click();
  await page.keyboard.press("Control+k");
  await page.getByLabel("Pesquisar no projeto").fill("U");
  await page.keyboard.press("Enter");
  await page.keyboard.press("F5");
  await expect(page.locator(".result-content")).toBeVisible({ timeout: 15000 });
  const before = await canvas.evaluate(el => (el as HTMLCanvasElement & { __nexoViewport: RustViewportDebugApi }).__nexoViewport);
  await page.getByRole("button", { name: "Configurações", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Configurações", exact: true });
  await dialog.getByRole("button", { name: "Aparência", exact: true }).click();
  await dialog.getByLabel("Tema visual").selectOption("dark");
  await expect(canvas).toHaveAttribute("data-theme", "dark");
  for (const selector of [".project-bar", ".settings-tab-content", ".settings-tabs-sidebar", ".pane-heading", ".properties-panel", ".editor-field input", ".editor-field textarea", ".results-splitter", ".result-filterbar"]) {
    const color = await page.locator(selector).first().evaluate(el => getComputedStyle(el).backgroundColor);
    const channels = color.match(/\d+/g)!.slice(0, 3).map(Number);
    // Transparent content inherits the surrounding graphite panel.
    if (color !== "rgba(0, 0, 0, 0)") {
      expect(Math.max(...channels)).toBeLessThan(75);
      expect(Math.max(...channels) - Math.min(...channels)).toBeLessThan(4);
    }
  }
  const pixel = await canvas.evaluate(el => {
    const canvas = el as HTMLCanvasElement & { __nexoViewport: RustViewportDebugApi };
    const api = canvas.__nexoViewport;
    const node = api.nodes.find(n => n.visible && n.screenX > 0 && n.screenY > 0)!;
    const gl = canvas.getContext("webgl2")!;
    const ratio = canvas.width / canvas.clientWidth;
    const value = new Uint8Array(4);
    gl.readPixels(Math.round((node.screenX + 80 * api.zoom) * ratio), canvas.height - Math.round((node.screenY + 13 * api.zoom) * ratio) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value);
    const width = Math.round(140 * api.zoom * ratio), height = Math.round(24 * api.zoom * ratio);
    const title = new Uint8Array(width * height * 4);
    gl.readPixels(Math.round((node.screenX - 65 * api.zoom) * ratio),
      canvas.height - Math.round((node.screenY - 12 * api.zoom) * ratio), width, height,
      gl.RGBA, gl.UNSIGNED_BYTE, title);
    let brightTextPixels = 0;
    for (let i = 0; i < title.length; i += 4)
      if (Math.min(title[i], title[i + 1], title[i + 2]) > 160) brightTextPixels++;
    return { color: Array.from(value), brightTextPixels };
  });
  expect(pixel.color[3]).toBeGreaterThan(200);
  expect(Math.max(...pixel.color.slice(0, 3))).toBeLessThan(85);
  expect(pixel.brightTextPixels).toBeGreaterThan(20);
  await page.keyboard.press("Escape");
  const after = await canvas.evaluate(el => (el as HTMLCanvasElement & { __nexoViewport: RustViewportDebugApi }).__nexoViewport);
  expect(after.nodes.map(n => [n.id, n.screenX, n.screenY])).toEqual(before.nodes.map(n => [n.id, n.screenX, n.screenY]));
  expect(after.zoom).toBe(before.zoom);
  await expect(page.locator(".result-content")).toBeVisible();
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Balanço térmico de uma sala", { timeout: 20000 });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(canvas).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Configurações", exact: true }).click();
  await page.getByRole("button", { name: "Aparência", exact: true }).click();
  await page.getByLabel("Tema visual").selectOption("light");
  await expect(canvas).toHaveAttribute("data-theme", "light");
  await expect.poll(() => page.locator(".project-bar").evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(241, 243, 244)");
});

test("settings have immediate effects and do not expose scientific controls with no consumer", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Configurações", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Configurações", exact: true });
  await dialog.getByRole("button", { name: "Viewport", exact: true }).click();
  await dialog.getByLabel("Grade visual").selectOption("none");
  await expect.poll(() => page.getByTestId("graph-viewport").evaluate(el => getComputedStyle(el).backgroundImage)).toBe("none");
  await dialog.getByLabel("Grade visual").selectOption("lines");
  await expect.poll(() => page.getByTestId("graph-viewport").evaluate(el => getComputedStyle(el).backgroundImage)).toContain("linear-gradient");
  await dialog.getByRole("button", { name: "Nós", exact: true }).click();
  await expect(dialog.getByLabel("Duplo clique")).toHaveValue("inspect");
  await dialog.getByLabel("Halo de seleção").check();
  await dialog.getByRole("button", { name: "Motor", exact: true }).click();
  await expect(dialog).toContainText("120 s");
  await expect(dialog.locator("input,select")).toHaveCount(0);
  await expect(dialog).not.toContainText("Garante consistência");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Balanço térmico de uma sala", { timeout: 20000 });
  await expect(page.locator("html")).toHaveAttribute("data-grid-style", "lines");
});

test("free pan, double-click inspection and the deletion preference affect real interactions", async ({ page }) => {
  await ready(page);
  const canvas = page.locator('[data-testid="graph-canvas"] canvas');
  const state = () => canvas.evaluate(el => (el as HTMLCanvasElement & { __nexoViewport: RustViewportDebugApi }).__nexoViewport);
  await page.getByRole("button", { name: "Configurações", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Configurações", exact: true });
  await dialog.getByRole("button", { name: "Viewport", exact: true }).click();
  await dialog.getByLabel("Navegação e Pan").selectOption("free");
  await dialog.getByRole("button", { name: "Geral", exact: true }).click();
  await dialog.getByLabel("Confirmar exclusão de nós conectados").uncheck();
  await page.keyboard.press("Escape");
  const before = await state();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 90, { steps: 10 });
  await page.mouse.up();
  const after = await state();
  expect(after.nodes[0].screenX - before.nodes[0].screenX).toBeCloseTo(80, 0);
  expect(after.nodes[0].screenY - before.nodes[0].screenY).toBeCloseTo(70, 0);
  await canvas.dblclick({ position: { x: after.nodes[0].screenX, y: after.nodes[0].screenY } });
  await expect(page.locator(".subgraph-breadcrumb-bar")).toHaveCount(0);
  await expect(page.getByLabel("Detalhes da investigação").getByLabel("Rótulo", { exact: true })).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(page.locator(".delete-confirm-dialog")).toHaveCount(0);
  await expect.poll(async () => (await state()).nodeCount).toBe(15);
});

test("overview labels can be hidden and restored without changing the graph", async ({ page }) => {
  await ready(page);
  const canvas = page.locator('[data-testid="graph-canvas"] canvas');
  const state = () => canvas.evaluate(el => (el as HTMLCanvasElement & { __nexoViewport: RustViewportDebugApi }).__nexoViewport);
  while ((await state()).zoom >= 0.36) await page.getByRole("button", { name: "Diminuir zoom", exact: true }).click();
  expect((await state()).zoom).toBeGreaterThan(0.22);
  expect((await state()).nodes.some(node => node.textVisible)).toBe(true);
  await page.getByRole("button", { name: "Configurações", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Configurações", exact: true });
  await dialog.getByRole("button", { name: "Nós", exact: true }).click();
  await dialog.getByLabel("Rótulos na visão geral").uncheck();
  await expect.poll(async () => (await state()).nodes.some(node => node.textVisible)).toBe(false);
  await dialog.getByLabel("Rótulos na visão geral").check();
  await expect.poll(async () => (await state()).nodes.some(node => node.textVisible)).toBe(true);
  expect((await state()).nodeCount).toBe(16);
});
