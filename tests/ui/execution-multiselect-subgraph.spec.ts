import { test, expect } from "@playwright/test";
import { ready, createModuleForTest, enterModuleForTest } from "./workspace-helpers";

test.describe("Execution Console, Multi-Selection & Subgraph Builder", () => {
  test("marquee box selects multiple nodes and displays multi-selection inspector", async ({
    page,
  }) => {
    await ready(page);

    const canvas = page.locator('[data-testid="graph-canvas"] canvas');
    await expect(canvas).toBeVisible();

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();

    // Start drag on empty top-left of the canvas
    const startX = canvasBox!.x + 25;
    const startY = canvasBox!.y + 25;
    const endX = canvasBox!.x + canvasBox!.width - 80;
    const endY = canvasBox!.y + canvasBox!.height - 80;

    // Perform marquee drag over canvas
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();

    // Verify multi-selection inspector panel is displayed
    const multiInspector = page.locator(".multi-selection-inspector");
    await expect(multiInspector).toBeVisible();
    await expect(
      multiInspector.locator(".multi-selection-header").getByText(/elementos selecionados/),
    ).toBeVisible();
    await expect(multiInspector.locator(".multi-breakdown-tags")).toBeVisible();
    await expect(multiInspector.getByRole("button", { name: "Excluir elementos selecionados" })).toBeVisible();
    await expect(multiInspector.getByRole("button", { name: "Enquadrar seleção" })).toBeVisible();

    // Clicking "Excluir elementos selecionados" opens the batch confirmation modal
    await multiInspector.getByRole("button", { name: "Excluir elementos selecionados" }).click();
    const deleteModal = page.locator(".delete-confirm-dialog");
    await expect(deleteModal).toBeVisible();
    await expect(deleteModal.getByText(/elementos selecionados.*possuem/)).toBeVisible();

    // Cancel deletion
    await deleteModal.getByRole("button", { name: "Cancelar" }).click();
    await expect(deleteModal).not.toBeVisible();

    // Clear selection with button
    await multiInspector.getByRole("button", { name: "Limpar seleção" }).click();
    await expect(multiInspector).not.toBeVisible();
  });

  test("pressing F5 records completed engine checks without simulated steps", async ({
    page,
  }) => {
    await ready(page);

    // Press F5 to trigger analyze
    await page.keyboard.press("F5");

    // Results dock should open
    const dock = page.locator(".results-dock");
    await expect(dock).toBeVisible();

    // When engine analysis finishes, checks list is displayed
    await expect(dock.locator(".result-content")).toBeVisible({ timeout: 15_000 });

    // Switch to Console de Execução tab to review completed logs
    await dock.getByRole("tab", { name: "Console de Execução" }).click();
    await expect(dock.locator(".terminal-dock-container")).toBeVisible();

    // Verify progress bar and terminal logs
    const progressTrack = dock.locator(".progress-track");
    await expect(progressTrack).toBeVisible();

    const terminalBody = dock.locator(".terminal-body");
    await expect(terminalBody).toBeVisible();
    await expect(terminalBody.locator(".terminal-line")).not.toHaveCount(0);
    await expect(terminalBody.getByText(/Verificação iniciada/)).toBeVisible();
    await expect(terminalBody.getByText(/Concluído em|finalizada em/)).toBeVisible();

    // Check that "Ver Verificações" button returns to results checks
    const viewChecksBtn = dock.getByRole("button", { name: "Ver Verificações" });
    await expect(viewChecksBtn).toBeVisible();
    await viewChecksBtn.click();

    // Should now show the results check list
    await expect(dock.locator(".result-content")).toBeVisible();
  });

  test("module context renders real internal nodes in Rust rather than an unsaved builder",async({page})=>{
    test.setTimeout(120000);await ready(page);await createModuleForTest(page);await enterModuleForTest(page);
    const canvas=page.locator('[data-testid="graph-canvas"] canvas');await expect(canvas).toHaveAttribute("data-renderer","rust-wasm-webgl2");
    await expect.poll(()=>canvas.evaluate(el=>(el as any).__nexoViewport.nodeCount)).toBe(16);
    const ids=await canvas.evaluate(el=>(el as any).__nexoViewport.nodes.map((n:any)=>n.id));expect(ids.every((id:string)=>id.startsWith("nested_"))).toBe(true);
    await page.getByRole("button",{name:"Modelo completo",exact:true}).click();await expect.poll(()=>canvas.evaluate(el=>(el as any).__nexoViewport.nodeCount)).toBe(32);
  });

  test("editing an internal module quantity changes the real scientific result",async({page})=>{
    test.setTimeout(120000);await ready(page);await createModuleForTest(page);await enterModuleForTest(page);
    await page.keyboard.press("Control+k");await page.getByLabel("Pesquisar no projeto").fill("nested_U");await page.keyboard.press("Enter");
    const inspector=page.getByLabel("Detalhes da investigação");await inspector.getByLabel("Valor",{exact:true}).fill("0.6");
    await inspector.getByRole("button",{name:"Aplicar alterações",exact:true}).click();await page.keyboard.press("F5");
    await expect(page.getByTestId("finding-count")).toHaveText("1",{timeout:30000});
    await expect(inspector).toContainText("2400 W");
  });
});
