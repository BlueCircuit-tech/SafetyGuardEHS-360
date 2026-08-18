# Etapa 18 — Acidentes, CAT e Investigação

Fecha o §16 do plano diretor (o registro formal que a observação de campo não
cobre) e o §5/§14 (vínculo documento↔ocorrência).

## Acidente e CAT

- Tipos: típico, trajeto, doença ocupacional; parte do corpo, afastamento e
  dias perdidos.
- **CAT (S-2210 do eSocial)**: número e data de emissão. Sem CAT após 1 dia
  útil da data do acidente, o registro aparece como **pendente** — é o prazo
  legal (checklist do próprio acervo da consultoria).
- Vínculos opcionais: colaborador, área, observação de origem e o plano de
  ação da tratativa.

## Investigação

- Situações: aberta → em investigação → concluída.
- **Concluir exige a causa raiz** — verificado: a API rejeita conclusão sem
  ela. A data de conclusão é carimbada automaticamente.
- Fatores contribuintes e investigador registrados; trilha de auditoria em
  toda alteração.

## Documento vinculado à ocorrência

O documento ganhou a abrangência **Ocorrência de campo**: uma APR, AST, PT ou
FISPQ pode ficar presa ao registro que a exigiu. A validação cruzada continua:
ocorrência de outro cliente é rejeitada (`ALVO_DE_OUTRO_CLIENTE`).
Filtro `GET /documentos?observacaoId=` lista os documentos de uma ocorrência.

| Método | Rota |
| --- | --- |
| `GET/POST/PUT/DELETE` | `/acidentes[/:id]` |
| `GET` | `/acidentes/resumo` (12 meses: total, afastamentos, dias perdidos, CATs pendentes, investigações abertas) |

Permissões `planos:*` — registro sensível, fora do alcance do perfil Técnico.
Tela: **`/acidentes`**. Sem seed: acidente fictício criaria estatística falsa;
o estado inicial correto é zero.
