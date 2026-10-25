# Plano de implementação

## Forma de trabalho

Usar um épico por capacidade e rodadas pequenas com critérios de aceitação. Não
adotar sprints com prazo fixo antes de conhecer a capacidade da equipe. Cada rodada
termina com código revisável, evidência de validação e atualização de
[ESTADO_ATUAL.md](ESTADO_ATUAL.md). Conversas futuras começam por esse documento.

## Item ativo — continuidade R2/E1 (24/10/2026)

Atualização25/10: usuário encerrou o hook; exclusão confirmada no aplicativo e
consolidação em commit/push autorizada. A continuidade automática descrita abaixo
é histórica e não deve ser recriada. Pendências técnicas permanecem para retomada manual.

Prioridade explícita do usuário em 25/10: concluir em sequência, sem aguardar
revisão entre entregas, os itens 1–4 da lista do chat: retomada de propostas,
histórico persistente de edições/Desfazer/Refazer, módulos/nós com contratos e grupos/
feixes. Demais frentes ficam depois. Não declarar esses itens completos antes dos
ensaios correspondentes. Instalação limpa continua para o final.

Pedido autorizado: evolução e testes de hora em hora neste chat até o usuário parar.
Automação já criada; contrato e aceites em [EVOLUCAO_CONTINUA.md](EVOLUCAO_CONTINUA.md).
Não criar outra automação nem tratar limites de conta como removidos.

Decisão do usuário em 24/10: deixar o item 8 da lista de pendências (instalação e
validação em Windows limpo) para a fase final. Continuar os demais incrementos;
essa validação permanece obrigatória antes do aceite de distribuição.

- [x] Corrigir sucesso/progresso fictícios no console e descartar resultado cancelado.
- [x] Arraste único com coordenadas, Novo por editor e validação de expressão do catálogo.
- [x] Tema escuro grafite, marca e GPU; campos, barras, diálogos e superfícies do claro.
- [x] Preferências suportadas persistidas/aplicadas; remover controles sem efeito.
- [x] Tradução React pt/en de comandos/painéis e formatação por idioma; dados/evidências
      preservados na origem e mensagens livres do motor ainda no idioma original.
- [x] Aposentar explorador redundante; manter leitura de projetos v1 antigos.
- [x] Separar estados de carregar/abrir/salvar/restaurar/analisar.
- [ ] Continuar revisão de menus/textos/ícones.
- [x] Recuperação local restrita/atômica com restauração explícita e falhas visíveis.
- [x] Histórico persistente por modelo/revisão, somente leitura e exportação de evidência.
- [x] Conector JSON por linha em sessão isolada: criação/análise/evidência e conflitos
      explícitos por revisão, cliente real e importação no aplicativo.
- [x] Adaptador MCP stdio opcional, descoberta e ferramentas testadas com cliente oficial.
- [x] Proposta portátil com diferenças, comparação de base, aplicação e Desfazer na janela.
- [x] Registro persistente de decisões de propostas, com intenção e confirmação separadas.
- [x] Transporte experimental Windows de propostas MCP, conexão explícita e fila volátil por sessão.
- [x] Vincular recibo de entrega à decisão persistida v2, com migração v1 preservada e confirmação nativa por conteúdo/fase.
- [x] Proteger intenções pending da retenção por quantidade/bytes; recusar operação sem espaço antes de aplicar, preservando arquivo anterior.
- [x] Recuperar fila Windows sem credenciais, revisar queued e encerrar intenção como desconhecida, sem inventar aplicação/falha.
- [x] Sincronizar recibo perdido com decisão final persistida após reinício, sem reaplicação.
- [ ] Retomada/deduplicação remotas entre novas conexões e demais clientes/plataformas.
- [x] Histórico limitado de modelos antes/depois e eventos edit/undo/redo, persistido no projeto e recuperação.
- [ ] Histórico de todos os ajustes visuais e auditoria imutável/assinada.
- [x] Captura incremental limitada de stdout/stderr no worker do conector/MCP.
- [x] Captura incremental na ponte Rust com término confirmado em limite/timeout.
- [x] Cancelamento explícito por ID, fila até confirmação e Job Object no Windows.
- [x] Orçamento nativo Windows por job (memória comprometida/CPU usuário), controles e defeito sintético de240 entidades.
- [ ] Estender orçamento ao worker MCP/outras plataformas, medir outros perfis e validar contenção na distribuição.
- [x] Módulos planos reais, biblioteca, portas por produtores, namespaces, AST/referências preservadas e validação Python.
- [x] Remover/restaurar definição durante o diálogo, liberar capacidade sem apagar instâncias; editor de portas legível nos temas claro/grafite.
- [x] Grupos disjuntos Rust/GPU, feixes por relação, contexto interno com fronteiras e retorno à raiz; persistência de metadados/posições.
- [ ] Composição recursiva/portas compostas, extração automática de dependências e hierarquia aninhada; não confundir com o protótipo DOM antigo.
- [ ] Executar escada de projetos válidos/defeitos plantados e medir escala separadamente.

Histórico local implementado em JSON atômico no host (20 registros/8 MB por perfil),
com confirmação por ID de resposta real do motor, leitura separada de resultado
corrente e evidência exportável. Arquivo de evidência ainda não tem importador.
Transporte experimental implementado em [CONECTOR_LOCAL.md](CONECTOR_LOCAL.md):
processo separado, sem rede/pastas, mesmos contratos/projeção/verificador científicos.
Cliente constrói modelo válido/defeito, recusa revisão antiga e exporta modelos
importáveis no aplicativo. [MCP stdio](MCP_LOCAL.md) agora usa SDK oficial opcional
e preserva o contrato; cliente oficial e circuito sintético exercitados.
Propostas portáteis, registro local dos lotes e conexão direta experimental Windows
implementados; fila/recibos agora persistem no Windows, com revisão local de retomada.
Há sincronização explícita de recibo final perdido, sem aplicar novamente. O registro não comprova
salvamento nem estado atual após Desfazer. Sessão do conector
ainda não persiste nem escreve no histórico nativo. Pastas/GitHub exigem escopo.

Cancelamento nativo e limites incrementais de saída da R2 foram implementados e
exercitados, incluindo orçamento de recursos do job Windows. Permanecem instalação
em máquina limpa (fase final), extensão dos orçamentos ao worker MCP e outras
plataformas e validação da contenção na distribuição. Hot reload é o caminho de iteração.

## Decisões acordadas

- Desktop Windows como primeiro alvo do instalador.
- Tauri/Rust para integração nativa; painéis, barras e diálogos em React/TypeScript.
- **Mudança de arquitetura do viewport (23/10/2026):** o viewport, os nós, as portas
  estruturadas (entrada, saída, hipótese, requisito e validação), as ligações
  roteadas entre portas e os gráficos internos dos nós passaram a ser construídos
  em **Rust compilado para WebAssembly (`packages/viewport-core`) e renderizados
  diretamente na GPU via WebGL2**, substituindo Cytoscape.js e os cartões HTML/DOM/SVG.
  Motivo: garantir uma arquitetura mais robusta e escalável que não sofra lag ao
  manipular centenas ou milhares de nós simultaneamente.
- Python para o motor científico; nenhuma reescrita geral do motor matemático em Rust por antecipação.
- Interface desde o primeiro protótipo; CLI complementar, nuvem e GitHub posteriormente.
- Desenvolvimento pode continuar no Codex cloud. Compilação e testes específicos do
  Windows usam runner Windows e, para experiência real, uma máquina Windows.
- “Nexo” é apenas o nome de trabalho usado na interface, sem decisão de marca.

## Épico E0 — Primeiro percurso verificável

Objetivo: abrir um modelo, explorar relações, executar verificações reais e entender
um achado sem terminal na experiência do usuário final.

### Rodada R1 — Motor, interface e base desktop

Entregas:

- [x] Contratos Pydantic e protocolo JSON versionado.
- [x] Modelo térmico sintético e quatro cenários reproduzíveis.
- [x] Verificação de integridade, cobertura, dimensões, dependências e resíduos.
- [x] Interface com grafo, lista acessível de elementos e caderno de investigação.
- [x] Importação/exportação JSON no fluxo de navegador de desenvolvimento.
- [x] Testes científicos e de ponta a ponta com motor real.
- [x] Executável Python Linux construído e exercitado sem vínculos PYTHON/VIRTUAL_ENV.
- [x] Host Tauri e ponte Rust/Python implementados.
- [x] Fluxo de CI para gerar instalador Windows escrito.
- [x] Confirmar compilação completa do Tauri no Windows e produzir o primeiro instalador.
- [x] Instalar e testar a janela nativa e as operações de arquivo no Windows.

R1 não equivale a um produto desktop distribuível validado enquanto os dois últimos
itens não forem concluídos. O documento de estado registra os resultados da ponte
Rust separadamente dos resultados da compilação Tauri.

Em 23/10/2026, os dois itens foram verificados na máquina Windows local. Isso não
encerra os critérios adicionais da R2, em especial instalação limpa e cancelamento.

### Rodada R2 — Fechar o percurso Windows

1. Executar o workflow Windows a partir de código disponibilizado no GitHub, ou os
   mesmos comandos numa máquina Windows com toolchains adequados.
2. Resolver eventuais erros de compilação, empacotamento e WebView2 sem enfraquecer
   permissões para conseguir passar o build.
3. Validar iniciar/fechar o motor, importação e exportação nativas, Unicode em caminhos,
   execução sem Python instalado e erro explícito quando o motor não inicia.
4. Confirmar que o instalador inclui todos os recursos. O primeiro artefato será sem
   assinatura; assinatura e política de atualizações precisam de decisão posterior.
5. Acrescentar cancelamento explícito e limites adicionais; atualmente há timeout,
   limites de entrada e serialização das chamadas desktop, mas não sandbox de memória/CPU.

Critério de aceite: instalação limpa Windows, percurso gráfico completo e registro
dos resultados, incluindo versões e limitações. O workflow escrito, sozinho, não conta.

Retomada local em 23/10/2026: build, instalador, instalação por usuário, janela,
importação/exportação, Unicode, motor ausente e execução com ferramentas fora do
PATH verificados. Faltam VM limpa, cancelamento, limites adicionais e medição do
cold start. Evidências e condições das tentativas em `ESTADO_ATUAL.md`.

Prioridade adicional do usuário em 23/10: tornar a interface uma área de trabalho
desktop e melhorar a navegação do viewport. Implementados barra compacta,
explorador/inspetor ajustáveis, câmera persistente na sessão, ferramentas de zoom,
enquadramento e layout por dependências. Isso antecipa parte da legibilidade de
grafos prevista em E1; não introduz persistência, edição ou encerra a R2.

Segunda revisão solicitada pelo usuário: tema claro baseado em imagem de referência,
nós com cores e dados, resultados inferiores recolhíveis, propriedades, visibilidade,
busca e navegador independente. Recuperação por Exibir e iteração via hot reload.
Executar histórico somente em memória nesta fase. Atividade de arquivos ao estilo
Gource/MCP fica como evolução futura de E2, após a interface; não usar animações
simuladas como evidência de análise ou alterações de arquivos.

Terceira revisão solicitada pelo usuário em 23/10 (arquitetura robusta de viewport):
migração completa do viewport e de todos os elementos internos (nós, portas tipadas
de entrada/saída/hipótese/requisito/validação, ligações curvas entre portas e
gráficos analíticos internos dos nós) para **Rust + WebAssembly + WebGL2 na GPU**
(`packages/viewport-core`), eliminando nós em DOM/SVG e o Cytoscape.js no viewport,
mantendo painéis e barras de ferramentas em React.

## Épico E1 — Projetos persistentes e edição

Por solicitação explícita do usuário nesta revisão, parte de E1 foi antecipada:
projeto `.nexo.json` nomeado com abrir/salvar/salvar como, vista persistida, editor
restrito e desfazer/refazer em memória. A R2 permanece aberta. O critério completo
de E1 ainda exige recuperação, histórico de revisões/execuções e comparação.

O [roteiro do laboratório](EVOLUCAO_DO_LABORATORIO.md) detalha a sequência seguinte:
recuperação/histórico → objetivos/fontes e contrato semântico v2 → grupos/feixes →
propostas/eventos → atividade e múltiplos atores → pasta local/GitHub → novos
verificadores. Cada incremento tem critérios de saída e limites explícitos.

- Banco SQLite por projeto ou catálogo local, a decidir após prova técnica.
- Revisões, execuções e evidências persistentes; backup e recuperação testados.
- Edição visual de quantidades, unidades, fontes e equações na DSL restrita.
- Comparação entre execuções; invalidar resultados ao mudar entradas.
- Melhorar layout e legibilidade dos grafos com medidas de responsividade.

Critério de aceite: fechar/reabrir projeto, recuperar achados e comparar revisão
anterior sem depender da sessão em memória. Não confundir hash do modelo com um
sistema de versionamento persistente já implementado.

## Épico E2 — Análise delimitada de software e arquivos

- Seleção explícita de pasta e inventário sem modificar arquivos.
- Registrar caminhos relativos, hashes e estado de arquivos não enviados ao Git.
- Começar com uma linguagem e analisadores existentes; recomendar Python para a prova.
- Dependências/imports, diagnósticos estáticos e vínculos entre requisitos e código.
- Decidir isolamento e consentimento para qualquer execução de testes ou scripts.

Critério de aceite: defeitos conhecidos encontrados em um pequeno repositório de
referência e controles válidos preservados. Análise estática não prova ausência de bugs.

## Épico E3 — Fontes e descoberta assistida

- Importação revisável de documentos e referências; direitos de uso explícitos.
- Adaptadores opcionais para Z3, Lean, DoWhy e IA, cada qual com avaliação própria.
- Hipóteses rastreáveis, teste separado e resultado inconclusivo de primeira classe.

## Épico E4 — Colaboração e GitHub

- Adaptador FastAPI e armazenamento PostgreSQL para modo online.
- Análise por commit/PR com credenciais e permissões mínimas.
- Autorização por projeto, isolamento, auditoria e controle de custos.
- Reaproveitar motor e componentes visuais; não prometer sincronização automática sem
  especificar conflitos, privacidade e portabilidade dos dados.

## Regra para otimização

O viewport gráfico já opera em Rust + WebAssembly + WebGL2 na GPU para suportar
centenas e milhares de nós sem gargalo de DOM/SVG. Para o motor científico (Python),
medir separadamente motor, transporte e solucionadores antes de portar algoritmos
matemáticos específicos para Rust.
