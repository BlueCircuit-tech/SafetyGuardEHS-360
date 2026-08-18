# Etapa 15 — Gestão de Consequências

Formato da planilha real da operação (`Controle Gestão Consequencias.xlsx`,
GE Jandira 2016): comportamento de risco → envolvido → líder → medida →
motivação → TST responsável.

- Medidas em escala progressiva: orientação verbal, advertência escrita,
  suspensão, desligamento, reciclagem/treinamento.
- Motivação registrada (cliente, interna, auditoria, reincidência) — a coluna
  que a planilha original tinha como texto livre virou lista padronizada.
- **Reincidência derivada, nunca digitada**: o sistema conta os registros de
  cada colaborador (a planilha original contava à mão).
- Vínculo opcional com a observação de campo que originou o fato.
- **Registro sensível**: permissões `planos:*` (fora do alcance do perfil
  Técnico) e trilha de auditoria com autor e data em toda alteração.

| Método | Rota |
| --- | --- |
| `GET/POST/PUT/DELETE` | `/consequencias[/:id]` |
| `GET` | `/consequencias/resumo` |

Tela: **`/consequencias`**. Sem seed — dado disciplinar de demonstração criaria
"histórico" falso sobre nomes fictícios; a tela nasce vazia de propósito.
