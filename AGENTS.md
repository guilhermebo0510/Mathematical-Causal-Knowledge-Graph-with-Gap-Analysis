# Continuidade do projeto

Antes de implementar, leia `docs/CONTEXTO_PROJETO.md` e `docs/ESTADO_ATUAL.md`, depois o item ativo de
`docs/PLANO_IMPLEMENTACAO.md`. Use `docs/RELATORIO_INICIAL.md` como referência de
arquitetura; o estado atual distingue o que existe do que foi apenas proposto.

- O produto prioritário é desktop para Windows: Tauri/Rust no host nativo,
  **viewport, nós, portas, ligações e gráficos internos construídos em Rust
  (compilado para WebAssembly + WebGL2 na GPU)**, painéis/barras em React/TypeScript
  e motor científico em Python. A interface existe desde a primeira rodada.
- Nota de evolução de stack: o viewport deixou de usar Cytoscape.js e cartões HTML/DOM/SVG
  para adotar uma arquitetura mais robusta em Rust + GPU (`packages/viewport-core`),
  evitando gargalos de composição DOM quando o grafo tiver centenas ou milhares de nós
  e organizando conexões reais por portas tipadas de entrada, saída e estado.
- O núcleo não depende de CLI, FastAPI, serviços externos ou uma conta de IA.
- No motor científico (Python), otimize algoritmos adicionais em Rust apenas após
  medir o componente responsável pelo gargalo.
- Não confunda consistência dimensional, resultado de teste, prova formal e evidência empírica.
  Erro, timeout e caso não suportado devem permanecer explícitos, nunca virar aprovação.
- Preserve fontes, domínio, hipóteses, tolerâncias e revisão do modelo nos resultados.
- Os exemplos são sintéticos. Não descreva lacunas plantadas como descobertas científicas.
- Não execute código dos projetos importados automaticamente. A importação atual aceita
  apenas modelos JSON restritos; análise geral de repositórios ainda não existe.
- Ao encerrar uma rodada, atualize `docs/ESTADO_ATUAL.md`: mudanças, testes efetivamente
  executados, bloqueios, limitações e próximo passo concreto. Atualize o plano se necessário.
- Diferencie os testes de navegador na nuvem da validação de uma janela/instalador Windows.
- Use o checkout existente. Cada tarefa cloud já é isolada; não crie worktree sem pedido explícito.
- Na iteração de interface, use `npm run desktop:dev` e hot reload. Se alterar o crate
  Rust do viewport (`packages/viewport-core`), execute `npm run viewport:build` para
  atualizar o `.wasm` servido ao Vite/Tauri sem precisar reinstalar o aplicativo.
  Reserve instaladores para validação de empacotamento, entregas ou pedido do usuário.

Comandos e dependências estão no README e no documento de estado. Não presuma que
processos da rodada anterior continuem vivos.
