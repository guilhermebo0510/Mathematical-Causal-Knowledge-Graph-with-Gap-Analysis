# Histórico de edições do projeto

O arquivo Nexo v1 aceita o campo opcional `revisionHistory` v1, mantendo leitura dos
arquivos antigos. Guarda pilhas de Desfazer/Refazer e eventos edit/undo/redo com
modelos antes/depois, data local e ID. Não armazena análise aprovada. Datas e autoria
não são autenticadas. Editar → Histórico de edições permite inspecionar diferenças.

Até30 entradas em cada pilha/lista e600 KB no total. Retenção explícita remove eventos
antigos primeiro, depois estados antigos das pilhas, com contador acumulado. Não é
auditoria imutável ou histórico ilimitado. Cada modelo restaurável é importado pelo
motor antes de substituir o documento aberto; importação inválida não troca o projeto.

Salvar o projeto persiste esse histórico. A cópia automática também o preserva;
restaurá-la continua exigindo ação explícita. Novo projeto/JSON simples começa sem
histórico. Reabrir não restaura resultados como se fossem atuais: reexecute F5.

O histórico registra alterações do modelo científico. Biblioteca, agrupamento,
câmera e painéis persistem como metadados do projeto, sem eventos completos de
Desfazer/Refazer para cada ajuste visual. Recolher um grupo não invalida uma análise;
inserir um módulo altera o modelo e invalida o resultado corrente.
