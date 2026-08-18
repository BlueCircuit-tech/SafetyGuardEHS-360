# Indicadores SSMA — especificação e motor de cálculo

Este documento é a fonte única das **fórmulas, pesos e faixas** da plataforma.
A implementação vive em `packages/shared/src/indicadores/` — funções puras, sem
banco e sem framework, usadas tanto pela API (para persistir e notificar) quanto
pelo dashboard (para exibir). Não existe segunda implementação.

> **Estado atual.** As fórmulas estão prontas e testadas (39 testes) e, desde a
> [Etapa 6](etapa-06-observacoes-bbs.md), rodam sobre **observações reais** —
> veja `GET /indicadores/bbs` e a tela `/dashboard-bbs`. Os pilares que ainda não
> têm fonte estão listados em [Dependência de dados](#dependência-de-dados).

---

## 1. Indicador de Comportamento × Condição Insegura (BBS)

O indicador central de maturidade da cultura de segurança: a maioria dos
acidentes nasce da combinação entre comportamento inseguro e condição insegura.

### Tipos de observação

Escolhidos pelo inspetor logo após a leitura do QR Code da área.

| Tipo | Conta no ICS/ICI | Abre plano de ação |
| --- | :-: | :-: |
| 🟢 Comportamento Seguro | ✔ | |
| 🟡 Comportamento Inseguro | ✔ | ✔ |
| 🟠 Condição Insegura | ✔ | ✔ |
| 🔵 Melhoria Identificada | | |
| 🔴 Não Conformidade | | ✔ |

> **Decisão de modelagem.** Melhoria Identificada e Não Conformidade são
> registradas e entram nos demais painéis, mas ficam **fora do denominador** do
> ICS/ICI — o índice de cultura compara comportamento seguro contra desvio de
> comportamento e de condição. É o que reproduz os exemplos do plano
> (425 + 72 + 18 = 515) e o segundo exemplo (615 observações, 89/8/3%).

### Fórmulas

```
Total BBS = Comportamentos Seguros + Comportamentos Inseguros + Condições Inseguras

ICS = (Comportamentos Seguros ÷ Total BBS) × 100
ICI = (Condições Inseguras    ÷ Total BBS) × 100
```

Exemplo do plano: 425 ÷ 515 × 100 = **82,5%**.

### Faixas do ICS

| Índice | Situação |
| --- | --- |
| ≥ 95% | 🟢 Excelente |
| 90 – 94,9% | 🔵 Muito Bom |
| 80 – 89,9% | 🟡 Bom |
| 70 – 79,9% | 🟠 Atenção |
| < 70% | 🔴 Crítico |

Essa mesma escala vale para **todo indicador 0–100** da plataforma
(Índice Global, ICSG, Score de Maturidade).

### ICI

O plano define **meta ≤ 10%**, mas não define faixas para o ICI. Em vez de
inventar uma escala, `avaliarIci()` compara com a meta e devolve o desvio em
pontos percentuais. Se você quiser faixas próprias, me diga os cortes.

### Pareto, mapa de calor e tendência

- **Pareto** (`calcularPareto`) — ordena as causas da maior para a menor, com
  percentual e curva acumulada, marcando as que compõem os primeiros 80%.
- **Mapa de calor** (`calcularMapaCalor`) — cruza desvios por área. A criticidade
  é **relativa ao pior caso do período**, não a um limiar absoluto: o que importa
  é onde concentrar inspeção agora. Cortes calibrados com o exemplo do plano
  (Soldagem 24 → Alta · Logística 18 → Média/Alta · Montagem 13 → Média ·
  Pintura 6 → Baixa), em `CORTES_CRITICIDADE`.
- **Tendência** (`calcularTendencia`) — variação entre o primeiro e o último
  período. Menos desvio é melhor, então queda ≥ 5% marca ↓ MELHORANDO.

---

## 2. Índices compostos

Todos usam o mesmo motor (`calcularIndicePonderado`): cada pilar recebe nota
0–100 e entra com o seu peso.

> **Pilar sem dado é ignorado e os pesos são renormalizados.** Um contrato que
> ainda não passou por auditoria não pode ser penalizado como se tivesse tirado
> zero nela. O resultado informa `pilaresSemDados` para ficar explícito.
>
> **Pilar invertido:** quando "menos é melhor" (Condições Inseguras), a nota
> entra como `100 − valor`.

### Índice Global SSMA

O indicador principal da empresa.

| Pilar | Peso |
| --- | :-: |
| Segurança | 30% |
| Cultura de Segurança (BBS) | 20% |
| Gestão de Riscos | 15% |
| Plano de Ação | 15% |
| Auditorias | 10% |
| Meio Ambiente | 5% |
| Treinamentos | 5% |

> ⚠️ **Conflito no plano — decisão tomada.** O documento traz **duas** tabelas de
> peso para o Índice Global:
>
> | Pilar | Versão 1 | Versão 2 (Plano Diretor) |
> | --- | :-: | :-: |
> | Segurança | 35% | **30%** |
> | Comportamento Seguro / Cultura (BBS) | 20% | **20%** |
> | Condições Inseguras | 10% | — |
> | Gestão de Riscos | — | **15%** |
> | Plano de Ação | 15% | **15%** |
> | Inspeções | 10% | — |
> | Auditorias | — | **10%** |
> | Meio Ambiente | 5% | **5%** |
> | Treinamentos | 5% | **5%** |
>
> Adotei a **versão 2 (Plano Diretor)**, por ser a consolidada e por tratar
> Gestão de Riscos e Auditorias como pilares próprios. Se a intenção era a
> versão 1, é uma linha em `PESOS_INDICE_GLOBAL`.

### Índice de Cultura de Segurança (ICSG)

| Pilar | Peso | Observação |
| --- | :-: | --- |
| Comportamentos Seguros | 40% | recebe o ICS |
| Condições Inseguras | 20% | recebe o ICI, **invertido** (100 − ICI) |
| Plano de Ação Concluído | 20% | % de ações concluídas |
| Inspeções Realizadas | 10% | % da meta de inspeções |
| Treinamentos | 10% | % de aderência |

### Score de Maturidade SSMA

| Pilar | Peso |
| --- | :-: |
| Liderança | 20% |
| Cultura de Segurança | 20% |
| BBS | 20% |
| Plano de Ação | 15% |
| Auditorias | 15% |
| Treinamentos | 10% |

Aplicável a cliente, contrato, empresa contratada ou unidade.

---

## 3. Índice Inteligente de Risco (IIR)

Mede o risco **antes** do acidente, permitindo priorizar inspeções.

```
IIR = Severidade × Probabilidade × Exposição × Frequência
```

Cada fator vai de 1 a 5 (valores fora da faixa são rejeitados). Resultado: 25 a 625.

| Faixa | Nível |
| --- | --- |
| 0 – 20 | 🟢 Baixo |
| 21 – 50 | 🟡 Moderado |
| 51 – 100 | 🟠 Alto |
| > 100 | 🔴 Crítico |

Exemplo do plano: 5 × 4 × 3 × 2 = **120 → Crítico**.

`grauRiscoPeloIir()` deriva o grau da ocorrência (I, II, III) a partir do IIR,
para o inspetor não precisar preencher os dois campos manualmente.

---

## 4. Pirâmide de Bird

| Código | Classificação |
| :-: | --- |
| A | MAJOR |
| B | SERIOUS |
| C | MINOR |
| D | MAJOR NEAR MISS |
| E | NEAR MISS |
| F | FIRST AID |
| — | Atos e Condições Inseguras (base) |

`montarPiramideBird()` também calcula a **razão entre a base e cada nível** —
uma base larga de desvios observados com poucos acidentes no topo indica um
programa de observação funcionando.

---

## 5. Matriz de Comunicação Automática

Define quem é avisado, por qual canal e em que prazo. Evita excesso de mensagens
e garante tratativa imediata dos casos críticos. Tabela única em
`MATRIZ_COMUNICACAO` — não há regra espalhada pelo código.

| Classificação | Grau | Ação | E-mail | WhatsApp | Prazo |
| --- | :-: | --- | :-: | :-: | --- |
| A - MAJOR | I | Paralisação da atividade | ✅ | ✅ | Imediato |
| B - SERIOUS | I | Correção imediata | ✅ | ✅ | 2 horas |
| C - MINOR | II | Abrir plano de ação | ✅ | Opcional | 24 horas |
| D - MAJOR NEAR MISS | I | Investigar ocorrência | ✅ | ✅ | Imediato |
| E - NEAR MISS | II | Registrar e acompanhar | ✅ | Opcional | 48 horas |
| F - FIRST AID | III | Registrar atendimento | ✅ | Não | 24 horas |
| Condição Insegura | I | Isolar área | ✅ | ✅ | Imediato |
| Condição Insegura | II | Programar manutenção | ✅ | Não | 72 horas |
| Comportamento Inseguro | II | Orientação imediata | ✅ | Opcional | Mesmo dia |
| Ocorrência Ambiental | I | Acionar Meio Ambiente | ✅ | ✅ | Imediato |

Combinação não prevista cai na regra mais severa daquele evento; evento
desconhecido cai na `REGRA_PADRAO` (e-mail, 72h, Supervisor + SSMA) — nenhuma
ocorrência fica sem tratativa.

### Roteamento por tipo de desvio

Somado aos destinatários da matriz, sem duplicar (`planoDeComunicacao`).
Comparação tolerante a acento e caixa.

| Condição insegura | Destinatário |
| --- | --- |
| Piso irregular | Manutenção |
| Vazamento de óleo | Meio Ambiente + Manutenção |
| Extintor vencido | SSMA |
| Proteção de máquina removida | Supervisor + Manutenção |
| Iluminação inadequada | Manutenção |
| Falta de sinalização | SSMA |

| Comportamento inseguro | Destinatário |
| --- | --- |
| Não uso de EPI | Supervisor |
| Trabalho sem APR/AST | Supervisor + SSMA |
| Uso de celular em área operacional | Supervisor |
| Trabalho em altura sem cinto | Supervisor + Coordenador + SSMA |
| Operação sem autorização | Coordenação |

### Escalonamento automático

| Atraso sobre o prazo | Nível acionado |
| --- | --- |
| Registro | Supervisor |
| +24 horas | Coordenador |
| +48 horas | Gerente |
| +72 horas | Gerência Corporativa |

`calcularEscalonamento(horasDesdeORegistro, prazoHoras)` devolve o degrau atual,
as horas de atraso e o próximo nível.

---

## Dependência de dados

Os indicadores acima consomem eventos que **ainda não existem** no sistema:

| Indicador | Fonte | Estado |
| --- | --- | :-: |
| ICS, ICI, distribuição BBS | Observações (Etapa 6) | ✅ |
| Pareto | Causa catalogada da observação | ✅ |
| Mapa de calor | Observação × área (Etapa 5) | ✅ |
| Tendência | Série histórica das observações | ✅ |
| Pirâmide de Bird | `classificacaoBird` da observação | ✅ |
| Matriz de comunicação (cálculo) | Tipo + grau de risco + causa | ✅ |
| Matriz de comunicação (registro) | Notificação por plano/escalonamento (Etapa 7) | ✅ |
| Matriz de comunicação (envio) | Integração de e-mail/WhatsApp | ⬜ |
| Plano de Ação (pilar) | `percentualConcluido` de `/planos-acao/resumo` (Etapa 7) | ✅ |
| Inspeções (pilar) | Programação de inspeções (planejado × realizado) | ⬜ |
| Auditorias, Treinamentos, Meio Ambiente | Módulos próprios | ⬜ |

O ICSG e o Índice Global são calculados com o que existe e **renormalizam os
pesos** dos pilares sem fonte — hoje o ICSG sai com 60% dos pesos (comportamentos
seguros e condições inseguras). O campo `pilaresSemDados` da resposta diz
exatamente o que está faltando.

O pilar *Plano de Ação* já está ligado: o ICSG passou de 60% para **80% dos
pesos**. Faltam apenas inspeções programadas e treinamentos, que ainda não têm
módulo próprio.
