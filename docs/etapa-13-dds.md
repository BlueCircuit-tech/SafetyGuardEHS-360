# Etapa 13 — DDS Digital

Diálogo Diário de Segurança com **banco de temas semeado do acervo da
consultoria** (`01 - 100 Temas de DDS Prontos.docx` — o documento contém **90
temas** numerados em 9 categorias; os itens 91–100 não existem no arquivo).

- Registro com cliente, área, tema (do banco ou livre), líder, participantes,
  duração e **lista de presença anexável** (PDF/imagem).
- Indicador de constância: DDS nos últimos 30 dias, participação média e data
  do último registro — sem meta inventada; a meta é decisão de gestão.
- Permissões `observacoes:*`: quem registra observação registra DDS.

| Método | Rota |
| --- | --- |
| `GET` | `/dds/temas` · `/dds` · `/dds/resumo` |
| `POST/PUT/DELETE` | `/dds[/:id]` |
| `POST` | `/dds/:id/lista-presenca` |

Tela: **`/dds`**. Demonstração: 51 registros nos últimos 30 dias (dias úteis,
~85% de constância — 100% seria irreal).
