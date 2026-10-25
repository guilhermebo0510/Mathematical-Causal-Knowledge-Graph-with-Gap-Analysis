import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { ready, togglePanel } from "./workspace-helpers";
import type { ProjectDocument } from "../../apps/desktop/src/project";
import type { RustViewportDebugApi } from "../../apps/desktop/src/GraphView";

async function state(page: import("@playwright/test").Page) {
  return page
    .locator('[data-testid="graph-canvas"] canvas')
    .evaluate(
      (el) =>
        (el as HTMLCanvasElement & { __nexoViewport: RustViewportDebugApi })
          .__nexoViewport,
    );
}
async function search(page: import("@playwright/test").Page, id: string) {
  await page.keyboard.press("Control+k");
  await page.getByLabel("Pesquisar no projeto").fill(id);
  await page.keyboard.press("Enter");
}
test.setTimeout(60000);

test("saves and reopens a named project, restoring model, camera, positions and panels", async ({
  page,
}) => {
  await ready(page);
  await page.getByTestId("status-project-name").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Renomear projeto" }).click();
  await page
    .getByLabel("Nome do projeto")
    .fill("Estudo térmico – revisão local");
  await page.keyboard.press("Enter");
  await search(page, "U");
  const inspector = page.getByLabel("Detalhes da investigação");
  await inspector.getByLabel("Valor", { exact: true }).fill("0.6");
  await inspector
    .getByLabel("Fonte / procedência")
    .fill("Entrada informada para teste sintético.");
  await inspector.getByRole("button", { name: "Aplicar alterações" }).click();
  await page.getByRole("button", { name: "Zoom real 100%" }).click();
  await page
    .getByRole("button", { name: "Aumentar zoom", exact: true })
    .click();
  await togglePanel(page, "Navegador do grafo");
  await togglePanel(page, "Propriedades");
  const downloadPromise = page.waitForEvent("download");
  await page.locator(".file-menu > summary").click();
  await page
    .getByRole("button", { name: "Salvar projeto", exact: true })
    .click();
  const download = await downloadPromise;
  const text = await readFile((await download.path())!, "utf8");
  const document = JSON.parse(text) as ProjectDocument;
  expect(document.format).toBe("nexo-project");
  expect(document.workspace.viewport?.camera.zoom).toBeCloseTo(1.25);
  expect(document.workspace.viewport?.positions).toHaveLength(16);
  expect(document.workspace.inspector).toBe(false);
  expect(document.workspace.explorer).toBe(false);
  // Older v1 projects may request the retired explorer. Accept the file without
  // restoring redundant UI or changing its model/camera.
  const legacyDocument = structuredClone(document);
  legacyDocument.workspace.explorer = true;
  expect(document.model.variables.find((v) => v.id === "U")?.value).toBe(0.6);
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Balanço térmico de uma sala", {
    timeout: 20000,
  });
  await page
    .getByLabel("Arquivo do modelo")
    .setInputFiles({
      name: "Estudo.nexo.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(legacyDocument)),
    });
  await expect(page.locator("h1")).toHaveText(
    "Estudo térmico – revisão local",
    { timeout: 20000 },
  );
  await expect(page.getByTestId("zoom-level")).toHaveText("125%");
  await expect(page.getByLabel("Explorador do modelo")).toHaveCount(0);
  await page.locator(".view-menu:not(.file-menu) > summary").click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Explorador", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Detalhes da investigação")).toBeHidden();
  await expect(page.getByTestId("map-camera")).toBeVisible();
  await expect(page.getByTestId("finding-count")).toHaveText("—");
  const data = await state(page),
    saved = document.workspace.viewport!;
  const u = saved.positions.find((p) => p.id === "U")!,
    node = data.nodes.find((n) => n.id === "U")!;
  expect(node.screenX).toBeCloseTo(u.x * saved.camera.zoom + saved.camera.x, 0);
  await page.getByRole("button", { name: "Executar verificação" }).click();
  await expect(page.getByTestId("finding-count")).toHaveText("1", {
    timeout: 20000,
  });
  await search(page, "P_total");
  await expect(page.getByLabel("Detalhes da investigação")).toContainText(
    "2.400",
  );
});

test("renames equations without changing calculations and invalidates old evidence after edit", async ({
  page,
}) => {
  await ready(page);
  await page.keyboard.press("F5");
  await expect(page.getByTestId("finding-count")).toHaveText("0", {
    timeout: 20000,
  });
  await search(page, "eq_total");
  const inspector = page.getByLabel("Detalhes da investigação");
  await inspector
    .getByLabel("Rótulo", { exact: true })
    .fill("Balanço revisado");
  await inspector.getByRole("button", { name: "Aplicar alterações" }).click();
  await expect(page.getByTestId("finding-count")).toHaveText("—");
  await expect(inspector.locator(".validation-state")).toHaveText(
    "Não verificado",
  );
  await page.keyboard.press("F5");
  await expect(page.getByTestId("finding-count")).toHaveText("0", {
    timeout: 20000,
  });
  await search(page, "P_total");
  await expect(inspector).toContainText("2.200");
});

test("protects unsaved work, has one viewport command row and contextual help outside the viewport", async ({
  page,
}) => {
  const startup: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/__engine"))
      startup.push(request.postDataJSON().operation);
  });
  await ready(page);
  expect(startup.filter((op) => op === "load_example")).toHaveLength(1);
  expect(startup.filter((op) => op === "list_examples")).toHaveLength(1);
  await expect(page.locator(".project-bar .brand-symbol")).toHaveCount(0);
  expect(
    (await page.getByRole("tab", { name: "Grafo", exact: true }).boundingBox())!
      .y,
  ).toBeLessThan(100);
  await page
    .getByRole("button", { name: "Adicionar variável", exact: true })
    .click();
  await page.getByRole("button", { name: "Novo", exact: true }).click();
  await page.getByLabel("Rótulo do elemento").fill("Elemento de teste");
  await page.getByRole("button", { name: "Criar e Adicionar ao Catálogo" }).click();
  await expect(
    page
      .getByLabel("Detalhes da investigação")
      .getByLabel("Valor", { exact: true }),
  ).toHaveValue("");
  await page.locator(".file-menu > summary").click();
  await page.getByRole("button", { name: "Novo projeto", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Alterações não salvas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Balanço térmico de uma sala");
  await expect(page.locator(".canvas-hint")).toHaveCount(0);
  await page
    .getByLabel("Detalhes da investigação")
    .getByLabel("Rótulo", { exact: true })
    .focus();
  await expect(page.getByLabel("Ajuda contextual")).toContainText(
    "Propriedades",
  );
  await page
    .getByRole("button", { name: "Origem e execução", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Origem e execução" }),
  ).toContainText("GitHub · planejado");
});

test("renders labels beyond the old 64-node atlas limit", async ({ page }) => {
  await ready(page);
  const model = {
    schema_version: 1,
    id: "atlas",
    title: "72 quantidades",
    description: "Teste sintético de rótulos GPU.",
    variables: Array.from({ length: 72 }, (_, i) => ({
      id: `v_${i}`,
      label: `Quantidade ${i}`,
      unit: "1",
      value: i,
      source: "Teste sintético",
    })),
    equations: [],
    assumptions: [],
    requirements: [],
    observations: [],
  };
  await page
    .getByLabel("Arquivo do modelo")
    .setInputFiles({
      name: "atlas.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(model)),
    });
  await expect(page.locator("h1")).toHaveText("72 quantidades", {
    timeout: 20000,
  });
  await page.getByRole("button", { name: "Zoom real 100%" }).click();
  await expect.poll(async () => (await state(page)).nodeCount).toBe(72);
  await search(page, "v_71");
  await expect(page.getByLabel("Detalhes da investigação")).toContainText(
    "Quantidade 71",
  );
  await expect
    .poll(
      async () =>
        (await state(page)).nodes.find((n) => n.id === "v_71")?.textVisible,
    )
    .toBe(true);
});


test("project actions open above the status bar without scrolling the workspace", async ({ page }) => {
  await ready(page);
  await page.getByTestId("status-project-name").click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Opções do projeto" });
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  const footer = await page.locator(".status-bar").boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(footer!.y);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await page.getByTestId("status-project-name").click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Renomear projeto" }).click();
  await expect(page.getByLabel("Nome do projeto")).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
