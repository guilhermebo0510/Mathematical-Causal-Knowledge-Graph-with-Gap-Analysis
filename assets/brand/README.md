# Nexo — kit de identidade visual

Abra index.html para consultar o guia visual.

- logos/: símbolo, assinatura horizontal e vertical; claro, escuro, monocromático e branco. SVG transparente e PNG 2×.
- app/: ícone SVG, PNG 16–1024 e ICO Windows com 9 resoluções.
- splash/: artes clara/escura, SVG e PNG 1200×720. Não contêm barra de progresso fictícia.
- icons/: 32 ícones Lucide em SVG; licença incluída. Catálogo visual, não lista de recursos implementados.
- construction.svg: malha e proporções do símbolo.
- tokens.json: cores e convenções de tipografia/iconografia.
- brand-board.png: prévia do guia.

Símbolo original desenhado em vetores para este projeto. Segoe UI para a assinatura, sem redistribuir fontes: SVG contém texto editável e PNG registra a aparência exportada. Os ícones de ferramentas são Lucide, sujeitos à licença na pasta icons.

Regenerar na raiz: node scripts/generate_brand_assets.mjs. Playwright usa PLAYWRIGHT_CHROMIUM_EXECUTABLE, ou Edge padrão no Windows. Sem build do app ou instalador. As cópias em apps/desktop/public/brand e src-tauri/icons são geradas pelo mesmo script. Ícones nativos atualizados serão incorporados na próxima compilação do host.

## Temas do aplicativo — revisão 24/10/2026

Tema escuro usa grafite neutro: canvas #202020, painéis #2a2a2a, barras #242424,
texto #e3e3e3 e apoio #aaaaaa. Acento menta/teal e cores semânticas dos tipos
permanecem; azul não é usado como fundo geral. Wordmark/símbolo escuros e splash
acompanham esse fundo em SVG e PNG. O ícone Windows mantém sua identidade própria.
Tokens por tema estão em tokens.json; superfícies da aplicação em src/themes.css.
