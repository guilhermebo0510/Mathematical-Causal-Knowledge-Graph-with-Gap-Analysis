# Módulos e grupos — contrato inicial

Arquivo → Módulos permite guardar o modelo atual como módulo, importar/exportar
JSON restrito e instanciar com um prefixo. A biblioteca pertence ao projeto: até10
definições/600 KB. Cada definição contém um modelo científico completo, portas de
entrada/saída e identificação. Não contém código executável ou veredicto salvo.

Na captura, títulos de projeto acima de120 caracteres geram um nome resumido com
reticências, preservando caracteres Unicode completos. O título e os dados do modelo
interno continuam integrais. Definições com o mesmo nome mostram também seu ID no
seletor, para seleção inequívoca. Nome do módulo e botão Renomear definição alteram
somente o rótulo da biblioteca, mantendo ID, modelo interno e instâncias existentes;
nome vazio é recusado. Salvar/exportar preserva o nome; importação de ID repetido
é recusada, sem substituir uma definição existente.

Remover definição libera espaço na biblioteca e conserva instâncias já expandidas,
seus grupos, equações, fontes e histórico científico. O moduleId do grupo continua
como identificação de origem, sem exigir a definição para funcionar. A última
remoção pode ser restaurada enquanto o diálogo estiver aberto; ao reabrir o diálogo,
essa opção transitória é descartada. Restaurar respeita os mesmos limites10/600 KB
e conflitos de ID, sem substituir silenciosamente outra definição. Biblioteca não
faz parte do Desfazer/Refazer do modelo científico. Salve o projeto para persistir.

Entradas são apresentadas em cartões de vínculo com ID/unidade, em duas colunas ou
uma coluna em painel estreito; saídas mostram ID/unidade e a biblioteca indica uso
de capacidade. Superfícies usam os mesmos tokens dos temas claro e grafite.

Entradas são quantidades sem produtor interno; saídas precisam ter exatamente uma
equação produtora. Uma entrada pode copiar seu valor definido no módulo ou ligar-se
explicitamente a uma quantidade existente com unidade textual idêntica. Conversão
implícita de unidades não foi implementada. O usuário continua responsável por
domínio, hipóteses, fontes e adequação do vínculo. Valor ausente permanece ausente.

Instanciar gera IDs com prefixo, preserva operadores/ordem/repetições da AST e
reescreve todas as referências: entradas, produtores, hipóteses, requisitos e
observações. Não troca operações por aproximações. Recusa IDs em conflito e modelo
acima de240 entidades. O motor Python normaliza/valida o candidato antes de aplicar;
isso é validação estrutural de importação, não aprovação científica. F5 verifica o
modelo completo. Instanciação entra no histórico e pode ser desfeita.

A composição também respeita os limites por lista do contrato científico:100
variáveis,50 equações e30 hipóteses/requisitos/observações em cada lista. Recusa
composição acima do limite com mensagem específica, antes de aplicar qualquer nó;
atingir um desses limites pode impedir novas instâncias mesmo abaixo de240 entidades.
O motor continua validando o candidato independentemente dessa verificação da interface.

Entradas compartilhadas continuam pertencendo ao modelo externo: não são copiadas
nem passam a integrar o grupo da instância. Aparecem como vizinhas de fronteira no
contexto interno; editar seu valor afeta todos os consumidores reais. Salvar/reabrir
preserva referências e Desfazer/Refazer da edição, exigindo nova análise. O seletor
oferece somente unidades textualmente iguais; uma composição incompatível também
é recusada na camada de dados, sem alterar o modelo original ou a definição.

Cada instância também cria grupo organizacional. Arquivo → Grupos permite agrupar
uma seleção livre, recolher/expandir, desagrupar, localizar membros e entrar no contexto
do grupo. O contexto mostra membros e vizinhos de fronteira reais; a barra permite
voltar ao modelo completo. As câmeras de cada nível são mantidas durante a navegação,
e o grupo ativo pode ser salvo/reaberto. Análises continuam no modelo completo.
Selecionar uma entrada externa visível mantém o contexto; pesquisar um elemento
fora da projeção retorna ao modelo completo. A busca prioriza IDs exatos para evitar
editar outro elemento que contenha o mesmo texto no rótulo ou na procedência.
Criar elementos pelo editor/catálogo dentro do contexto acrescenta entidades reais ao
grupo; Desfazer/Refazer e salvamento preservam essa associação. Editar uma instância
não modifica automaticamente a definição original da biblioteca.

Grupos atuais são partições, sem sobreposição nem grupos aninhados. Recolher não
altera IDs, equações ou resultados. A projeção remove arestas internas apenas da
vista, reúne ligações externas por origem/destino/tipo e preserva os IDs das arestas
no feixe. Feixes não podem ser desconectados como se fossem uma única relação:
expanda para editar. Escolher um achado ou pesquisar um membro expande seu grupo.

Cartões, ícones de grupo, portas e linhas continuam no Rust/WASM/WebGL2. A projeção
organizacional é preparada em TypeScript e não entra no modelo enviado ao solver.
Posições ocultas ficam no cache limitado da vista e no arquivo do projeto. Grupos e
biblioteca são metadados; o histórico científico e as evidências permanecem separados.
Inserções em lote usam layout Rust com separação dos nós existentes, sem a pilha de
cartões em diagonais de28px. Organizar grafo visível rearranja/enquadra somente a
projeção atual; não muda equações ou resultados. Grupos com achados permanecem no
foco visual de achados, e entradas pelo duplo clique usam o grupo real do nó.

Limites: primeira biblioteca cria módulos a partir do modelo inteiro; não há editor
recursivo de módulos, extração arbitrária de seleção com fechamento automático de
dependências, portas de outros domínios nem prova formal da composição. Hierarquias
recursivas, conexão entre portas compostas e agrupamento automático são evolução
posterior, sem fingir que os protótipos DOM antigos já executam essas capacidades.
