# Limites da ponte Rust/Tauri

O host mantém a execução exclusiva e escolhe somente o motor empacotado ao lado do
executável. A WebView não fornece caminho de executável, argumentos, ambiente ou
código. Modelos continuam sendo JSON restrito; permissões não foram ampliadas.

A ponte agora envia stdin, drena stdout/stderr e aguarda o processo em paralelo.
stdout retido até 1.000.000 bytes; stderr contado até 64.000 bytes sem reter ou
ecoar conteúdo. Leitura usa blocos de até 8.192 bytes e lê no máximo um byte além
do teto para identificar excesso. O limite é verificado durante a leitura.

Entrada permanece até 256.000 bytes antes do newline. Prazo de troca permanece
120 s, inclusive se o filho não consumir stdin. Excesso, falha de IO, saída não-zero
ou timeout encerram o filho direto e aguardam seu término, até mais 5 s. Término
não confirmado vira erro próprio, sem aprovação. `kill_on_drop` permanece como
defesa para abandono da future, sem afirmar confirmação de término nesse percurso.

No Windows, cada execução agora tem Job Object próprio com kill-on-close e sem
breakaway. O processo nasce suspenso, é associado ao job e só então retomado; isso
contém os descendentes normais do launcher PyInstaller antes que ele possa criá-los.
Cancelamento/erro termina o job e confere ActiveProcesses=0 (até mais5 s), além do
wait do filho direto. Falha de contenção/inicialização não inicia o cálculo fora do
job. Em outras plataformas permanece controle do filho direto, sem promessa de árvore.

Botão Cancelar/Escape envia cancel_engine_request com ID exclusivo da chamada.
O registro mantém uma operação ativa, até32 pedidos anteriores por10 s e64 IDs
recentes finalizados. Pedido antigo/de outra operação não interrompe a atual.
Pré-cancelamento cobre a corrida de chegada IPC antes de engine_request. A resposta
do comando diz requested/queued/already_finished/not_active, nunca prova de término.

A fila só segue após o retorno terminal de engine_request. Cancelamento confirmado
não cria recibo de análise nem entrada no histórico. Corrida com resposta já concluída
é marcada resposta descartada; falha de transporte/término não confirmado é erro,
sem virar confirmação. Sem confirmação de término, o registro fica em quarentena
e novas execuções são recusadas, mesmo após devolver o erro à interface.
Nenhum comando aceita PID ou caminho de programa da WebView.

## Orçamento de recursos no Windows (24/10)

O mesmo job nativo agora limita a soma de memória virtual comprometida a512 MiB
(536.870.912 bytes), incluindo launcher e descendentes. Uma tentativa de compromisso
acima desse orçamento falha; não é teto de RSS ou de toda a memória física do app,
nem garante encerramento automático por memória. O motor fixo continua responsável
por devolver erro quando uma alocação necessária falha; não executa código importado.

Há também orçamento nominal agregado de30 s de CPU em modo usuário para os processos
do job, configurado em unidades de100 ns. Windows verifica periodicamente e a ação
padrão encerra o job. Não é porcentagem de CPU, limite de tempo de kernel ou garantia
de corte no instante exato. O prazo de parede de120 s continua independente.
A ponte reconfere TotalUserTime após confirmar o encerramento, inclusive em saída
aparentemente bem-sucedida, e recusa resultado quando o orçamento foi atingido.
Cancelamento explícito e término não confirmado mantêm seus estados próprios.

O primeiro teste mostrou que inferir a causa apenas do exit code não era suficiente
nesta máquina. O diagnóstico agora vem da contabilidade real do job, não de um código
presumido. Falha sem diagnóstico verificável continua erro genérico, nunca aprovação.
Valores são internos/fixos e não podem ser elevados pelo JSON ou pela WebView.

Fora do Windows não há esses orçamentos nesta ponte. O worker separado do conector/MCP
também não os recebe automaticamente. Não é sandbox de código, limite global do
computador ou ampliação das operações científicas. Conexões externas de propostas
continuam independentes; orçamento configurável e distribuição final são futuros.

Semântica conferida nas referências Microsoft:
[Extended limits — memória comprometida por job](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_extended_limit_information),
[Basic limits — CPU agregada e verificações periódicas](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_limit_information),
[End of job time — ação de encerramento](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_end_of_job_time_information).

## Validação

```powershell
$env:KNOWLEDGE_ENGINE_BINARY = (Resolve-Path "apps/desktop/src-tauri/binaries/knowledge-engine-x86_64-pc-windows-msvc.exe").Path
cargo test --locked --manifest-path packages/desktop-bridge/Cargo.toml
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Testes da ponte verificam teto exato/byte extra, descarte de stderr, flood de ambas
as saídas com filho direto confirmado encerrado, entrada bloqueada com timeout,
saída não-zero, entrada grande/binário ausente e ida/volta do motor empacotado.
A fixture executável é o próprio binário de testes, invocado explicitamente em
filho isolado; fica marcada ignorada no processo pai para não executar o flood
como teste comum. Não é código de projeto e não representa teste científico.

Há ainda testes de cancelamento antes do spawn, canal encerrado sem ordem, cancelamento
durante execução e Job com descendente ativo. O job precisa chegar a zero processos
sem atingir um processo de teste fora dele. Host testa exclusão/ID antigo/pedido
antes do início/expiração/limites. Frontend distingue confirmação/descarte/falha e
mantém a fila; teste de navegador cobre Escape sem execução registrada.

Fixtures adicionais exercitam negação real de VirtualAlloc, processo fora do job
que ainda consegue a mesma alocação, orçamento compartilhado (pai40 MiB + tentativa
do filho32 MiB em job64 MiB) e dois processos ocupando CPU até encerramento real por
orçamento1 s. A espera de teste de15 s é distinta do orçamento de CPU. O grupo chega
a zero processos; contabilidade confirma o consumo. Não são modelos científicos.

Outro teste usa o motor Python já empacotado sob os orçamentos padrão:240 entidades
nas quantidades máximas do esquema,950 termos de expressão,560 relações projetadas.
Controle independente `(8 * 1) * (8 * 1) = 64`, depois referência65 com uma falha
plantada. Isso verifica esse caso no contrato restrito; não é benchmark geral nem
promessa de suportar milhares de fórmulas ou um domínio científico arbitrário.

O motor real precisa reproduzir o controle térmico 2.200 W/zero falhas e o cenário
sintético de parcela omitida 1.000 W/duas falhas. Testes de janela e instalação são
evidências separadas; Windows limpo ficou para a fase final por decisão do usuário.

Sem alteração de viewport, não é necessário recompilar WASM; compila-se somente
o host afetado para carregá-lo na janela. Nenhum instalador é necessário nesta fase.

Implementação conferida na [documentação oficial do Tokio 1.54.1 — Child](https://docs.rs/tokio/1.54.1/tokio/process/struct.Child.html):
iniciar o encerramento é diferente de aguardar o término. A ponte confirma o filho
direto com wait após erro/prazo. No Windows, [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
e [CREATE_SUSPENDED](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags)
fundamentam a contenção antes de executar e a conferência adicional da árvore.
