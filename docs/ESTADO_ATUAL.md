# Estado atual — ponto de retomada

Última atualização: 23/10/2026. Rodada: **R1, base funcional com validação desktop pendente**.
Próxima sessão: **chat local no Windows**, conforme decisão do usuário.

## Leia primeiro

O [contexto do projeto](CONTEXTO_PROJETO.md) explica objetivo final e decisões.
O [plano](PLANO_IMPLEMENTACAO.md) organiza as entregas em épicos. Este arquivo é a
fonte do estado implementado e deve ser atualizado ao encerrar cada rodada.

## Entregue nesta rodada

- Motor Python com esquema validado e expressão estruturada sem execução de código.
- Regras de integridade, cobertura, dimensões, dependências acíclicas e resíduo absoluto.
- Resultados `passed`, `failed` e `inconclusive`, com evidência, regra e orientação.
- Referência sintética térmica e três variantes com defeitos conhecidos.
- Grafo React/Cytoscape, lista de elementos, investigação de achados e importação/exportação JSON.
- Host Tauri com permissões restritas e executável fixo; ponte Rust testável sem GTK.
- JSON UTF-8 explícito, inclusive quando o processo Python herda codificação legada.
- Empacotador PyInstaller e teste funcional do executável.
- Lockfiles npm, uv e Cargo; instruções de instalação e fluxo Windows de CI.
- Contexto, plano, pesquisa e instruções para retomada por agentes.

## Evidência da máquina cloud Linux

| Verificação                  | Resultado                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Motor Python                 | 21 testes aprovados: cálculos, conversão, omissões, ciclos, integridade, limites e protocolo                    |
| Adaptador TypeScript         | 2 testes aprovados: erros do motor e resposta com ID incompatível                                               |
| Interface com motor real     | 3 testes Playwright aprovados: quatro cenários, rejeição de JSON inseguro e exportação/importação com recálculo |
| Ponte Rust/Python empacotado | 3 testes aprovados: ida e volta, binário ausente e entrada excessiva                                            |
| TypeScript e build Vite      | Aprovados; aviso de bundle acima de 500 KB permanece, sem benchmark de desempenho                               |
| Ruff                         | Aprovado                                                                                                        |
| Rustfmt                      | Aprovado para ponte e host                                                                                      |
| PyInstaller Linux            | Executável de cerca de 30 MB construído; smoke test retorna 2.200 W e detecta a omissão                         |
| Tauri nativo Linux           | Bloqueado em `glib-sys`: faltam GLib/GTK/WebKit de desenvolvimento; compilação completa não verificada          |
| Tauri e instalador Windows   | Ainda não executados nesta sessão Linux                                                                         |

Esses resultados se referem à rodada cloud. Navegador testado: Chromium do sistema,
via `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`. O download do browser pelo
Playwright foi bloqueado com 403 pelo proxy; não foi necessário relaxar verificação
TLS ou substituir testes por mocks.

O workflow Windows está escrito, mas sua execução remota e o artefato não estão
incluídos nos resultados acima. Ao retomar, verificar a aba Actions e registrar o
resultado real. O script ou sua publicação no GitHub não prova que o build passou.

## Limites atuais

- Sessão em memória. Exportação salva o modelo, não um histórico de execuções.
- Não há SQLite, editor de equações, KaTeX ou comparação persistente de revisões.
- Não há análise de repositórios/pastas, código de usuário ou documentos científicos.
- SymPy constrói expressões; não há prova formal nem análise simbólica geral.
- Requisitos de cobertura são cadastrados no modelo; o motor não conhece toda a física.
- Ciclos e múltiplas definições são inconclusivos, sem solver de sistemas simultâneos.
- Host aplica timeout/tamanho/serialização, sem sandbox completa de CPU/memória.
- Interface de arquivos é a do frontend; testar comportamento nativo Windows e
  implementar diálogos apropriados se necessário.
- Instalador sem assinatura, atualização automática e política de licença pendentes.

## Próxima ação concreta — R2 no Windows

1. Ler o contexto e confirmar o clone/branch e os pré-requisitos do README.
2. `uv sync --frozen` e `npm ci`.
3. `npm run engine:bundle` e `uv run python scripts/smoke_sidecar.py`.
4. Configurar `KNOWLEDGE_ENGINE_BINARY` para o `.exe` gerado e rodar os testes da ponte.
5. `npm run desktop:dev`: corrigir erros de compilação/empacotamento que aparecerem.
6. Validar janela, Unicode, arquivos, respostas do motor e fechamento dos processos.
7. `npm run desktop:build -- --bundles nsis`; testar instalação em Windows sem Python.
8. Registrar evidência e só então iniciar E1 (persistência/edição).

Não reabrir a decisão de stack nem começar pela CLI. Não expandir para IA ou análise
geral de software antes de fechar esse percurso desktop.

## Retomada na nuvem, se necessária

Checkout atual: `/workspace/Mathematical-Causal-Knowledge-Graph-with-Gap-Analysis`.
Ativação: `. scripts/cloud-env.sh`. Rust está sob `/workspace/.toolchains`, fora do
Git; isso é específico da máquina cloud e não deve ser copiado para configurar o Windows.

```bash
uv sync --frozen
npm ci
uv run pytest -q
npm run test
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
npm run engine:bundle
uv run python scripts/smoke_sidecar.py
KNOWLEDGE_ENGINE_BINARY="$PWD/apps/desktop/src-tauri/binaries/knowledge-engine-x86_64-unknown-linux-gnu" cargo test --locked --manifest-path packages/desktop-bridge/Cargo.toml
```

Para iniciar a interface de desenvolvimento, usar `npm run dev`; não presumir que
um servidor de sessão anterior continue rodando. Os binários, dependências locais,
artefatos de build e resultados de testes são ignorados pelo Git e devem ser recriados.
