import { test, expect } from "@playwright/test";
import { ready } from "./workspace-helpers";

test("asset library filters by category, searches, and toggles view mode", async ({
  page,
}) => {
  await ready(page);

  // Switch to Elementos tab
  await page.getByRole("tab", { name: "Elementos", exact: true }).click();
  const library = page.getByRole("region", {
    name: "Biblioteca de elementos",
    exact: true,
  });
  await expect(library).toBeVisible();

  // Check categories exist
  await expect(library.getByRole("button", { name: /Todos/ })).toBeVisible();
  await expect(library.getByRole("button", { name: /Variáveis/ })).toBeVisible();
  await expect(library.getByRole("button", { name: /Equações/ })).toBeVisible();

  // Filter by Equações
  await library.getByRole("button", { name: /Equações/ }).click();
  await expect(
    library.getByRole("button", { name: /Transmissão: U · A · ΔT/ }),
  ).toBeVisible();
  // Variable should not be visible when filtering by Equações
  await expect(
    library.getByRole("button", { name: /Área da envoltória/ }),
  ).toBeHidden();

  // Reset to Todos
  await library.getByRole("button", { name: /Todos/ }).click();
  await expect(
    library.getByRole("button", { name: /Área da envoltória/ }),
  ).toBeVisible();

  // Test search in library
  const searchInput = library.getByPlaceholder(
    "Pesquisar elementos por nome, ID ou expressão…",
  );
  await searchInput.fill("Potência térmica");
  await expect(
    library.getByRole("button", { name: /Potência térmica total/ }),
  ).toBeVisible();
  await expect(
    library.getByRole("button", { name: /Área da envoltória/ }),
  ).toBeHidden();

  // Clear search
  await library.getByRole("button", { name: "Limpar busca" }).click();
  await expect(
    library.getByRole("button", { name: /Área da envoltória/ }),
  ).toBeVisible();

  // Toggle view mode to List
  await library
    .getByRole("button", { name: "Visualização em lista" })
    .click();
  await expect(library.locator(".library-list")).toBeVisible();
  await expect(
    library.getByRole("button", { name: /Potência térmica total/ }),
  ).toBeVisible();

  // Toggle back to Grid
  await library
    .getByRole("button", { name: "Visualização em miniaturas" })
    .click();
  await expect(library.locator(".library-grid")).toBeVisible();
});

test("settings modal opens from the tool rail", async ({ page }) => {
  await ready(page);

  const settingsBtn = page.getByRole("button", {
    name: "Configurações",
  });
  await expect(settingsBtn).toBeVisible();
  await settingsBtn.click();

  const dialog = page.getByRole("dialog", {
    name: "Configurações",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Geral" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Aparência" })).toBeVisible();

  // Close with escape
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("deletion via delete key checks connections before deleting", async ({
  page,
}) => {
  await ready(page);

  // 1. Unconnected node: add a new variable from the library drawer and select it
  await page.getByRole("button", { name: "Adicionar variável" }).click();
  await page.getByRole("button", { name: "Novo" }).click();
  await page.getByLabel("Rótulo do elemento").fill("Elemento de teste");
  await page.getByRole("button", { name: "Criar e Adicionar ao Catálogo" }).click();
  const inspector = page.getByLabel("Detalhes da investigação");
  await expect(inspector.getByText("var_1 · Variável")).toBeVisible();

  // Press Delete on unconnected node: should be deleted without confirmation modal
  await page.keyboard.press("Delete");
  await expect(
    page.getByRole("dialog", {
      name: "Confirmar exclusão de elemento conectado",
    }),
  ).toBeHidden();
  await expect(inspector.getByText("var_1 · Variável")).toBeHidden();

  // 2. Connected node: select node "U" (transmitância térmica)
  await page.keyboard.press("Control+k");
  await page.getByLabel("Pesquisar no projeto").fill("U");
  await page.keyboard.press("Enter");
  await expect(inspector.getByText("U · Variável")).toBeVisible();

  // Press Delete on connected node: should open confirmation dialog
  await page.keyboard.press("Delete");
  const confirmModal = page.getByRole("dialog", {
    name: "Confirmar exclusão de elemento conectado",
  });
  await expect(confirmModal).toBeVisible();
  await expect(confirmModal).toContainText("possui");
  await expect(confirmModal).toContainText("ligação(ões)");

  // Cancel deletion
  await confirmModal.getByRole("button", { name: "Cancelar" }).click();
  await expect(confirmModal).toBeHidden();
  // Node U is still present
  await expect(inspector.getByText("U · Variável")).toBeVisible();
});

test("top menu switches on hover when open", async ({ page }) => {
  await ready(page);

  // Click Arquivo to open it
  await page.locator(".file-menu > summary").click();
  await expect(
    page.getByRole("button", { name: "Novo projeto" }),
  ).toBeVisible();

  // Hover over Editar: should switch to Editar
  await page.locator(".edit-menu > summary").hover();
  await expect(
    page.getByRole("button", { name: "Modo seleção" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Novo projeto" }),
  ).toBeHidden();

  // Close menus with escape
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Modo seleção" }),
  ).toBeHidden();
});
