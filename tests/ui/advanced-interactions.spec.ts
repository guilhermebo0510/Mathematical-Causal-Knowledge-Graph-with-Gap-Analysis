import { test, expect } from "@playwright/test";
import { ready, enableExperimentalSubgraphs, createModuleForTest } from "./workspace-helpers";

test.describe("Advanced Desktop UX & Interactions", () => {
  test("right click on canvas background opens custom canvas context menu", async ({
    page,
  }) => {
    await ready(page);

    const canvas = page.locator('[data-testid="graph-canvas"] canvas');
    // Right click on empty top-left canvas area
    await canvas.click({ button: "right", position: { x: 30, y: 30 } });

    const menu = page.locator(".canvas-context-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByText("Novo elemento")).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Nova Variável/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Nova Equação/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Selecionar todos/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Enquadrar tudo/ })).toBeVisible();

    // Select all via context menu
    await menu.getByRole("menuitem", { name: /Selecionar todos/ }).click();
    await expect(menu).not.toBeVisible();
  });

  test("inspector collapse docks panel to the right and expands back", async ({
    page,
  }) => {
    await ready(page);

    // Inspector is open initially
    await expect(page.locator(".properties-panel")).toBeVisible();

    // Click collapse button
    const collapseBtn = page.getByRole("button", {
      name: "Ocultar propriedades para a direita",
    });
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();

    // Inspector is docked into slim vertical strip on the right
    await expect(page.locator(".properties-panel")).not.toBeVisible();
    const dockedStrip = page.locator(".inspector-docked-strip");
    await expect(dockedStrip).toBeVisible();
    const expandBtn = page.getByRole("button", {
      name: "Expandir painel de propriedades",
    });
    await expect(expandBtn).toBeVisible();

    // Click expand button to restore
    await expandBtn.click();
    await expect(page.locator(".properties-panel")).toBeVisible();
    await expect(page.locator(".inspector-docked-strip")).not.toBeVisible();
  });

  test("settings dialog opens full 2-column modal with category tabs", async ({
    page,
  }) => {
    await ready(page);

    await page.getByRole("button", { name: "Configurações" }).click();

    const dialog = page.locator(".settings-modal-layout");
    await expect(dialog).toBeVisible();

    // Verify tabs
    await expect(dialog.getByRole("button", { name: "Geral" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Aparência" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Viewport" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Nós" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Motor" })).toBeVisible();

    // Switch to Viewport
    await dialog.getByRole("button", { name: "Viewport" }).click();
    await expect(dialog.getByLabel("Navegação e Pan")).toBeVisible();

    // Switch to Nós
    await dialog.getByRole("button", { name: "Nós" }).click();
    await expect(
      dialog.getByLabel("Cor de destaque do nó selecionado"),
    ).toBeVisible();

    // Close dialog
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("double-click enters the real module context and returns to the full Rust graph", async ({page}) => {
    test.setTimeout(120000);await ready(page);await createModuleForTest(page);await enableExperimentalSubgraphs(page);
    const canvas=page.locator('[data-testid="graph-canvas"] canvas');
    const position=await canvas.evaluate(el=>{const api=(el as any).__nexoViewport;const node=api.nodes.find((n:any)=>n.id==="nested_U");return {x:node.screenX,y:node.screenY};});
    await canvas.dblclick({position});
    await expect(page.getByRole("navigation",{name:"Navegação do grupo",exact:true})).toBeVisible();
    await expect.poll(()=>canvas.evaluate(el=>(el as any).__nexoViewport.nodeCount)).toBe(16);
    await page.getByRole("button",{name:"Modelo completo",exact:true}).click();
    await expect.poll(()=>canvas.evaluate(el=>(el as any).__nexoViewport.nodeCount)).toBe(32);
    await expect(page.locator(".subsystem-builder-view")).toHaveCount(0);
  });

  test("element library has '+ Novo Elemento no Catálogo' button and creates new item", async ({
    page,
  }) => {
    await ready(page);

    // Switch to Elementos tab
    await page.getByRole("tab", { name: /Elementos/ }).click();
    await expect(page.locator(".elements-library")).toBeVisible();

    // Click "+ Novo Elemento no Catálogo"
    const newBtn = page.getByRole("button", {
      name: "Novo Elemento no Catálogo",
    });
    await expect(newBtn).toBeVisible();
    await newBtn.click();

    // Modal opens
    const modal = page.locator(".new-catalog-dialog");
    await expect(modal).toBeVisible();

    // Fill form
    await modal.getByLabel("Identificador do elemento").fill("Q_custom_test");
    await modal.getByLabel("Rótulo do elemento").fill("Carga de Teste");
    await modal.getByRole("button", { name: "Criar e Adicionar ao Catálogo" }).click();

    // Modal closes and new element is listed in library
    await expect(modal).not.toBeVisible();
    await expect(
      page.locator(".elements-library").getByText("Q_custom_test"),
    ).toBeVisible();
  });

  test("status bar help icon has proper gap and does not overlap text", async ({
    page,
  }) => {
    await ready(page);

    const helpContainer = page.locator(".status-bar .context-help");
    await expect(helpContainer).toBeVisible();

    const icon = helpContainer.locator(".hint-icon");
    const text = helpContainer.locator("> span");
    await expect(icon).toBeVisible();
    await expect(text).toBeVisible();

    // Check computed flex layout & gap
    const styles = await helpContainer.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        display: computed.display,
        gap: computed.gap,
        alignItems: computed.alignItems,
      };
    });
    expect(["flex", "inline-flex"]).toContain(styles.display);
    expect(styles.gap).toBe("8px");
    expect(styles.alignItems).toBe("center");
  });

  test("mode tools are in left rail, node creation in right rail, and prominent execute in top bar", async ({
    page,
  }) => {
    await ready(page);

    // Verify prominent execute button in top header bar
    const runBtn = page.getByRole("button", { name: "Executar verificação" });
    await expect(runBtn).toBeVisible();
    await expect(runBtn).toContainText("Executar");

    // Verify view switcher tabs in top bar
    await expect(page.getByRole("tab", { name: "Grafo" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Elementos" })).toBeVisible();

    // Verify mode tools (Select and Pan) in left navigation rail
    const leftRail = page.getByRole("navigation", { name: "Ferramentas do viewport" });
    const selectBtn = leftRail.getByRole("button", { name: "Selecionar elementos" });
    const panBtn = leftRail.getByRole("button", { name: "Mover viewport" });
    await expect(selectBtn).toBeVisible();
    await expect(panBtn).toBeVisible();

    // Verify right rail has node creation tools
    const rightRail = page.getByRole("navigation", { name: "Adicionar elementos" });
    const addVarBtn = rightRail.getByRole("button", { name: "Adicionar variável" });
    await expect(addVarBtn).toBeVisible();

    // Clicking right rail tool expands the library drawer palette (Clip Studio / AnimeIAI style)
    await addVarBtn.click();
    const drawer = page.getByTestId("node-library-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Variáveis");
    await expect(drawer.getByRole("button", { name: "Novo" })).toBeVisible();

    // Clicking it again recoils/collapses the drawer
    await addVarBtn.click();
    await expect(drawer).not.toBeVisible();

    // Select tool is active by default
    await expect(selectBtn).toHaveClass(/active/);
    await expect(panBtn).not.toHaveClass(/active/);

    // Switch to Pan tool
    await panBtn.click();
    await expect(panBtn).toHaveClass(/active/);
    await expect(selectBtn).not.toHaveClass(/active/);

    // Switch back with shortcut V
    const viewport = page.getByTestId("graph-viewport");
    await viewport.click();
    await page.keyboard.press("v");
    await expect(selectBtn).toHaveClass(/active/);

    // Press and hold Space activates pan mode temporarily
    await page.keyboard.down("Space");
    await expect(viewport).toHaveClass(/is-space/);
    await page.keyboard.up("Space");
    await expect(viewport).not.toHaveClass(/is-space/);

    // Test project search
    const searchContainer = page.locator(".project-search");
    await expect(searchContainer).toBeVisible();
    const searchInput = searchContainer.locator("input");

    // Focus inside search container
    await searchInput.focus();
    await expect(searchInput).toBeFocused();
    await expect
      .poll(async () => {
        return await searchContainer.evaluate(
          (el) => window.getComputedStyle(el).borderColor,
        );
      })
      .toBe("rgb(23, 141, 204)");

    // Type query to search
    await searchInput.fill("Potência");
    const results = searchContainer.locator(".search-results");
    await expect(results).toBeVisible();
    await expect(results.getByText("Potência térmica total")).toBeVisible();

    // Clicking search result navigates to node
    await results.getByText("Potência térmica total").click();
    await expect(results).not.toBeVisible();
    await expect(page.locator(".properties-panel")).toBeVisible();
  });

  test("node library palette drawer filters, inserts template, and supports drag-and-drop to canvas", async ({
    page,
  }) => {
    await ready(page);

    const rightRail = page.getByRole("navigation", { name: "Adicionar elementos" });
    const addVarBtn = rightRail.getByRole("button", { name: "Adicionar variável" });

    // Open drawer
    await addVarBtn.click();
    const drawer = page.getByTestId("node-library-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("Variáveis")).toBeVisible();
    await expect(drawer.locator(".drawer-resize-handle")).toBeVisible();
    await expect(drawer.locator(".visual-node-thumb").first()).toBeVisible();

    // Filter templates
    const searchInput = drawer.locator(".drawer-search-input");
    await searchInput.fill("Temperatura");
    await expect(drawer.getByText("Temperatura Externa (T_ext)")).toBeVisible();
    await expect(drawer.getByText("Vazão Mássica de Ar (ṁ)")).toBeHidden();

    // Clear filter
    await drawer.locator(".drawer-search-clear").click();
    await expect(drawer.getByText("Vazão Mássica de Ar (ṁ)")).toBeVisible();

    // A real pointer drag instantiates the template at the release point.
    const canvas = page.locator('[data-testid="graph-canvas"] canvas');
    const bounds = (await canvas.boundingBox())!;
    const template = drawer.locator(".drawer-card").filter({ hasText: "Vazão Mássica de Ar (ṁ)" });
    await template.hover();
    await page.mouse.down();
    await page.mouse.move(bounds.x + 160, bounds.y + 180, { steps: 12 });
    await page.mouse.up();

    // Verify newly inserted node opens in inspector with template properties
    const inspector = page.getByLabel("Detalhes da investigação");
    await expect(inspector).toBeVisible();
    await expect(inspector.getByLabel("Rótulo", { exact: true })).toHaveValue(
      "Vazão Mássica de Ar (ṁ)",
    );
    await expect(inspector.getByLabel("Unidade", { exact: true })).toHaveValue("kg/s");

    // Switch to equation drawer
    const addEqBtn = rightRail.getByRole("button", { name: "Adicionar equação" });
    await addEqBtn.click();
    await expect(drawer.getByText("Equações")).toBeVisible();

    const equationTemplate = drawer.locator(".drawer-card").first();
    const label = await equationTemplate.locator(".card-label").textContent();
    await equationTemplate.hover();
    await page.mouse.down();
    await page.mouse.move(bounds.x + 230, bounds.y + 250, { steps: 12 });
    await page.mouse.up();
    await expect(inspector.getByLabel("Rótulo", { exact: true })).toHaveValue(label!);

    // Press Escape to close drawer
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });
});
