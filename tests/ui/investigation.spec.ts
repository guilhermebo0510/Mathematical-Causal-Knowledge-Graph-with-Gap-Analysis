import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("investigates real engine results across four scenarios", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Balanço térmico de uma sala" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Executar verificação" }).click();
  await expect(page.getByTestId("finding-count")).toHaveText("0", {
    timeout: 20_000,
  });
  await page.getByRole("tab", { name: "Elementos", exact: true }).click();
  await page.getByRole("button", { name: /Potência térmica total/ }).click();
  await expect(page.getByLabel("Detalhes da investigação")).toContainText(
    "2.200",
  );

  await page
    .getByLabel("Balanço térmico", { exact: true })
    .selectOption("missing_air");
  await page.getByRole("button", { name: "Executar verificação" }).click();
  await expect(page.getByTestId("finding-count")).toHaveText("2", {
    timeout: 20_000,
  });
  await page.getByRole("tab", { name: "Verificações", exact: true }).click();
  await page
    .getByRole("button", { name: /Previsão diverge da referência/ })
    .click();
  await expect(page.getByLabel("Detalhes da investigação")).toContainText(
    "1200 W",
  );
  await expect(page.getByLabel("Detalhes da investigação")).toContainText(
    "não identifica causa única",
  );
  await page.getByRole("tab", { name: "Grafo", exact: true }).click();
  await page.screenshot({ path: "test-results/prototype.png", fullPage: true });
  await page.getByRole("tab", { name: "Verificações", exact: true }).click();

  await page
    .getByLabel("Balanço térmico", { exact: true })
    .selectOption("invalid_unit");
  await page.getByRole("button", { name: "Executar verificação" }).click();
  await expect(
    page.getByRole("button", { name: /Dimensões incompatíveis/ }).first(),
  ).toBeVisible({ timeout: 20_000 });

  await page
    .getByLabel("Balanço térmico", { exact: true })
    .selectOption("missing_input");
  await page.getByRole("button", { name: "Executar verificação" }).click();
  await expect(
    page
      .getByRole("button", { name: /Entrada sem valor ou derivação/ })
      .first(),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole("tab", { name: "Grafo", exact: true }).click();
  await page.screenshot({
    path: "test-results/investigation-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("imports and rejects an unsafe expression without running it", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Balanço térmico de uma sala" }),
  ).toBeVisible();
  await page.getByLabel("Arquivo do modelo").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ eval: '__import__("os").system("echo unsafe")' }),
    ),
  });
  await expect(page.getByRole("alert")).toContainText("inválida");
  await expect(
    page.getByRole("heading", { name: "Balanço térmico de uma sala" }),
  ).toBeVisible();
});

test("exports and reimports a changed model, computing new results rather than a fixture", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Balanço térmico de uma sala" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar modelo JSON" }).click();
  const download = await downloadPromise;
  const model = JSON.parse(await readFile((await download.path())!, "utf-8"));
  model.variables.find(
    (variable: { id: string }) => variable.id === "U",
  ).value = 1;
  await page.getByLabel("Arquivo do modelo").setInputFiles({
    name: "changed.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(model)),
  });
  await expect(page.getByLabel("Balanço térmico", { exact: true })).toHaveValue(
    "imported",
  );
  await page.getByRole("button", { name: "Executar verificação" }).click();
  await expect(page.getByTestId("finding-count")).toHaveText("1", {
    timeout: 20_000,
  });
  await page.getByRole("tab", { name: "Elementos", exact: true }).click();
  await page.getByRole("button", { name: /Potência térmica total/ }).click();
  await expect(page.getByLabel("Detalhes da investigação")).toContainText(
    "3.200",
  );
});
