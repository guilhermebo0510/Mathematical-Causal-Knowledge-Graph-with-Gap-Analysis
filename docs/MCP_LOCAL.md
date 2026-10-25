# MCP local — sessão de autoria isolada

O Nexo possui um adaptador MCP por stdio, com o SDK Python oficial **1.28.1** fixado
no extra opcional `mcp` e no lockfile. O motor científico e a janela não dependem
desse extra. Não há servidor HTTP, conta de IA ou acesso geral a pastas/GitHub.
Cada cliente inicia um processo com um projeto em memória. Há conexão opcional de
propostas à janela Windows, explicitamente ativada no aplicativo, sem aplicação automática.

## Instalar o extra e executar

No checkout:

```powershell
uv sync --frozen --extra mcp
uv run --frozen --extra mcp python -m knowledge_engine.mcp_server
```

O segundo comando é um servidor stdio: recebe mensagens MCP em stdin e responde em
stdout. Não escreva JSONL do conector diretamente nele; o cliente MCP negocia o
protocolo e faz `tools/list`/`tools/call`. Diagnósticos ficam em stderr.

Exemplo genérico para clientes com configuração `mcpServers` (não aplicado
automaticamente a ChatGPT, Claude, Gemini ou Codex):

```json
{
  "mcpServers": {
    "nexo-local": {
      "command": "uv",
      "args": [
        "--directory",
        "C:\\Grafo de Conhecimento Matemático-Causal com Análise de Lacunas",
        "run", "--frozen", "--extra", "mcp", "python", "-m",
        "knowledge_engine.mcp_server"
      ]
    }
  }
}
```

O cliente precisa suportar processo MCP local e encontrar `uv` no PATH. A
compatibilidade testada é com o cliente oficial do mesmo SDK no Windows; não foi
testada a configuração de cada produto comercial ou um cliente remoto da nuvem.
Não configurar um cliente que só aceita URL HTTP como se fosse stdio local.

## Ferramentas e regras

| Ferramenta | Efeito |
| --- | --- |
| `nexo_describe` | Contrato do conector, escopo e limites |
| `nexo_create_project` | Criar um projeto, sem substituir outro nesta sessão |
| `nexo_get_project` | Snapshot, grafo derivado e revisão |
| `nexo_export_project` | Retornar snapshot para o cliente salvar, sem escrever arquivo |
| `nexo_apply_edits` | Lote atômico de elementos/relações/renomeação |
| `nexo_analyze` | Verificador científico real em filho limitado por prazo |
| `nexo_get_evidence` | Modelo e resposta originais de uma execução retida |
| `nexo_export_proposal` | Proposta portátil com base explícita para revisão no desktop |
| `nexo_submit_to_desktop` | Exportar/entregar proposta à fila local de uma conexão Windows explícita |
| `nexo_desktop_status` | Consultar estado da entrega por código temporário/ID, sem ler o projeto |

Schemas publicados por `tools/list` derivam dos contratos existentes. Os argumentos
não contêm `id`, `operation` ou `protocol_version`; esses campos são fixados pelo
adaptador. Toda operação de projeto exige `session_id`, `project_id` e
`expected_revision` do snapshot. Duas edições concorrentes na mesma revisão não
sobrescrevem: uma altera o estado, a outra recebe conflito e deve reler/revisar.

Resultados incluem texto JSON e `structuredContent` com o mesmo envelope.
`isError=true` significa falha de ferramenta/escopo/revisão/entrada/transporte.
Uma análise concluída com `run.outcome=attention` ou `inconclusive` tem
`isError=false`: **a ferramenta concluiu, não aprovou o modelo**. Inspecione sempre
regras, evidências, hipóteses, fontes, tolerâncias, revisão e limitações.

As operações científicas e a semântica de nós/AST/relações são as de
[CONECTOR_LOCAL.md](CONECTOR_LOCAL.md), sem reinterpretar uma ligação como operação.
Não há sampling, execução de código fornecido, inferência causal ou prova formal.

## Concorrência, cancelamento e limites

Chamadas são serializadas. Cada uma trabalha sobre uma cópia candidata, que só
substitui o estado após o processamento e a conferência de cancelamento. Um teste
com operação de transporte artificialmente lenta confirmou descarte da candidata
cancelada. Isso não demonstra cancelamento da árvore de processos nem cancelamento
efetivo na ponte Tauri. O filho científico termina normalmente ou alcança 20 s;
cancelar a chamada não promete interrompê-lo imediatamente.

Uma resposta perdida depois de confirmar uma edição ainda exige reconciliação:
não há journal idempotente persistente. As evidências ficam até 20 registros/8 MB
em memória; encerrar perde a sessão. Nunca são gravadas no histórico nativo por MCP.

Linha MCP limitada a 300 KB antes de decodificar; operação do conector limitada a
256 KB/modelo 240 KB/lote 240 edições. Entrada MCP malformada ou acima do limite
encerra o processo com diagnóstico genérico sem ecoar o documento. Não foi validado
como recuperação de sessão. O filho científico agora tem captura incremental de
stdout até 4 MB e stderr até 64 KB, com interrupção/erro explícito quando excedidos.
Isso não limita memória/CPU do cálculo nem gerencia toda a árvore. Texto e conteúdo
estruturado duplicam parte da resposta no transporte MCP.

## Ensaio reproduzível

```powershell
uv run --extra mcp pytest -q
uv run --extra mcp python scripts/validate_mcp.py
```

O roteiro usa handshake, descoberta e ferramentas do cliente oficial para construir
um circuito sintético com nove nós: I=2 A, R=3 ohm, V=I·R=6 V, P=V·I=12 W.
Controle exige ausência de falhas/inconclusivos; referência 13 W plantada exige uma
falha de resíduo. A evidência antiga continua associada à referência 12 W e à
revisão original. Exporta modelos/evidências/resumo em diretório novo de build,
sem sobrescrever ensaios anteriores. O cliente salva os arquivos; o servidor MCP
não recebe um caminho de escrita.

Os modelos podem ser abertos no aplicativo pelo menu Arquivo e verificados outra
vez. A nova análise precisa reproduzir a revisão e os resultados do MCP. Isso não
equivale a controlar ou acompanhar a janela em tempo real.

## Referências oficiais consultadas

Implementação e cliente conferidos no [SDK Python v1 — servidor de baixo nível](https://py.sdk.modelcontextprotocol.io/v1/low-level-server/),
incluindo stdio, descoberta, `CallToolResult` e conteúdo estruturado; assinaturas e
comportamento também conferidos no pacote 1.28.1 instalado. Não foram usados APIs
privadas ou exemplos de pré-lançamento do SDK v2.

[Propostas portáteis revisáveis](PROPOSTAS.md) agora podem aplicar um lote no projeto
aberto após comparação completa de conteúdo e confirmação, com Desfazer. O transporte
direto local Windows e a fila de revisão agora estão descritos em
[CONEXAO_DESKTOP.md](CONEXAO_DESKTOP.md). Eventos reais de montagem,
persistência da sessão e integração de pastas/GitHub continuam pendentes.
