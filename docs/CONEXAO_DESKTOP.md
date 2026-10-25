# Entrega local de propostas à janela Windows

Integração experimental, ativada em **Arquivo → Propostas locais… → Conectar este
projeto**. Usa um named pipe local do Windows; não abre servidor HTTP/TCP, não exige
conta de IA e não dá ao cliente controle automático do grafo. O editor/motor normal
continua independente da integração e do SDK MCP opcional.

## Usar com um cliente MCP local

1. Exporte o modelo atual no aplicativo e crie o projeto isolado MCP com esse JSON.
   Conectar captura a base normalizada atual, mas não a transmite automaticamente
   ao cliente. Guarde o modelo original para comparar a proposta.
2. Conecte no aplicativo e copie o **Código para o cliente MCP** apenas para o seu
   cliente local autorizado. Não publique esse código nem o grave no repositório.
   Ele contém uma credencial temporária; não é identidade autenticada do autor.
3. Edite a sessão MCP normalmente. Chame `nexo_submit_to_desktop` com os campos de
   `nexo_export_proposal` (`session_id`, `project_id`, `expected_revision`, `base_model`,
   `author`, `reason`), mais `connection` (o código) e `delivery_id` (ID único da entrega).
4. Consulte `nexo_desktop_status` com `connection` e `delivery_id`. Os estados são
   `queued`, `reviewing`, `applied`, `rejected`, `conflict`, `failed`, `unconfirmed`, `closed`.
   Receber/entrar na fila não aplica, salva ou analisa. `applied` descreve uma ação
   naquela sessão; não comprova salvamento, estado atual ou validação científica.
5. Na fila do aplicativo, escolha **Revisar entrega**. Cancelar mantém a entrega
   pendente. Rejeitar persiste uma decisão e devolve `rejected`. Aplicar exige a mesma
   revisão explícita do caminho por arquivo e permite Desfazer.
6. Reconecte após editar a base. A conexão original continua associada à base inicial;
   propostas antigas são recusadas na revisão se o conteúdo corrente tiver mudado.
   Abrir outro documento, mesmo com o mesmo ID, encerra a conexão anterior.

Os esquemas exatos dos argumentos são publicados por `tools/list`. O cliente oficial
do SDK1.28.1 foi exercitado no Windows; isso não instala/configura automaticamente
ChatGPT, Claude, Gemini ou outro produto. Um cliente somente de nuvem/URL HTTP não
acessa diretamente o named pipe; precisa de execução MCP local compatível.

## Escopo e proteção do canal

### Retomada local após reinício (25/10)

O host grava `proposal-inbox-v1.json` antes de confirmar uma nova entrega como queued.
Gravação atômica/sincronizada, leitura limitada, formato estrito, até32 registros/8 MB
por perfil. Somente finalizadas antigas podem sair pela retenção; queued/reviewing/
unconfirmed são preservadas. Sem espaço ou com corrupção, recusa sem sobrescrever
o arquivo anterior e sem confirmar recebimento em memória. Credencial/pipe não persistem.

Após desconectar, fechar ou reiniciar, Arquivo → Propostas locais mostra **Entregas
recuperadas** do projeto. Queued pode reabrir a revisão sem reativar conexão; base
completa e identidade do documento continuam verificadas. Nenhuma entrega é aplicada,
analisada, salva no projeto ou reenviada automaticamente.

Reviewing/unconfirmed não são reaplicáveis. Consulte o diário: uma intenção pending
pode ser encerrada explicitamente como unconfirmed, com reconhecimento de que seu
efeito continua desconhecido. Quando vinculada à fila, o recibo passa a closed somente
após o host verificar essa decisão no diário. Não significa applied nem failed.

Se a decisão final já existe, mas a fila ficou reviewing/unconfirmed por falha de
confirmação, **Registro de propostas → Sincronizar recibo** repete somente o recibo.
O host exige a mesma proposta, origem e fase persistida, inclusive após reiniciar.
Não reaplica, salva o projeto, executa análise ou converte decisão desconhecida em sucesso.

A retomada é pela UI local. A autorização anterior expira; consulta remota ainda
exige conexão ativa. Não há retomada remota transparente/deduplicação entre novas
conexões, assinatura, recuperação de tokens ou integração geral de pastas/GitHub.

- Pipe de nome aleatório `nexo-proposals-<UUID>`, credencial temporária separada e
  DACL protegida concedendo acesso ao SID do usuário Windows atual. Clientes remotos
  são recusados pela configuração Windows. Não é proteção contra processos maliciosos
  da mesma conta ou administradores; diferentes autores declarados não são identidades.
- Código não entra no modelo, projeto, recuperação, propostas, evidências ou registro
  de decisões. Não há criação de chave permanente ou serviço global. A aplicação
  recebe somente JSON, nunca um comando, executável ou caminho de arquivo do cliente.
- Prazo nominal15 minutos por conexão. A interface mantém uma presença periódica;
  sem renovação por10 s, a sessão fica inacessível e o listener é encerrado. Há até3 s
  para uma troca em andamento e verificação periódica do listener. Não promete
  revogação instantânea nem recuperação da fila após interrupção.
- Até8 entregas não resolvidas,32 entregas retidas e2 MB serializados por conexão.
  Proposta até600 KB; frame até620 KB. Recusa fila cheia sem remover silenciosamente
  entregas existentes. Terminais também consomem retenção; reconectar cria outra sessão.
  Fila e recibos de transporte são voláteis. Expirar/desconectar/substituir o projeto
  pode perder pendências; o cliente deve conservar suas propostas e recibos.
- O backend MCP mantém seus limites próprios (requisição256 KB e linha300 KB).
  Não confundir o teto maior do pipe com ampliação dos contratos do motor/MCP.

Apenas a janela `main` cria/consulta/resolve/encerra sessões pelo comando
`proposal_session`. O cliente do pipe só envia proposta ou consulta seu estado;
não lê modelos, arquivos, histórico científico ou outros dados da janela pelo canal.

## Comparação, repetição e confirmação

A base é conferida pelo conteúdo completo, sem confiar nos hashes declarados.
Quantidades no contrato são números finitos de ponto flutuante: a grafia JSON
`100`/`100.0` é equivalente, sem epsilon ou coerção de texto para número. Ordem e
repetições dos operandos, unidades, fontes, hipóteses e tolerâncias permanecem
significativas. A janela revalida base, candidato e modelo atual pelo motor antes de aplicar.

Repetir `delivery_id` com o mesmo conteúdo retorna o estado existente, sem criar
outra entrega. Com conteúdo diferente gera erro. Depois do início da aceitação,
a entrega é reservada como `reviewing` antes de alterar o modelo; a interface não
oferece reaplicação dessa entrega. O registro persistente de intenção/decisão continua
separado. Falha final marca aplicação não confirmada e permite repetir somente o
recibo. Desfazer não transforma o recibo histórico em afirmação sobre o modelo atual.

Essas garantias são por conexão ativa; não há deduplicação persistente entre reinícios
ou novas conexões. Perder resposta significa consultar/repetir **o mesmo ID**, não
inventar um ID novo e supor que a primeira tentativa não chegou. O pipeline não
declara aprovação científica de uma entrega aplicada. Reexecute para obter evidência.

## Auxiliar Python e limites

`desktop_transport.py` valida estritamente o código e só constrói o namespace literal
`\\.\pipe\nexo-proposals-<UUID>`. Não aceita UNC remoto, outro dispositivo, arquivo,
shell ou pickle. Um auxiliar fixo Python com `-I` faz IO bloqueante, com resposta
limitada e JSON independente da codificação da console Windows. O processo chamador
usa `subprocess.run(timeout=8)`: após timeout mata/aguarda o auxiliar. A criação do
processo pode acrescentar tempo antes da observação desse timeout. Isso evita deixar
uma thread de IO indefinidamente bloqueada. Não é orçamento de CPU/memória do solver.

O auxiliar requer Python local Windows; não está embutido no sidecar PyInstaller.
Análises do MCP continuam no worker isolado já existente, sem herdar automaticamente
os orçamentos de recursos da ponte nativa. Código de projetos não é executado.

## Evidência e próximos passos

Roteiro local de ensaio, com código de conexão em arquivo temporário privado:

```powershell
uv run --extra mcp python scripts/validate_desktop_delivery.py `
  --connection-file build/conexao-temporaria.private.json `
  --output-dir build/ensaio-local-novo --delivery-id ensaio-001 --wait
```

O roteiro usa exclusivamente o modelo térmico sintético completo, referência2.200 W,
e referência2.300 W plantada. Verifica handshake SDK, entrega, repetição, mudança de
conteúdo/base recusadas e consulta da decisão real. O arquivo da credencial deve
ficar fora do Git e ser removido após desconectar; os relatórios não incluem o código.

O recibo de decisões revisadas inclui `decision_id`. O host só confirma reviewing,
applied ou rejected após encontrar a decisão persistida correspondente: sessão,
entrega, proposta completa e fase precisam coincidir. Reviewing exige intenção pending;
applied/rejected exigem o estado final gravado. Falha/corrupção nunca vira confirmação.
Unconfirmed conserva somente um vínculo anteriormente verificado, sem afirmar aplicação.

O registro v2 guarda `delivery: {sessionId, id}`, sem código/token de conexão.
Lê o v1 e grava a próxima mudança em `proposal-journal-v2.json`, preservando o arquivo
v1. Um v2 existente inválido bloqueia gravações; não volta silenciosamente ao v1.
O vínculo pode ser consultado/exportado no registro mesmo após encerrar a sessão,
dentro da retenção de 20 decisões/8 MB. Intenções pending não são removidas pela
retenção; se não houver espaço liberável em decisões finalizadas antigas, a nova
decisão é recusada atomicamente, antes de aplicar. A consulta remota exige conexão ativa.

Pendentes: fila persistente, deduplicação e retomada entre processos,
perfis de conexão fora do Windows e clientes comerciais.
Não há edição automática, eventos gráficos de agentes, integração geral de pastas
ou GitHub. Windows limpo/instalador final continuam etapas distintas.

Referências primárias consultadas:
[Tokio1.54.1 ServerOptions](https://docs.rs/tokio/1.54.1/tokio/net/windows/named_pipe/struct.ServerOptions.html),
[segurança de named pipes Windows](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights),
[descritor SDDL e liberação](https://learn.microsoft.com/en-us/windows/win32/api/sddl/nf-sddl-convertstringsecuritydescriptortosecuritydescriptorw),
[Python3.12 subprocess.run](https://docs.python.org/3.12/library/subprocess.html#subprocess.run).
