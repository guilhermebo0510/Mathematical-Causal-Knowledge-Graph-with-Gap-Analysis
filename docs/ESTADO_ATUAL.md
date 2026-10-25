# Estado atual — ponto de retomada

Última atualização: 25/10/2026. Rodada: **R2/E1 — retomada, histórico, módulos e grupos**.
A R2 permanece aberta: máquina limpa (fase final), extensão de orçamentos ao worker
MCP/outras plataformas e validação de distribuição pendentes. Não há aceite de distribuição.

A interface usa Tauri/Rust no Windows, viewport Rust/WASM/WebGL2 e painéis React.
Há menus desktop, biblioteca em grade/lista, pesquisa, propriedades, navegação e
resultados. Tema grafite e preferências suportadas foram conectados aos consumidores
e testados. Português/inglês agora altera comandos, painéis e formatos de exibição.
Há módulos científicos planos reutilizáveis, expandidos em entidades reais do modelo,
com biblioteca e grupos Rust/GPU. Subgrafos recursivos e portas compostas de outros
domínios continuam pendentes; o protótipo DOM antigo não comprova essas capacidades.
Não há garantia geral de 60 fps: benchmark visual não valida modelos científicos grandes.

## Continuidade horária encerrada em 25/10

Automação heartbeat **Nexo — evolução e validação contínuas**, ID
`nexo-evolu-o-e-valida-o-cont-nuas`, excluída pelo aplicativo em25/10 por pedido
explícito do usuário. Desenvolvimento automático encerrado; não recriar o hook.
O usuário autorizou consolidar todo o trabalho em commit e enviar ao GitHub.
As seções anteriores de continuidade são histórico, não autorização para retomada automática.
Fila, aceites e roteiro de projetos: [EVOLUCAO_CONTINUA.md](EVOLUCAO_CONTINUA.md).

### Consolidação autorizada para GitHub (25/10)

- Commit de consolidação local a05b669 criado. Primeiro push recusado pelo GitHub:
  credencial OAuth não tem escopo workflow para alterar .github/workflows/validation.yml.
  Autorização interativa iniciada com gh auth refresh --hostname github.com --scopes
  workflow; conclusão depende do usuário no GitHub. Não remover o workflow nem forçar
  envio para ocultar a pendência. Retomar push após autenticação e conferir SHA remoto.

- Hook excluído com confirmação do aplicativo, por pedido explícito do usuário.
  Trabalho consolidado no checkout existente/main para commit e envio a origin.
- Conferência antes do commit: Python completo54/54 (44,09 s), host Rust31/31
  (29,19 s), viewport Rust6/6 (0,07 s), frontend83/83 (4,82 s), typecheck e Ruff
  aprovados. git diff --cached --check sem erros. Testes de interface e janela nativa
  anteriores continuam descritos por rodada; não recontados como executados agora.
- Verificados234 arquivos versionados/candidatos com busca por padrões de credenciais
  e chaves privadas, sem ocorrências nesses padrões. Builds temporários, dependências,
  sessão e recuperação local ficam fora do Git. Incluídos código, marca, WASM servido,
  exemplos, testes e documentação; nenhum instalador novo ou publicação de release.
- R2 segue sem aceite de distribuição: instalação limpa, extensões do orçamento e
  demais pendências registradas não foram convertidas em funcionalidades concluídas.

### Retomada — nomes longos e identificação de módulos (25/10, 10:55 UTC)

- Corrigida captura que falhava com título válido do projeto acima de120 caracteres:
  somente o rótulo da biblioteca é resumido com reticências, sem cortar par Unicode;
  modelo interno conserva título integral, fontes, tolerâncias e operações.
- Definições com nomes iguais mostram IDs distintos no seletor. Adicionados campo
  Nome do módulo e comando de renomeação com ícone, confirmação explícita por botão
  ou Enter, limite120 e recusa de nome vazio. Altera metadados da biblioteca, não ID,
  modelo científico/histórico ou instâncias. Revalida orçamento600 KB antes da troca.
- Edge com título longo: duas capturas antes impossíveis, seleção distinguível,
  exportação com modelo integral, recusa de reimportação de mesmo ID sem substituir,
  renomeação, salvamento e reabertura preservando nomes e histórico/modelo inalterados.
  Rótulos repetidos recebem identificação apenas enquanto necessário.
- Testes: typecheck e frontend83/83 (3,05 s) aprovados; novo unitário confirma Unicode
  no limite e título interno intacto. Edge final2/2 (28,4 s): nomes/exportação/rename/
  reopen20,9 s; regressão grafite/painel estreito6,0 s. Lote anterior2/2 (58,7 s)
  também incluiu biblioteca cheia/remover/restaurar21,2 s e primeira versão do ensaio
  de nomes34,8 s. Nenhuma falha nesses lotes; sem somar repetições,51 casos Edge
  distintos acumulados nos itens1–4.
- Artefatos em build/module-name-editor-20261025, subdiretórios Playwright:
  long-title.nexo, long-title.nexo-module.json e screenshots grafite/estreito.
  Servidor desktop:dev existente respondeu200; não foi reiniciado. Sem novos testes
  nativos/instalador/instalação limpa, Rust/WASM ou commits/push/publicação.
  Projetos e recuperação do usuário preservados; usados somente dados de teste.
- Limitação: rótulos da biblioteca continuam metadados sem auditoria persistente de
  cada edição; não mudam nomes dos grupos/instâncias já criados. Próximo incremento:
  validar estes fluxos recentes na janela Tauri Windows usando cópia própria de teste,
  começando por observar/preservar o estado aberto e a recuperação do usuário.

### Continuação — gerenciamento e layout da biblioteca (25/10)

- Módulos agora permite Remover definição sem apagar entidades/grupos da instância,
  invalidar a análise científica corrente ou modificar seu histórico. A última
  definição removida pode ser restaurada durante o diálogo; ao reabrir, a opção
  transitória é descartada. Restauração respeita limite10/600 KB e conflitos de ID.
  Traduções pt/en e ícones de remoção/restauração adicionados; capacidade visível.
- Biblioteca cheia validada com10 definições e instância real já expandida:11ª
  captura recusada; remover→restaurar→remover libera lugar para nova captura;
  restaurar a antiga enquanto cheia recusa sem perda. Modelo, grupos e histórico
  científico idênticos ao controle; salvamento/reabertura e F5 sem achados. moduleId
  de origem preservado no grupo, sem dependência da definição removida.
- Inspeção visual encontrou campos de portas correndo na mesma linha. Reorganizados
  em grade de vínculos com ID/unidade e seletores completos, saídas em etiquetas com
  unidades e campos de biblioteca/prefixo alinhados. Tokens compartilhados de tema;
  duas colunas em painel amplo, uma em largura estreita. Screenshots claro/grafite
  inspecionados; sem sobreposição horizontal no diálogo em900×720 e500×720 no Edge.
- Testes: typecheck aprovado; frontend82/82 (4,86 s); Edge gerenciamento1/1 inicial
  (32,3 s), repetição após layout1/1 (24,9 s), módulo/grupo/save/reopen1/1 (19,3 s),
  grafite/responsividade1/1 (6,3 s). Sem falhas nesses ensaios. Dois casos novos,
  total50 casos Edge distintos acumulados nos itens1–4; repetições não somadas.
- Artefatos: build/module-library-layout-20261025 contém module-library.png e
  library-preserved-instances.nexo nos subdiretórios Playwright; screenshots grafite
  e estreito em build/module-ports-appearance-20261025. Rodada sem teste nativo novo,
  Rust/WASM, instalador ou instalação limpa; sem commit/push/publicação. Projetos e
  recuperação do usuário não foram restaurados, descartados ou sobrescritos.
- Limites: restauração de uma definição é transitória e de um nível, não auditoria
  persistente da biblioteca; somente histórico científico permanece em Desfazer.
  Próximo: revisar nomes longos ao capturar módulos e permitir identificar melhor
  definições com o mesmo título, mantendo biblioteca e instâncias independentes.

### Retomada — controle elétrico e correção da pesquisa (25/10, 09:50 UTC)

- Adicionado exemplo importável examples/circuito-resistivo-sintetico.json e roteiro
  em examples/README.md: I=2 A, R=3 ohm, V=I*R, P=V*I, referências6 V/12 W com
  tolerâncias0,01, fontes aritméticas e hipótese resistiva constante explícitas.
  Controle no Python real9/0/0; instância m1 compartilhando I17/0/0.
- Defeito numérico plantado I=3 afeta os dois consumidores:9 V/27 W,13 aprovadas/
  4 falhas de resíduo/0 inconclusivas. Após Desfazer, unidade de R original trocada
  por s produz12/2/2, sem previsão original de V/P e com comparações inconclusivas;
  instância independente conserva6 V/12 W. Arquivo reaberto e reanalisado mantém
  estados, fontes, tolerâncias e referências, sem resultado corrente pré-aprovado.
- Encontrado bug de pesquisa: consulta exata R selecionava I/Corrente, pois resultados
  eram apenas filtrados pela ordem do modelo. Agora ID exato tem prioridade, seguido
  de rótulo exato, prefixos e correspondências parciais, antes do limite15. O ensaio
  confirma edição da Resistência correta; pesquisa parcial Potência segue funcionando.
- Corrigida saída inesperada do contexto ao selecionar entrada compartilhada visível
  na fronteira: selecionar nó/achado permanece no grupo quando todos os elementos
  estão na projeção atual. Buscar R original fora do contexto ainda retorna à raiz.
- Edge Windows com motor local: elétrico1/1 (33,6 s), regressão térmica compartilhada
  1/1 (33,9 s), pesquisa parcial/ferramentas1/1 (4,6 s); typecheck aprovado. Elétrico
  é caso novo, demais são repetições:48 casos Edge distintos acumulados nos itens1–4.
  Artefatos em build/electrical-search-corrected-20261025, subdiretório electrical-module,
  arquivos electrical-module.nexo e runs.json. Frontend82/82 é evidência da retomada
  anterior; não foi recontada como nova execução de unitários nesta rodada.
- Falhas intermediárias: teste tentou Desfazer antes da interface liberar análise e
  depois supôs seleção preservada pelo Desfazer; sincronização/resseleção corrigidas.
  O ensaio subsequente revelou a pesquisa selecionando I em vez de R (bug corrigido).
  Typecheck indicou import ausente de GraphNode na ordenação (corrigido); repetição
  final aprovada. Não converter falhas intermediárias em testes aprovados.
- Sem teste de janela nativa/instalador/instalação limpa nesta retomada; sem alteração
  do motor, Rust/WASM ou commits/push/publicação. Exemplo demonstra apenas operações
  acíclicas suportadas em um controle estipulado; não simulador elétrico geral/prova.
- Próximo: gerenciamento da biblioteca de módulos (remoção de definições sem apagar
  instâncias independentes) e ensaio do limite10, para não deixar biblioteca cheia
  sem meio de reutilização. Instalação limpa continua para a fase final.

### Retomada — composição em escala e retenção de edições (25/10, 08:51 UTC)

- Escada térmica com14 instâncias compartilhando as seis entradas externas:156
  entidades,45 equações,30 requisitos,15 grupos de resultados científicos (modelo
  original e14 cópias;14 grupos organizacionais). Motor Python real retornou136
  verificações aprovadas/0 falhas/0 inconclusivos,15 resultados P_total=2200 W.
  Revisão e33ba7978d435c8256917a82d64c1fa6d1252ab36b94846b05f1e794bea2c115.
  Os13 primeiros módulos foram preparados pelo mesmo instanciador de dados no teste;
  o14º foi instanciado pelo diálogo. Não alegar14 operações manuais de inserção.
- O15º módulo excederia30 requisitos mesmo com apenas166 entidades. Agora a
  composição recusa cada limite de lista com mensagem específica antes de aplicação:
  100 variáveis,50 equações,30 hipóteses/requisitos/observações por lista, alinhados
  ao esquema Python existente. O motor mantém validação independente do candidato.
  Verificado que recusa preserva modelo, grupos, histórico e permite salvar.
- Histórico em156 entidades:32 renomeações reais pela interface, retenção resultante
  com20 estados undo,0 redo,0 eventos e44 remoções contadas;592997 bytes compactos de
  histórico,1314778 bytes de projeto. Reabertura seguida de Desfazer/Refazer recupera
  os títulos31/32. Retenção pode remover todos os eventos antes das pilhas, conforme
  contrato; não confundir com registro completo e imutável de auditoria.
- Testes desta retomada: frontend82/82 (3,91 s), typecheck; Edge escala1/1 (20,7 s;
  total23,4 s) e retenção1/1 (52,7 s; total54,1 s). Casos novos elevam a47 casos Edge
  distintos na rodada acumulada dos itens1–4. Sem falhas nestes dois ensaios. Teste
  unitário cobre orçamento exato e recusa do elemento seguinte nas cinco listas,
  sem mutação do alvo. Não é teste científico dos modelos artificiais desse unitário.
- Artefatos: build/module-scale-20261025 contém scale-14-modules.nexo e scientific-run.json;
  build/module-history-scale-20261025 contém bounded-history.nexo e retention-summary.json,
  em subdiretórios do Playwright. Somente arquivos próprios de teste; projetos do usuário
  e recuperação antiga não foram abertos/descartados. Sem Rust/WASM novo, teste nativo,
  instalador, commit, push ou publicação nesta retomada. Escala é evidência deste caso
  sintético, sem garantia geral de desempenho/prova científica.
- Próximo incremento concreto: ensaio de módulo elétrico simples com entradas
  compartilhadas e defeito de unidade/observação plantado, mantendo o mesmo motor
  de operações suportadas. Validar evidências, grupo e reabertura sem afirmar suporte
  geral a novos domínios. Instalação limpa permanece na fase final.

### Retomada — entrada compartilhada, histórico e limite de grupos (25/10, 07:52 UTC)

- Reabertura do projeto com entrada U compartilhada, contexto interno e
  Desfazer/Refazer validados no Edge com motor Python real. O contexto contém15
  membros próprios e U como vizinho externo (16 cartões); U não é copiado/agrupado.
  Desfazer recupera2200 W e zero falhas; Refazer retorna2400 W e duas falhas sintéticas
  tanto na instância quanto no modelo original. AST e contexto ativo preservados.
- Corrigido limite de composição: instanciar módulo com60 grupos antes criava o61º,
  tornando o projeto incompatível com seu contrato de salvamento. Agora recusa antes
  de commit, sem alterar modelo, grupos ou histórico. Caso Edge com76 nós/60 grupos
  confirmou recusa e salvamento do mesmo documento (1/1,22,4 s).
- Biblioteca de módulos ganhou nome acessível explícito no seletor. Unidade
  incompatível não aparece nas opções; teste unitário verifica recusa de unidade
  divergente, entrada ausente/não declarada e tentativa de usar saída como entrada,
  preservando alvo/definição. Grafias diferentes da mesma unidade continuam recusadas;
  conversão implícita não foi implementada.
- Testes desta retomada: frontend81/81 (repetição final2,57 s), typecheck e dois casos Edge aprovados
  em execuções direcionadas: compartilhamento/reabertura33,6 s e capacidade21,0 s.
  A extensão do caso compartilhado é repetição do caso anterior; capacidade é caso
  novo (45 casos Edge distintos acumulados na rodada dos itens1–4).
- Falhas intermediárias dos testes: expectativa incorreta de17 cartões no contexto
  (correto16), seletor sem nome acessível exato e inferência TypeScript do array de
  bindings inválidos no teste; corrigidos, com repetições aprovadas.
  Não houve novo teste da janela nativa, host, WASM, instalador ou instalação limpa;
  esses resultados anteriores não foram recontados. Sem commits/push/publicação.
- Próximo incremento concreto: escada de composição com instâncias múltiplas e
  entradas compartilhadas, medir recusas por limite de entidades/listas e retenção
  do histórico. Preservar modelos e recuperação do usuário; instalação limpa ao final.

### Continuação autorizada — itens 1 a 4 (25/10)

- Entregas: arquivo separado proposal-inbox-v1.json,32 registros/8 MB, atomicidade e
  validação estrita. Recebimento só é confirmado depois de gravar; falha preserva
  arquivo e desfaz inclusão em memória. Token/pipe não persistem. Queued recupera
  revisão após reinício sem reconectar; reviewing/unconfirmed não reaplicam.
- Decisão interrompida: encerramento explícito como unconfirmed, com reconhecimento
  do usuário, sem fingir applied/failed. Fila vinculada passa a closed após conferir
  decisão/conteúdo/fase. Finalizadas podem sair por retenção; pendentes não.
- Histórico de edições no projeto e recuperação: pilhas undo/redo e eventos com
  modelos antes/depois,30 por lista/600 KB totais, retenção contada. Snapshots
  restauráveis são normalizados pelo motor antes de substituir o documento aberto.
  Editar → Histórico de edições mostra diferenças. Não restaura aprovação científica.
- Biblioteca de módulos: capturar modelo, importar/exportar JSON restrito e instanciar
  prefixando IDs. Entradas/saídas definidas por produtores reais; bindings apenas
  entradas com unidade textual igual. Reescreve AST e todas as referências sem trocar
  operações, preserva fontes/hipóteses/tolerâncias. Importação estrutural não é aprovação.
- Grupos: seleção livre ou instância de módulo, recolher/expandir/desagrupar, feixes
  por origem/destino/tipo, contexto com membros/vizinhos reais e retorno à raiz.
  Ícone/cartão Group adicionado no Rust/GPU; não é cartão DOM. Modelos científicos
  permanecem completos; feixes são somente visuais e não podem ser desconectados
  como uma única relação. Posições ocultas preservadas. Busca/achados abrem grupos.
- Metadados módulos/grupos e histórico persistem no Nexo v1 por extensões opcionais;
  arquivos antigos continuam abrindo. Até10 módulos/600 KB,60 grupos disjuntos e
  limite científico240 entidades. Não há grupos aninhados ou composição recursiva.
  Biblioteca/câmera/grupos não têm histórico completo de cada mudança visual.
- Corrigida perda potencial de recuperação antiga: salvar outro estado não remove
  a cópia ainda não restaurada. Native Save criou build/validacao-itens-1-4-20261025.nexo,
  com32 nós,1 módulo,1 grupo recolhido e histórico. Hash da recuperação anterior igual
  ao backup build/before-1-4-native-20261025; arquivo original7157 bytes preservado.
- Windows real: SDK enviou native-durable-restart como queued; desconexão e fechamento
  do processo confirmados, servidor/dev relançado. Novo processo mostrou entrega
  recuperada sem código/conexão; rejeição c4ed7f88-7e61-43f7-9730-8d527185bb3f conferida
  na fila e no diário, ambos rejected e vinculados. Credencial temporária removida;
  verificadas ausências de token/pipe na fila. Relatório build/durable-delivery-native-20261025.
- Windows real: módulo térmico duplicado e recolhido, F5 retornou19 aprovados/0 falhas/
  0 inconclusivos, P_total e m1_P_total=2200 W, revisão92824d90. Arquivo salvo e reaberto;
  Desfazer restaurou16 nós e Refazer32; eventos edit/undo/redo gravados. Novo F5
  confirmou a mesma revisão/valores. Testes sintéticos; não são descoberta científica.
- Evidência automatizada: host31/31 (29,05 s), viewport Rust6/6 (0,03 s), frontend80/80
  (4,32 s) e typecheck; Python transporte/MCP12/12 (30,06 s), Ruff. WASM recompilado
  (134261 bytes); sem sidecar novo/instalador. Edge10/10 inicial e2/2 de navegação;
  rodada final13/13 (3,5 min) cobre projetos5, diário3, recuperação3, história/módulos2.
  Inbox5/5 e recibo1/1 concluídos; lote final de correções4/4. Total de44 casos Edge
  distintos aprovados em lotes direcionados, sem somar repetições. Lote de layout,
  câmera, arraste e percursos novos10/10 (1,8 min); artefato final1/1 (23,7 s).
- Refinamentos: Sincronizar recibo confere decisão final persistida sem reaplicar o
  modelo. Criar componente no contexto associa nós reais ao grupo; contexto ativo
  persiste no projeto. Câmeras por grupo retornam à raiz sem perder zoom. Layout
  Rust preserva posições anteriores e distribui novos módulos sem sobrepor cartões;
  Organizar grafo visível reorganiza sem alterar o modelo/resultado. Membros ocultos
  mantêm posições e achados sinalizam o grupo. IDs como constructor usam Map;
  callback assíncrono de módulo não aplica durante análise ativa.
- Os refinamentos finais de layout/contexto foram verificados no Edge; não foram
  todos repetidos na janela nativa. Artefato final salvo pela interface em
  build/entrega-itens-1-4-final-20261025/revisions-modules-groups-m-553d3--analysis-saves-and-reopens/projeto-validado.nexo.
- Falhas intermediárias: faltava dependência direta serde (adicionada, lock atualizado
  offline); teste inicial da retomada rodou durante edição/HMR e perdeu diálogo,
  repetição isolada e lote estável passaram; novo breadcrumb faltava import do ícone
  e tradução Contexto (corrigidos); Rustfmt do novo ícone exigiu formato (corrigido).
  Não contar execuções intermediárias com falha como aprovadas.
- Limites: fila retomada pela UI, sem autorização/deduplicação remota entre conexões;
  histórico limitado/local sem assinatura; módulos planos criados pelo modelo inteiro;
  grupos disjuntos de um nível com navegação de contexto, não hierarquia recursiva.
  Instalação limpa continua na fase final. Sem commit, push ou publicação.
- Incremento adicional Edge1/1 (23 s): módulo compartilha U existente, sem duplicá-lo
  nem incluí-lo como membro próprio. Controle19/0/0 e ambos P_total=2200 W; alterar
  U de0,5 para0,6 produz ambos2400 W, duas falhas plantadas e zero inconclusivos.
  Clicar no achado expande o grupo recolhido (17→31 nós visíveis). Corrigido bug:
  selecionar resultado agora também reabre propriedades que estavam recolhidas à
  direita; caso reproduzido e coberto no teste. Typecheck aprovado depois da correção.
  Teste usa Edge com motor Python local real; não foi repetido nativamente.
- Próximo: reabrir projeto com entrada compartilhada, verificar Desfazer/Refazer dessa
  edição e persistência das relações de fronteira; ensaiar recusa de composição por
  unidades incompatíveis. Continuar refinando os quatro percursos;
  composição recursiva, auditoria visual completa e instalação limpa permanecem fora
  do aceite inicial. Sem commit, push ou publicação.

### Continuação local — retenção de intenções e exportação do vínculo (25/10 UTC)

- Encontrado risco no registro: a retenção removia a decisão mais antiga mesmo pending,
  apagando a única intenção persistida após confirmação perdida/interrupção. Em certos
  casos de bytes poderia remover o próprio novo registro e retornar sucesso sem guardá-lo.
- Corrigidos host e backend web: só removem decisões finalizadas antigas, excluindo a
  decisão da operação atual. Sem espaço liberável, recusam a operação inteira antes de
  substituir arquivo/chave e antes da aplicação no grafo. Limites20/8 MB preservados.
- Testes: Rust28/28 (26,25 s, compilação incremental19,71 s); frontend73/73 (5,72 s)
  e typecheck aprovados. Casos novos cobrem quantidade, bytes, recusa de nova rejeição,
  arquivo/objeto intactos e remoção exclusiva de finalizadas quando surge espaço.
- Edge Windows7/7 (1,9 min), saída própria build/receipt-retention-ui-20261025 para
  evitar colisão de artefatos. Inclui recusa de aplicar com20 pending, modelo/chave
  intactos; exportação v2 mantém entrega/sessão/decision_id, sem código de conexão.
  Inbox usa IPC nativo simulado e motor Python real via adaptador web. Não é novo
  ensaio SDK/pipe/janela nativos. Python/viewport/ponte científica não foram alterados.
- Rustfmt e git diff --check aprovados. Backup de recuperação e journals em
  build/before-retention-20261025. Original .nexo segue7157 bytes/data01:15:04.
- Limitação explícita: pending após reinício ainda não tem fluxo de resolução; não
  presumir failed/applied para liberar espaço. Se todos os registros estiverem pendentes
  e ocuparem o limite, novas decisões são bloqueadas preservando evidência. Próximo
  incremento é recuperar essas intenções com revisão explícita, junto à fila persistente.
- desktop:dev relançado após confirmar ausência de janela/servidor, host recompila
  porque seu Rust mudou; nenhum instalador/WASM/sidecar foi gerado nesta rodada.
- Janela Windows real: abriu registro existente após reiniciar host, expandiu decisão
  c290cd74 e mostrou Entrega local/native-sdk-persistent-receipt. Exportar registro por
  mouse gerou Downloads/c290cd74-4eca-412e-8145-7c764a17de6f.nexo-decision.json.
  JSON lido confirma envelopev2, estadoapplied, IDs de decisão/entrega correspondentes
  e metadados somente id/sessionId. Hashes recovery/v1/v2 iguais ao backup anterior:
  leitura/exportação não regravou os arquivos do perfil. Não iniciou nova conexão,
  restaurou cópia, aplicou proposta ou executou análise. Escape fecha o registro.

### Continuação local — vínculo persistente do recibo (24/10)

- Registro v2 acrescenta somente IDs de sessão/entrega à decisão. Migração lê v1 e
  grava v2 separadamente; v1 permanece intacto. V2 corrompido bloqueia leitura/escrita,
  sem voltar silenciosamente ao v1. Exportação de decisão usa envelope v2; proposta v1.
- Host verifica decisão persistida, fase, sessão, entrega e conteúdo completo antes
  de confirmar reviewing/applied/rejected. Unconfirmed conserva vínculo já verificado.
  Cliente Python limita campos de resposta e valida decision_id. Código/token da
  conexão não é incluído nos metadados de entrega. A fila continua volátil.
- Executados nesta rodada: host 26/26 (5,05 s); frontend 71/71 (3,51 s), typecheck;
  Python direcionado transporte/MCP/propostas/conector 26/26 (42,40 s), Ruff aprovado.
  Não é execução da suíte Python completa nem nova validação do WASM/ponte científica.
- Edge: seis casos passaram no lote inicial (quatro inbox com IPC simulado e dois
  registro). O sétimo, propostas portáteis, perdeu arquivo temporário quando outro
  Playwright limpou test-results: falha de execução concorrente, sem atribuir aprovação.
  Caso registro foi repetido com migração v1 e passou (32,5 s). Repetição isolada de
  propostas concluída: test-results/.last-run.json recuperado com status passed e
  failedTests vazio. Total sete casos distintos aprovados, sem contar repetição como caso novo.
- SDK MCP real + pipe Windows + revisão por mouse: entrega native-sdk-persistent-receipt
  aplicada, decision_id c290cd74-4eca-412e-8145-7c764a17de6f. Relatórios em
  build/direct-delivery-native-20261024-r6. V2 em disco confirma mesmo ID/estado/entrega;
  hash do v1 igual ao backup anterior, sem token nos metadados. UI leu decisões novas
  e antigas após desconectar. Credencial temporária removida; conexão revogada.
- F5 nativo: referência plantada 2.300 W contra previsto 2.200 W, resíduo 100 W,
  9 aprovados/1 falha. Desfazer + F5: revisão52d518a6 restaurada, 10 aprovados,
  zero falhas/inconclusivos, confirmados no histórico nativo. Arquivo original não salvo
  nem substituído; cópia de recuperação existente não foi restaurada/descartada.
- Limitações: recibo histórico não é prova científica, salvamento ou estado atual após
  Desfazer. Consulta remota exige sessão ativa; retenção 20/8 MB pode remover decisões.
  Não há persistência de fila/deduplicação entre processos. Windows limpo continua final.
- Próximo passo: exercitar exportação/leitura
  do vínculo na UI; depois implementar retomada explícita de entregas persistidas, sem
  reabrir credenciais nem aplicar propostas automaticamente. Sem commit/push/instalador.
  Na retomada posterior, sky não encontrou janela knowledge-desktop.exe; relançar
  desktop:dev somente após conferir processos/servidor e preservar a recuperação.
  Não foi realizada nova validação visual nem instalação limpa nessa retomada.

### Continuação local — canal direto de propostas e fila por sessão (24/10)

- Arquivo → Propostas locais… conecta explicitamente a base atual. Canal Windows
  named pipe com DACL protegida do usuário atual, recusa de clientes remotos e
  credencial temporária separada. Não abre servidor HTTP/TCP nem permite ler arquivos
  ou comandar automaticamente o modelo. Só `main` inicia/consulta/resolve/encerra.
- Fila volátil: até 8 entregas não resolvidas, 32 retidas e 2 MB serializados; proposta
  até 600 KB/frame 620 KB. Prazo nominal de 15 minutos e presença da interface
  renovada a cada segundo, com expiração após 10 segundos sem renovação (mais troca
  em andamento/verificação periódica). Abrir documento, mesmo ID, revoga a conexão.
  Recusa fila cheia sem remover pendências para aceitar outra. Não é fila persistente.
- Base completa comparada sem confiar em hashes; corrigida falsa diferença causada
  pela serialização de números finitos `100.0`/`100` entre Python/JavaScript/Rust.
  Comparação exata em f64, sem epsilon/coerção de strings/reordenar operandos.
  Revisão final reaproveita importação/normalização pelo motor e registro persistente.
- ID repetido com o mesmo conteúdo retorna estado existente; conteúdo diferente com
  o mesmo ID é recusado. Antes de alterar o grafo, a entrega é reservada como
  reviewing, depois applied/failed/unconfirmed. Sem reserva confirmada não aplica.
  Falha da confirmação permite repetir somente recibo. Cancelar a revisão mantém
  queued; Rejeitar registra rejected sem análise. applied não comprova salvamento,
  estado atual após Desfazer ou validação científica.
- MCP agora publica 10 ferramentas: nexo_submit_to_desktop exporta/entrega da sessão
  isolada, e nexo_desktop_status consulta somente o recibo da conexão. Cliente Python
  só constrói namespace local validado, sem UNC remoto/caminho/shell/pickle. Auxiliar
  fixo com -I, resposta limitada e subprocess.run(timeout=8), sem thread de IO presa.
  Criação do processo pode acrescentar tempo ao timeout. Não herda orçamento do solver.
  Recusas reconhecidas têm código/mensagem permitidos; texto desconhecido não é ecoado.
- Falhas encontradas: teste inicial do roteiro usava envelope run/campo node.put
  incorretos (corrigido); wire de erro dependia da console cp1252 (agora JSON ASCII
  compatível com UTF-8); base numericamente igual era recusada (corrigido acima).
  Mock inicial de Tauri não fornecia metadata.currentWindow, deixando o teste de UI
  sem montar; corrigido o mock e repetidos os casos. Ruff inicialmente apontou estilo,
  corrigido antes das execuções finais. Falhas intermediárias não contam como sucesso.
- Testes finais: host 22/22 (8,30 s; compilação incremental 21,70 s separada), incluindo
  pipe real, autenticação, DACL, limites/expiração/IDs/estados e igualdade numérica.
  Python completo 53/53 (40,36 s) e Ruff aprovados; frontend 70/70 (3,22 s) e typecheck
  aprovados. Rustfmt e git diff --check aprovados. Ponte científica/viewport não mudaram;
  não repetir contagens anteriores da ponte como evidência nova.
- Edge Windows: 9/9 (2,7 min: cancelamento, três casos de inbox com IPC nativo simulado,
  cinco de projeto/workspace) + 3/3 (2,0 min: propostas portáteis/registro).
  Mais 1/1 de foco após desconectar (17,5 s), total de 13 casos distintos após as
  correções. Encontrado e corrigido foco perdido ao remover o botão Desconectar,
  que impedia Escape de fechar o diálogo; esse último caso usa IPC simulado.
  Mock verifica UI e motor Python real pelo adaptador web, não o pipe Windows.
  Sem repetição da suíte completa de 56 casos.
- Janela Windows real + cliente SDK MCP oficial: r3 aplicou, r4 rejeitou, r5 repetiu
  aplicação após reserva obrigatória. Entrega repetida manteve um ID; alteração de
  conteúdo no mesmo ID e base errada foram recusadas. Cada cliente calculou controle
  2.200 W/zero falhas e defeito de referência 2.300 W/uma falha, sem chamar isso de
  descoberta. Relatórios sem credenciais em build/direct-delivery-native-20261024-r3,
  r4 e r5. r1/r2 documentam falhas iniciais, não ensaios aprovados.
- No fluxo final r5, SDK recebeu applied. F5 nativo confirmou uma falha (resíduo) e
  revisão 1718189d; um Desfazer restaurou o modelo. F5 seguinte confirmou 2.200 W,
  dez regras/zero falhas/zero inconclusivos e revisão original 52d518a6. Histórico
  térmico chegou a 13 registros. Consulta ainda retornou applied após Desfazer,
  conforme semântica de recibo histórico; não promoveu resultado antigo.
- Conexão de teste desconectada pela UI; tentativa posterior de consulta falhou como
  esperado. Código temporário em arquivo ignorado foi removido após revogação, sem
  incluí-lo em relatório/projeto. Não houve configuração de cliente comercial/conta.
  Auxiliar requer Python Windows local; não foi integrado ao sidecar PyInstaller.
- Recuperação atual corresponde por checksum ao backup
  build/before-direct-reservation-20261024/recovery-before.json, referência 2.200 W,
  mantida pendente na janela sem restaurar/descartar. Backup anterior de 8:22 também
  permanece separado. Original sessao-antes-do-tema.nexo mantém 7.157 bytes/01:15:04.
  Sessão restaurada por Desfazer continua marcada não salva; nenhum arquivo do projeto
  foi sobrescrito. Somente hot reload/host afetado, sem WASM/sidecar/instalador.
- Próximo concreto: persistir fila/recibos e associar entrega à decisão para retomada
  após interrupção, sem reaplicar automaticamente. Expandir orçamento do worker MCP,
  perfis de domínio e propriedades/subgrafos conforme o plano. Windows limpo segue
  na fase final. Sem commit/push/publicação ou comunicação externa de projeto.

### Continuação local — orçamento de memória/CPU Windows (24/10)

- Antes de ampliar a conexão direta de propostas, fechado um incremento de contenção
  de recursos já pendente no plano. Job nativo agora tem512 MiB de memória virtual
  comprometida agregada e orçamento nominal30 s de CPU em modo usuário agregada.
  Inclui launcher e descendentes; parâmetros fixos, não fornecidos pelo projeto/UI.
  Não é RSS, porcentagem de CPU, limite de kernel ou sandbox. Timeout120 s permanece.
  Fora do Windows e no worker separado do MCP esses novos tetos não se aplicam.
- Excesso de compromisso de memória recusa a alocação, não garante matar processo;
  não inventar diagnóstico específico de memória a partir de erro genérico. CPU:
  Windows verifica periodicamente e termina o job. A ponte também consulta o consumo
  real depois do término e recusa resultados quando orçamento foi atingido, inclusive
  saída aparentemente bem-sucedida. Mantém cancelamento e término não confirmado.
  Documentação Microsoft conferida e vinculada em PONTE_NATIVA.md.
- Testes de fixtures reais: tentativa VirtualAlloc128 MiB negada em job64 MiB, mesma
  tentativa permitida fora do job; pai40 MiB + filho32 MiB compartilham o teto64 MiB
  e segunda alocação é negada; dois processos ocupam CPU até término por orçamento
  nominal1 s, com consumo consultado e zero processos restantes. Testes não executam
  código importado nem alteram limites do computador inteiro.
- Primeiro teste de CPU não confirmou o exit code presumido a partir da referência;
  diagnóstico corrigido para contabilidade do job e teste repetido com aprovação.
  Primeiro controle maior falhou em asserção JSON64.0 versus inteiro64: corrigida
  comparação numérica, sem mudar operação científica ou relaxar valor esperado.
- Motor Python já empacotado, sob os tetos padrão: importação de240 entidades
  (100 variáveis/50 equações/30 hipóteses/30 requisitos/30 observações),950 termos,
  projeção560 relações. Controle `(8 somas de1) * (8 somas de1)` produz64; todos
  os testes do controle consistentes e sem inconclusivos. Referência65 plantada gera
  exatamente uma falha e revisão diferente, sem mudar resultado64. É um caso
  sintético restrito, não benchmark geral ou comprovação de escala ilimitada.
- Evidência final: ponte16/16 (36,88 s), mais fixture ignorada no processo pai;
  host16/16 (6,35 s; compilação55,80 s separada), frontend70/70 unitários (4,94 s)
  e typecheck aprovados. Rustfmt e git diff --check aprovados. Sem nova suíte de
  navegador ou Python fonte: operações científicas e viewport não mudaram. Não
  reapresentar contagens anteriores de navegador como testes desta rodada.
- Processos dev/nativo anteriores estavam ausentes na retomada posterior. Iniciado
  npm run desktop:dev, compilando somente host/ponte afetados (33,18 s), sem gerar
  WASM/sidecar/instalador. Janela nativa: F5 real aprovou dez regras, zero falhas e
  inconclusivos, revisão52d518a6; nono registro térmico persistido. Arquivo de histórico
  confirma P_total2.200 W. Não houve ensaio manual de excesso na UI: excesso foi
  exercitado por fixtures Windows, separado da validação da janela normal.
- Backup existente build/before-resource-budget-20261024-105024/recovery-before.json
  conserva4.184 bytes da recuperação anterior. Na nova inicialização, o arquivo
  ativo recovery-v1.json estava ausente e o aviso não apareceu; causa não determinada.
  Não restaurado ou recriado automaticamente. Não afirmar checksum ativo preservado
  nesta retomada. Original sessao-antes-do-tema.nexo7.157 bytes/01:15:04 intacto.
  Viewport antes do intervalo estava320%; nova sessão iniciou51%, sem prometer
  restauração de câmera não salva. Modelo térmico16 nós, sem edição de formulário.
- Sem commit/push/publicação/comunicação externa. Próximo: transporte direto e fila
  de propostas por sessão; estender limites ao MCP e medir outros perfis suportados.
  Validação da distribuição/Windows limpo fica para a fase final conforme usuário.

### Continuação local — registro persistente de decisões de propostas (24/10)

- Arquivo → Registro de propostas… consulta decisões do modelo aberto por ID,
  diferenças Antes/Depois, autor/motivo declarados e exportação JSON somente leitura.
  Não altera grafo/resultados nem reaplica propostas. Tema herdado e pt/en funcionais.
- Aplicar persiste intenção pending antes de tocar o modelo, reconfere a identidade
  corrente e registra applied/failed depois da aplicação síncrona. Falha inicial
  impede mudança; falha final fica visível e oferece repetir só a confirmação.
  Interrupção mantém Aplicação não confirmada, sem inferir sucesso ou retomar edição.
  Rejeitar registra rejected sem editar modelo; Cancelar/fechar só dispensa a revisão.
- JSON nativo separado proposal-journal-v1.json, app_local_data_dir, mutex, leitura
  limitada e temporário sincronizado/substituição. Comando proposal_journal apenas
  main, sem caminho fornecido, execução, exclusão ou importação de histórico. Browser
  usa localStorage nativo do ambiente de desenvolvimento. Até20 registros/8 MB por
  perfil, com contagem de remoção por retenção. Corrupção impede nova gravação.
- Não é autoria autenticada, histórico científico ou auditoria imutável. Registra
  aplicação naquela sessão, sem afirmar salvamento/estado atual após Desfazer ou
  troca de projeto. Registros pending também podem sair pela retenção. Não persiste
  a fila de propostas recebidas nem integra ainda o MCP diretamente à janela.
- Testes finais: typecheck aprovado;70/70 unitários (4,16 s), incluindo retenção por
  bytes/contagem, transições, repetição segura e falha com intenção preservada.
  Host16/16 (9,30 s; compilação incremental24,59 s separada), incluindo três novos
  testes de persistência, corrupção/tamanho excessivo, retenção, estados e proteção
  de arquivo alheio. Cargo fmt --check e git diff --check aprovados.
- Edge Windows:11/11 direcionados (2,3 min: continuidade4, histórico2, idioma3,
  registro2) mais revisão MCP1/1 (1,2 min), total12 casos distintos aprovados nesta
  rodada. Aplicação/Desfazer, rejeição, exportação e recarga conferidos; falha inicial
  não muda modelo, falha final só repete recibo, um Desfazer basta. Tela de registro
  em inglês conferida. Primeira execução unitária revelou duas traduções ausentes,
  corrigidas. Primeiro roteiro MCP teve asserção de teste sobre campo inexistente
  expected_value; corrigida para value e caso repetido com aprovação. Sem ocultar
  essas falhas iniciais. Suíte completa52 não repetida: última completa50 pertence
  à rodada anterior. Python/motor científico/viewport/ponte não alterados.
  Capturas de falha de confirmação e registro em inglês preservadas em
  build/proposal-journal-validation-20261024; captura inglesa inspecionada visualmente.
- Janela Windows real: host recompilado pelo watcher desktop:dev (10:35:41),
  leitura do registro vazio, abertura da proposta térmica sintética local e rejeição.
  Gravação nativa real confirmada no disco e na reabertura do diálogo: estado rejected,
  autor Teste local sintético, ID1e29fd21-5fbe-4a68-992f-a4d19b8e9a63. Modelo original
  manteve16 nós/zoom51%/Sem execução, histórico térmico8 e recuperação pendente.
  Não foi aplicação manual nativa nem teste de instalação limpa. Proposta de controle
  em build/native-journal-control.proposal.json; gerador local não executa importados.
- Backup anterior em build/before-proposal-journal-20261024-103059/recovery-before.json.
  Conferência final: recuperação com checksum idêntico; arquivo original
  sessao-antes-do-tema.nexo7.157 bytes/01:15:04 preservado; nenhum knowledge-engine
  restante. Sem WASM/sidecar/instalador/commit/push/publicação/comunicação externa.
- Próximo incremento: transporte direto e fila de propostas por sessão explicitamente
  conectada, com limites, revisão visível e recusa de base obsoleta. Critérios em
  PROPOSTAS.md. Windows limpo continua na fase final; memória/CPU permanecem pendentes.

### Continuação local — cancelamento explícito e Job Object (24/10)

- Cancelar/Escape envia ID UUID da operação ao comando cancel_engine_request,
  permitido só à janela principal. Não recebe PID, executável, ambiente ou código.
  Registro limitado: uma operação ativa,32 pré-pedidos/10 s,64 finalizadas. Corridas
  de chegada e cancelamento antigo são tratadas; exclusão/fila mantidas até retorno
  terminal. Confirmação requested/queued não é confirmação de processo encerrado.
  Sem confirmação do término, host fica em quarentena e recusa novos trabalhos;
  devolver um erro à UI não libera outro processo em paralelo ao anterior incerto.
- Windows: Job Object kill-on-close, processo criado suspenso, associado e retomado
  antes do código do launcher. Erro/cancelamento termina job e exige ActiveProcesses=0,
  além de wait direto. Falha de contenção é erro, sem executar fora do job. Usa APIs
  estáveis Windows via windows-sys0.61.2 já presente no grafo, agora dependência direta;
  Tokio habilita sync. Referências oficiais/limites em PONTE_NATIVA.md.
- Frontend distingue cancelamento confirmado, resposta já concluída descartada e
  interrupção não confirmada. Esta última é erro visível. Host não registra recibo
  de execução cancelada; cliente não arquiva resultado descartado. Mantém queue até
  engine_request terminar. Payload não permite sobrescrever id/operação do transporte.
- Bug encontrado e corrigido: primeiro ramo Escape fechava menus, tornando o ramo
  posterior de cancelamento inalcançável. Escape agora prioriza operação analyze.
  Novo teste de navegador segura a requisição, cancela, exige ausência de progresso,
  sucesso fictício e histórico. Não é prova de cancelamento do navegador na árvore
  Windows: esse percurso foi validado separadamente na janela nativa.
- Ponte Rust12/12 aprovado (31,88 s no reteste final), mais fixture ignorada no pai;
  Job com dois processos termina ambos e preserva processo fora do job. Canal fechado
  sem ordem não cancela; pré-pedido não inicia executável. Motor empacotado continua
  reproduzindo controles térmicos. Host13/13 (6,82 s), cinco novos testes de IDs/fila/
  quarentena. Typecheck e66/66 unitários aprovados, incluindo erro de término sem
  aborto do usuário. Cargo check/fmt aprovados; Clippy segue ausente.
- Edge Windows6/6 direcionados (1 min: integridade/histórico) e novo Escape1/1 (13,7 s).
  Regressão completa Edge Windows:50/50 aprovados (8,9 min), incluindo GPU,
  câmera, propostas, persistência, recuperação, idioma e cancelamento por Escape.
  Python/viewport não mudaram. Sem build WASM/sidecar/instalador ou commit/push.
- Janela Windows: duas tentativas manuais rápidas concluíram antes do Escape; não
  contadas como cancelamento. Ensaio seguinte observou Verificando e enviou Escape
  imediatamente em duas células de entrada/refresco: Cancelamento confirmado pelo
  host, Sem execução, histórico térmico6 mantido, nenhum knowledge-engine no inventário.
  Total do perfil8 (inclui dois aritméticos), sem nova entrada cancelada. Em seguida,
  F5 novamente validou reabertura da fila:2.200 W/dez consistentes/zero achados.
  Após a proteção adicional de quarentena, outro F5 normal também concluiu sem erro;
  tentativas sem estado ativo observado não foram contadas como cancelamentos.
- Recuperação copiada antes das mudanças para
  build/before-native-cancel-20261024-095318/recovery-before.json. Permanece pendente,
  não restaurada/descartada; checksum final idêntico ao backup. Projeto original
  sessao-antes-do-tema.nexo permanece7.157 bytes/24-10 às01:15:04. Inventário final
  sem processos knowledge-engine; git diff --check sem erros (avisos LF/CRLF).
  Fixture científica adicional em
  build/native-cancellation-workload-20261024.json:100 variáveis/50 equações/950 termos,
  controle64 com103 regras aprovadas (verificador fonte0,116 s nesta execução). Não foi
  importada na janela e não serve como benchmark geral ou validação de desempenho.
- Próximo: transporte direto/registro persistente de propostas e orçamento de recursos.
  Windows limpo mantido para a fase final conforme usuário. Testar contenção também
  na distribuição final; não anunciar sandbox ou suporte de árvore fora do Windows.

### Continuação local — limite incremental nativo (24/10)

- Ponte Rust envia entrada, drena as duas saídas e espera processo em paralelo;
  stdout até 1 MB retido, stderr até 64 KB contado sem retenção/eco. Limites durante
  a leitura, não após wait_with_output. Mantidos entrada 256 KB e prazo 120 s.
  Não muda motor científico, contratos, permissões ou operações matemáticas.
- Excesso/IO/saída não-zero/timeout gera erro, inicia término e aguarda filho direto
  até 5 s adicionais. Término não confirmado permanece explícito. Não equivale a
  limite de memória/CPU ou gerência da árvore (incluindo launcher PyInstaller).
  Cancelar na UI ainda não envia comando ao host; fila/descarte anteriores continuam.
- API Tokio 1.54.1 conferida na documentação oficial. Detalhes/comandos em
  PONTE_NATIVA.md. Nenhuma dependência nova, instalador, build WASM ou sidecar.
- Ponte: 8 testes aprovados (19,36 s), mais uma fixture ignorada no processo pai,
  invocada nos testes de subprocesso. Casos: fronteira, flood stdout/stderr,
  timeout/stdin bloqueado, saída não-zero, binário/entrada e motor real empacotado.
  O filho direto é confirmado encerrado nos fixtures; não é prova sobre descendentes.
  Motor real reproduziu 2.200 W/zero falhas e omissão plantada 1.000 W/duas falhas.
- Host: 8/8 aprovados (7,47 s de execução; compilação incremental separada), incluindo
  arquivos Unicode, recuperação/histórico, limites e falhas sem perda. Watcher do
  desktop:dev recompilou somente host afetado; executável novo de 09:36:25 aberto.
  Janela nativa: F5 real, 2.200 W, dez consistentes/zero achados/zero inconclusivos,
  revisão 52d518a6, quarto registro térmico no histórico. Mesmo canvas Rust/GPU.
  Sem suíte nova de navegador/Python nesta rodada: esses componentes não mudaram.
- Antes da mudança: recuperação copiada para
  build/before-native-bridge-20261024-093003/recovery-before.json. Janela restaurada
  mostrava recuperação pendente, sem execução e sem editor de nó aberto. Cópia
  mantida, sem descartar/restaurar automaticamente. Nenhum commit/push/publicação.
  Conferência final: recuperação presente/hash idêntico ao backup, original
  theme-baseline 7.157 bytes/01:15:04 preservado. Cargo fmt --check aprovado;
  Clippy indisponível na toolchain 1.99.1 instalada, não executado nem contado como
  aprovado.
- Próximo: cancelamento com identificação de operação e confirmação no host, sem
  perder a exclusão da fila. Transporte direto de propostas continua pendente;
  instalação em Windows limpo permanece para a fase final.

### Retomada horária — limite incremental do conector/MCP (24/10)

- Incremento independente na fila de recursos: captura do worker científico de
  conector/MCP agora lê stdout/stderr em paralelo, em blocos limitados. stdout até
  4 MB, stderr até 64 KB sem reter/ecoar conteúdo. Não espera acumular a resposta
  inteira para verificar o tamanho. Limites não são fornecidos pelo projeto ou IA.
- Ao exceder, encerra e aguarda o filho direto e retorna output_limit. Timeout,
  falha de início/saída e término não confirmado têm erro explícito; nenhuma dessas
  situações arquiva um run como aprovado. Escrita da entrada em paralelo permite
  cumprir o prazo mesmo se o filho não consumir stdin. Código confiável fixo,
  isolado de cwd/PYTHONPATH; nenhum código dos modelos é executado.
- Limite é de captura, não de memória/CPU/RSS do solver, e não gerencia descendentes.
  Ponte Rust/Tauri ainda usa sua implementação anterior; cancelamento efetivo e
  orçamento de recursos nativos seguem abertos. Sem alterar/recompilar host,
  viewport, React ou sidecar e sem interromper sessão nativa não salva.
- Oito casos novos: fronteira exata, flood stdout/stderr com filho confirmado
  encerrado, dreno simultâneo, stdin bloqueado com timeout, saída não-zero sem eco,
  executável ausente e erro de limite sem histórico. Fixtures executáveis são de
  teste, não arquivos de projeto ou evidência científica. Import sorting encontrado
  pelo Ruff foi corrigido. Python completo com extra MCP 48/48 aprovado em 42,71 s;
  Ruff aprovado. Edge Windows direcionado 2/2 em 52,7 s: cliente JSONL aritmético e
  cliente MCP/circuito reais, modelos importados com mesmas revisões/resultados.
  Suíte completa de interface 49/49 é da rodada anterior; não repetida sem mudança
  de React/Rust/WASM. Janela nativa e instalação limpa não exercitadas nesta rodada.
- Windows limpo permanece para a fase final por decisão do usuário. Transporte
  direto de propostas e registro persistente permanecem pendentes; próximo aceite
  continua escopo visível/revisão explícita, sem acessar pastas/GitHub implicitamente.

### Continuação local — propostas portáteis (24/10)

- Usuário adiou o item 8 (instalação/validação em Windows limpo) para o final.
  Pendência mantida antes de distribuição; não interrompe os outros incrementos.
- Ferramenta MCP `nexo_export_proposal`/operação JSONL proposal.export recebe base
  explícita do mesmo projeto e autor/motivo. Exporta envelope não assinado, sem
  alterar a sessão ou executar análise. MCP agora publica oito ferramentas.
- Arquivo → Revisar proposta abre diálogo de diferenças Antes/Depois por elemento e
  metadados. Base/candidato/atual são normalizados pelo contrato de importação do
  motor já empacotado; nenhuma mudança de protocolo/host ou build do sidecar.
  Comparação é pelo conteúdo completo, preservando ordem/multiplicidade das
  expressões, não por hash declarado pelo remetente. Autor/motivo não autenticados;
  hashes do envelope não são apresentados como verificados pela UI.
- Cancelar não altera modelo/resultado. Aceitar exige revisão explícita e aviso
  sobre formulários ainda não aplicados; reconfere base atual após awaits, recusa
  conflito e aplica pelo commit do editor, com Desfazer/Refazer, análise invalidada,
  câmera/caminho preservados e alterações não salvas. Não escreve arquivo sozinho.
  Transporte direto MCP→janela, fila persistente e auditoria ainda não existem.
- Limites: proposta 600 KB e contratos científicos/transporte por modelo; arquivo
  rejeita campos extras ou modelos de outro projeto. Dados passam por validação
  estrutural, não aprovação científica. Documentação: PROPOSTAS.md.
- Testes: Python completo com MCP 40/40 (41,81 s), incluindo exportação de base/
  candidato e recusa de projeto diferente. Typecheck e 63/63 unitários frontend;
  cobertura pt/en inclui o diálogo. Falha inicial encontrou tradução Fechar ausente,
  corrigida e teste repetido. Edge direcionado 2/2 (1,3 min): circuito via MCP e
  revisão/cancelamento/aplicação/reanálise/Desfazer/base adulterada com hash intacto.
  Suíte completa Edge Windows 49/49 aprovada (6,6 min). Diálogo conferido na captura
  test-results/proposals-MCP-proposal-rev-48c54-d-refuses-content-conflicts/proposal-review.png.
  Benchmark de renderer incluído na suíte não equivale a validação de modelo
  científico de mil nós nem garantia geral de desempenho.
- Recuperação existente copiada antes da mudança de interface para
  build/before-proposals-20261024-084304/recovery-before.json; não apagada ou
  restaurada automaticamente. App não ganhou hooks novos, preservando a assinatura
  de Fast Refresh da sessão principal. Não gerar instaladores nesta fase.
  Conferência final: recuperação presente e hash idêntico ao backup; original
  theme-baseline segue 7.157 bytes/01:15:04. Nenhum commit/push ou publicação.
- Próximo: transporte direto com escopo visível e registro persistente de propostas;
  depois cancelamento/limites de recursos conforme a fila. Janela/instalador Windows
  desta funcionalidade ainda não foram validados nesta rodada; navegador separado.

### Continuação local — MCP stdio e circuito sintético (24/10)

- Adaptador `knowledge_engine.mcp_server` sobre o contrato do conector. SDK Python
  oficial 1.28.1 fixado no extra opcional `mcp`/lockfile; sem dependência obrigatória
  do motor ou da janela. Contrato/configuração genérica em [MCP_LOCAL.md](MCP_LOCAL.md),
  conferidos na documentação oficial v1 e nas assinaturas do pacote instalado.
- Sete ferramentas MCP com JSON Schema, instruções e anotações: describe, create,
  get, export, apply, analyze e evidence. Descoberta/handshake pelo SDK, conteúdo
  textual e estruturado equivalentes. Falha de ferramenta usa isError=true;
  attention/inconclusive de análise real concluída não é erro de transporte nem
  aprovação científica. Campos de caminho/código/transporte fornecidos são recusados.
- Sessão segue separada, em memória, sem rede, pastas/GitHub, sampling, controle da
  janela ou gravação no histórico nativo. Chamadas serializadas; cópia candidata só
  é confirmada após checagem de cancelamento. Cancelamento testado com operação de
  transporte lenta simulada, não desempenho científico nem cancelamento de árvore.
  Filho científico pode terminar ou alcançar prazo 20 s antes do descarte.
- Linha MCP até 300 KB antes de decodificar; mesmos limites internos do conector.
  Entrada malformada/grande encerra com diagnóstico genérico, sem eco de documento.
  Não há recuperação de sessão ou journal idempotente persistente; limites
  incrementais da saída científica continuam pendentes. Texto/structuredContent
  duplicam dados no fio. Nenhuma configuração externa de IA foi alterada.
- Testes desta continuação: Ruff services/scripts/tests/engine e uv lock --check
  aprovados; Python completo com extra MCP 39/39 (30,65 s). Seis casos MCP novos:
  schemas, cliente SDK stdio real, duas edições concorrentes/revisão antiga,
  evidência original após mudança, cancelamento de candidata, erro sem eco e
  entradas malformada/grande. Primeiro ensaio teve erro no pytest/Windows por ID
  de parâmetro grande; IDs curtos corrigiram a infraestrutura, sem falha científica.
- `scripts/validate_mcp.py`: cliente oficial criou nove nós de circuito sintético
  I=2 A/R=3 ohm, V=6 V/P=12 W; sete regras aprovadas/zero inconclusivos. Referência
  13 W plantada causou uma falha de resíduo/seis aprovadas. Evidência de 12 W
  permaneceu na revisão original. Artefatos em build/mcp-circuit-validation-20261024.
- Novo Edge Windows 1/1 (38,4 s): script MCP real, importação dos dois modelos na
  UI, nove nós GPU, mesmas revisões e 6 V/12 W; zero/um achado conforme referência.
  Janela nativa minimizada retornou título térmico; captura recusada por estar
  minimizada, sem ativar/reiniciar/interferir na sessão. Encontrada recuperação
  local de 4.184 bytes, preservada; não removê-la nem substituir trabalho não salvo.
  Arquivo theme-baseline permanece 7.157 bytes/01:15:04. Janela não foi usada para
  ensaio MCP nesta continuação. Suítes completas de frontend/Rust e instalação limpa não
  repetidas sem alteração nesses componentes.
- Ambiente Python isolado sem extra MCP confirmou ausência do módulo mcp e análise
  térmica real: 2.200 W, dez regras aprovadas/zero falhas/zero inconclusivos. SDK
  opcional não é requisito para o núcleo. Workflow de validação passa a executar
  pytest com --extra mcp; CI remoto não executado nesta rodada.
- Próximo concreto: proposta/preview para aplicar lote à janela ativa com revisão
  esperada, resumo de diferenças e preservação de alterações não salvas. MCP local
  já testado; não afirmar compatibilidade testada com cada produto comercial ou
  acesso remoto da nuvem. Sem builds WASM/host/instalador, commits/push/publicação.

### Sexta retomada horária — conector de autoria isolado (24/10, manhã)

- Novo transporte opcional `python -m knowledge_engine.connector`, JSON por linha,
  stdin/stdout, uma sessão em memória por processo. Sem servidor/rede, acesso a
  pastas/GitHub/código importado ou controle da janela ativa. Não é MCP. Contrato
  e limites em [CONECTOR_LOCAL.md](CONECTOR_LOCAL.md); nenhuma dependência nova.
- Describe fornece JSON Schema. Create/get/export/apply/analyze/evidence.get
  reutilizam contratos Pydantic, projeção e verificador científicos existentes.
  Operações de projeto exigem sessão, projeto e revisão esperada; conflito não
  aplica mudanças. Lote de edições sobre cópia é atômico. IDs duplicados recusados.
- Cinco tipos de nó; put completo/remove, renomear projeto e três relações de
  contexto tipadas. INPUT_TO/PRODUCES derivam de AST/lhs explícitos de equação:
  nenhuma conexão inventa operação ou achata/reordena expressão. Remover deixa
  referências pendentes explícitas para a verificação. Desconexão não usa um
  identificador sentinela que já corresponda a um nó existente.
- Análise em filho científico confiável, isolado de cwd/PYTHONPATH e com prazo de
  20 s. Timeout encerra esse filho e retorna erro; evidência não é arquivada como
  aprovação. Captura de saída ainda é limitada depois da leitura, sem orçamento
  incremental de memória. Isso não resolve o cancelamento da ponte Tauri original.
- Sessão: requisição 256 KB, modelo 240 KB, lote 240 edições e limites científicos
  preservados. Até 20 evidências/8 MB em memória, 4 MB por evidência. Consulta guarda
  revisão/modelo/resposta originais, envelope igual ao da exportação desktop.
  Encerrar perde a sessão; não há persistência/ingestão no histórico do desktop.
- Cliente de referência independente de SDK de IA e roteiro
  `scripts/validate_connector.py`. Construiu seis nós/cinco classes de relação via
  stdio: `(12.5*12.5)-12.5=143.75`, cinco regras aprovadas. Referência 143 plantada
  resultou em uma falha de resíduo, quatro aprovadas/zero inconclusivos. Conflito
  recusado e evidência original ainda contém 143.75. Arquivos separados em
  `build/connector-validation-20261024-r6`, sem sobrescrever experimento anterior.
- Testes desta rodada: Ruff em services/scripts/tests/engine aprovado; suíte Python
  completa 33/33 (29,88 s), incluindo 12 novos cenários: escopo, conflito, lote
  atômico, tipos/identidade, evidência antiga, timeout real, falha sem arquivamento,
  referência ausente, campos/código/caminho recusados, Unicode/JSON ruim/256 KB.
  Uma falha de worker simulada testa só transporte/estado, não resultado científico.
  Novo teste Edge Windows 1/1 (33 s): cliente stdio real, importação dos dois modelos,
  seis nós GPU e revisões/resultados idênticos ao conector. Esse teste antecedeu só
  o ajuste de desconexão de sentinela, depois coberto pela suíte Python 33/33.
  Suíte frontend completa 46/46 e 60 unitários são evidências da rodada anterior;
  não foram reexecutados, pois não houve alteração de código React/Rust/WASM.
- Mouse/Tauri: importação do controle abriu seis nós, Sem execução; F5 real retornou
  143,75, cinco consistentes/zero inconclusivos, revisão faea8caa, registrada no
  histórico nativo. Contraprova também importada sem herdar resultado corrente;
  F5 real: quatro consistentes/um achado/zero inconclusivos, revisão f36ea91d,
  resíduo 0,75 ante referência 143/tolerância zero. Resultado/evidência renderizados
  nas propriedades e dois registros no histórico do projeto sintético.
  Roteiro stdio repetido após o ajuste final do cliente: mesmo resultado, saídas
  separadas em `build/connector-validation-20261024-r6-final`.
  Retomadas de 10:16/11:14 UTC incorporadas ao trabalho em andamento sem outra rodada
  concorrente. Projeto original theme-baseline reaberto, 16 nós/zoom 51% e Sem
  execução após abertura; arquivo segue 7.157 bytes/01:15:04, sem sobrescrita e sem
  recuperação pendente. F5 final confirmado na janela e no histórico: 2.200 W,
  dez consistentes/zero achados/zero inconclusivos, revisão 52d518a6. Três registros
  térmicos no histórico; os dois aritméticos permanecem associados ao outro projeto.
- Base existente do Gemini preservada nesta retomada; sem instalador,
  builds WASM/host, commit,
  push, publicação ou comunicação externa. Apenas servidor desktop já vivo reutilizado.
- Próximo: propostas revisáveis para a janela ativa e adaptador MCP; depois eventos
  reais de montagem. Persistência da sessão, limites incrementais, cancelamento da
  árvore de processos e escopo local/GitHub permanecem pendentes.

### Quinta retomada horária — histórico e evidência (24/10, madrugada)

- Histórico local agora guarda modelo de entrada, fontes/hipóteses/tolerâncias,
  resposta real, revisão, versão do motor, data, valores, regras, evidências e limites.
  Arquivo `history-v1.json` separado do projeto/recuperação no diretório local do app;
  navegador usa `nexo.history.v1` em localStorage. JSON atômico, não SQLite.
- Windows: host retém até quatro confirmações temporárias de respostas reais do
  motor. UI confirma apenas runId depois de aceitar a execução; não envia modelo
  nem veredicto ao comando de arquivamento. Importar JSON de projeto não cria
  histórico. ID sem resposta real é recusado; repetir confirmação já gravada não
  duplica. Cancelamento ou resultado descartado pela UI não chama arquivamento.
- Retenção explícita: até 20 registros ou 8 MB por perfil, 4 MB por registro; mais
  antigos saem primeiro, com contador de retenção. Modelo permanece limitado a 2 MB.
  Leitura limitada, gravação temporária/sync/substituição e fila/trava. Corrupção,
  escrita recusada e falha de confirmação não viram sucesso; cópia anterior e
  confirmação ainda não gravada permanecem para repetição.
- Painel Histórico filtra pelo ID do projeto. Cada registro mostra revisão/data e
  distingue Execução atual de Arquivada. Inspeção somente leitura mostra regras,
  evidência, snapshot de entrada e limites sem mudar grafo, câmera, propriedades ou
  análise corrente. Exportação `.nexo-evidence.json` preserva modelo/resposta juntos.
  Ainda não existe importador desse envelope de evidência.
- Falha de persistência tem aviso no histórico, indicador na aba e Tentar novamente;
  resultado científico concluído continua disponível. Reabrir/consultar histórico
  não roda análise automaticamente e não repinta nós como verificados.
- Testes: typecheck e 60/60 unitários; suíte completa Edge Windows 46/46 (6,4 min),
  incluindo dois novos cenários com motor real: revisão original de 2.200 W,
  alteração sintética U=0,7 para 2.600 W, exportação da evidência antiga, recarga sem
  resultado corrente, arquivo corrompido preservado e repetição após correção.
  Rust host 8/8 aprovado também no reteste final (7,96 s): persistência/Unicode,
  limites por quantidade/bytes, deduplicação, confirmação inexistente, repetição,
  estados desconhecidos e falha sem perda. Após a suíte completa, o limite de texto
  de expression no histórico foi alinhado ao orçamento de 4 MB do registro: o motor
  serializa expressões SymPy e o limite genérico de rótulos (10 mil caracteres)
  poderia rejeitar uma resposta válida. Teste adicional cobre só essa serialização,
  sem afirmar validação científica de um modelo grande.
  Reteste direcionado Edge 2/2 passou em 42,2 s após esse ajuste. Primeira tentativa
  de iniciar o reteste recusou a porta 1420 ocupada; repetido com
  NEXO_REUSE_DEV_SERVER=1, preservando o servidor desktop existente.
- Falha encontrada durante implementação: chave de tradução Revisão duplicada,
  detectada no typecheck e corrigida antes do aceite. Novo painel usa catálogo pt/en;
  evidência e textos do modelo permanecem na origem. Cobertura de traduções inclui
  RunHistory.tsx. Motor Python e crate viewport não alterados.
- Mouse/Tauri: F5 real gerou arquivo de 7.448 bytes, um registro com revisão
  52d518a6 e motor 0.1.0. Após Ctrl+R, registro continuou no histórico, marcado
  Arquivada; status Sem execução e nós pendentes. Abrir a evidência manteve esse
  estado. Sem restaurar resultado antigo como nova análise. Reinício incremental
  do host preservou o registro em disco com Sem execução. Projeto original foi
  reaberto e F5 produziu uma segunda execução: ambas consistentes, 10 regras
  aprovadas e zero falhas, revisão 52d518a6. Histórico final 14.831 bytes/dois IDs
  distintos; arquivo original segue 7.157 bytes/01:15:04, sem sobrescrita e sem cópia
  de recuperação pendente. Nenhuma instalação limpa foi testada nesta rodada.
- Limites: uma instância por perfil, sem coordenação entre processos concorrentes;
  histórico local não é assinatura nem prova científica. Registros anteriores à
  implementação não são reconstruídos. Importação de evidências/MCP e SQLite não
  implementados. Nenhum instalador, publicação, commit/push ou alteração externa.
- Próximo: contrato e transporte de automação local com revisão esperada, cliente
  de teste independente de fornecedor e escopo explícito para acesso a arquivos.

### Quarta retomada horária — recuperação local (24/10, madrugada)

- Cópia automática da sessão ativa: modelo canônico, fontes/hipóteses/tolerâncias,
  posições, câmera, visibilidade e os painéis já suportados pelo formato v1. Consulta
  a cada 1,5 s enquanto há alterações e nenhuma operação em andamento; só grava
  quando o conteúdo muda. Não inclui rascunhos ainda não aplicados, seleção,
  protótipos de subgrafos ou histórico de execuções, que continua pendente.
- Windows: `recovery-v1.json` no diretório local de dados do app, separado do arquivo
  escolhido. Comando Rust aceita somente read/write/clear e nenhum caminho externo;
  escrita temporária + sync + substituição atômica, leitura limitada e trava/fila de
  operações. Projeto continua limitado a 2 MB; envelope de recuperação a 2,1 MB.
  Navegador usa `nexo.recovery.v1` em localStorage, sujeito à quota do navegador.
- Ao reabrir/recargar, oferece Restaurar/Descartar sem substituir silenciosamente o
  projeto atual. Modelo recuperado passa pela importação restrita do motor e fica
  não salvo, sem autorização herdada sobre um caminho e sem análise corrente.
  Não carrega verdictos extras do snapshot; F5 é uma nova execução real.
- Falha/corrupção mantém o conteúdo anterior e mostra aviso compacto com detalhes.
  Gravações/remoção são serializadas para um checkpoint atrasado não ressuscitar
  cópia descartada. Salvamento nativo confirmado limpa a recuperação; download de
  navegador mantém a cópia, pois não confirma persistência do arquivo recebido.
- Estados de carregar/abrir/salvar/restaurar/verificar agora separados. Abrir arquivo
  não mostra execução científica, passos ou Cancelar falsos. Erros gerais não são
  rotulados todos como erro de análise. UI nova disponível em pt/en.
- Testes: typecheck e 52/52 unitários; 3/3 Rust host (gravação/Unicode, corrupção,
  limite e destino que falha); suíte completa Edge Windows 43/43 em 6 min. Novos
  cenários cobrem recarga com dados/câmera, fonte e 2.600 W recalculados, tentativa
  de injetar resultado antigo, corrupção mantida, quota simulada e IPC de arquivo.
- Mouse/Tauri: primeiro ensaio expôs permissão do comando ausente; adicionada ao
  manifesto e à capability restrita, host recompilado incrementalmente. Nome sintético
  alterado sem salvar; arquivo real de recuperação de 4.195 bytes criado pelo host;
  Ctrl+R reabriu a oferta; Restaurar trouxe 16 posições/zoom 0,5114 sem execução.
  F5 real retornou 10 consistentes/0 inconclusivos, 2.200 W e revisão 73edb6c7.
  Salvo depois em `build/continuity-recovery-20261024/ensaio-nativo-recuperado.nexo`;
  arquivo de recuperação deixou de existir. Snapshot de ensaio preservado em build.
  Checkpoint anterior continua 7.157 bytes e modificação 01:15:04, não sobrescrito.
- Limites: ensaio nativo foi recarga de WebView, não queda de energia nem instalação
  limpa. Uma cópia por perfil/sessão; não há coordenação entre várias instâncias.
  Últimos 1,5 s e alterações durante operação podem ainda não estar na cópia.
  Histórico persistente e MCP não implementados nesta etapa. Sem instalador/commit/push.
- Mouse também encontrou menu do nome do projeto abrindo abaixo da barra inferior:
  herdava top da classe toolbar-popover. Corrigido top:auto e afastamento acima do
  rodapé; Escape agora fecha esse menu. Novo teste de geometria reproduziu o defeito
  (menu até y=1011,5 num rodapé y=973); ajuste intermediário deixou sobreposição de
  0,5 px, corrigida com afastamento maior. Sete testes focais de projeto/recuperação
  passaram nesse reteste e o novo cenário passou depois 1/1 em 9,6 s. Somados aos
  43/43 da suíte, 44 cenários distintos cobertos; não houve nova suíte completa 44/44.
  Mouse confirmou menu visível acima do rodapé. Typecheck e 52 unitários passaram
  novamente após o último ajuste de teclado. Cobertura estática 527/0 ausências.
- Sessão final: checkpoint original theme-baseline reaberto com caminho confirmado,
  português/grafite, 16 nós/zoom 0,5114, sem alteração não salva. F5 real novamente:
  10 consistentes/0 inconclusivos, potência 2.200 W, revisão 52d518a6. Nenhum snapshot
  de ensaio pendente no diretório do app; ensaio salvo e backup guardados em build.
- Próximo: histórico persistente com vínculo ao modelo/revisão/versão do motor e
  distinção explícita entre arquivo de evidência e execução atual; depois conector.

### Terceira retomada horária — idioma e validação (24/10, madrugada)

- Contexto React e catálogo explícito português/inglês, sem substituição DOM. Idioma
  aplicado imediatamente e persistido em `nexo.preferences.v1`, compatível com dados
  anteriores. Comandos, configurações, biblioteca, propriedades, resultados, ajuda,
  dicas e estados gerados dos nós GPU acompanham a escolha; números/datas usam Intl.
- Dados do projeto, IDs, expressões, unidades, fontes e evidências mantêm o texto
  original. Títulos das regras conhecidas são localizados; erros livres do motor e
  mensagens de validação ainda podem vir em português. Não há tradução automática
  de conteúdo científico nem de botões fornecidos pelo Windows.
- Troca de idioma não refaz análise, não modifica revisão/modelo/câmera e não converte
  título de projeto que coincida com um comando (controle: título “Salvar projeto”).
  Atlas GPU é reconstruído para texto/portas do idioma, sem alterar topologia/layout.
- Corrigida atualização do título nativo ao abrir/renomear projeto (dependia apenas de
  dirty). Atalhos de arquivo agora leem idioma/preferências atuais: mouse nativo
  encontrou Ctrl+O usando idioma antigo após troca; dependências corrigidas e teste
  de IPC simulado cobre pt/en imediatamente. Diálogos próprios têm título/filtro
  inglês; botões e aparência do seletor Windows seguem o sistema.
- Ajuda/ficha experimental deixam de inventar hipóteses térmicas, equação padrão ou
  garantia de tolerância. Exibem hipóteses reais e fonte somente leitura; protótipo
  de subsistema não executa nem salva componentes. Ajuda distingue cobertura,
  operações suportadas e consistência de prova/causalidade. Atualizações não afirma
  falsamente estar na última versão quando não há serviço configurado.
- Escada aritmética pela interface inglesa e motor Python real: x=12,5; saída
  `(x * x) - x` = 143,75; referência 143,75 com tolerância 0,0001 passa; trocar para
  143 produz falha residual e nova revisão. Caso sintético, não descoberta empírica.
- Testes: typecheck; 47/47 unitários; host Rust 1/1 (arquivo Unicode/gravação atômica);
  suíte completa Edge Windows 39/39 antes dos últimos ajustes focais. Após ajustes,
  os dois cenários de idioma/matemática passaram novamente e o novo teste de atalhos
  com IPC simulado passou 1/1 (40 testes UI distintos no conjunto, não suíte completa
  de 40 executada nesse checkpoint inicial). Depois da retirada do explorador,
  typecheck e 47 unitários passaram novamente; 519 chaves estáticas/0 ausências.
  A execução completa de 40 terminou 39 aprovados/1 falha na expectativa do teste
  migrado de painel esquerdo para direito (ArrowRight reduz largura, não aumenta).
  Corrigida a expectativa direcional; reteste focal de viewport 2/2 aprovado
  (22,7 s). Aceite final cobre os 40 cenários distintos por suíte 39+reteste 2;
  não foi repetida outra suíte completa depois dessa correção somente de teste.
- Durante reteste houve hot reload de catálogo ainda em edição: uma rodada foi
  invalidada por recarga e uma primeira simulação IPC incompleta não tinha metadata
  de janela. Corrigidos e repetidos sem edições concorrentes; falhas não são aceites.
  Uma vírgula de catálogo causou overlay de desenvolvimento, corrigido antes do aceite.
- Mouse/janela Tauri Windows: tema grafite preservado, pt→en, diálogo de abertura
  inglês confirmado, checkpoint `build/continuity-theme-baseline-20261024/sessao-antes-do-tema.nexo`
  reaberto com caminho confirmado, 16 nós/zoom 0,5114. F5 real: 10 consistentes,
  0 inconclusivos, revisão 52d518a6 e potência 2.200 W. Retorno en→pt manteve resultado,
  arquivo e câmera; janela deixada em português. Arquivo de checkpoint não sobrescrito.
- Nenhum instalador/release/commit/push. Host recompilado incrementalmente apenas
  pelo diálogo nativo alterado; crate viewport não alterado, sem novo build WASM.
- Incremento seguinte na mesma retomada: explorador redundante aposentado de Exibir,
  árvore lateral, estado/largura e CSS. Formato v1 aceita workspace.explorer=true de
  projetos antigos, ignora painel retirado e grava false nos novos salvamentos.
  Exemplos continuam em Arquivo; pesquisa, biblioteca e navegador permanecem.
  Itens dinâmicos de Exibir também traduzidos; teste de redimensionamento migrou
  para Propriedades. Mouse confirmou Exibir com somente os três painéis existentes;
  checkpoint reaberto e F5 repetido com os mesmos 10 resultados e revisão.
- Próximo: estados separados de arquivo/análise e revisão de ícones/textos; depois
  recuperação/histórico persistente com teste de interrupção, antes de conector/MCP.

### Segunda retomada horária — tema e preferências (24/10)

- Superfícies compartilhadas por tokens: claro com barras discretamente cinza, canvas
  quase branco e campos separados; escuro grafite neutro (canvas #202020, painéis
  #2a2a2a, barras #242424). Removida camada azul-marinho incompleta. Menus, formulários,
  biblioteca, configurações, propriedades e resultados usam as mesmas superfícies.
- Paleta dos cartões/ícones/portas/trilhas GPU agora tem tema explícito em Rust via
  `vp_set_appearance`; atlas tipográfico tem cores de texto/unidade/estado para escuro.
  Não é um filtro CSS aplicado ao canvas. Tema não altera dados, arestas ou câmera.
- Barra de título Windows acompanha o tema por API nativa, com permissão restrita
  `core:window:allow-set-theme`. Verificado visualmente na janela WebView/Tauri.
  Diálogos de arquivo do Windows continuam seguindo a aparência do sistema operacional.
- Marca escura/splash em SVG/PNG e tokens do kit atualizados para grafite; gerador
  mantém essas variantes e publica cópias runtime. Ícone Windows existente preservado.
- Configurações extraídas para `SettingsPanel.tsx`. Oito preferências reais com aplicação
  imediata e persistência local versionada: tema, grade, Pan livre/Espaço, rótulos na
  visão geral, cor/halo de seleção, duplo clique e confirmação de exclusão com vínculos.
  Valores inválidos/corrompidos usam defaults seguros; falha ao salvar é explícita.
- Removidos seletores sem consumidor de timeout/tolerância/verificação automática e
  estilo de fio. Motor exibe apenas informação real: processo local, limite 120 s,
  tolerância por referência. Idioma sem implementação foi retirado temporariamente,
  para ser substituído pela tradução React real no próximo incremento.
- Duplo clique padrão inspeciona; subsistema experimental exige opção explícita.
  Cor/halo de seleção chegam à geometria Rust; halo amplo desativado por padrão.
  Grade e Pan têm comportamento efetivo. Dicas acompanham o modo e o duplo clique.
- Antes de reinício/HMR, sessão salva pelo diálogo nativo em
  `build/continuity-theme-baseline-20261024/sessao-antes-do-tema.nexo`: envelope válido,
  16 posições, zoom ~0,5114. Reaberta na janela em grafite, com caminho confirmado.
  A alteração de capacidade reiniciou o host de desenvolvimento pelo watcher; houve
  atualização incremental WASM, nenhum instalador nem rebuild de distribuição.
- Detectada incompatibilidade transitória entre ponte e WASM durante hot reload;
  acrescentada checagem explícita da ABI para mostrar diagnóstico em vez de erro
  tardio de função ausente. Após compilar WASM e recarregar, janela recuperada.

Validação desta segunda retomada:

- `npm run typecheck`: aprovado. `npm run test`: **43 aprovados**.
- `cargo test --locked --manifest-path packages/viewport-core/Cargo.toml`: **6 aprovados**,
  incluindo invariância de dados/câmera e nova paleta neutra GPU.
- `npm run viewport:build`: aprovado; artefato servido atualizado (133.934 bytes).
- Suíte completa Playwright/Edge Windows: **35/35 aprovados**, com motor Python real.
  Regressão focal após correção de campos brancos: **2/2 aprovados**, incluindo leitura
  de pixels GPU de superfície escura e texto claro, preservação de câmera/resultados,
  retorno ao claro e recarga com preferências persistidas.
- Testes adicionais de Pan livre, inspeção por duplo clique, confirmação de exclusão
  e rótulos em zoom distante: **2/2 aprovados**. Total de 37 cenários distintos de UI
  aprovados no conjunto (suíte integral de 35 mais dois casos novos).
- Mouse/teclado na janela Windows: tema aplicado na hora, barra nativa grafite,
  campos de propriedades legíveis e abertura nativa da cópia preservada. Resultado
  de F5 no projeto recuperado: **10 consistentes/0 inconclusivos**, revisão 52d518a6,
  P_total=2.200 W. Observados e corrigidos campos brancos e barra de filtros clara
  que os primeiros testes de tema não cobriam; regressão estendida para esses locais.
- SVG/PNG escuros e prancha visual regenerados sem tocar nos ícones nativos. Prévia
  diagnóstica e cópia de segurança ficam em build/ (ignoradas no Git).

### Incremento implementado nesta retomada

- Console aguarda o motor real: removidos timers, percentuais inventados, aprovação
  dimensional antecipada e sucesso por nó sem telemetria. Enquanto aguarda, progresso
  indeterminado; ao concluir, logs por regra preservam passado/falha/inconclusivo.
- Cancelamento descarta a resposta, inclusive no Tauri. A fila do host permanece ocupada
  até liberação real do subprocesso; não existe comando para matá-lo manualmente ainda.
  Solicitação e espera são explícitas; erro/cancelamento não viram resultado aprovado.
- Arraste da miniatura usa pointer capture, funciona no WebView Windows e tem apenas
  um caminho de criação. A posição de soltura é convertida com pan/zoom atuais; cria
  uma instância no centro escolhido. Soltura em painel/fora do canvas ou Esc cancela.
  Removidos handlers duplicados de HTML drop, clique de inserção e botão Inserir.
- Novo abre editor do tipo ativo; Enter na miniatura abre configuração. IDs previsíveis
  e únicos, sem sufixo aleatório. Criação via catálogo usa limites/validações do mutator,
  preserva expressão, rejeita ID duplicado/operando inexistente e não supõe saída própria.
  Referência exige valor explícito; não transforma campo vazio em medição zero.
- Corrigidas expressões dos exemplos térmicos para os identificadores do exemplo atual;
  removida divisão não suportada. Requisitos agora descrevem cobertura de equações,
  sem aparentar verificar desigualdades que o motor v1 não verifica. Removida referência
  normativa sem fonte. Dados de catálogo identificados como exemplos sintéticos.
- Removidas sementes internas fictícias de subgrafo e instrução F5 repetida no inspetor.
  O editor de subsistemas restante é um protótipo local em memória: usa DOM e não é
  grafo científico executável, não persiste, não atende ainda ao contrato Rust/GPU.

### Evidência desta retomada

- `npm run typecheck`: aprovado.
- `npm run test`: 41 testes aprovados (inclui cancelamento nativo/serialização e criação
  transacional com rejeição de expressões/IDs/quantidades inválidas).
- Playwright no Edge Windows com motor Python real: execução inicial 31/32 aprovados.
  Falha restante revelou entrada inexistente em fórmula de catálogo; corrigida e
  revalidada no percurso de arraste. Regressão focal: 4 testes aprovados (arraste,
  editor, espera honesta e catálogo). O caso adicional de ciclo real passou em execução
  isolada: inconclusivo não aparece como falha/prova. No conjunto, 33 casos distintos
  de interface aprovados; não foi uma única execução integral de 33/33.
  A primeira versão desse teste usava equação incompleta (falha de integridade,
  corretamente diferente de ciclo inconclusivo); a fixture foi corrigida.
  Benchmark visual durante suíte: 1.000 nós/2.000 arestas, layout ~15,1 ms e frame
  geométrico ~2,6 ms no Edge desta máquina; não é medição de análise científica.
- Janela Tauri/WebView Windows, mouse real via Computer Use: arrastar temperatura
  para ponto escolhido criou um nó; Ctrl+Z restaurou os 16 nós. F5 retornou **10 regras
  consistentes, zero inconclusivos**, P_wall=1.000 W, P_air=1.200 W no exemplo completo.
  Observado console aguardando motor sem passos de sucesso fictícios.
- Hot reload com servidor local existente em 127.0.0.1:1420 e host debug existente.
  Nenhum instalador, rebuild de host ou compilação WASM necessários neste incremento.
- Base anterior preservada em `build/continuity-baseline-20261024/` (ignorada).
  Alterações locais sem commit/push; arquivo e ferramenta externa Gource preservados.

### Próximo incremento concreto

1. Tradução real pt/en dos comandos e painéis por catálogo/contexto React; restaurar
   seletor de idioma quando de fato traduzir. Não traduzir dados do usuário ou provas
   científicas por substituição DOM. Revisar formatação de números/data.
2. Auditar demais superfícies/estados de tema nos protótipos experimentais e completar
   compactação de textos. Preferências suportadas já são persistidas/aplicadas; não
   reintroduzir timeout/tolerância globais ou promessa de verificação automática.
3. Aposentar explorador redundante, encurtar textos e distinguir ícones. Acrescentar
   mapeamento explícito de entradas ao instanciar fórmulas fora dos exemplos compatíveis.
4. Recuperação/histórico e MCP independente de fornecedor conforme fila. Sem promessa
   de subgrafos científicos, análise de pastas/GitHub ou agentes que ainda não existem.

## Leia primeiro

O [contexto do projeto](CONTEXTO_PROJETO.md) explica objetivo final e decisões.
O [plano](PLANO_IMPLEMENTACAO.md) organiza as entregas em épicos. Este arquivo é a
fonte do estado implementado e deve ser atualizado ao encerrar cada rodada.

## Histórico anterior — preservar contexto, não substituir a auditoria acima

- **Confinamento do ResultsDock no Viewport Central**: O console e terminal foram realocados para dentro de .viewport-center-area, mantendo os trilhos laterais (ferramentas e configurações à esquerda, biblioteca à direita) com altura 100% contínua e imutáveis durante a expansão vertical dos resultados.
- **Estruturação da aba Elementos em coluna**: A biblioteca ocupa o topo e o ResultsDock é renderizado na base da tela, evitando sobreposição ou posicionamento horizontal sob o painel de propriedades.
- **Miniaturas de nós com tamanho fixo e rígido (108px)**: Na gaveta da biblioteca, as miniaturas não esticam mais ao redimensionar a largura do painel, reorganizando as colunas via grid sem distorção.
- **Padronização total de Splitters e alças de redimensionamento**: Alça da gaveta, splitter horizontal do console e splitter do inspetor unificados com 5px de espessura, canaleta em repouso (#f6faff com bordas #dde6ee/#e2ebf1) e destaque ativo no azul técnico exato do painel de Propriedades (#0284c7), sem halos, glows ou larguras duplicadas.
- **Remoção de duplicidade visual no console**: Eliminado o indicador ocioso 'Pronto para executar' do cabeçalho do terminal, exibindo o cabeçalho de progresso somente durante execuções ativas ou com achados.
- **Título da janela limpo e formato nativo .nexo**: Removida a bolinha preta '●' do título da janela; suporte de primeira classe ao formato .nexo com envelope versionado.
- **Botão Executar otimizado**: Removido o rótulo interno '<kbd>F5</kbd>', mantendo o atalho F5 funcional, tooltip e padding lateral mais elegante.
- **Menu Editar e Ajuda expandidos**: Adicionadas operações completas de clipboard (Ctrl+X, Ctrl+C, Ctrl+V, Ctrl+A, Del), modos de ferramenta e modais dedicados de Atalhos, Documentação técnica, Relatório de diagnóstico & feedback (com exportação JSON), Verificação de atualizações e Sobre o Nexo.

- Motor Python com esquema validado e expressão estruturada sem execução de código.
- Regras de integridade, cobertura, dimensões, dependências acíclicas e resíduo absoluto.
- Resultados `passed`, `failed` e `inconclusive`, com evidência, regra e orientação.
- Referência sintética térmica e três variantes com defeitos conhecidos.
- **Viewport interativo em Rust + WebAssembly + WebGL2 na GPU (`packages/viewport-core`)**: layout por dependências, nós, portas estruturadas (`E`, `S`, `HIP`, `REQ`, `VAL`), ligações Bézier porta a porta e indicadores de disponibilidade das entradas, sem cartões DOM/SVG nem Cytoscape.js no viewport.
  - Arraste interativo de ligações porta a porta com renderização em tempo real de curva de Bézier cúbica de rascunho com auréola e ponta de seta na GPU; detecção precisa de hit-testing em portas e fios.
  - Drop em portas compatíveis cria conexões validadas no modelo; clique em conexões e portas conectadas abre menu flutuante permitindo desconexão imediata.
  - Criação de novos nós (`Variável`, `Equação`, `Hipótese`, `Requisito`, `Referência`) pelas ferramentas de criação na lateral, posicionados no centro da visão sem deslocar o layout dos nós existentes.
  - Painel de propriedades (`Inspector`) com edição aplicada de rótulo, quantidade/unidade/fonte, expressão/saída, justificativa e referência/tolerância; dependências tipadas e exclusão de elementos.
  - Edição restrita com validação final pelo motor e operações via `modelMutator.ts` (`connectNodes`, `disconnectEdge`, `createNodeInModel`, `updateNodeInModel`, `deleteNodeFromModel`, `projectGraph`), mantendo operandos ausentes explícitos e invalidando evidências ao alterar o modelo.
- Painéis e barras em React/TypeScript: lista de elementos, investigação de achados, importação/exportação JSON, barra de título com nome exclusivo do programa, menus clássicos de desktop (Arquivo, Editar, Exibir, Ajuda) sem setas ou atalhos visuais poluídos, busca/origem dos dados na ponta direita e nome do projeto centralizado no rodapé.
- **Biblioteca de Elementos (Asset Library)**: A aba "Elementos" no viewport foi transformada em uma biblioteca visual completa:
  - Painel lateral com categorias ("Todos", "Variáveis", "Equações", "Hipóteses", "Requisitos", "Observações") com contagens e ícones específicos.
  - Barra superior de busca em tempo real com botão de limpeza de filtro.
  - Alternador de visualização entre miniaturas (Grid de cartões com badge de tipo, valor/expressão/justificativa, contagem de vínculos e botão de foco) e lista estruturada.
- **Exclusão inteligente com tecla Delete (`Del`)**:
  - Pressionar Delete com elemento selecionado inspeciona topologia.
  - Se for nó isolado (0 conexões), exclusão direta sem diálogo redundante.
  - Se possuir conexões (>0 conexões), exibe modal de confirmação com listagem detalhada de todos os vínculos ("Alimenta" / "Depende de", ID e rótulo) antes de confirmar a exclusão.
- **Menu flutuante do nó compacto**: Reduzido para `Inspecionar` (`Enter`), `Enquadrar` (`F`) e `Excluir` (`Del`), com largura otimizada (`min-width: 130px; max-width: 155px`), eliminando o espaço em branco lateral desnecessário.
- **Proteção do nome do projeto no rodapé**: Removida a edição com clique simples de botão esquerdo. Clique com botão direito exibe menu de contexto com "Renomear projeto" e "Salvar como…".
- **Botão de Configurações na barra lateral de ferramentas**: Substitui os ícones de desfazer/refazer (acessíveis via menu Editar e `Ctrl+Z` / `Ctrl+Shift+Z`), abrindo diálogo de configurações do ambiente.
- **Diálogo de Origem e Formato**: Caminho absoluto em disco, pasta local do projeto, formato nativo (`.nexo.json`) e motor local isolado Python 3.12.
- **Status bar inferior unificada**: Pílula unificada do motor ("Motor pronto" / "Verificando modelo…" / "Erro na análise"), ícone de ajuda contextual e contagem de nós com ícone gráfico de rede.
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

## Evidência local Windows — R2 em 23/10/2026

Clone em `C:\Grafo de Conhecimento Matemático-Causal com Análise de Lacunas`, branch
`main`, base `29bfcee65ddd13f312baba69e85a7ccf2298201c`. Alterações desta retomada
permanecem locais, sem commit/push.

Ambiente: Windows 11 Home Single Language 10.0.26200, x64, 8 GB de RAM;
Node 24.18.0; uv 0.11.28 (aceitou `uv sync --frozen`); Python 3.12.13 gerenciado
pelo uv; Rust 1.99.1 MSVC; Visual Studio 2022 Community com C++ (Build Tools 2019
também presentes); WebView2 155.0.4283.62. Não foi necessário alterar os lockfiles.

Correções:

- O transporte desktop agora enfileira invocações. O carregamento inicial usava
  `Promise.all`, incompatível com o `try_lock` do host, que aceita um único motor.
  Um teste reproduziu a rejeição antes da correção; também se verifica recuperação
  da fila depois de erro. O bloqueio do host permanece restrito.
- O teste JSON-lines agora decodifica explicitamente UTF-8. Antes, a leitura
  `cp1252` do subprocesso falhava no Windows; o protocolo do motor já emitia UTF-8.
- O smoke test aceita `--binary` para testar o motor instalado, remove variáveis
  Python/virtualenv e restringe o PATH do filho ao System32, registrando duração.

| Verificação local | Resultado efetivamente observado |
| --- | --- |
| Dependências | `uv sync --frozen` e `npm ci` concluídos |
| Motor / Ruff | 21 testes aprovados; lint aprovado |
| Adaptador TypeScript / Workspace | 37 testes unitários Vitest aprovados (`modelMutator`, `project`, `engine`) |
| TypeScript / Vite | Build aprovado; aviso de bundle acima de 500 KB permanece |
| Navegador Windows | 29 testes Playwright aprovados (cenários térmicos reais, GPU/WASM WebGL2 benchmark, cabeçalho superior unificado com alternador de abas Grafo/Elementos e botão proeminente Executar F5 eliminando a barra intermediária, gaveta/paleta expansível de biblioteca no trilho lateral direito no estilo Clip Studio Paint / AnimeIAI com busca em tempo real, catálogo de modelos de engenharia, nós existentes no projeto, criação rápida + Novo e suporte a Drag & Drop direto para o canvas, console de execução em modo claro com barra de progresso condicional e logs de alto contraste, aba Histórico de execuções, ferramentas de navegação na lateral esquerda do viewport, seleção múltipla por marquee com painel dedicado e exclusão em lote, construtor de subsistemas hierárquicos com fluxo entre portas e ficha técnica renderizada, persistência de workspace, biblioteca de elementos com personalização de cor por categoria, atalho Del com validação de vínculos, menus desktop, dock do inspetor, busca ampliada no projeto com container focus ring, configurações e context menu; auditoria de 24/10 encontrou tema escuro incompleto e controles sem efeito) |
| PyInstaller Windows | Motor `.exe` gerado, cerca de 27,5 MB; smoke test aprovado |
| Ponte Rust | 3 testes aprovados contra o `.exe`: ida e volta, motor ausente e entrada excessiva |
| Tauri / NSIS | Compilação release e instalador x64 concluídos; instalador cerca de 28,1 MiB |
| Instalação nesta máquina | Instalação por usuário via `/S`, código 0; aplicativo, motor e desinstalador presentes; registro Nexo 0.1.0 |
| Janela nativa | Abertura, grafo com 16 elementos/18 relações e análise completa com zero achados |
| Exportação nativa | Botão exportou `thermal_pilot.json` em Downloads, sem diálogo de escolha de destino |
| Importação / Unicode | Diálogo Windows abriu `build/validação Windows/modelo alterado ç.json`; título com acentos preservado; U=1 recalculou 3.200 W e resíduo de 1.000 W, com um achado |
| Motor indisponível | Cópia isolada da aplicação sem sidecar exibiu “Não foi possível iniciar o motor empacotado”; nenhuma aprovação falsa |
| Ferramentas fora do PATH | Motor instalado e janela instalada funcionaram com PATH restrito ao System32; Python/uv/Rust não eram resolvidos pelo filho |
| Fechamento | Janelas de teste fechadas; consulta posterior não encontrou processos `knowledge-engine` remanescentes |

Instalador da primeira validação (posteriormente substituído pela revisão da interface):
`apps/desktop/src-tauri/target/release/bundle/nsis/Nexo_0.1.0_x64-setup.exe`.
SHA-256: `741b3e060eb418b8a272806c60b21cf92f832eef3f2f75c10e5692d6d7235cb2`.
Uma segunda compilação com o frontend final e reinstalação também concluíram com
código 0. O executável instalado difere do executável em `target/release` apenas
nos três bytes do marcador de tipo de bundle (`NSI` versus `UNK`).

Motor instalado testado com:

```powershell
uv run python scripts/smoke_sidecar.py --binary "$env:LOCALAPPDATA\Nexo\knowledge-engine.exe"
```

Tempos dessa execução: carregar completo 6,99 s, analisar completo 9,69 s,
carregar omissão 12,70 s, analisar omissão 6,04 s. Não constituem benchmark.
Uma tentativa inicial sob carga da primeira compilação atingiu o timeout de 15 s;
os testes de navegador também falharam inicialmente ao esperar o carregamento em
5 s. Após a compilação, o smoke test e os três testes de navegador passaram sem
aumentar limites. A inicialização por processo e extração PyInstaller merecem medição.

O aplicativo instalado foi localizado sob o LocalCache do pacote MSIX do Codex
(`.../OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local/Nexo/`), embora o registro do
instalador informe `%LOCALAPPDATA%\Nexo`. Verificar instalação iniciada fora do
ambiente do Codex e atalhos no próximo teste; não presumir equivalência com máquina limpa.

O [workflow remoto da base](https://github.com/guilhermebo0510/Mathematical-Causal-Knowledge-Graph-with-Gap-Analysis/actions/runs/39978404647)
terminou com `engine-and-interface` e `windows-installer` aprovados. Refere-se ao
commit base, não às alterações locais desta retomada.

Pendências observadas: `npm audit --json` informou 3 vulnerabilidades na cadeia de
desenvolvimento/testes: `@vitest/mocker` (moderada), `tinypool` e `vitest` (críticas).
O npm sugere Vitest 5.0.5, uma atualização major; não foi aplicado
`npm audit fix --force`. Falta avaliar os avisos e validar a atualização separadamente.

## Revisão anterior — interface desktop e viewport (23/10/2026)

Solicitação do usuário: aparência/comportamento de programa, removendo a composição
de site, e melhoria das ferramentas e da resposta do viewport. Esta revisão foi
priorizada antes de continuar as pendências da R2; não inicia persistência/edição.

Mudanças:

- Área de trabalho ocupa a janela, com barra compacta, explorador hierárquico,
  abas de grafo/elementos/verificações, inspetor e barra de estado. Removidos título
  promocional, cartões de métricas e rolagem externa da página. Os painéis têm
  separadores ajustáveis por mouse/teclado e botões de ocultar/mostrar.
- A instância Cytoscape agora dura enquanto o modelo está aberto. Análise e filtro
  alteram classes em lote; não destroem o renderer nem refazem o layout. As abas
  ocultam o canvas sem desmontá-lo. Resize ajusta o canvas sem chamar fit.
- Novo modelo e reorganização explícita distribuem as dependências em camadas
  horizontais. Grupos cíclicos continuam visíveis numa coluna de fallback; é
  apenas layout, não resolução de ciclos nem inferência causal. Se o modelo mudar
  numa aba oculta, o enquadramento é adiado até o canvas voltar a ter tamanho.
- Zoom de 10% a 400%, roda centrada no cursor, botões +/− e porcentagem, escala
  real, enquadrar tudo e enquadrar seleção/vizinhos; modos selecionar/mover.
  Na visão geral, identificadores maiores; acima de 72%, nomes completos.
- Atalhos globais Ctrl+O/Ctrl+S/F5 e atalhos do viewport F/Home, 0, +/− e setas.
  A fila do motor da etapa anterior permanece; nenhum verificador científico mudou.

Validação desta revisão:

- TypeScript, build Vite e 4 testes do adaptador aprovados.
- 5 fluxos Playwright com motor real aprovados: os 3 fluxos científicos/importação
  anteriores e 2 testes de viewport. Após ajustar os atalhos globais, os 2 testes
  de viewport foram executados novamente e passaram, incluindo F5 com foco no body.
- Regressões verificadas: mesmo elemento canvas após análise/aba, zoom preservado,
  inspetor ocultável ampliando a área, separador por teclado, seleção/navegação e
  controles dentro da janela em 1440×900, 1024×768 e 800×650.
- Na execução final, inclusão de elementos/layout do exemplo de 16 nós e 18
  relações levou 20 ms no Edge. É medição pontual do layout, não benchmark de FPS,
  latência do motor ou validação de grafos grandes. O bundle JS continua acima
  de 500 KB; o cold start do Python não foi otimizado nesta revisão.
- A captura em `docs/images/workbench.png` foi substituída pela revisão clara
  seguinte; a validação nativa dessa etapa é descrita abaixo.

Build Tauri/NSIS da interface revisada concluído e instalado por usuário com código
0, em substituição à versão anterior. Artefato:
`apps/desktop/src-tauri/target/release/bundle/nsis/Nexo_0.1.0_x64-setup.exe`.
SHA-256 do instalador dessa etapa: `9536cff62cffb16772f022e7cb353f3ee26aa83d5a76734f4710e06a6b6429fc`.
A janela nativa da cópia instalada abriu com explorador, inspetor e ferramentas.
O layout inicial de 16 nós/18 relações mostrou 71 ms nessa execução nativa;
esse tempo também não mede FPS nem o cold start do motor.
Na janela instalada foram verificados escala real → zoom 125%, análise via F5
concluída com zero achados e manutenção dos 125% após a análise e ao recolher o
inspetor. A versão revisada ficou aberta para avaliação do usuário.

As larguras dos painéis e a câmera permanecem somente na sessão. Ainda não há
minimapa, histórico persistente, editor de modelos ou prova de desempenho para
modelos grandes. Os próximos passos originais da R2 permanecem abaixo.

## Revisão anterior — referência clara, painéis e hot reload (23/10/2026)

O usuário forneceu uma imagem de referência e priorizou a interface antes da
visualização de atividade de arquivos. Preferiu hot reload a compilar/reinstalar
a cada ajuste. Essas instruções também estão registradas em `AGENTS.md`.

Implementado:

- Tema claro, barra lateral de seleção/pan e acesso a arquivos, pesquisa Ctrl+K
  e ferramentas compactas acima do viewport. Não existe indicador falso de
  projeto salvo: a barra mostra sessão local e a persistência continua via exportação.
- Painel Propriedades com recolhimento, fechamento, evidência, contexto e localização
  no grafo. Explorador opcional, fechado inicialmente. Menu **Exibir** recupera
  cada painel e restaura a disposição inicial, sem apagar o modelo ou os resultados.
- Resultados embaixo, recolhíveis, fecháveis e ajustáveis em altura, com filtros.
  A aba Execuções contém até 20 resultados reais da sessão (ID/revisão/horário e
  contagem); não é histórico persistente e não é incluída no JSON exportado.
- Navegador/minimapa independente das propriedades, com fechar/recolher, retângulo
  da câmera e clique/arraste para navegar mantendo o zoom. É um painel acoplado;
  desacoplamento em janelas flutuantes ainda não foi implementado.
- Visibilidade começa fechada. Os checkboxes mostram/ocultam tipos de nós, destacam
  achados com contexto e permitem legenda opcional. Nenhum filtro altera o modelo
  ou o resultado científico.
- Cartões coloridos sobre o renderer Cytoscape (substituídos na revisão seguinte pelo
  motor Rust + WebGL2 descrito abaixo).

## Revisão atual — Viewport, nós, portas, ligações e gráficos internos em Rust + WebAssembly + WebGL2 na GPU (23/10/2026)

Solicitação do usuário: migrar o viewport e tudo o que é renderizado dentro dele
(nós, portas organizadas de entrada/saída/estados, ligações e gráficos internos)
para **Rust na placa de vídeo (GPU)**, mantendo painéis e barras de ferramentas em
React/TypeScript, e registrar nos arquivos de documentação da stack a nota de que
essa mudança foi feita para garantir uma arquitetura mais robusta capaz de lidar
com centenas e milhares de nós sem o lag de DOM/SVG.

Mudanças implementadas:

- **Crate Rust do viewport (`packages/viewport-core`)**: compilado para
  `wasm32-unknown-unknown` via `npm run viewport:build` (`scripts/build_viewport_wasm.mjs`),
  gerando `apps/desktop/public/wasm/viewport_core.wasm` (130.193 bytes, `opt-level = 3`, LTO).
- **Layout por dependências e minimização de cruzamentos em Rust (`ViewportEngine::arrange`)**:
  ordenação topológica em camadas horizontais, duas passagens de redução de cruzamentos
  por baricentro, espaçamento vertical adaptativo e coluna de fallback para ciclos.
- **Portas estruturadas e tipadas por função (`ViewportEngine::rebuild_ports`)**:
  cada nó constrói pinos reais ordenados ao longo do perímetro para evitar sobreposição:
  - `PortKind::Input` (`E`): entradas de dados (`INPUT_TO`) ordenadas verticalmente na borda esquerda;
  - `PortKind::Output` (`S`): saídas (`PRODUCES`) ordenadas na borda direita;
  - `PortKind::Assumption` (`HIP`): hipóteses (`ASSUMPTION_FOR`) ancoradas na borda superior da equação;
  - `PortKind::Requirement` (`REQ`): requisitos de cobertura (`REQUIRES`) ancorados na borda inferior da equação;
  - `PortKind::Validation` (`VAL`): vínculo empírico (`VALIDATED_BY`) entre variável derivada e observação;
  - Estados visuais por porta (`PortState::Normal`, `Verified`, `Flagged`).
- **Roteamento de curvas Bézier cúbicas porta a porta (`ViewportEngine::build_frame`)**:
  ligações saem na direção normal da porta de origem e chegam na normal da porta de destino,
  com halo branco de ponte para cruzamentos legíveis, traço contínuo (dados) ou tracejado
  (hipóteses, requisitos e validação), esfera direcional no ponto médio e seta orientada na porta.
- **Gráficos analíticos embutidos em cada nó (`ViewportEngine::recompute_charts` / `emit_node_chart`)**:
  - `ChartKind::Bar`: barra normalizada com marcas de escala para variáveis (e alerta segmentado quando sem valor);
  - `ChartKind::Stacked`: barra empilhada de contribuição de cada termo de entrada nas equações (e lacuna destacada quando há requisito omitido);
  - `ChartKind::Gauge`: medidor de tolerância e resíduo nas referências/observações (`±50 W` vs desvio medido);
  - `ChartKind::StatusSegments`: indicadores segmentados de atendimento para hipóteses e requisitos.
- **Renderizador WebGL2 + atlas tipográfico mipmapped (`apps/desktop/src/viewportEngine.ts` e `GraphView.tsx`)**:
  2 passes de GPU no `<canvas data-renderer="rust-wasm-webgl2">` (geometria SDF anti-aliased a partir do buffer linear WASM + quads de texto com mipmap trilinear), hit-testing espacial em Rust (`vp_hit_test`) para corpo do nó, botão `⋯` e portas, e eliminação total de Cytoscape.js e de `.node-layer` / `.graph-node` do viewport.
- **Redução do bundle JS de produção**: com a remoção do Cytoscape do runtime do viewport,
  o bundle JS do Vite caiu de `> 500 kB` (que gerava aviso de tamanho) para **290,60 kB**
  (88,93 kB gzip), sem avisos, somado aos **130,19 kB** do `viewport_core.wasm`.
- **Documentação de stack atualizada**: nota explícita da mudança de arquitetura registrada em
  `AGENTS.md`, `README.md`, `docs/CONTEXTO_PROJETO.md`, `docs/PLANO_IMPLEMENTACAO.md`,
  `docs/RELATORIO_INICIAL.md` e `.github/workflows/validation.yml`.

Validação efetiva desta revisão:

| Verificação | Resultado observado |
| --- | --- |
| Testes unitários e stress Rust (`packages/viewport-core`) | `cargo test --locked --manifest-path packages/viewport-core/Cargo.toml`: **3 testes aprovados** em 0,02 s (`organizes_typed_ports_and_embedded_charts_for_thermal_graph`, `hit_tests_node_body_and_more_button_precisely`, `scales_to_thousand_nodes_and_two_thousand_edges_without_lag`) |
| Benchmark Rust/WASM no navegador (1.000 nós e 2.000 ligações) | Medido no Edge via `benchmarkNodes(1000, 2000)` em `tests/ui/viewport.spec.ts`: **`layoutMs = 6,6 ms`** (layout + portas + gráficos) e **`frameMs = 2,0 ms`** (`274.941` floats = `30.549` vértices GPU) |
| Formatação Rust (`rustfmt`) | `cargo fmt --check` aprovado em `packages/viewport-core` e `apps/desktop/src-tauri` |
| Motor Python e lint (`pytest` / `ruff`) | **21 testes aprovados** em 0,88 s; `ruff check` aprovado |
| Testes unitários TypeScript (`vitest`) | **4 testes aprovados** (`apps/desktop/src/engine.test.ts`) |
| TypeScript e build Vite (`npm run build`) | `tsc --noEmit` e `vite build` aprovados sem avisos (`290,60 kB` JS + `130,19 kB` WASM) |
| Testes E2E Playwright no Edge com motor real | **8 testes aprovados** (`investigation.spec.ts`, `reference-workspace.spec.ts`, `viewport.spec.ts`), verificando portas estruturadas (`eq_wall = 6 portas`, `eq_air = 7 portas`), clique no botão `⋯` renderizado no canvas GPU, minimapa, busca `Ctrl+K`, 4 cenários térmicos e preservação de câmera/renderer |
| Janela `desktop:dev` (Tauri + Vite HMR) | Processo `knowledge-desktop` ativo recebeu o novo viewport via hot reload sem necessidade de reinstalar o pacote NSIS |

## Ferramenta externa de acompanhamento — 23/10/2026

Por solicitação do usuário, foi configurada **somente a árvore animada do Gource**
para acompanhar a construção do programa. Não é o Gantt de análise do produto,
não integra o Nexo e não altera o escopo da R2.

- Pasta externa: `C:\Users\leona\Codex-Acompanhamento\Nexo-Gource`.
- Atalho: `Acompanhar Nexo - Gource.lnk` na Área de Trabalho do usuário.
- Gource portátil Windows 0.53 obtido pelo link do site oficial; Python 3.13 e Git
  locais, sem nova dependência nos manifests ou no instalador do produto.
- Observador externo consulta arquivos rastreados e novos não ignorados pelo Git,
  compara tamanho/mtime a cada segundo e transmite UTF-8 diretamente ao stdin.
  Exclui dependências/build, não executa código do projeto e grava logs fora do checkout.
- O inventário inicial aparece como `Base existente`, sem inventar histórico.
  Eventos seguintes usam `Atividade local (autoria nao identificada)`: não é possível
  distinguir automaticamente edições do Codex, do usuário e de outros processos.
- Verificação isolada executada: arquivo novo, edição, renomeação, exclusão, UTF-8,
  filtros Git/build e proteção contra abertura duplicada aprovados. A primeira
  tentativa de abertura duplicada revelou leitura de byte bloqueado no Windows;
  corrigida para consultar tamanho sem ler o byte, e a repetição passou.
- Janela nativa do Gource aberta, processo respondendo e inventário de 51 arquivos
  recebido sem erros no stderr. Fechamento normal da janela encerrou o observador;
  reabertura pelo atalho confirmada. Uma edição real de `docs/ESTADO_ATUAL.md`
  foi recebida como evento `M` no log da sessão reaberta.
  Isso não é validação visual por screenshot nem
  teste do aplicativo Nexo. Próximo uso: abrir o atalho antes de continuar a R2.
- Limites: observa salvamentos, não raciocínio/testes/conclusão; arquivos efêmeros
  entre amostras e edições que preservem tamanho/mtime podem não aparecer. Não
  reconstrói trabalho anterior. Logs guardam caminhos e horários até remoção manual.
  Instruções e diagnóstico em `LEIA-ME.md` na pasta externa.

## Identidade visual Nexo — 23/10/2026

O usuário confirmou o pedido de iconografia/construção visual, sem ampliar o motor
para econometria. Kit em `assets/brand`, com guia HTML e prévia PNG:

- Símbolo N formado por quatro terminais/conexões; assinaturas horizontal e vertical,
  variantes clara/escura/monocromática/branca, SVG editável e PNG transparente.
- Malha de construção, proporções/respiro, paleta e tokens JSON, convenções de
  Segoe UI/Cascadia Code sem redistribuir fontes Windows.
- Ícone SVG, PNG 16–1024 px e ICO com 9 resoluções (16–256 px). Variante simplificada
  para tamanhos pequenos. Arquivos nativos substituídos nos caminhos já configurados.
- Splash claro/escuro em SVG e PNG 1200×720; 32 ferramentas Lucide em SVG com licença.
  O catálogo visual inclui opções futuras e não afirma que essas funções existem.
- Marca aplicada ao cabeçalho, favicon e abertura React durante o carregamento real.
  Sem delay artificial, percentuais fictícios ou nova janela/permissão Tauri.
- Gerador reproduzível: `node scripts/generate_brand_assets.mjs`; usa dependências
  existentes, sem alterar lockfiles. Cópias de runtime em `apps/desktop/public/brand`.

Validação: TypeScript aprovado; nove entradas ICO contendo PNG válido conferidas;
32 SVGs e imagens do guia carregando; splash visível durante transporte real e
removido ao carregar o grafo. Captura atualizada com o motor real, sem erros JS.
Janela Tauri debug conferida com a marca no cabeçalho e no ícone nativo. A troca
dos recursos inicialmente só reiniciava um executável com ícone antigo; `build.rs`
agora declara os dois arquivos como dependências para invalidar recursos embutidos.
A compilação incremental do host concluiu em 21,93 s e o novo ícone foi observado;
React/CSS continuam em hot reload. Nenhum instalador/release foi gerado.

Limites: textos nos SVGs usam a fonte do sistema e continuam editáveis; PNG fixa
a aparência exportada. O splash React aparece após iniciar a WebView, não cobre
a fase anterior do processo nativo. Trabalho local, sem commit/push. R2 segue aberta.

## Revisão semântica e área de trabalho — 23/10/2026

Solicitação: auditar as alterações do viewport/editor feitas em outro chat, reduzir
duplicações da interface, permitir continuar um projeto salvo e formular a evolução
do laboratório. Isso antecipa parte de E1 por prioridade explícita do usuário,
mantendo R2 aberta e o motor científico em Python.

Entregas:

- Arquivo de projeto `.nexo.json`, formato/versionamento explícitos, nome editável,
  novo/abrir/salvar/salvar como. Inclui modelo, posições dos nós, câmera, filtros de
  tipos e painéis; limite 2 MB e validação do modelo pelo motor antes de salvar/abrir.
- Diálogos Windows via rfd; escrita temporária no mesmo diretório, sync e substituição
  via tempfile. Caminhos só vêm de seleção nativa; frontend não recebe API genérica
  para leitura/gravação. Reabrir um projeto validado habilita Ctrl+S no mesmo arquivo.
- Estado de alterações não salvas, proteção ao trocar modelo/projeto e ao fechar
  a janela Windows. Durante operação em andamento, o fechamento pede aguardar;
  isso não implementa o cancelamento do processo científico pendente da R2.
- Barra principal com Arquivo/nome/estado/pesquisa/Exibir/origem/ajuda, sem marca e
  casinha duplicadas. A barra nativa inclui o projeto. Grafo/Elementos fica na mesma
  linha dos comandos; criação dos cinco tipos e desfazer/refazer ficam na lateral.
- Propriedades por tipo, fonte/procedência editável, saída da equação, expressão
  restrita com parênteses, quantidade observada/tolerância, justificativas e relações
  escolhidas explicitamente. Formulário aplica uma transação; 30 edições podem ser
  desfeitas/refeitas na sessão. Histórico de execuções continua separado, em memória.
- Rodapé contextual muda em nós, portas, ligações, pan, pesquisa e propriedades;
  retiradas as instruções fixas do canvas. Navegador indica seleção/contagens,
  permite arrastar a câmera sem salto e navegar pelas setas do teclado.
- Roteiro com tipos semânticos, revisão/evidência, grupos recolhíveis e feixes,
  objetivos/fontes, propostas, eventos transacionais, atores reais e painéis futuros:
  `EVOLUCAO_DO_LABORATORIO.md`. GitHub como origem é distinto de executar na nuvem.

Correções da auditoria:

- Renomear equação antes reconstruía a expressão a partir de referências únicas,
  perdendo repetição, ordem e operações aninhadas. Rótulo agora preserva a AST.
  Conectar preserva a expressão; subtração não descarta uma entrada silenciosamente.
  Desconectar/excluir deixa operandos ausentes explícitos, preservando operações.
- Portas incompatíveis, ciclos introduzidos por ligações, produtores duplicados e
  saída com valor fixo são recusados. Não se adivinha operador pelo nome da equação.
  Valores não finitos, tolerância negativa e unidades fora do contrato são recusados.
  Adicionar uma segunda referência simples exige operação explícita; expressões
  pendentes precisam de reparo ou Desfazer. Edição/conexão respeita também os limites
  de profundidade 12 e 1.000 termos do modelo.
- Novas variáveis não inventam medição de 100 W; novas referências não se ligam
  automaticamente à primeira variável. Rascunhos incompletos continuam não verificados.
- Qualquer edição invalida execução e achado selecionado antigos. Criação/edição
  durante requisição são bloqueadas; resposta também é descartada se mudou o modelo.
- Removidas comparações de magnitudes com unidades diferentes e percentuais físicos
  arbitrários das miniaturas. Indicadores das equações resumem entradas disponíveis,
  não contribuições matemáticas. Hipóteses/requisitos sem execução não dizem “Atendido”.
- Atlas GPU antes limitava textos aos primeiros 64 nós. Agora dimensiona todas as
  células conforme capacidade da GPU. Selecionar/pan não reconstrói a textura de
  texto sem mudança de conteúdo. Culling mantém apenas os textos visíveis no frame.
- Clique numa porta agora encontra sua ligação exata, em vez da primeira ligação
  incidente no nó. Pan não inicia conexão ao passar sobre porta; Esc/cancelamento
  de ponteiro encerram rascunho de ligação. Resize atualiza também o minimapa atual.
- Inicialização compartilha as requisições entre repetições do StrictMode: uma
  chamada de catálogo e uma de modelo. Fast Refresh não substitui um modelo já
  editado pelo exemplo inicial. A janela original manteve seus 17 elementos e a
  referência nova durante a atualização final; nenhuma alteração dela foi descartada.
- Regressões encontradas nos testes da nova UI: menu Arquivo não fechava por Esc,
  o checkmark interferia no nome acessível dos painéis e a linha de comandos sumia
  na aba Elementos. Corrigidas; testes usam funções/roles correspondentes à nova UI.

Validação desta revisão:

- TypeScript aprovado e 37 testes Vitest aprovados (27 mutadores/regressões,
  6 contrato de projeto/gramática e 4 transporte).
- 5 testes Rust do viewport aprovados, incluindo porta → ligação exata e indicadores
  que não inferem percentuais; WASM recompilado pelo comando próprio, sem instalador.
- Teste Rust de arquivos aprovado: criar/substituir em caminho Unicode, rejeitar
  JSON inválido sem truncar original e recusar leitura acima de 2 MB.
- 13 fluxos Playwright com motor real verificados entre a suíte e repetições seletivas:
  quatro cenários científicos/importação/exportação, criação/edição/conexões,
  salvar/reabrir/alterar/recalcular, invalidar evidência, nomes/ajuda/alterações não
  salvas, rótulo do 72º nó, painéis, minimapa, câmera e janelas 1440/1024/800 px.
  Na última suíte ampla passaram 11; os dois restantes eram seletores ambíguos após
  tornar os nomes dos painéis acessíveis. Os 3 testes dessa área passaram após correção.
- Janela Windows de teste separada da janela já aberta: salvar em caminho Unicode,
  reabrir pelo diálogo nativo, salvar novamente no mesmo caminho sem novo diálogo,
  cancelar fechamento com alteração pendente e fechar após salvar conferidos.
  Artefato local ignorado em `build/Nexo-validacao-Windows-20261023.nexo.json`.

Limites: arquivo não inclui execuções, histórico de edição/undo, anexos, fontes
documentais nem recuperação automática. Aplique o formulário antes de salvar.
Agrupamento/feixes, propostas, agentes, eventos, pastas e GitHub são próximos
incrementos, não foram simulados. As capacidades científicas e limites quantitativos
do schema v1 permanecem; o benchmark visual não valida 1.200 fórmulas científicas.
Alterações locais sem commit/push. Não foi gerado nem reinstalado um instalador.

## Limites atuais

- Projeto JSON salva modelo e vista; execuções e undo continuam em memória.
- Não há SQLite, autosave/recuperação, KaTeX ou comparação persistente de revisões.
- Não há análise de repositórios/pastas, código de usuário ou documentos científicos.
- SymPy constrói expressões; não há prova formal nem análise simbólica geral.
- Requisitos de cobertura são cadastrados no modelo; o motor não conhece toda a física.
- Ciclos e múltiplas definições são inconclusivos, sem solver de sistemas simultâneos.
- Host aplica timeout/tamanho/serialização, sem sandbox completa de CPU/memória.
- Projetos têm diálogos nativos de destino no Windows; exportação do modelo legado
  continua usando download da WebView. Navegador de desenvolvimento usa download/importação.
- Instalador sem assinatura, atualização automática e política de licença pendentes.

## Próxima ação concreta — concluir R2

1. Testar o instalador fora do ambiente MSIX do Codex, idealmente numa VM Windows
   limpa sem Python/Node/Rust, incluindo atalhos, importação/exportação e desinstalação.
   O teste com PATH restrito é evidência de independência do sidecar, não de máquina limpa.
2. Implementar e testar cancelamento explícito e encerramento durante uma requisição,
   verificando também processos filhos do PyInstaller; até aqui foi verificado o
   fechamento normal, sem operação em andamento.
3. Acrescentar limites de recursos/saída durante a leitura. O limite atual de saída
   Rust é verificado depois de `wait_with_output`, não limita a alocação incremental.
4. Medir cold start e analisar as vulnerabilidades reportadas pelo npm antes de
   distribuir. Não reduzir controles nem atualizar dependências à força para passar.
5. Revisar as alterações locais e organizar o commit. A antecipação de parte de E1
   foi solicitada pelo usuário; continuar conforme `EVOLUCAO_DO_LABORATORIO.md`,
   mantendo as pendências de distribuição Windows explícitas.

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
