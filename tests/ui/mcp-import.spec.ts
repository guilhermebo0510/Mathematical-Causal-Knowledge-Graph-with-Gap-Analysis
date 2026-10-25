import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ready } from "./workspace-helpers";

test("MCP circuit exports reproduce revisions, voltages and power in the GPU UI", async ({page}, info) => {
  test.setTimeout(90000);
  const output = info.outputPath("mcp-artifacts");
  await promisify(execFile)("uv", ["run", "--extra", "mcp", "python", "scripts/validate_mcp.py", "--output-dir", output], {timeout:45000});
  const summary = JSON.parse(await readFile(join(output,"summary.json"),"utf8"));
  await ready(page);
  for (const [file,revision,failures] of [
    ["valid.model.json",summary.control_revision,0],
    ["known-defect.model.json",summary.defect_revision,1],
  ] as const) {
    await page.getByLabel("Arquivo do modelo").setInputFiles(join(output,file));
    await expect(page.locator("h1")).toHaveText("Circuito resistivo via MCP");
    await expect(page.getByTestId("finding-count")).toHaveText("—");
    const response = page.waitForResponse(r=>r.url().endsWith("/__engine") && r.request().postDataJSON()?.operation==="analyze");
    await page.keyboard.press("F5");
    const run=(await(await response).json()).data;
    expect(run.model_revision).toBe(revision);
    expect(run.values.V.value).toBe(6);
    expect(run.values.P.value).toBe(12);
    await expect(page.getByTestId("finding-count")).toHaveText(String(failures));
    await expect.poll(()=>page.locator('[data-testid="graph-canvas"] canvas').evaluate(el=>(el as HTMLCanvasElement & {__nexoViewport?:{nodeCount:number}}).__nexoViewport?.nodeCount),{timeout:20000}).toBe(9);
  }
});
