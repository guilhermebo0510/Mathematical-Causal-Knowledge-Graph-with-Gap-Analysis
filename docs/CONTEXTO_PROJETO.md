# Contexto do projeto — leitura de entrada para uma nova conversa

## 1. O que estamos construindo

Um laboratório computacional de conhecimento, com interface gráfica desktop, para
representar e investigar as relações entre problemas reais, modelos, equações,
variáveis, hipóteses, evidências e resultados. O objetivo final inclui tanto problemas
matemáticos e científicos quanto falhas, omissões e inconsistências em software,
sistemas e arquivos que o usuário desenvolve.

A unidade central é conhecimento verificável. IA poderá ajudar na extração e na
geração de hipóteses, enquanto regras determinísticas, álgebra, solvers e testes
verificam o que estiver dentro de seus domínios. O grafo preserva contexto e evidência.

O produto deve permitir seguir o caminho de uma pergunta até as equações, os dados
ou o código que sustentam uma resposta e identificar exatamente onde falta suporte.
Uma relação candidata não vira descoberta científica por ter sido gerada por IA,
ajustada a dados ou desenhada no grafo.

## 2. Decisões do usuário que devem ser preservadas

- O motor deve ser extensível a múltiplos domínios; começar por um domínio pequeno
  permite validar o método sem prometer resolver qualquer ciência automaticamente.
- Priorizar um aplicativo instalável, com acesso local a projetos e arquivos.
- A interface gráfica existe desde o início. CLI pode existir para automação, mas
  não deve ser o caminho obrigatório para o usuário final.
- Usar **Tauri com Rust**, **React/TypeScript com Cytoscape.js** e **motor Python**.
  A menção oral a “Stoscat” foi interpretada no contexto como Cytoscape.js.
- Não escrever tudo em Rust. Medir gargalos e otimizar algoritmos específicos
  somente quando isso trouxer vantagem comprovada.
- **Windows é o primeiro sistema-alvo**, confirmado pelo usuário nesta rodada.
- Versão web, colaboração, GitHub e execução na nuvem são caminhos futuros que
  reaproveitam o núcleo; não são pré-requisitos para uso local.
- O usuário decidiu continuar a próxima rodada num chat local, com uma pasta no
  computador e o código sincronizado com o GitHub.
- Nome “Nexo” foi adotado provisoriamente na interface, sem decisão de marca.

## 3. Onde estamos

Existe o primeiro percurso funcional: carregar um exemplo térmico, visualizar um
grafo, selecionar elementos, executar verificações e investigar resultados. É código
executável, não apenas um mockup. A interface chama o motor Python real.

Foram implementados contratos de entrada restritos, exemplos, verificadores,
protocolo versionado, empacotamento Python, ponte Rust e host Tauri. O executável
Python e a ponte foram exercitados no Linux da nuvem. A interface foi testada no
Chromium com o mesmo motor.

**A janela e o instalador Windows ainda não foram testados.** A máquina cloud não
possui os pacotes de desenvolvimento GLib/GTK/WebKit para compilar o host Linux.
Esse bloqueio não demonstra defeito do aplicativo no Windows; também não permite
afirmar que o desktop já funciona. O workflow Windows está preparado para tentar
o build e gerar um artefato sem assinatura, sem publicação de release.

Contagens de testes, comandos verificados e pendências vivem em
[ESTADO_ATUAL.md](ESTADO_ATUAL.md), evitando duplicar um estado que mudará.

## 4. O que o exemplo demonstra

Modelo educacional estacionário, sem ganhos solares ou internos:

`P_total = U · A · ΔT + ρ · cp · vazão · ΔT`

Com os valores sintéticos cadastrados:

- Transmissão: 1.000 W.
- Troca de ar: 1.200 W.
- Total: 2.200 W.

Quatro cenários: completo; transmitância sem valor; área em metros em vez de metros
quadrados; troca de ar omitida. Neste último, o contrato exige uma parcela ausente e
a previsão diverge da referência. O sistema apresenta dois achados diferentes, sem
alegar ter descoberto a causa única de um fenômeno.

O teste de importação também altera uma entrada e recalcula a previsão, para evitar
validar uma interface que apenas reproduza números fixos.

## 5. Arquitetura implementada

```text
Interface React/Cytoscape
  ├─ Desktop: invoke(engine_request) → host Tauri → ponte Rust
  └─ Desenvolvimento na nuvem: adaptador Vite → processo Python
                                                 ↓
                          protocolo JSON UTF-8 por stdin/stdout
                                                 ↓
                          esquema + motor + verificadores Python
```

Ambos os transportes chegam às mesmas operações: listar exemplos, carregar exemplo,
validar/importar modelo e executar verificações. O protocolo tem versão, ID da
requisição e sucesso/erro explícitos. O host aceita um executável fixo empacotado;
o frontend não pode escolher um programa ou uma string de shell para executar.

O host desktop serializa chamadas e aplica timeout de 15 s. Um novo processo Python
é iniciado por requisição; é uma simplificação a medir antes de optar por processo
persistente. O fluxo não tem sandbox completa de CPU/memória e não executa código
de repositórios importados.

Expressões usam referências a variáveis e uma árvore restrita de adição, subtração
e multiplicação. Não usamos `eval`, `exec` ou interpretação de strings de Python.
SymPy constrói a representação simbólica; Pint calcula quantidades e verifica unidades.
Não há ainda demonstração formal ou verificador simbólico geral.

As setas do grafo atual representam fluxo computacional: `INPUT_TO`, `PRODUCES`,
`ASSUMPTION_FOR`, `REQUIRES`, `VALIDATED_BY`. Não são inferência causal automática.
O esquema inicial tem listas de variáveis, equações, hipóteses, requisitos e observações;
a ontologia mais ampla do relatório ainda não foi toda implementada.

## 6. Mapa rápido do código

| Arquivo/diretório                                  | Onde mexer quando…                             |
| -------------------------------------------------- | ---------------------------------------------- |
| `services/engine/knowledge_engine/schema.py`       | Mudar contratos, AST e limites de entrada      |
| `services/engine/knowledge_engine/examples.py`     | Acrescentar casos de referência                |
| `services/engine/knowledge_engine/verification.py` | Alterar regras, cálculo e projeção do grafo    |
| `services/engine/knowledge_engine/protocol.py`     | Alterar operações e transporte JSON            |
| `packages/desktop-bridge/src/lib.rs`               | Mudar comunicação com o processo Python        |
| `apps/desktop/src-tauri/src/main.rs`               | Integrar a janela ao motor                     |
| `apps/desktop/src-tauri/tauri.conf.json`           | Configurar desenvolvimento e empacotamento     |
| `apps/desktop/src/engine.ts`                       | Alterar o adaptador frontend/host              |
| `apps/desktop/src/App.tsx`                         | Mudar o fluxo de investigação                  |
| `apps/desktop/src/GraphView.tsx`                   | Mudar visualização, seleção e layout           |
| `scripts/bundle_engine.py`                         | Ajustar distribuição do Python por sistema     |
| `.github/workflows/validation.yml`                 | Alterar checks e geração de instalador Windows |

## 7. O que ainda não existe

- Instalação Windows validada, assinatura e atualização automática.
- Abertura/análise geral de uma pasta de código; o importador atual recebe modelos JSON.
- SQLite, edição de projeto e histórico persistente de execuções.
- Cancelamento manual da análise e isolamento completo de recursos.
- Extração de PDFs, busca de artigos, LLM, inferência causal ou prova formal.
- Autenticação, colaboração, sincronização e análise de PRs.

O hash da revisão e o ID da execução existem, mas isso não significa que já exista
um histórico persistido. A sessão é em memória; exportar JSON é o caminho de salvar
o modelo no frontend de desenvolvimento. O comportamento de arquivos na WebView
Windows precisa de teste e poderá exigir diálogos nativos.

## 8. Como continuar no chat local

1. Abrir a pasta do clone correto. Confirmar branch, alterações locais e último commit;
   não sobrescrever trabalho do usuário para sincronizar.
2. Ler este arquivo, `docs/ESTADO_ATUAL.md`, `docs/PLANO_IMPLEMENTACAO.md` e `AGENTS.md`.
3. Verificar pré-requisitos Windows do README: Python 3.12, Node 24, uv, Rust/MSVC,
   ferramentas C++/SDK e WebView2.
4. Executar instalação por lockfiles, empacotar o sidecar e fazer o smoke test.
5. Rodar a ponte Rust e abrir Tauri; resolver o primeiro erro concreto de Windows.
6. Validar instalador limpo e percurso gráfico antes de ampliar capacidades.
7. Registrar resultados, limitações e próximos passos no documento de estado.
8. Organizar commits pequenos e enviar ao GitHub conforme o fluxo autorizado pelo usuário.

Os comandos Windows do README são o roteiro para essa validação; não assuma que já
foram executados porque há um script ou workflow pronto. PyInstaller não é
cross-compiler: o binário Linux da nuvem não serve como motor Windows.

## 9. Para onde vamos

Primeiro fechar o percurso Windows. Depois persistência/edição, um analisador de
software delimitado com arquivos locais e somente então ampliação de domínios,
fontes e descoberta assistida. Esses passos estão em épicos no plano. A visão final
continua abrangente, mas cada capacidade precisa de um caso verificável e limites
explícitos.

Uma medida consistente de avanço é: “qual pergunta o usuário consegue investigar
agora, com qual evidência e com que confiabilidade?”. Quantidade de nós, agentes
ou sugestões de IA, isoladamente, não responde a isso.
