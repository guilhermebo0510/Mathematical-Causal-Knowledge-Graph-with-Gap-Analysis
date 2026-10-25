import {expect,test} from "@playwright/test";
import {ready} from "./workspace-helpers";

test("Escape cancels an active browser request without reporting a completed analysis", async({page})=>{
  await ready(page);
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/__engine",async route=>{
    if(route.request().postDataJSON()?.operation==="analyze") await gate;
    await route.continue().catch(()=>{});
  });
  await page.keyboard.press("F5");
  const dock=page.locator(".results-dock");
  try {
    await expect(dock.getByRole("button",{name:/Cancelar/})).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dock.getByRole("progressbar")).toHaveCount(0,{timeout:10000});
    await expect(dock).toContainText("cancelada");
    await expect(dock.locator(".terminal-line.success")).toHaveCount(0);
    await expect(page.getByTestId("finding-count")).toHaveText("—");
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("nexo.history.v1")??'{"entries":[]}').entries.length)).toBe(0);
  } finally {release();}
});
