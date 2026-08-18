# Etapa 14 — EPI e Estoque

Formato tirado das planilhas reais do acervo (`Controle de EPI com C.A.xls`,
`Planilha de Estoque de EPI`).

- **Catálogo** com CA e validade do CA (NR-06), fornecedor, vida útil, estoque
  atual e mínimo. Painel acusa **CA vencido** e **item abaixo do mínimo**.
- **Ficha de entrega NR-06**: quem recebeu o que, quando e por quê (primeira
  entrega, substituição, perda, danificado).
- **A entrega dá baixa no estoque na mesma transação** — nunca há ficha sem
  baixa. Estoque insuficiente bloqueia a entrega (`ESTOQUE_INSUFICIENTE`) em
  vez de deixar saldo negativo esconder a falta. O estorno devolve a quantidade.

| Método | Rota |
| --- | --- |
| `GET/POST/PUT` | `/epis[/:id]` · `GET /epis/resumo` |
| `GET/POST/DELETE` | `/epis/entregas[/:id]` (DELETE = estorno) |

Permissões: `cadastros:ler` / `cadastros:escrever`. Tela: **`/epis`** com abas
Estoque/CA e Entregas. Demonstração: 7 EPIs (1 CA vencido, 1 a vencer, 1 abaixo
do mínimo) e 12 entregas.
