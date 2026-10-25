# Conector local de autoria — versão inicial

Este documento descreve o transporte JSONL direto. O [adaptador MCP](MCP_LOCAL.md)
é outro ponto de entrada sobre o mesmo contrato, com extra opcional do SDK oficial.

Transporte opcional JSON por linha, em stdin/stdout, independente de fornecedor.
Usa os mesmos contratos Pydantic, projeção de grafo e verificador Python do desktop.
Não é um servidor MCP e **não controla a janela aberta**. Cada processo contém uma
sessão isolada, em memória. Não lê pastas, repositórios, arquivos de projeto ou código
indicado em requisições; não abre rede. O núcleo gráfico continua independente dele.

## Iniciar e descobrir o contrato

No ambiente de desenvolvimento do checkout, após `uv sync --frozen`:

```powershell
uv run python -m knowledge_engine.connector
```

Enviar uma linha UTF-8 e ler uma resposta por requisição:

```json
{"protocol_version":1,"id":"1","operation":"describe"}
```

`data.schema` contém o JSON Schema completo das requisições aceitas, incluindo
campos de cada edição. Campos desconhecidos são recusados. `ok:true` significa que
a operação terminou, não que o modelo seja cientificamente válido. Só `analyze`
produz um resultado científico, com estados, regras, evidências e limitações.

## Operações

| Operação | Entrada específica | Resultado |
| --- | --- | --- |
| `describe` | nenhuma | Contrato, escopo e limites |
| `project.create` | `model` no formato científico v1 | Nova sessão/projeto/revisão/modelo/grafo |
| `project.get` | escopo | Snapshot atual |
| `project.export` | escopo | Mesmo snapshot; cliente pode salvar `data.model` como JSON importável |
| `project.apply` | escopo e `edits` | Edição atômica e novo snapshot |
| `analyze` | escopo | Execução real relativa à revisão, retenção/expulsões |
| `evidence.get` | escopo e `run_id` | Envelope `nexo-run-evidence` com snapshot e execução originais |
| `proposal.export` | escopo, `base_model`, `author`, `reason` | Proposta portátil, sem alterar estado ou escrever arquivo |

Após criar, toda operação sobre o projeto exige `session_id`, `project_id` e
`expected_revision` obtidos na resposta. Uma revisão antiga retorna
`revision_conflict` e `current_revision`; nenhuma edição parcial é aplicada.
O cliente deve reler o estado e revisar/reformular sua mudança antes de repetir.
Sessão/projeto incorretos retornam `scope_mismatch`. Uma sessão existente não pode
ser substituída por outro `project.create`: use outro processo.

`revision` é SHA-256 da mesma representação canônica usada pelo verificador. É uma
identidade do conteúdo, não assinatura, prova ou contador monotônico: voltar ao
mesmo conteúdo pode produzir a mesma revisão.

Exemplo de edição depois de substituir os três valores de escopo:

```json
{"protocol_version":1,"id":"2","operation":"project.apply","session_id":"obtido-na-criacao","project_id":"meu_modelo","expected_revision":"sha256-obtido-na-resposta","edits":[{"op":"project.rename","title":"Novo estudo"}]}
```

## Edições e semântica das ligações

- `node.put`: `kind` (`variable`, `equation`, `assumption`, `requirement`,
  `observation`) e `node` completo conforme contrato científico. Cria ou substitui
  o elemento do mesmo tipo/ID; não renomeia identificadores nem migra referências.
- `node.remove`: `node_id`. Referências ficam explícitas e podem virar defeitos
  apontados pelo verificador. Não elimina fórmulas ou requisitos silenciosamente.
- `project.rename`: `title`.
- `relation.set`: `relation`, `source`, `target`, `enabled` (padrão true).
  `ASSUMPTION_FOR`: hipótese → equação; `REQUIRES`: requisito → equação;
  `VALIDATED_BY`: variável → observação. Tipos/extremos são conferidos.
  Desligar referência singular cria identificador ausente explícito; verificação
  passa a apontar a referência incompleta. Não associa a um nó existente por acaso.

`INPUT_TO` e `PRODUCES` são derivados de `rhs` e `lhs` da equação. Para mudá-los,
envie `node.put` de equação com AST explícita, operação, ordem e parênteses.
Não há operação que adivinhe soma/multiplicação ao conectar uma segunda entrada.
Multiplicidades como `x*x-x` são preservadas na expressão, embora o grafo tenha uma
aresta por dependência distinta. Desenhar uma ligação não demonstra causalidade.

Cada lote é validado sobre uma cópia e aplicado inteiro ou recusado. Referências
pendentes e ciclos podem existir como material de investigação; importação/edição
não os aprovam. O motor relata os defeitos e casos não suportados ao analisar.

## Cliente e ensaio reproduzível

`knowledge_engine.connector_client.ConnectorClient` é um cliente de referência sem
dependências de SDKs de IA. Inicia somente o módulo confiável do produto em processo
separado, isola cwd/PYTHONPATH, confere ID/protocolo e encerra no erro de transporte.
Outras linguagens podem implementar o mesmo JSON por linha.

```powershell
uv run python scripts/validate_connector.py
```

O roteiro cria um diretório novo em `build/connector-<data-hora>` e nunca sobrescreve
experimento existente. Constrói seis nós e as cinco classes de relação, usando
`(12.5*12.5)-12.5 = 143.75` como controle; muda a referência para 143 e exige uma
falha de resíduo. Também testa conflito e consulta da evidência original após
mudar o projeto. Salva modelos JSON, envelopes de evidência e resumo. Esses dados
são sintéticos, não descoberta científica nem prova formal.

O usuário pode abrir `valid.model.json` ou `known-defect.model.json` pelo menu Arquivo
do Nexo. O aplicativo valida/importa o modelo e exige nova análise; o envelope de
evidência não é importado como aprovação. O diretório de saída é escolhido pelo
cliente/roteiro, não concedido como acesso a arquivos dentro do protocolo.

## Limites e próximos passos

Uma requisição ≤256 KB; modelo ≤240 KB; lote ≤240 edições, mantendo os limites
científicos atuais (100 variáveis, 50 equações, 1.000 termos etc.). Execuções em
processo científico filho com prazo de 20 s: timeout encerra esse filho e retorna
erro, nunca aprovação. O cliente aguarda até 25 s pela resposta.
Saída científica é lida em blocos com teto incremental de 4 MB; stderr é drenado
sem retenção do conteúdo, com teto de 64 KB. Exceder qualquer um encerra o filho
direto, confirma seu término e retorna output_limit, sem arquivar execução. Entrada
é escrita em paralelo, evitando bloquear o prazo se o filho não ler stdin.
Isso limita a captura, não o consumo total de memória/CPU do processo científico.
A interrupção abrupta do cliente/processo não foi
validada como cancelamento de toda a árvore de processos.

Até 20 evidências/8 MB ficam em memória por sessão, com expulsão das mais antigas.
Não há persistência de sessão ou gravação no histórico nativo do desktop. Encerrar
o processo perde a sessão; exporte antes. Não há retry idempotente persistente,
transações entre processos ou eventos de progresso/agentes no viewport.

Adaptador MCP e proposta portátil com revisão no desktop implementados e testados.
Próximos aceites: transporte direto de propostas para
a janela ativa e registro persistente de revisão; eventos reais de
construção; persistência da sessão; orçamento de memória/CPU e cancelamento. Integrações
de pastas/GitHub requerem concessões próprias de escopo e continuam pendentes.
