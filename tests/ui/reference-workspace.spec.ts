import { chooseScenario, togglePanel } from "./workspace-helpers";
import { test, expect } from "@playwright/test";
import type { RustViewportDebugApi } from "../../apps/desktop/src/GraphView";

async function getViewportState(page: import("@playwright/test").Page) {
  return page
    .locator('[data-testid="graph-canvas"] canvas')
    .evaluate(
      (el) =>
        (el as HTMLCanvasElement & { __nexoViewport?: RustViewportDebugApi })
          .__nexoViewport ?? null,
    );
}

async function ready(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Balanço térmico de uma sala" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(
      async () => {
        const state = await getViewportState(page);
        return state?.nodes.find((n) => n.id === "U")?.visible ?? false;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
}

test("visibility starts closed and Exibir restores every closed panel", async ({
  page,
}) => {
  await ready(page);
  const visibility = page.locator(".visibility-menu");
  await expect(visibility).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Visibilidade", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Variáveis", exact: true })
    .uncheck();
  await expect
    .poll(async () => {
      const state = await getViewportState(page);
      return state?.nodes.find((n) => n.id === "U")?.visible;
    })
    .toBe(false);
  await page.getByRole("checkbox", { name: "Variáveis", exact: true }).check();
  await expect
    .poll(async () => {
      const state = await getViewportState(page);
      return state?.nodes.find((n) => n.id === "U")?.visible;
    })
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(visibility).not.toHaveAttribute("open", "");

  await page
    .getByRole("button", { name: "Fechar propriedades", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fechar resultados", exact: true })
    .click();
  await expect(page.getByLabel("Detalhes da investigação")).toBeHidden();
  await expect(page.getByLabel("Painel de resultados")).toBeHidden();
  await page.locator(".view-menu:not(.file-menu) > summary").click();
  await page
    .getByRole("menuitemcheckbox", { name: "Propriedades", exact: true })
    .click();
  await page
    .getByRole("menuitemcheckbox", { name: "Resultados", exact: true })
    .click();
  await page
    .getByRole("menuitemcheckbox", { name: "Navegador do grafo", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Detalhes da investigação")).toBeVisible();
  await expect(page.getByLabel("Painel de resultados")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Navegador do grafo", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Fechar navegador", exact: true })
    .click();
  await page.locator(".view-menu:not(.file-menu) > summary").click();
  await page
    .getByRole("button", { name: "Restaurar disposição inicial", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Navegador do grafo", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Expandir resultados" }),
  ).toBeVisible();
});

test("project search, node menus and navigator act on the real camera", async ({
  page,
}) => {
  await ready(page);
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("textbox", { name: "Pesquisar no projeto" }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Pesquisar no projeto" })
    .fill("P_total");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Detalhes da investigação")).toContainText(
    "Potência térmica total",
  );

  // Click the node's (⋯) options button rendered on the Rust WebGL2 canvas
  const pTotal = (await getViewportState(page))?.nodes.find(
    (n) => n.id === "P_total",
  );
  expect(pTotal).toBeDefined();
  await page.locator('[data-testid="graph-canvas"] canvas').click({
    position: {
      x: Math.round(pTotal!.moreScreenX),
      y: Math.round(pTotal!.moreScreenY),
    },
  });
  await page
    .getByRole("menuitem", { name: "Enquadrar elemento e vínculos" })
    .click();
  await togglePanel(page, "Navegador do grafo");
  const camera = page.getByTestId("map-camera");
  await expect(camera).toBeVisible();
  const before = await camera.getAttribute("x");
  const scale = await page.getByTestId("zoom-level").textContent();
  const map = page.getByRole("img", { name: /Navegador do grafo: clique/ });
  await map.click({ position: { x: 20, y: 20 } });
  await expect.poll(() => camera.getAttribute("x")).not.toBe(before);
  await expect(page.getByTestId("zoom-level")).toHaveText(scale!);
  await page.getByRole("button", { name: "Enquadrar", exact: true }).click();
  await page.getByRole("button", { name: "Recolher navegador" }).click();
  await expect(map).toBeHidden();
  await page.getByRole("button", { name: "Expandir navegador" }).click();
  await expect(map).toBeVisible();
  // The camera overlay must not intercept clicks on node markers.
  await map.locator(".map-node").filter({ hasText: /^U$/ }).click();
  await expect(page.locator(".inspector-identity code")).toHaveText(/^U ·/);
});

test("bottom results collapse and retain actual session executions", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await ready(page);
  await chooseScenario(page, "missing_air");
  await page
    .getByRole("button", { name: "Executar verificação", exact: true })
    .click();
  await expect(page.getByTestId("finding-count")).toHaveText("2", {
    timeout: 20_000,
  });
  await expect
    .poll(async () => {
      const state = await getViewportState(page);
      return state?.nodes.find((n) => n.id === "P_total")?.detail;
    })
    .toBe("1.000 W");
  await expect(
    page.getByRole("separator", { name: "Altura dos resultados" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Previsão diverge da referência/ })
    .click();
  await expect(page.getByLabel("Detalhes da investigação")).toContainText(
    "1200 W",
  );
  await page.getByRole("button", { name: "Recolher resultados" }).click();
  await expect(
    page.getByRole("button", { name: /Previsão diverge da referência/ }),
  ).toBeHidden();
  await page.getByRole("tab", { name: /Execuções/ }).click();
  await expect(page.locator(".execution-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Recolher resultados" }).click();
  await page.getByRole("button", { name: "Localizar no grafo" }).click();
  await expect(
    page.getByRole("region", { name: "Navegador do grafo", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "build/reference-workspace.png" });
});
