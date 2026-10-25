# Propostas revisáveis no projeto aberto

Atualização de 25/10: entregas agora persistem em uma fila local separada. Intenções
pending podem ser encerradas pelo usuário como **Encerrada sem confirmação**, com
reconhecimento explícito, preservando a proposta e o desconhecimento sobre seu efeito.
Não são promovidas a applied/failed. A decisão passa a ser elegível à retenção;
uma entrega vinculada só é encerrada após conferir o registro persistido. Não reaplica.
Detalhes em [CONEXAO_DESKTOP.md](CONEXAO_DESKTOP.md).

Atualização de 24/10: o registro de decisões usa formato v2, com vínculo opcional
`delivery: {sessionId, id}` para entregas locais. Exportar registro inclui esse vínculo
no envelope `nexo-proposal-decision` v2; propostas portáteis continuam na versão 1.
Registros v1 são lidos sem inventar vínculos, e o arquivo/chave v1 permanece separado.
Não há fallback para v1 quando existe v2 corrompido. Consulte as garantias e limites
do recibo em [CONEXAO_DESKTOP.md](CONEXAO_DESKTOP.md).

Primeiro percurso de integração: o cliente MCP exporta uma proposta portátil, o
usuário abre **Arquivo → Revisar proposta…**, confere diferenças e aceita o lote.
Também há [entrega por canal local Windows](CONEXAO_DESKTOP.md), com conexão
explícita e fila de revisão. Não há acompanhamento ou edição automática da janela.

## Produzir a proposta

Exporte o modelo atual no aplicativo e crie a sessão MCP com esse JSON. Edite pelos
comandos existentes. A ferramenta `nexo_export_proposal` recebe o escopo/revisão da
sessão, `base_model` original, `author` e `reason`. Retorna dados, não escreve arquivo.
O cliente pode salvar a resposta em `.proposal.json` para a revisão.

Envelope `nexo-change-proposal` v1 contém projeto, autor/motivo, modelos base e
candidato e revisões declaradas. É material não assinado, não uma evidência de
aprovação. Não aceita campos de código/caminho, execuções ou veredictos anexados.

## Conferir e aplicar

O desktop usa o contrato de importação do motor já existente para validar e
normalizar base/candidato/modelo atual. Compara **o conteúdo completo** da base com
o atual, sem confiar no hash fornecido pelo remetente. Ordem dos operandos e
repetições permanecem significativas. As revisões do envelope não são apresentadas
como hashes verificados pelo cliente. Reabrir o modelo candidato exige nova análise
para obter a revisão científica calculada pelo motor.

A revisão mostra inclusões, remoções e alterações, incluindo fonte, unidade, valor,
expressão e metadados do projeto. Cada diferença expande Antes/Depois. Cancelar ou
uma falha de importação/comparação não altera modelo, resultado ou arquivo atual.

Aceitar exige confirmação explícita das mudanças e de que campos de formulário
ainda não aplicados serão substituídos. Reaplica a conferência de conteúdo atual
antes do commit e recusa modelo alterado durante a revisão. O lote entra no mesmo
Desfazer/Refazer do editor, invalida análise antiga, mantém a câmera e o caminho do
projeto, marca alterações não salvas e não escreve automaticamente no arquivo.

A aceitação não é análise científica nem concordância com os números propostos.
Execute novamente para obter regras/evidências referentes à nova revisão.

## Limites e evolução

Arquivo até 600 KB; cada modelo continua sujeito aos limites do motor/transporte.
Sessão MCP e sua evidência continuam separadas do histórico nativo até o desktop
executar sua própria análise. O diálogo não é uma fila persistente de propostas
recebidas. Decisões locais são registradas conforme a seção abaixo. Sem
assinatura/autenticação de autoria.

O roteiro `scripts/validate_mcp.py` também gera uma proposta do circuito válido
(referência 12 W) para o defeito conhecido (13 W). O teste de interface cobre
cancelar, aplicar, invalidar análise, executar, desfazer e recusar base adulterada
mesmo com o hash declarado inalterado.

## Registro local de decisões (24/10)

**Arquivo → Registro de propostas…** consulta decisões do modelo aberto, com autor
declarado, motivo, data local, diferenças Antes/Depois e exportação JSON somente
leitura. O projeto é filtrado por seu ID, não por caminho nem identidade autenticada.
Os dados/revisões do remetente permanecem declarados, não assinados ou certificados.
Não é histórico científico nem registro completo de revisões ou de Desfazer.

Aplicar grava primeiro uma intenção `pending`, reconfere a identidade do modelo
aberto e então aplica o lote na sessão. Só depois persiste `applied`; caso o modelo
mude ou a aplicação seja recusada, registra `failed`. Falha antes de gravar a intenção
impede a aplicação. Se a confirmação final falhar, o modelo pode já ter sido alterado:
a interface avisa e oferece repetir **somente o registro**, sem reaplicar o lote.

Interrupção deixa `pending`, exibido como **Aplicação não confirmada**, sem retomada
automática ou promoção a sucesso. O registro de aplicação descreve aquela sessão;
Desfazer, fechamento sem salvar ou troca de projeto podem mudar o modelo depois.
Não comprova que o arquivo do projeto tenha sido salvo. **Rejeitar proposta** grava
`rejected` sem alterar modelo/análise; Cancelar/fechar apenas dispensa o diálogo.
Propostas inválidas ou com conflito na base não recebem decisão aplicada/rejeitada.

Windows: arquivo separado `proposal-journal-v2.json` em `app_local_data_dir`, mutex,
leitura limitada e substituição por temporário sincronizado. Único comando
`proposal_journal`, apenas janela `main`, ações read/start/finish, sem caminho,
execução, exclusão ou importação de histórico fornecidos pelo chamador. Browser de
desenvolvimento: `nexo.proposal-journal.v2` no localStorage. Ambos retêm até20 decisões
e8 MB por perfil, removem decisões finalizadas antigas com contagem visível e recusam
sobrescrever arquivo corrompido. Intenções pending e a decisão da operação atual são
preservadas: sem espaço liberável, a operação inteira falha antes da gravação e da
aplicação. O arquivo anterior fica intacto. Não é arquivo de auditoria imutável, pois
decisões finalizadas continuam sujeitas à retenção. Envelope limitado a600 KB.
Pendências após interrupção permanecem explícitas; ainda falta um fluxo de recuperação
para resolvê-las após reiniciar, sem inventar confirmação. Nenhuma é descartada para
liberar espaço automaticamente.

Transporte direto Windows e fila temporária por sessão implementados em
CONEXAO_DESKTOP.md. Próximo incremento: persistência da fila/recibos e retomada.
O registro de decisões já existe; não há eventos de agentes simulados.
Instalação/validação em Windows limpo foi adiada pelo usuário para a fase final.

## Aceites do transporte direto — implementação experimental Windows

- Conexão iniciada/encerrável pelo aplicativo, com projeto e escopo visíveis; vínculo
  temporário a uma sessão, sem reutilizar autorização para outro projeto aberto.
- Canal local com acesso restrito e contrato documentado após conferir a documentação
  oficial da tecnologia escolhida; sem servidor de rede obrigatório ou leitura
  arbitrária de pastas. Credenciais de sessão não entram nos projetos/exportações.
- Fila limitada em tamanho/quantidade/prazo, sem descartar silenciosamente proposta
  ainda não revisada. Receber não aplica, executa ou salva o projeto.
- Reusar normalização e comparação integral da base ao revisar/aplicar, incluindo
  mudança do modelo durante espera. Projeto/base diferentes geram conflito explícito.
- Remetente recebe estado de entrega/revisão limitado à sua sessão, sem confundir
  aplicação, salvamento e veredicto científico. Repetir entrega não duplica aplicação.
- Usar o registro implementado para decisões reais; testar desconexão, interrupção,
  fila cheia, ID repetido, conflito e escrita negada com cliente MCP real e janela.
