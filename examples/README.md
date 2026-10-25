# Exemplos importáveis

Abra o JSON pelo menu Arquivo do Nexo. O aplicativo importa somente dados do modelo;
não há código a executar nesses arquivos. Execute F5 para obter uma análise corrente.

## Circuito resistivo sintético

`circuito-resistivo-sintetico.json` estipula I=2 A e R=3 ohm, com V=I·R e P=V·I.
O controle produz6 V e12 W, com9 verificações aprovadas e nenhuma falha/inconclusiva.
Fontes e referências são aritméticas/sintéticas, não medições. A hipótese de regime
resistivo constante está declarada no modelo. Não é simulador geral de circuitos.

Para exercitar módulos: guarde o modelo em Arquivo → Módulos, use prefixo m1 e ligue
a entrada I à quantidade I existente; deixe R como cópia. Instancie e execute F5.
Original e instância devem produzir6 V e12 W, com17 verificações aprovadas.

Defeitos intencionais para investigação, um de cada vez:

| Alteração | Resultado esperado após F5 |
| --- | --- |
| I=3 A no modelo compartilhado | Original e instância:9 V e27 W; quatro divergências das referências sintéticas;13 aprovadas/4 falhas/0 inconclusivas |
| Desfazer a alteração de I; mudar somente a unidade de R original para s | Original sem previsão V/P; dimensão incompatível e dependência bloqueada; duas comparações inconclusivas. Instância conserva6 V/12 W;12 aprovadas/2 falhas/2 inconclusivas |

Reabrir um projeto salvo preserva modelo, referências, hipóteses e histórico limitado;
reexecute as verificações. Uma incompatibilidade dimensional, uma divergência de
referência e uma comparação inconclusiva têm significados diferentes. Os resultados
acima são controles conhecidos do ensaio, não descobertas ou provas científicas.
