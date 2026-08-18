# Etapa 19 — Inventário de Riscos (GRO/PGR) e Central de Risco

Fecha o §7 (Gestão de Riscos / PGR) e o §10 (Central de Risco) do plano diretor.

## Inventário (a base do PGR — NR-1)

Para cada **perigo** identificado num contexto (área **ou** função):

- classificação NR-1/NR-9: físico, químico, biológico, ergonômico, acidente;
- fonte geradora, atividade e danos possíveis;
- **avaliação com o mesmo motor de IIR das observações de campo**
  (S × P × E × F) — o mesmo perigo não pode ter dois graus diferentes na mesma
  plataforma;
- controles existentes com o **nível na hierarquia da NR-1** (eliminação →
  substituição → engenharia → administrativo → **EPI, último recurso**);
- medidas propostas com vínculo ao plano de ação;
- situação e data de reavaliação — o PGR é documento vivo.

**IIR e grau são derivados no servidor**, nunca aceitos do formulário, e
persistidos junto dos fatores: o valor precisa ficar estável no documento
assinado mesmo que a régua do motor mude depois. O formulário mostra a prévia
do IIR em tempo real, com a mesma função.

### Regras que o cadastro impõe

- **Perigo sem área nem função é rejeitado** — não dá para dizer onde ele existe.
- **"Controlado" sem controle descrito é rejeitado** — é só uma afirmação.

Ambas valem sobre o **estado final** (registro + alterações), não sobre o
payload: editar apenas a situação não falha por um campo que o registro já tem.

## Central de Risco (§10)

Leitura operacional no topo da tela: riscos por faixa de criticidade
(crítico/alto/moderado/baixo), riscos sem controle concluído, reavaliações
vencidas, planos atrasados e as **ocorrências críticas em aberto** com link
direto para o registro.

| Método | Rota |
| --- | --- |
| `GET` | `/riscos` (filtros: cliente, área, tipo, situação, **faixa**, busca) |
| `GET` | `/riscos/central` |
| `GET/POST/PUT/DELETE` | `/riscos[/:id]` |

Permissões `cadastros:*`. Tela: **`/riscos`**. Sem seed: inventário de risco
fictício viraria PGR falso — a tela nasce vazia de propósito.
