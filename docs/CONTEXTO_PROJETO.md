# Contexto do projeto — leitura de entrada para uma nova conversa

## 1. O que estamos construindo

Um laboratório computacional de conhecimento, com interface gráfica desktop, para
representar e investigar as relações entre problemas reais, modelos, equações,
variáveis, hipóteses, evidências e resultados. O objetivo final inclui tanto problemas
matemáticos e científicos quanto falhas, omissões e inconsistências em software,
sistemas e arquivos que o usuário desenvolve.

A unidade central é conhecimento verificável. IA poderá ajudar na extração e na
geração de hipóteses, enquanto regras determinísticas, álgebra, solvers e testes
verificam o que estiver dentro de seus domínios. O grafo preserva contexto e evidência.

O produto deve permitir seguir o caminho de uma pergunta até as equações, os dados
ou o código que sustentam uma resposta e identificar exatamente onde falta suporte.
Uma relação candidata não vira descoberta científica por ter sido gerada por IA,
ajustada a dados ou desenhada no grafo.

## 2. Decisões do usuário que devem ser preservadas

- O motor deve ser extensível a múltiplos domínios; começar por um domínio pequeno
  permite validar o método sem prometer resolver qualquer ciência automaticamente.
- Priorizar um aplicativo instalável, com acesso local a projetos e arquivos.
- A interface gráfica existe desde o início. CLI pode existir para automação, mas
  não deve ser o caminho obrigatório para o usuário final.
- Usar **Tauri com Rust**, **painéis/barras em React/TypeScript**, **viewport e nós
  em Rust (WebAssembly + WebGL2 na GPU)** e **motor científico em Python**.
- **Nota de mudança arquitetural da stack (23/10/2026):** inicialmente o viewport
  usava Cytoscape.js com cartões em HTML/DOM. Com base na experiência prática de que
  centenas ou milhares de nós em DOM/SVG geram lag severo, o usuário determinou a
  migração de tudo o que está dentro do viewport (câmera, nós, portas organizadas de
  entrada/saída/estados, ligações curvas entre portas e gráficos internos dos nós)
  para **Rust na GPU (`packages/viewport-core` → WASM + WebGL2)**, mantendo painéis
  e barras de ferramentas em React.
- No motor científico em Python, não reescrever tudo em Rust por antecipação: medir
  gargalos e otimizar algoritmos matemáticos específicos somente quando houver vantagem comprovada.
- **Windows é o primeiro sistema-alvo**, confirmado pelo usuário nesta rodada.
- Versão web, colaboração, GitHub e execução na nuvem são caminhos futuros que
  reaproveitam o núcleo; não são pré-requisitos para uso local.
- O usuário decidiu continuar a próxima rodada num chat local, com uma pasta no
  computador e o código sincronizado com o GitHub.
- Nome “Nexo” foi adotado provisoriamente na interface, sem decisão de marca.
- O usuário pediu a identidade visual desse nome: kit vetorial, iconografia,
  ícone Windows e splash em `assets/brand`. Confirmou que a palavra transcrita
  “econometria” significava iconografia/construção da marca, não análise econométrica.
- Na interface, o usuário prefere iteração por `npm run desktop:dev` e hot reload;
  não gerar/reinstalar o aplicativo a cada ajuste. Usar uma área de trabalho clara,
  com painéis recuperáveis pelo menu Exibir e ferramentas compactas.

## 3. Onde estamos

Existe o primeiro percurso funcional: carregar um exemplo térmico, visualizar um
grafo, selecionar elementos, executar verificações e investigar resultados. É código
executável, não apenas um mockup. A interface chama o motor Python real.

Foram implementados contratos de entrada restritos, exemplos, verificadores,
protocolo versionado, empacotamento Python, ponte Rust, viewport Rust/WASM/WebGL2 e host Tauri.
O executável Python e a ponte foram exercitados no Linux da nuvem e no Windows local.

**A janela e o instalador Windows foram exercitados na retomada local de 23/10/2026.**
Build, instalação nesta máquina, Unicode e importação/exportação funcionaram após
correção da concorrência do transporte desktop. A R2 segue aberta para instalação
limpa (fase final), extensão de orçamentos ao MCP e validação da distribuição. Cancelamento
nativo com contenção e orçamento de memória comprometida/CPU usuário dos processos
Windows foi implementado e exercitado em 24/10; limites em PONTE_NATIVA.md.
A máquina cloud não possui os pacotes de
desenvolvimento GLib/GTK/WebKit para compilar o host Linux; esse bloqueio continua
separado da evidência Windows. O workflow remoto da base também passou e gerou
artefato sem assinatura, sem publicação de release; veja o documento de estado.

Na continuidade local de 24/10, preferências/idioma, recuperação e histórico por
modelo/revisão passaram a existir. Recuperação e histórico usam arquivos JSON
atômicos separados no diretório local do app; SQLite continua uma proposta anterior,
não uma dependência implementada. Execuções arquivadas não viram análise corrente.
Detalhes e limites ficam no estado. Existe um conector experimental JSON por linha
para autoria em sessão separada, análise e evidências, com conflitos por revisão.
Há também [adaptador MCP stdio](MCP_LOCAL.md), com SDK oficial opcional e cliente
real testado. Propostas portáteis agora podem ser revisadas e aplicadas pelo menu
Arquivo, com comparação de conteúdo e Desfazer. Há registro persistente local das
decisões, separado da evidência científica e com aplicação não confirmada explícita;
há entrega direta experimental por conexão local Windows e fila persistente sem
credenciais, com retomada/revisão e sincronização explícita de recibos após reinício,
sem edição automática. Contrato em [CONEXAO_DESKTOP.md](CONEXAO_DESKTOP.md) e autoria em
[CONECTOR_LOCAL.md](CONECTOR_LOCAL.md).

Na continuidade de25/10, projetos e cópias de recuperação passaram a preservar
histórico limitado de edições/Desfazer/Refazer. Há módulos planos reutilizáveis com
portas/namespaces e relações reais, biblioteca, grupos Rust/GPU recolhíveis, feixes e
navegação de contexto. Não é composição recursiva. Contratos em
[HISTORICO_EDICOES.md](HISTORICO_EDICOES.md) e [MODULOS_E_GRUPOS.md](MODULOS_E_GRUPOS.md).

Contagens de testes, comandos verificados e pendências vivem em
[ESTADO_ATUAL.md](ESTADO_ATUAL.md), evitando duplicar um estado que mudará.

Na continuação de 23/10, o usuário priorizou uma interface com comportamento de
programa desktop e, em seguida, uma arquitetura mais robusta de viewport em Rust + GPU.
O viewport central (`packages/viewport-core` + `apps/desktop/src/viewportEngine.ts`)
mantém o mesmo `<canvas>` WebGL2 montado entre análises e abas; resultados atualizam
estados, portas e gráficos internos em Rust sem reconstruir o layout nem perder a câmera.
Os nós possuem portas estruturadas e ordenadas por função: entradas (`INPUT_TO`) à
esquerda, saídas (`PRODUCES`) à direita, hipóteses (`ASSUMPTION_FOR`) no topo,
requisitos (`REQUIRES`) na base e validação (`VALIDATED_BY`) com curvas Bézier
roteadas porta a porta e gráficos analíticos embutidos em cada cartão. Layout visual
não representa inferência causal nem muda os resultados científicos.

## 4. O que o exemplo demonstra

Modelo educacional estacionário, sem ganhos solares ou internos:

`P_total = U · A · ΔT + ρ · cp · vazão · ΔT`

Com os valores sintéticos cadastrados:

- Transmissão: 1.000 W.
- Troca de ar: 1.200 W.
- Total: 2.200 W.

Quatro cenários: completo; transmitância sem valor; área em metros em vez de metros
quadrados; troca de ar omitida. Neste último, o contrato exige uma parcela ausente e
a previsão diverge da referência. O sistema apresenta dois achados diferentes, sem
alegar ter descoberto a causa única de um fenômeno.

O teste de importação também altera uma entrada e recalcula a previsão, para evitar
validar uma interface que apenas reproduza números fixos.

## 5. Arquitetura implementada

```text
Painéis e barras React/TypeScript + Viewport Rust/WASM/WebGL2 (GPU)
  ├─ Viewport: packages/viewport-core (Rust → WASM) → WebGL2 no <canvas>
  ├─ Desktop: invoke(engine_request) → host Tauri → ponte Rust
  └─ Desenvolvimento na nuvem/local: adaptador Vite → processo Python
                                                  ↓
                          protocolo JSON UTF-8 por stdin/stdout
                                                  ↓
                          esquema + motor + verificadores Python
```

Ambos os transportes chegam às mesmas operações: listar exemplos, carregar exemplo,
validar/importar modelo e executar verificações. O protocolo tem versão, ID da
requisição e sucesso/erro explícitos. O host aceita um executável fixo empacotado;
o frontend não pode escolher um programa ou uma string de shell para executar.

O host desktop serializa chamadas e aplica timeout de 120 s. Um novo processo Python
é iniciado por requisição; é uma simplificação a medir antes de optar por processo
persistente. No Windows, o job limita memória comprometida agregada e CPU usuário;
não é sandbox completa e não executa código
de repositórios importados.

Expressões usam referências a variáveis e uma árvore restrita de adição, subtração
e multiplicação. Não usamos `eval`, `exec` ou interpretação de strings de Python.
SymPy constrói a representação simbólica; Pint calcula quantidades e verifica unidades.
Não há ainda demonstração formal ou verificador simbólico geral.

As setas do grafo atual representam fluxo computacional: `INPUT_TO`, `PRODUCES`,
`ASSUMPTION_FOR`, `REQUIRES`, `VALIDATED_BY`. Não são inferência causal automática.
O esquema inicial tem listas de variáveis, equações, hipóteses, requisitos e observações;
a ontologia mais ampla do relatório ainda não foi toda implementada.

## 6. Mapa rápido do código

| Arquivo/diretório                                  | Onde mexer quando…                                                |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `services/engine/knowledge_engine/schema.py`       | Mudar contratos, AST e limites de entrada                         |
| `services/engine/knowledge_engine/examples.py`     | Acrescentar casos de referência                                   |
| `services/engine/knowledge_engine/verification.py` | Alterar regras, cálculo e projeção do grafo                       |
| `services/engine/knowledge_engine/protocol.py`     | Alterar operações e transporte JSON                               |
| `packages/viewport-core/src/lib.rs`                | Mudar layout, nós, portas, ligações, gráficos e buffers GPU (Rust)|
| `scripts/build_viewport_wasm.mjs`                  | Compilar e publicar o binário `.wasm` do viewport                 |
| `apps/desktop/src/viewportEngine.ts`               | Mudar shaders WebGL2, ponte WASM e atlas tipográfico              |
| `apps/desktop/src/GraphView.tsx`                   | Mudar ferramentas do viewport, eventos e integração React/GPU     |
| `packages/desktop-bridge/src/lib.rs`               | Mudar comunicação com o processo Python                           |
| `apps/desktop/src-tauri/src/main.rs`               | Integrar a janela ao motor                                        |
| `apps/desktop/src-tauri/tauri.conf.json`           | Configurar desenvolvimento e empacotamento                        |
| `apps/desktop/src/engine.ts`                       | Alterar o adaptador frontend/host                                 |
| `apps/desktop/src/App.tsx`                         | Mudar o fluxo de investigação e painéis                           |
| `scripts/bundle_engine.py`                         | Ajustar distribuição do Python por sistema                        |
| `.github/workflows/validation.yml`                 | Alterar checks e geração de instalador Windows                    |

## 7. O que ainda não existe

- Instalação Windows em máquina limpa, assinatura e atualização automática.
- Abertura/análise geral de uma pasta de código; o importador atual recebe modelos JSON.
- SQLite, auditoria imutável e histórico de todos os ajustes visuais. Histórico limitado
  de modelos/edições existe no projeto; recuperação e execuções usam JSON local.
- Grupos aninhados e composição recursiva de módulos. Módulos planos e grupos de um
  nível já existem; análises permanecem no modelo científico completo.
- Orçamentos de recursos no worker MCP e em outras plataformas, configurações
  desses orçamentos e isolamento completo. Cancelamento, contenção e orçamento
  agregado de memória comprometida/CPU usuário existem no host Windows; não são sandbox.
- Extração de PDFs, busca de artigos, LLM, inferência causal ou prova formal.
- Autenticação, colaboração, sincronização e análise de PRs.

O projeto agora pode ser nomeado, salvo e reaberto como `.nexo.json`, com modelo,
posições, câmera, visibilidade e painéis. No Windows há diálogos nativos e gravação
por temporário/substituição; no navegador de desenvolvimento há download/importação.
Até20 execuções são persistidas separadamente por perfil (8 MB) e não são incluídas no projeto.
Ao reabrir, os resultados precisam ser executados novamente. O menu Arquivo preserva
importação/exportação do modelo JSON v1. O editor restrito permite quantidades,
fontes, expressões com parênteses, saída e referências, com desfazer/refazer na sessão.

A nova prioridade do usuário inclui acompanhar a construção do conhecimento,
com grupos e feixes de relações e, futuramente, eventos atribuídos a agentes reais.
O [roteiro detalhado](EVOLUCAO_DO_LABORATORIO.md) separa entidades, relações, revisão
humana, evidência científica, organização visual e atividade. Estes recursos futuros
não devem ser simulados como já implementados. GitHub é origem de dados, diferente
do local de execução da análise.

## 8. Como continuar no chat local

1. Abrir a pasta do clone correto. Confirmar branch, alterações locais e último commit;
   não sobrescrever trabalho do usuário para sincronizar.
2. Ler este arquivo, `docs/ESTADO_ATUAL.md`, `docs/PLANO_IMPLEMENTACAO.md` e `AGENTS.md`.
3. Verificar pré-requisitos Windows do README: Python 3.12, Node 24, uv, Rust/MSVC
   (incluindo target `wasm32-unknown-unknown`), ferramentas C++/SDK e WebView2.
4. Executar instalação por lockfiles, `npm run viewport:build` (se alterar o crate do
   viewport), empacotar o sidecar e fazer o smoke test.
5. Rodar a ponte Rust e abrir Tauri; resolver o primeiro erro concreto de Windows.
6. Validar instalador limpo e percurso gráfico antes de ampliar capacidades.
7. Registrar resultados, limitações e próximos passos no documento de estado.
8. Organizar commits pequenos e enviar ao GitHub conforme o fluxo autorizado pelo usuário.

Os comandos Windows do README são o roteiro para essa validação; não assuma que já
foram executados porque há um script ou workflow pronto. PyInstaller não é
cross-compiler: o binário Linux da nuvem não serve como motor Windows.

## 9. Para onde vamos

Primeiro fechar o percurso Windows. Depois persistência/edição, um analisador de
software delimitado com arquivos locais e somente então ampliação de domínios,
fontes e descoberta assistida. Esses passos estão em épicos no plano. A visão final
continua abrangente, mas cada capacidade precisa de um caso verificável e limites
explícitos.

Uma medida consistente de avanço é: “qual pergunta o usuário consegue investigar
agora, com qual evidência e com que confiabilidade?”. Quantidade de nós, agentes
ou sugestões de IA, isoladamente, não responde a isso.
