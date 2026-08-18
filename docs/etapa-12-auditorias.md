# Etapa 12 — Auditorias

Fecha o pilar **AUDITORIAS** do Índice Global (10%) e da Maturidade (15%).
Com ele, o Índice Global usa **95% dos pesos** — falta apenas Meio Ambiente.

- Tipos: ISO 45001, ISO 14001, ISO 50001, interna, de cliente e legal.
- **Score derivado, nunca digitado**: requisitos atendidos ÷ avaliados.
- Auditoria **concluída exige resultado** (avaliados + atendidos) — senão o
  pilar ganharia buraco disfarçado de nota.
- NC maiores/menores e oportunidades de melhoria contadas por auditoria; a
  tratativa é um plano de ação com origem `AUDITORIA` (enum já existente).
- **Nota do pilar** = média dos scores das concluídas nos últimos 12 meses;
  `null` sem nenhuma (o motor renormaliza).

| Método | Rota |
| --- | --- |
| `GET/POST/PUT/DELETE` | `/auditorias[/:id]` |
| `GET` | `/auditorias/resumo` |

Permissões: `cadastros:ler` / `cadastros:escrever`. Tela: **`/auditorias`**
(cards, formulário inline com edição, filtros).

Demonstração: 9 auditorias (6 concluídas → nota 89,6%, 3 planejadas).
