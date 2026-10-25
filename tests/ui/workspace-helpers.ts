import { expect, type Page } from "@playwright/test";
export async function chooseScenario(page: Page, id: string) {
  const picker = page.getByLabel("Balanço térmico", { exact: true });
  if (!(await picker.isVisible()))
    await page.locator(".file-menu > summary").click();
  await picker.selectOption(id);
}
export async function togglePanel(page: Page, name: string) {
  await page.locator(".view-menu:not(.file-menu) > summary").click();
  await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
  await page.keyboard.press("Escape");
}
export async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Balanço térmico de uma sala", {
    timeout: 20000,
  });
  await expect
    .poll(
      () =>
        page
          .locator('[data-testid="graph-canvas"] canvas')
          .evaluate(
            (el) =>
              (
                el as HTMLCanvasElement & {
                  __nexoViewport?: { nodeCount: number };
                }
              ).__nexoViewport?.nodeCount ?? 0,
          ),
      { timeout: 20000 },
    )
    .toBe(16);
}

export async function enableExperimentalSubgraphs(page: Page) {
  await page.getByRole("button", { name: "Configurações", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Configurações", exact: true });
  await dialog.getByRole("button", { name: "Nós", exact: true }).click();
  await dialog.getByLabel("Duplo clique").selectOption("subgraph");
  await page.keyboard.press("Escape");
}

export async function createModuleForTest(page:Page,prefix="nested") {
  await page.locator(".file-menu > summary").click();await page.getByRole("button",{name:"Módulos…",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Módulos",exact:true});await dialog.getByRole("button",{name:"Guardar modelo como módulo",exact:true}).click();
  await expect(dialog.getByLabel("Prefixo da instância")).toBeVisible({timeout:20000});await dialog.getByLabel("Prefixo da instância").fill(prefix);
  await dialog.getByRole("button",{name:"Instanciar módulo",exact:true}).click();await expect(dialog).toBeHidden({timeout:20000});
}
export async function enterModuleForTest(page:Page) {
  await page.locator(".file-menu > summary").click();await page.getByRole("button",{name:"Grupos…",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Grupos",exact:true});await dialog.getByTestId("model-group").locator("summary").click();
  await dialog.getByRole("button",{name:"Entrar no grupo",exact:true}).click();await expect(page.getByRole("navigation",{name:"Navegação do grupo",exact:true})).toBeVisible();
}
