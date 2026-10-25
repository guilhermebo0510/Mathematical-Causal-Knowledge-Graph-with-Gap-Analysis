// Rebuild the editable brand kit and Windows icons without building the application.
// Uses the repository's existing React, Lucide and Playwright dependencies.
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kit = resolve(root, "assets/brand");
const publicDir = resolve(root, "apps/desktop/public/brand");
const nativeDir = resolve(root, "apps/desktop/src-tauri/icons");
for (const folder of [kit, publicDir, nativeDir, `${kit}/logos`, `${kit}/icons`, `${kit}/app`, `${kit}/splash`]) await mkdir(folder, { recursive: true });
const palette = { ink: "#182b47", teal: "#007f8b", mint: "#68dfcf", paper: "#f3f8fb", blue: "#1687ef", green: "#00865b", purple: "#8955e8", amber: "#e97816" };
const svg = (w, h, body, title = "Nexo") => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}">${body}</svg>`;
// 64-unit construction: 24-unit verticals, four 5-unit terminals, 5-unit connectors.
const mark = (stroke = palette.teal, fill = "white") => `<path d="M20 44V20L44 44V20" fill="none" stroke="${stroke}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>${[[20,44],[20,20],[44,44],[44,20]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`).join("")}`;
const wordmark = (color) => `<text x="76" y="49" fill="${color}" font-family="Segoe UI,Arial,sans-serif" font-size="48" font-weight="650" letter-spacing="-2">Nexo</text>`;
const save = (path, data) => writeFile(resolve(kit, path), data);
await save("tokens.json", JSON.stringify({ name: "Nexo", version: 2, colors: palette, themes: {"light": {"canvas": "#fcfcfa", "panel": "#ffffff", "chrome": "#f1f3f4", "text": "#292d30", "muted": "#687077"}, "dark": {"canvas": "#202020", "panel": "#2a2a2a", "chrome": "#242424", "text": "#e3e3e3", "muted": "#aaaaaa"}}, typography: { ui: "Segoe UI, system-ui, sans-serif", mono: "Cascadia Code, Consolas, monospace" }, iconography: { library: "Lucide", viewBox: 24, strokeWidth: 1.75, preferredSizes: [16,18,20,24] } }, null, 2) + "\n");
for (const [name, stroke, fill, text] of [
  ["light", palette.teal, "white", palette.ink],
  ["dark", palette.mint, "#242424", "white"],
  ["mono", palette.ink, "white", palette.ink],
  ["white", "white", palette.ink, "white"],
]) {
  await save(`logos/symbol-${name}.svg`, svg(64,64,mark(stroke,fill)));
  await save(`logos/wordmark-${name}.svg`, svg(204,64,mark(stroke,fill)+wordmark(text)));
  await save(`logos/stacked-${name}.svg`, svg(240,176,`<g transform="translate(72 0) scale(1.5)">${mark(stroke,fill)}</g><text x="120" y="151" text-anchor="middle" fill="${text}" font-family="Segoe UI,Arial,sans-serif" font-size="52" font-weight="650" letter-spacing="-2">Nexo</text>`));
}
const tile = svg(512,512,`<rect x="8" y="8" width="496" height="496" rx="112" fill="${palette.ink}"/><g transform="translate(0 0) scale(8)">${mark("white",palette.mint)}</g>`);
await save("app/app-icon.svg",tile);
await save("app/app-icon-small.svg",svg(32,32,`<rect width="32" height="32" rx="7" fill="${palette.ink}"/><path d="M9 23V9L23 23V9" fill="none" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>${[[9,23],[9,9],[23,23],[23,9]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="2.4" fill="${palette.mint}"/>`).join("")}`));
const splash = (dark) => svg(1200,720,`<rect width="1200" height="720" fill="${dark ? "#202020" : palette.paper}"/><defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${dark ? "#3c3c3c" : "#d5e3ed"}"/></pattern></defs><rect width="1200" height="720" fill="url(#grid)"/><path d="M0 560H1200" stroke="${dark ? "#3c3c3c" : "#d5e3ed"}"/><g transform="translate(432 190) scale(1.65)">${mark(dark ? palette.mint : palette.teal,dark ? "#202020" : palette.paper)}${wordmark(dark ? "white" : palette.ink)}</g><text x="600" y="360" text-anchor="middle" fill="${dark ? "#aaaaaa" : "#687e97"}" font-family="Segoe UI,Arial,sans-serif" font-size="21">Laboratório de conhecimento</text><text x="52" y="667" fill="${dark ? "#aaaaaa" : "#687e97"}" font-family="Segoe UI,Arial,sans-serif" font-size="16">Modelos · relações · evidências</text><text x="1148" y="667" text-anchor="end" fill="${dark ? "#aaaaaa" : "#687e97"}" font-family="Segoe UI,Arial,sans-serif" font-size="16">Nexo / Desktop</text>`);
await save("splash/splash-light.svg",splash(false));
await save("splash/splash-dark.svg",splash(true));
await save("construction.svg",svg(640,400,`<rect width="640" height="400" fill="${palette.paper}"/><defs><pattern id="units" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#dce5ed" stroke-width="1"/></pattern></defs><rect width="640" height="360" fill="url(#units)"/><g transform="translate(160 0) scale(5)">${mark()}</g><text x="320" y="382" text-anchor="middle" fill="${palette.ink}" font-family="Segoe UI,Arial,sans-serif" font-size="16">Malha 64 u · terminais r = 5 u · conexão = 5 u · respiro mínimo = 8 u</text>`));
const iconNames = ["MousePointer2","Hand","Search","FolderOpen","FileUp","ArrowDownToLine","Play","Square","Undo2","Redo2","Focus","ZoomIn","ZoomOut","Eye","EyeOff","PanelLeft","PanelRight","PanelBottom","Map","Network","Variable","FunctionSquare","FileText","Database","TriangleAlert","CircleCheck","Settings","MessageSquare","X","ChevronDown","Ellipsis","History"];
for (const name of iconNames) await save(`icons/${name}.svg`, renderToStaticMarkup(createElement(icons[name], {xmlns:"http://www.w3.org/2000/svg",width:24,height:24,strokeWidth:1.75,color:palette.ink,"aria-label":name})));
await copyFile(resolve(root,"node_modules/lucide-react/LICENSE"),resolve(kit,"icons/LICENSE-Lucide"));
const swatches = Object.entries(palette).map(([name,color])=>`<div class="swatch"><i style="background:${color}"></i><b>${name}</b><code>${color}</code></div>`).join("");
const iconSheet = iconNames.map(name=>`<div class="tool"><img src="icons/${name}.svg" alt=""/><small>${name}</small></div>`).join("");
await save("index.html",`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nexo · Identidade visual</title><style>*{box-sizing:border-box}body{margin:0;background:#edf3f7;color:#182b47;font:15px/1.6 'Segoe UI',sans-serif}main{max-width:1140px;margin:auto;padding:48px}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:32px}header img{width:204px}small,code{color:#687e97}h1{font-size:40px;letter-spacing:-1px;margin:0}h2{font-size:20px;margin:0 0 20px}p{max-width:720px;color:#687e97}section{padding:32px;background:white;border:1px solid #dce5ed;border-radius:12px;margin:20px 0}.variants{display:grid;grid-template-columns:1fr 1fr;gap:16px}.variant{min-height:150px;display:flex;align-items:center;justify-content:center;background:#f3f8fb;border-radius:8px}.dark{background:#242424}.variant img{width:260px}.colors{display:flex;gap:12px;flex-wrap:wrap}.swatch{width:110px;display:flex;flex-direction:column}.swatch i{height:64px;border:1px solid #dce5ed;border-radius:6px;margin-bottom:8px}code{font-size:12px}.tools{display:grid;grid-template-columns:repeat(8,1fr);gap:12px}.tool{display:flex;flex-direction:column;align-items:center;gap:12px;padding:14px 0}.tool img{width:24px}.tool small{font-size:10px}.assets{display:flex;gap:30px;align-items:center}.assets img{width:100px}.splash{width:100%;border:1px solid #dce5ed;border-radius:8px}.construction{max-width:100%}a{color:#007f8b}footer{padding:8px 0 32px;color:#687e97}.caption{font-size:12px} @media(max-width:700px){main{padding:20px}.variants{grid-template-columns:1fr}.tools{grid-template-columns:repeat(4,1fr)}}</style><main><header><img src="logos/wordmark-light.svg" alt="Nexo"/><small>IDENTIDADE VISUAL / 01 · 2026</small></header><h1>Conhecimento em conexão.</h1><p>Uma identidade técnica e discreta para um laboratório de modelos, relações e evidências. Quatro terminais ligados formam a letra N; o símbolo permanece legível na barra de tarefas e dentro da área de trabalho.</p><section><h2>01 / Assinaturas</h2><div class="variants"><div class="variant"><img src="logos/wordmark-light.svg" alt="Marca clara"/></div><div class="variant dark"><img src="logos/wordmark-dark.svg" alt="Marca escura"/></div><div class="variant"><img src="logos/wordmark-mono.svg" alt="Marca monocromática"/></div><div class="variant dark"><img src="logos/wordmark-white.svg" alt="Marca branca"/></div></div><p class="caption">SVGs com fundo transparente. Versões horizontal, vertical e símbolo isolado disponíveis na pasta logos.</p></section><section><h2>02 / Cor e hierarquia</h2><div class="colors">${swatches}</div><p>Azul profundo estrutura a interface; verde petróleo identifica ações e a marca. Azul, verde, violeta e âmbar distinguem tipos do grafo. Cor acompanha texto ou ícone e não substitui o estado da verificação.</p></section><section><h2>03 / Construção e tipografia</h2><img class="construction" src="construction.svg" alt="Malha de construção do símbolo"/><p><b>Segoe UI</b> para a marca e a interface. Cascadia Code ou Consolas para identificadores. Não distribuir as fontes do Windows. Os textos dos SVGs continuam editáveis e dependem da fonte; PNGs fixam a aparência exportada.</p><p>Respiro: 8 unidades ao redor da área de 64. Marca horizontal a partir de 102 px de largura; símbolo isolado a partir de 16 px usando a variante simplificada. Não esticar, girar, adicionar sombras ou trocar as cores dos terminais isoladamente.</p></section><section><h2>04 / Aplicativo e ferramentas</h2><div class="assets"><img src="app/app-icon.svg" alt="Ícone do aplicativo"/><div><b>Windows · ICO multirresolução</b><p>16, 20, 24, 32, 40, 48, 64, 128 e 256 px. PNGs até 1024 px. Versão simplificada para tamanhos pequenos.</p></div></div><div class="tools">${iconSheet}</div><p class="caption">Ferramentas: Lucide, traço 1,75 em malha 24. Usar 16–20 px nas barras compactas, 24 px nos seletores. Licença em icons/LICENSE-Lucide. O catálogo inclui ícones para uso futuro e não representa funcionalidades já implementadas.</p></section><section><h2>05 / Abertura</h2><img class="splash" src="splash/splash-light.svg" alt="Splash claro Nexo"/><p>Splash claro e escuro em SVG e PNG 1200 × 720. Na aplicação, a abertura acompanha o carregamento real, sem atraso artificial ou porcentagem inventada.</p></section><footer>Nexo · kit visual local. <a href="README.md">Inventário e instruções</a> · <a href="tokens.json">Tokens</a></footer></main></html>`);
await save("README.md",`# Nexo — kit de identidade visual\n\nAbra index.html para consultar o guia visual.\n\n- logos/: símbolo, assinatura horizontal e vertical; claro, escuro, monocromático e branco. SVG transparente e PNG 2×.\n- app/: ícone SVG, PNG 16–1024 e ICO Windows com 9 resoluções.\n- splash/: artes clara/escura, SVG e PNG 1200×720. Não contêm barra de progresso fictícia.\n- icons/: 32 ícones Lucide em SVG; licença incluída. Catálogo visual, não lista de recursos implementados.\n- construction.svg: malha e proporções do símbolo.\n- tokens.json: cores e convenções de tipografia/iconografia.\n- brand-board.png: prévia do guia.\n\nSímbolo original desenhado em vetores para este projeto. Segoe UI para a assinatura, sem redistribuir fontes: SVG contém texto editável e PNG registra a aparência exportada. Os ícones de ferramentas são Lucide, sujeitos à licença na pasta icons.\n\nRegenerar na raiz: node scripts/generate_brand_assets.mjs. Playwright usa PLAYWRIGHT_CHROMIUM_EXECUTABLE, ou Edge padrão no Windows. Sem build do app ou instalador. As cópias em apps/desktop/public/brand e src-tauri/icons são geradas pelo mesmo script. Ícones nativos atualizados serão incorporados na próxima compilação do host.\n`);
const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"});
try {
  const page = await browser.newPage({deviceScaleFactor:1});
  async function raster(source,destination,width,height) {
    await page.setViewportSize({width,height});
    await page.setContent(`<style>html,body{margin:0;background:transparent;overflow:hidden}img{width:100vw;height:100vh;display:block}</style><img src="data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}">`);
    await page.locator("img").evaluate(img=>img.decode());
    await page.screenshot({path:destination,omitBackground:true});
  }
  for (const size of [16,20,24,32,40,48,64,128,256,512,1024]) await raster(size<=32 ? await readFile(`${kit}/app/app-icon-small.svg`,"utf8") : tile,`${kit}/app/icon-${size}.png`,size,size);
  for (const variant of ["light","dark","mono","white"]) for (const type of ["symbol","wordmark","stacked"]) {
    const [w,h] = type==="symbol" ? [128,128] : type==="wordmark" ? [408,128] : [480,352];
    await raster(await readFile(`${kit}/logos/${type}-${variant}.svg`,"utf8"),`${kit}/logos/${type}-${variant}.png`,w,h);
  }
  for (const variant of ["light","dark"]) await raster(splash(variant==="dark"),`${kit}/splash/splash-${variant}.png`,1200,720);
  const sizes=[16,20,24,32,40,48,64,128,256];
  const pngs=await Promise.all(sizes.map(size=>readFile(`${kit}/app/icon-${size}.png`)));
  const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
  let offset=header.length;
  sizes.forEach((size,index)=>{const pos=6+16*index;header[pos]=size===256?0:size;header[pos+1]=size===256?0:size;header.writeUInt16LE(1,pos+4);header.writeUInt16LE(32,pos+6);header.writeUInt32LE(pngs[index].length,pos+8);header.writeUInt32LE(offset,pos+12);offset+=pngs[index].length;});
  await save("app/icon.ico",Buffer.concat([header,...pngs]));
  await page.setViewportSize({width:1140,height:1000});
  await page.goto(new URL(`file:///${kit.replaceAll("\\","/")}/index.html`).href);
  await page.screenshot({path:`${kit}/brand-board.png`,fullPage:true});
} finally { await browser.close(); }
for (const [source,target] of [["logos/symbol-light.svg","symbol.svg"],["logos/wordmark-light.svg","wordmark.svg"],["app/app-icon.svg","app-icon.svg"],["logos/wordmark-dark.svg","wordmark-dark.svg"],["logos/symbol-dark.svg","symbol-dark.svg"]]) await copyFile(resolve(kit,source),resolve(publicDir,target));
// Copy native assets last so the dev watcher sees a complete, valid icon set.
await copyFile(resolve(kit,"app/icon-256.png"),resolve(nativeDir,"icon.png"));
await copyFile(resolve(kit,"app/icon.ico"),resolve(nativeDir,"icon.ico"));
console.log("Nexo brand kit generated: assets/brand/index.html");
