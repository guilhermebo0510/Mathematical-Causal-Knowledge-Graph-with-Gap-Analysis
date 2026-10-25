import { test, expect } from "@playwright/test";
import { ready } from "./workspace-helpers";
test("creates nodes, defines an equation, rejects incompatible links and resets stale evidence", async ({
  page,
}) => {
  test.setTimeout(60000);
  await ready(page);
  const inspector = page.getByLabel("Detalhes da investigação");
  await page
    .getByRole("button", { name: "Adicionar variável", exact: true })
    .click();
  await page.getByRole("button", { name: "Novo", exact: true }).click();
  await page.getByLabel("Rótulo do elemento").fill("Elemento de teste");
  await page.getByRole("button", { name: "Criar e Adicionar ao Catálogo" }).click();
  await inspector.getByLabel("Valor", { exact: true }).fill("125");
  await inspector.getByLabel("Unidade", { exact: true }).fill("W");
  await inspector.getByRole("button", { name: "Aplicar alterações" }).click();
  await page
    .getByRole("button", { name: "Adicionar equação", exact: true })
    .click();
  await page.getByRole("button", { name: "Novo", exact: true }).click();
  await page.getByLabel("Rótulo do elemento").fill("Elemento de teste");
  await page.getByRole("button", { name: "Criar e Adicionar ao Catálogo" }).click();
  await inspector.locator(".connect-details > summary").click();
  await inspector.getByLabel("Tipo de ligação").selectOption("INPUT_TO");
  await inspector
    .getByLabel("Selecionar elemento para conexão")
    .selectOption("var_1");
  await inspector
    .getByRole("button", { name: "Conectar", exact: true })
    .click();
  await expect(inspector.locator(".connection-row")).toContainText("var_1");
  await inspector
    .getByLabel("Expressão", { exact: true })
    .fill("var_1 * var_1");
  await inspector.getByRole("button", { name: "Aplicar alterações" }).click();
  await expect(inspector.locator(".expression-preview")).toContainText(
    "(var_1 * var_1)",
  );
  await inspector
    .getByRole("button", { name: "Desconectar var_1 de eq_1", exact: true })
    .click();
  await expect(inspector.locator(".empty-connections")).toBeVisible();
  await expect(inspector.locator(".expression-preview")).toContainText(
    "(? * ?)",
  );
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+k");
  await page.getByLabel("Pesquisar no projeto").fill("eq_1");
  await page.keyboard.press("Enter");
  await expect(inspector.locator(".expression-preview")).toContainText(
    "(var_1 * var_1)",
  );
  await inspector
    .getByRole("button", { name: "Excluir elemento", exact: true })
    .click();
  await page.keyboard.press("F5");
  await expect(page.getByTestId("finding-count")).not.toHaveText("—", {
    timeout: 20000,
  });
});
