# Evolução do Nexo — critérios, organização e construção visível

Decisões e proposta de implementação de 23/10/2026, a partir da revisão solicitada
pelo usuário. Este documento detalha o roteiro; o estado efetivamente testado fica
em `ESTADO_ATUAL.md`. “Planejado” não significa implementado.

## 1. O produto que estamos construindo

O Nexo deve ajudar o usuário a formular uma pergunta, acompanhar a construção de
um modelo explicativo, revisar as suas dependências e investigar resultados com
evidência. A montagem compreensível da estrutura é parte central do produto.
Não basta terminar uma análise e apresentar uma rede pronta que ninguém consegue ler.

Dois percursos precisam convergir:

1. **Construção:** pergunta → fontes → propostas de conceitos/relações → revisão
   humana → modelo versionado. O usuário acompanha quem propõe cada alteração,
   onde ela entra e por que foi sugerida.
2. **Verificação:** modelo + domínio + regras aplicáveis → execução numa revisão
   fixa → evidência → achado/inconclusão → investigação → nova revisão.

Layout, animação, agrupamento e quantidade de agentes não validam uma afirmação.
Um grafo visualmente conectado pode ter unidades incompatíveis, fontes ausentes
ou uma hipótese errada. O renderer Rust é uma camada de apresentação; o motor
científico continua responsável pelas verificações que suporta.

## 2. Revisão desta entrega

| Área | Entrega concreta |
| --- | --- |
| Projeto | Novo, renomear, abrir, salvar e salvar como; JSON versionado com modelo, posições, câmera, visibilidade e painéis |
| Arquivo Windows | Diálogos nativos; escrita por temporário no mesmo diretório e substituição; caminho escolhido pelo usuário, sem acesso genérico a arquivos pelo frontend |
| Barra principal | Comandos de arquivo, nome/estado do projeto, pesquisa, Exibir, origem/execução e ajuda; retirada a repetição da marca e da casinha |
| Ferramentas | Selecionar, pan, criar os cinco tipos atuais de nó, desfazer/refazer edição |
| Viewport | Grafo/Elementos na mesma linha dos comandos; sem dicas fixas dentro do canvas |
| Propriedades | Campos por tipo, expressão com parênteses, saída, fonte, referência/tolerância, relações explícitas e aplicar alterações |
| Integridade | Rótulo não modifica fórmula; desconectar não elimina operações; portas incompatíveis, ciclos novos e produtores conflitantes são recusados |
| Evidência | Edição invalida resultado e seleção de achado antigos; reabrir exige nova execução |
| Navegador | Identificação da seleção, contagem, arraste da câmera sem salto e navegação por teclado |
| Ajuda | Rodapé muda conforme nó, porta, ligação, pan, pesquisa e edição de propriedades |

Um projeto `.nexo.json` não é ainda um banco histórico. Execuções, propostas e
fontes documentais completas ainda não são persistidas. Salvar a configuração do
grafo não substitui salvamento de uma expressão ainda não aplicada no formulário.
Na visualização de navegador de desenvolvimento, salvar solicita download; no
desktop, confirma a gravação no arquivo escolhido. O instalador antigo não é
atualizado automaticamente pelo hot reload.

## 3. Critérios para nós e relações

### Modelo atual, executável

| Tipo | Definição necessária | Relações e regra |
| --- | --- | --- |
| Quantidade | Identificador, rótulo, unidade, valor conhecido ou pendente, fonte | Pode alimentar uma equação; se calculada, tem um único produtor e nenhum valor de entrada fixado |
| Equação | Expressão estruturada, saída, fonte e hipóteses | Entradas são as referências da expressão; parênteses, ordem da subtração e repetições são preservados |
| Hipótese | Afirmação e justificativa | Vincular à equação declara uma dependência; não prova a hipótese |
| Requisito | Equação exigida e eventual exclusão justificada | Regra de cobertura verifica o contrato declarado; não conhece toda a física de um domínio |
| Referência | Quantidade observada, valor, unidade, tolerância absoluta e fonte | Comparação numérica com conversão de unidades pelo motor; não equivale a prova formal |

Uma conexão de dados modifica o modelo, e não apenas um traço visual. O editor
atual aceita identificadores, adição, subtração, multiplicação e parênteses; constantes
devem ser quantidades explícitas. Divisão, potências, funções, sistemas simultâneos
e edição de domínio não devem aparecer como ações funcionais antes de terem contrato
e verificador. Rascunhos incompletos podem ser salvos; analisar deve expor referências
pendentes como erro/inconclusão, preservando a expressão. Uma segunda entrada não
define automaticamente uma operação quando só existe uma referência simples:
é necessário escrever a expressão. Depois de desconectar um operando, restaure
com Desfazer ou repare a expressão explicitamente; não se adivinha seu substituto.

### Próximo contrato semântico: versão 2 — planejado

Base comum por entidade: ID estável, revisão, tipo, rótulo, domínio, referências de
origem e estado de revisão. Tipos novos devem separar **problema/objetivo, afirmação,
fonte/documento, evidência, arquivo de software e execução** dos cinco tipos atuais.
Não basta criar um novo cartão: cada tipo precisa definir entradas, saídas, atributos,
relações permitidas e quais verificadores podem dizer algo sobre ele.

Estados separados:

- **Revisão:** rascunho, proposto, aceito ou rejeitado, com autor e justificativa.
- **Verificação:** não verificado, passou nos testes aplicados, falhou, inconclusivo
  ou não suportado. Estado depende da revisão e da versão da regra.
- **Execução:** aguardando, executando, concluído, falhou, cancelado ou timeout.

“Aceito por uma pessoa” não vira “verificado pelo motor”. “Hipótese declarada” não
vira “hipótese verdadeira”. Ausência de erro não vira prova de completude.

Para validação genérica, usar um núcleo comum de identidade, referências, cobertura,
procedência e revisão, mais verificadores por domínio. Cada verificador declara
os tipos suportados, pré-condições, parâmetros, limites e evidência produzida.
Relações causais precisam de hipóteses e método próprios; uma seta computacional
ou uma sugestão de IA não deve ser renomeada como descoberta causal.

## 4. Agrupamento e feixes — planejado

Usar hierarquia explícita de **projeto → domínio/módulo → grupo → elementos**.
Uma categoria de organização é diferente de uma equação de agregação. Agrupar
fórmulas por assunto não soma seus valores nem substitui suas saídas científicas.

Ao recolher 52 arquivos SVG ou 50 equações:

- O grupo mostra nome, tipo, quantidade e resumo de estados (ex.: 3 achados).
- Conexões externas equivalentes viram um feixe com contagem e direção.
- O feixe mantém os IDs das relações originais. Ao selecioná-lo, o usuário vê a
  lista de membros e pode expandir somente o trecho necessário.
- Relações de tipos diferentes não são fundidas numa única relação sem legenda.
- Busca, achados e “localizar” abrem os ancestrais necessários e selecionam o
  elemento real, preservando filtros/câmera quando possível.
- A análise recebe sempre os elementos reais, independentemente de recolhimento.

Primeiro incremento: grupos nomeados e recolhíveis, um nível, sem detecção automática.
Depois: hierarquia, feixes por tipo/direção, expansão progressiva e agregação visual
por nível de zoom. Diretórios/extensões servem para a futura visão de arquivos;
domínio, assunto e papel computacional servem para modelos matemáticos.

Aceite: grafo com 200 elementos; recolher/expandir preserva IDs, posições dos demais,
evidências e o mesmo resultado científico. Selecionar um feixe identifica todas as
relações que ele resume. Medir legibilidade e tempo de interação, não só layout.

## 5. Construção em tempo real e agentes — planejado

Criar um fluxo de eventos explícito, independente do desenho e do motor científico.
Um evento contém `event_id`, `project_id`, sequência, horário, ator identificado,
operação, entidades afetadas, revisão base, estado e referência de origem. Alterações
do modelo entram como transações completas; a UI nunca analisa metade de uma equação.

Eventos iniciais: tarefa iniciada, entidade proposta, relação proposta, lote revisado,
alteração aplicada, tarefa finalizada, execução iniciada e resultado registrado.
Somente eventos recebidos de uma integração real podem criar avatares/atividade.
O observador externo Gource não identifica automaticamente qual agente editou um arquivo.

No viewport, atores ficam numa camada visual de atividade, separados dos nós de
conhecimento. Um agente pode apontar para o módulo em que trabalha, destacar sua
última alteração e mostrar uma tarefa curta. Isso indica atividade atribuída pelo
transporte, sem fingir que se está exibindo pensamento interno de uma IA.

Para dez agentes:

1. Cada um recebe escopo e revisão base; propõe um lote com fontes/justificativa.
2. O controlador valida contrato, IDs, permissões e conflitos antes de aplicar.
3. Alterações concorrentes no mesmo elemento exigem resolução explícita; não usar
   “última gravação vence” para substituir uma expressão científica silenciosamente.
4. A UI distingue proposta de alteração aplicada e oferece aceitar/rejeitar lote.
5. Verificação usa um snapshot aceito, com revisão fixa; novas propostas não mudam
   retroativamente um resultado em andamento.

Painel Atividade permite filtrar ator/módulo, selecionar evento e acompanhar o
subgrafo. Pausar animação é diferente de interromper uma tarefa. Replay reproduz
eventos gravados sem executar ferramentas novamente. Falhas, desconexão, eventos
duplicados e eventos fora de ordem precisam ficar visíveis e recuperáveis.

Aceite: dois produtores de teste usando o protocolo real, eventos duplicados e fora
de ordem, conflito de revisão e retomada. Dez atores só entram após medir fila,
renderização e legibilidade. O teste usa atores de teste identificados e não é
apresentado como integração real de dez agentes de IA.

## 6. Painéis e ferramentas a acrescentar

| Painel | Função | Primeiro percurso testável |
| --- | --- | --- |
| Problema e objetivos | Pergunta, quantidade de interesse, domínio e critérios de aceite | Selecionar um objetivo enquadra somente suas dependências |
| Fontes e evidências | Procedência, trecho/arquivo, revisão/hash e uso por entidades | Um resultado permite chegar à fonte de cada entrada |
| Propostas | Revisar lotes sugeridos por agente/importador | Aceitar/rejeitar sem alterar a revisão analisada |
| Atividade | Eventos e construção do grafo, por ator e módulo | Clicar no evento seleciona sua entidade na revisão correta |
| Tarefas e agentes | Estado real, escopo e interrupção | Cancelamento confirmado pelo transporte e pelo processo filho |
| Regras e cobertura | Regras aplicáveis, não suportadas e parâmetros | Explicar por que uma regra foi executada ou não |
| Histórico e comparação | Revisões, execuções e diferenças persistidas | Fechar/reabrir e comparar duas revisões com suas evidências |

Na lateral, ferramentas futuras úteis: conectar explicitamente, agrupar seleção,
anotar, recortar subgrafo por objetivo e selecionar caminho de dependência. Cada
ferramenta só aparece ativa quando tem comportamento implementado, undo e ajuda
contextual. Exibir permanece o lugar único de recuperação dos painéis.

## 7. Origem dos dados e local de execução

São duas escolhas independentes:

| Eixo | Agora | Próximo incremento |
| --- | --- | --- |
| Origem | Exemplo ou arquivo JSON do computador | Pasta local inventariada; depois snapshot GitHub com commit fixo |
| Execução | Motor neste computador | Serviço remoto explicitamente configurado e autorizado |

GitHub hospeda arquivos e revisões; abrir um repositório não configura por si só
um serviço de análise em nuvem. A futura origem GitHub precisa de repositório,
branch/commit, escopo de arquivos, credencial quando necessária e snapshot local.
O analisador declara linguagens/formatos suportados. Nenhum código importado é
executado automaticamente. O serviço remoto exige contrato de dados, status,
cancelamento, autenticação e política de envio próprios.

## 8. Ordem de implementação e critérios de saída

| Ordem | Incremento | Critério de saída |
| --- | --- | --- |
| 0 — esta revisão | Revisão semântica do editor, projeto em arquivo, barras e propriedades | Salvar/reabrir recupera o trabalho; renomear não altera cálculo; erros não reaproveitam evidência antiga |
| 1 | Recuperação e histórico | Prova técnica de SQLite local, seguida de autosave, migração/backup e execuções ligadas a revisões; testes de falha durante gravação |
| 2 | Objetivos, fontes e contrato v2 | Dois modelos de domínios distintos, fontes rastreáveis e regra não suportada explícita; migração v1 sem perda |
| 3 | Grupos e feixes | 200 elementos recolhidos/expandidos mantendo relações e resultados; localização de um achado dentro do grupo |
| 4 | Propostas e eventos | Protocolo versionado, revisão base, transação e revisão humana; replay idempotente com conflitos testados |
| 5 | Atividade e múltiplos atores | Eventos de dois produtores reais do protocolo; painel e camada de atores; depois ensaio com dez |
| 6 | Pasta local e GitHub | Inventário, hash e analisador delimitado, sem execução automática; repositório sempre identificado por commit |
| 7 | Novos verificadores | Introduzir uma operação/domínio por vez, com controles válidos, defeitos conhecidos, erros/timeouts e evidência |

As pendências Windows da R2 continuam em paralelo: instalação limpa, cancelamento
com processos filhos e limites incrementais de saída/recursos. O usuário priorizou
explicitamente esta evolução da área de trabalho antes de fechar todos esses itens.
Isso antecipa parte de E1, sem declarar R2 concluída nem prometer um validador universal.

## 9. Medições que faltam

O benchmark anterior de 1.000 nós mede construção de buffers/layout; não garante
FPS, textos completos, latência de interação, consumo de GPU ou capacidade científica
para 1.200 fórmulas. O esquema atual limita 100 variáveis, 50 equações e 30 entidades
de cada um dos outros tipos. Aumentar limites requer orçamento de recursos e testes.

Medir separadamente: leitura/validação, layout, atlas de texto, buffers/GPU, seleção,
pan/zoom, minimapa aberto, lote de eventos e motor científico. Ensaiar 200/1.000/5.000
elementos visuais, diferentes tamanhos de tela e orçamento de memória. Atlas por
glifos/páginas, culling e nível de detalhe serão avaliados por essas medições; Rust/GPU
não elimina automaticamente custos quadráticos, texturas grandes ou excesso de linhas.

## Referências técnicas da persistência

Diálogos nativos: [rfd 0.15.4 — FileDialog](https://docs.rs/rfd/0.15.4/rfd/struct.FileDialog.html).
Gravação temporária e substituição: [tempfile — NamedTempFile::persist](https://docs.rs/tempfile/latest/tempfile/struct.NamedTempFile.html#method.persist).
Usar temporário no mesmo diretório evita gravar metade do documento no destino;
garantias de persistência após falta de energia continuam dependentes do sistema
de arquivos e precisam de testes de recuperação, não apenas de um caminho feliz.
