import { chooseScenario, togglePanel } from "./workspace-helpers";
import { test, expect } from "@playwright/test";
import type { RustViewportDebugApi } from "../../apps/desktop/src/GraphView";

test("preserves the Rust WebGL2 renderer and zoom through analysis, tabs, and panel resizing", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Balanço térmico de uma sala" }),
  ).toBeVisible({ timeout: 20_000 });
  const viewport = page.getByTestId("graph-viewport");
  const canvas = page.getByTestId("graph-canvas").locator("canvas").first();
  await expect(canvas).toHaveAttribute("data-renderer", "rust-wasm-webgl2");
  await canvas.evaluate((node) =>
    node.setAttribute("data-camera-test", "same-renderer"),
  );
  await page
    .getByRole("button", { name: "Zoom real 100%", exact: true })
    .click();
  await expect(page.getByTestId("zoom-level")).toHaveText("100%");
  await page
    .getByRole("button", { name: "Aumentar zoom", exact: true })
    .click();
  await expect(page.getByTestId("zoom-level")).toHaveText("125%");
  // Global application shortcuts also work before any control has focus.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press("F5");
  await expect(page.getByTestId("finding-count")).toHaveText("0", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("zoom-level")).toHaveText("125%");
  await expect(canvas).toHaveAttribute("data-camera-test", "same-renderer");

  const originalWidth = (await viewport.boundingBox())!.width;
  await togglePanel(page, "Propriedades");
  await expect(page.getByLabel("Detalhes da investigação")).toBeHidden();
  await expect
    .poll(async () => (await viewport.boundingBox())!.width)
    .toBeGreaterThan(originalWidth + 200);
  await expect(page.getByTestId("zoom-level")).toHaveText("125%");
  await togglePanel(page, "Propriedades");
  const splitter = page.getByRole("separator", {
    name: "Largura do inspetor",
  });
  const panelWidth = Number(await splitter.getAttribute("aria-valuenow"));
  await splitter.focus();
  // Right-hand panel: moving the divider right reduces its width.
  await page.keyboard.press("ArrowRight");
  await expect(splitter).toHaveAttribute("aria-valuenow", String(panelWidth - 16));
  await expect(page.getByTestId("zoom-level")).toHaveText("125%");

  await page.getByRole("tab", { name: "Elementos", exact: true }).click();
  await page.getByRole("button", { name: /Potência térmica total/ }).click();
  await page.getByRole("tab", { name: "Grafo", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-camera-test", "same-renderer");
  await viewport.focus();
  await page.keyboard.press("0");
  await expect(page.getByTestId("zoom-level")).toHaveText("100%");
  await page.keyboard.press("+");
  await expect(page.getByTestId("zoom-level")).toHaveText("125%");
  await page
    .getByRole("button", { name: "Enquadrar seleção", exact: true })
    .click();
  // Selecting an element now restores its properties panel automatically.
  await expect(page.getByLabel("Detalhes da investigação")).toBeVisible();
  await expect(page.getByLabel("Detalhes da investigação")).toContainText(
    "2.200",
  );

  // Verify structured ports and 1000-node Rust WASM GPU benchmark in browser
  const debugInfo = await canvas.evaluate((node) => {
    const api = (
      node as HTMLCanvasElement & { __nexoViewport?: RustViewportDebugApi }
    ).__nexoViewport!;
    const eqWall = api.nodes.find((n) => n.id === "eq_wall");
    const eqAir = api.nodes.find((n) => n.id === "eq_air");
    const bench = api.benchmarkNodes(1000, 2000);
    return {
      renderer: api.renderer,
      nodeCount: api.nodeCount,
      edgeCount: api.edgeCount,
      vertexFloatCount: api.vertexFloatCount,
      eqWallPorts: eqWall?.portCount ?? 0,
      eqAirPorts: eqAir?.portCount ?? 0,
      bench,
    };
  });
  expect(debugInfo.renderer).toBe("rust-wasm-webgl2");
  expect(debugInfo.nodeCount).toBe(16);
  expect(debugInfo.edgeCount).toBe(18);
  expect(debugInfo.vertexFloatCount).toBeGreaterThan(1000);
  // eq_wall has 3 inputs + 1 output + 1 assumption + 1 requirement = 6 distinct ports
  expect(debugInfo.eqWallPorts).toBe(6);
  // eq_air has 4 inputs + 1 output + 1 assumption + 1 requirement = 7 distinct ports
  expect(debugInfo.eqAirPorts).toBe(7);
  expect(debugInfo.bench.layoutMs).toBeLessThan(250);
  expect(debugInfo.bench.frameMs).toBeLessThan(50);
  console.log(
    "Rust WASM viewport benchmark (1000 nodes / 2000 edges):",
    debugInfo.bench,
  );

  await page.screenshot({ path: "test-results/desktop-workbench.png" });
});

test("keeps the work area inside the window at desktop sizes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Balanço térmico de uma sala" }),
  ).toBeVisible({ timeout: 20_000 });
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 800, height: 650 },
  ]) {
    await page.setViewportSize(size);
    await expect(
      page.getByRole("button", { name: "Aumentar zoom" }),
    ).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Executar verificação" }),
    ).toBeInViewport();
    const bounds = await page.getByTestId("graph-viewport").boundingBox();
    expect(bounds!.height).toBeGreaterThan(size.height * 0.65);
    const noPageScroll = await page.evaluate(
      () =>
        document.documentElement.scrollHeight <= innerHeight &&
        document.documentElement.scrollWidth <= innerWidth,
    );
    expect(noPageScroll).toBe(true);
  }
  await page.screenshot({ path: "test-results/desktop-workbench-compact.png" });
});
