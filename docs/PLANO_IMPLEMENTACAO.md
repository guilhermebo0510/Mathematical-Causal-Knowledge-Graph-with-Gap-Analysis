# Plano de implementação

## Forma de trabalho

Usar um épico por capacidade e rodadas pequenas com critérios de aceitação. Não
adotar sprints com prazo fixo antes de conhecer a capacidade da equipe. Cada rodada
termina com código revisável, evidência de validação e atualização de
[ESTADO_ATUAL.md](ESTADO_ATUAL.md). Conversas futuras começam por esse documento.

## Decisões acordadas

- Desktop Windows como primeiro alvo do instalador.
- Tauri/Rust para integração nativa; React/TypeScript e Cytoscape.js na interface.
- Python para o motor; nenhuma reescrita geral em Rust por antecipação.
- Interface desde o primeiro protótipo; CLI complementar, nuvem e GitHub posteriormente.
- Desenvolvimento pode continuar no Codex cloud. Compilação e testes específicos do
  Windows usam runner Windows e, para experiência real, uma máquina Windows.
- “Nexo” é apenas o nome de trabalho usado na interface, sem decisão de marca.

## Épico E0 — Primeiro percurso verificável

Objetivo: abrir um modelo, explorar relações, executar verificações reais e entender
um achado sem terminal na experiência do usuário final.

### Rodada R1 — Motor, interface e base desktop

Entregas:

- [x] Contratos Pydantic e protocolo JSON versionado.
- [x] Modelo térmico sintético e quatro cenários reproduzíveis.
- [x] Verificação de integridade, cobertura, dimensões, dependências e resíduos.
- [x] Interface com grafo, lista acessível de elementos e caderno de investigação.
- [x] Importação/exportação JSON no fluxo de navegador de desenvolvimento.
- [x] Testes científicos e de ponta a ponta com motor real.
- [x] Executável Python Linux construído e exercitado sem vínculos PYTHON/VIRTUAL_ENV.
- [x] Host Tauri e ponte Rust/Python implementados.
- [x] Fluxo de CI para gerar instalador Windows escrito.
- [ ] Confirmar compilação completa do Tauri no Windows e produzir o primeiro instalador.
- [ ] Instalar e testar a janela nativa e as operações de arquivo no Windows.

R1 não equivale a um produto desktop distribuível validado enquanto os dois últimos
itens não forem concluídos. O documento de estado registra os resultados da ponte
Rust separadamente dos resultados da compilação Tauri.

### Rodada R2 — Fechar o percurso Windows

1. Executar o workflow Windows a partir de código disponibilizado no GitHub, ou os
   mesmos comandos numa máquina Windows com toolchains adequados.
2. Resolver eventuais erros de compilação, empacotamento e WebView2 sem enfraquecer
   permissões para conseguir passar o build.
3. Validar iniciar/fechar o motor, importação e exportação nativas, Unicode em caminhos,
   execução sem Python instalado e erro explícito quando o motor não inicia.
4. Confirmar que o instalador inclui todos os recursos. O primeiro artefato será sem
   assinatura; assinatura e política de atualizações precisam de decisão posterior.
5. Acrescentar cancelamento explícito e limites adicionais; atualmente há timeout,
   limites de entrada e serialização das chamadas desktop, mas não sandbox de memória/CPU.

Critério de aceite: instalação limpa Windows, percurso gráfico completo e registro
dos resultados, incluindo versões e limitações. O workflow escrito, sozinho, não conta.

## Épico E1 — Projetos persistentes e edição

- Banco SQLite por projeto ou catálogo local, a decidir após prova técnica.
- Revisões, execuções e evidências persistentes; backup e recuperação testados.
- Edição visual de quantidades, unidades, fontes e equações na DSL restrita.
- Comparação entre execuções; invalidar resultados ao mudar entradas.
- Melhorar layout e legibilidade dos grafos com medidas de responsividade.

Critério de aceite: fechar/reabrir projeto, recuperar achados e comparar revisão
anterior sem depender da sessão em memória. Não confundir hash do modelo com um
sistema de versionamento persistente já implementado.

## Épico E2 — Análise delimitada de software e arquivos

- Seleção explícita de pasta e inventário sem modificar arquivos.
- Registrar caminhos relativos, hashes e estado de arquivos não enviados ao Git.
- Começar com uma linguagem e analisadores existentes; recomendar Python para a prova.
- Dependências/imports, diagnósticos estáticos e vínculos entre requisitos e código.
- Decidir isolamento e consentimento para qualquer execução de testes ou scripts.

Critério de aceite: defeitos conhecidos encontrados em um pequeno repositório de
referência e controles válidos preservados. Análise estática não prova ausência de bugs.

## Épico E3 — Fontes e descoberta assistida

- Importação revisável de documentos e referências; direitos de uso explícitos.
- Adaptadores opcionais para Z3, Lean, DoWhy e IA, cada qual com avaliação própria.
- Hipóteses rastreáveis, teste separado e resultado inconclusivo de primeira classe.

## Épico E4 — Colaboração e GitHub

- Adaptador FastAPI e armazenamento PostgreSQL para modo online.
- Análise por commit/PR com credenciais e permissões mínimas.
- Autorização por projeto, isolamento, auditoria e controle de custos.
- Reaproveitar motor e componentes visuais; não prometer sincronização automática sem
  especificar conflitos, privacidade e portabilidade dos dados.

## Regra para otimização

Medir separadamente motor, transporte, layout e renderização. Aplicar primeiro
subgrafos, atualizações incrementais e cache por revisão. Avaliar Rust em um algoritmo
específico apenas se o gargalo persistir, incluindo na medida o custo de integração.
