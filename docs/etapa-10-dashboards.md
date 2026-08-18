# Etapa 10 — Dashboards executivo, gerencial e operacional

Não há fórmula nova aqui. As três visões **compõem** o que as etapas anteriores
já calculam e mudam o recorte — porque três pessoas diferentes olham o mesmo
dado procurando coisas diferentes:

| Painel | Pergunta que responde | Quem usa |
| --- | --- | --- |
| **Executivo** | Estamos melhorando? Qual é o pior contrato? | Diretoria |
| **Gerencial** | Onde está o problema e qual é a causa? | Gerente / coordenador |
| **Operacional** | O que eu tenho que fazer hoje? | Supervisor / técnico |

---

## Painel executivo

### Índice Global SSMA

Os pesos vêm do plano diretor e somam 100%. Nem todos têm fonte hoje — **o
painel mostra quais faltam e por quê**, em vez de esconder a lacuna dentro do
número:

| Pilar | Peso | Fonte | Situação |
| --- | :-: | --- | :-: |
| Segurança | 30% | Pirâmide de Bird (proxy) | ✅ |
| Cultura de Segurança | 20% | ICSG (Etapa 6) | ✅ |
| Gestão de Riscos | 15% | % de áreas com inspeção em dia | ✅ |
| Plano de Ação | 15% | `percentualConcluido` (Etapa 7) | ✅ |
| Auditorias | 10% | — | ⬜ módulo não implementado |
| Meio Ambiente | 5% | — | ⬜ indicadores não coletados |
| Treinamentos | 5% | — | ⬜ matriz de capacitação não implementada |

Cobertura atual: **80% dos pesos**. Pilar sem dado fica de fora e os pesos
restantes são renormalizados — um contrato sem auditoria não é tratado como se
tivesse tirado zero nela.

#### As duas notas derivadas nesta etapa

**Segurança** = `100 − (% de registros que viraram acidente com lesão)`,
usando as classes A, B, C e F da pirâmide de Bird.

> ⚠️ **É um proxy, e está declarado como tal na resposta da API.** A medida
> clássica é a **Taxa de Frequência (TF)**, que exige homem-hora trabalhada —
> dado que a plataforma ainda não coleta. Enquanto isso, esta é a melhor
> aproximação possível com o que existe; quando a HHT entrar, troca-se a fonte
> sem mexer no resto.

**Gestão de Riscos** = **% de áreas com inspeção em dia**. Cada área declara a
sua frequência mínima no cadastro (Etapa 5); a nota compara a última observação
registrada com esse prazo. É o próprio cadastro cobrando a rotina que ele mesmo
definiu. Área **nunca inspecionada** conta como fora do prazo — é o caso mais
grave, não uma ausência de dado.

### Ranking de contratos

Cada cliente recebe a **mesma composição** do índice global, calculada sobre os
próprios números — é o que permite dizer "o contrato X está pior" com base em
algo comparável, e não em impressão.

### Centros de negócio × meta

Compara o índice de cada centro com a `metaIndiceGlobal` cadastrada na Etapa 4,
mostrando o desvio. Meta sem comparação é decoração.

### Também no painel

Score de Maturidade, Índice de Conformidade Legal (Etapa 9), tendência de
desvios dos últimos 12 meses e o retrato da carteira (clientes, contratadas,
colaboradores, áreas, observações e planos).

---

## Painel gerencial

Mesma base, recortada por **causa, área e responsável**:

- **ICSG** com ICS e ICI, e quanto dos pesos tem dado;
- **Pareto** das causas de comportamento inseguro e de condição insegura — a
  regra 80/20 que diz por onde começar;
- **Mapa de calor** por área, com a criticidade **realizada** (o que a operação
  registrou), ao lado da criticidade que o cadastro previu;
- **Áreas fora do prazo de inspeção**, com a frequência cadastrada e há quantos
  dias estão sem visita;
- **Pirâmide de Bird** com a razão base:topo;
- **Carteira de planos**: total, atrasados, aderência ao prazo, tempo médio de
  fechamento;
- **Desempenho das contratadas**: colaboradores, desvios gerados, planos abertos
  e a nota (percentual de planos concluídos) — o ranking de terceiros que o
  plano diretor pede.

---

## Painel operacional

Sem índice. Só a fila, na ordem em que aperta — e cada card leva à tela que
resolve:

| Card | Vai para |
| --- | --- |
| Planos atrasados | `/planos-acao?atrasados=true` |
| Planos vencendo em 7 dias | `/planos-acao` |
| Escalonamentos pendentes | `/planos-acao` |
| Observações sem tratativa | `/observacoes` |
| Áreas fora do prazo | `/areas` |
| Colaboradores impedidos | `/colaboradores` |
| Renovações em 30 dias | `/conformidade` |

Abaixo dos cards vêm as listas correspondentes: planos com prazo e nível de
escalonamento devido, desvios registrados que ainda não viraram plano, áreas sem
inspeção, colaboradores impedidos e a fila de renovação.

---

## Endpoints

| Método | Rota | Permissão |
| --- | --- | --- |
| `GET` | `/dashboards/executivo` | `indicadores:ler` |
| `GET` | `/dashboards/gerencial` | `indicadores:ler` |
| `GET` | `/dashboards/operacional` | **`planos:ler`** |

O operacional exige apenas `planos:ler`: quem trabalha em campo precisa da fila
do dia, mas não necessariamente das notas consolidadas da diretoria.

Parâmetros comuns: `clienteId`, `centroNegocioId`, `meses` (1–36, padrão 12).

---

## Telas

- **`/dashboard-executivo`** — índices, composição do índice global (com os
  pilares sem fonte listados), carteira, tendência, ranking e centros × meta.
- **`/dashboard-gerencial`** — ICSG, Pareto, mapa de calor, áreas atrasadas,
  pirâmide de Bird e desempenho das contratadas.
- **`/dashboard-operacional`** — cards da fila e as listas de trabalho.

---

## Números atuais (dados de demonstração)

| Indicador | Valor |
| --- | :-: |
| Índice Global SSMA | **94,1** (Muito Bom, 80% dos pesos) |
| Score de Maturidade | 85,2 (55% dos pesos) |
| Conformidade Legal | 78,6 (Atenção) |
| Segurança | 99,3 — 4 acidentes e 3 quase-acidentes em 546 registros |
| Gestão de Riscos | 100 — 8 de 8 áreas com inspeção em dia |
| Fila operacional | 6 planos atrasados · 6 impedidos · 12 renovações em 30 dias |

---

## O que vem depois

- **Homem-hora trabalhada** para calcular TF e TG de verdade e aposentar o proxy
  de Segurança.
- **Auditorias, meio ambiente e treinamentos** — os três pilares que faltam para
  o índice global fechar 100%.
- **Exportação em PDF** do painel executivo, com o cabeçalho institucional da
  Etapa 1.1 que já é usado nos alertas.
- **Cache do painel executivo**: o ranking recalcula o índice cliente a cliente,
  o que é aceitável nesta escala mas cresce linearmente com a carteira.
