# Etapa 6 — Registro de Observações (BBS)

É o **evento que liga os indicadores**. Até aqui o motor de cálculo existia sem
dados; a partir desta etapa ICS, ICI, distribuição, Pareto, tendência, mapa de
calor e Pirâmide de Bird passam a sair de observações reais — e a matriz de
comunicação ganha o gatilho que faltava.

```
QR Code da área (5) → Observação (6) → indicadores + matriz de comunicação
                                     └→ plano de ação (próxima etapa)
```

---

## Campos do registro

Legenda: **O** = obrigatório · *(pd)* = tem valor padrão

### Bloco 1 — Onde e quando

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `areaId` **ou** `tokenQr` | referência | ✔ | A área pode vir pelo id (formulário) ou pelo token do QR (campo). |
| `dataHora` | data/hora *(pd agora)* | | Não pode ser no futuro. |
| `observador` | texto (3–120) | ✔ | Vira vínculo de usuário na etapa de acessos. |
| `terceiroId` | referência | | Preenchido quando o desvio é de uma contratada. O servidor confere que o terceiro atua **naquele cliente**. |

`clienteId` **não vem do formulário** — é derivado da área pelo servidor. Isso
evita que um payload adulterado registre observação no cliente errado.

### Bloco 2 — Classificação

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `tipo` | enum | ✔ | `COMPORTAMENTO_SEGURO`, `COMPORTAMENTO_INSEGURO`, `CONDICAO_INSEGURA`, `MELHORIA_IDENTIFICADA`, `NAO_CONFORMIDADE`. É a primeira pergunta em campo. |
| `causaId` | referência | ✔ nos desvios | Catalogada — é ela que monta o Pareto. |
| `descricao` | texto (10–1000) | ✔ | |
| `acaoImediata` | texto (≤500) | | O que foi feito na hora. |

O que cada tipo dispara:

| Tipo | Entra no ICS/ICI | Exige causa | Exige foto | Abre plano |
| --- | :-: | :-: | :-: | :-: |
| 🟢 Comportamento Seguro | ✔ | | | |
| 🟡 Comportamento Inseguro | ✔ | ✔ | | ✔ |
| 🟠 Condição Insegura | ✔ | ✔ | ✔ | ✔ |
| 🔵 Melhoria Identificada | | | | |
| 🔴 Não Conformidade | | ✔ | ✔ | ✔ |

### Bloco 3 — Avaliação de risco (desvios)

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `severidade`, `probabilidade`, `exposicao`, `frequencia` | 1–5 | | **Os quatro ou nenhum.** Meia avaliação não produz IIR. |
| `classificacaoBird` | enum | | Só quando a observação virou ocorrência (A–F). `ATOS_E_CONDICOES` não é aceito: é a base da pirâmide, alimentada pela contagem de desvios. |

Derivados no servidor: `iir` (= S × P × E × F) e `grauRisco` (I/II/III). O
formulário mostra o IIR em tempo real enquanto o inspetor escolhe os fatores.

### Bloco 4 — Evidências

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `fotoUrl` | arquivo | ✔ em condição insegura e NC | `POST /observacoes/:id/foto`. |
| `assinaturaUrl` | arquivo | | `POST /observacoes/:id/assinatura`. |
| `latitude` / `longitude` | decimal | | Tudo-ou-nada. O botão de GPS usa a geolocalização do dispositivo. |

### Bloco 5 — Tratativa

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `situacao` | enum *(pd `REGISTRADA`)* | | `REGISTRADA`, `EM_TRATATIVA`, `CONCLUIDA`, `CANCELADA`. |
| `observacoes` | texto (≤1000) | | |

`prazoLimite` é calculado no registro, a partir da matriz de comunicação.

---

## Catálogo de causas

As causas são **catalogadas, não texto livre** — o Pareto só faz sentido se
"Não utilização de EPI" for sempre a mesma coisa. Cada causa pertence a um tipo
de observação e pode sugerir o setor responsável, que entra no roteamento da
comunicação.

O seed traz as 16 causas dos Paretos do plano diretor (EPI, trabalho sem
autorização, falta de sinalização, piso irregular, vazamento de óleo…).

`GET /causas?tipo=…` · `POST /causas`

---

## O que a observação dispara

### Indicadores

`GET /indicadores/bbs` monta o painel inteiro a partir das observações:

- **ICS e ICI** com a classificação na escala do plano;
- **distribuição** dos três tipos que entram no BBS;
- **Pareto** de comportamentos e de condições, com curva acumulada;
- **tendência mensal** dos desvios, com direção (↓/→/↑);
- **mapa de calor** por área, com criticidade relativa ao pior caso;
- **Pirâmide de Bird** com a razão base/topo;
- **ICSG** — calculado com os pilares disponíveis e **renormalizado**: hoje sai
  com 60% dos pesos, porque plano de ação, inspeções e treinamentos ainda não
  têm fonte. O campo `pilaresSemDados` diz quais faltam.

Toda a matemática vem de `packages/shared/src/indicadores/` — a API só busca
números no banco e entrega ao motor. Nenhuma fórmula é reescrita.

Filtros: `clienteId`, `centroNegocioId`, `areaId`, `terceiroId`, `tipo`,
`situacao`, `de`, `ate`, `meses`, `topCausas`. O filtro por centro atravessa
cliente → área → observação.

### Matriz de comunicação

Cada observação resolve, na leitura, o seu plano de comunicação: ação requerida,
canais, prazo, destinatários e degrau de escalonamento. O tipo e o grau de risco
entram na matriz; a causa acrescenta o setor responsável.

Exemplo real (condição insegura com IIR 120):

```json
{
  "iir": 120,
  "faixaIir": { "rotulo": "Critico" },
  "grauRisco": "I",
  "comunicacao": {
    "acao": "Isolar area",
    "email": true,
    "whatsapp": "OBRIGATORIO",
    "prazoRotulo": "Imediato",
    "destinatarios": ["SUPERVISOR", "COORDENADOR", "SSMA", "MANUTENCAO"]
  },
  "prazoLimite": "2026-08-17T20:23:50.306Z"
}
```

> A **Etapa 7** ([`etapa-07-planos-acao.md`](etapa-07-planos-acao.md)) transforma
> isso em plano de ação e **registra as notificações** com a mensagem montada.
> O disparo real (provedor de e-mail / API do WhatsApp) ainda não acontece: as
> notificações ficam com status `SIMULADA`.

---

## Regras de negócio

1. **Área obrigatória**, por id ou token de QR. Token malformado é recusado
   antes de consultar o banco; área inativa recusa o registro.
2. **`clienteId` derivado da área** — nunca do payload.
3. **Terceiro precisa atuar no cliente da área** (`409 TERCEIRO_FORA_DO_CLIENTE`).
4. **Causa obrigatória nos desvios**, senão o Pareto se fragmenta.
5. **Foto obrigatória** em condição insegura e não conformidade.
6. **Fatores de risco: os quatro ou nenhum.**
7. **Coordenadas tudo-ou-nada.**
8. **Trilha de auditoria** com diff campo a campo.

---

## Endpoints

| Método | Rota | Para quê |
| --- | --- | --- |
| `GET` | `/indicadores/bbs` | Painel completo (ICS, ICI, Pareto, tendência, mapa, Bird, ICSG) |
| `GET` | `/observacoes` | Lista paginada com busca e filtros |
| `GET` | `/observacoes/resumo` | Cards: registradas, em tratativa, concluídas, prazo vencido |
| `GET` | `/observacoes/tipos` | Tipos com as regras de cada um (usado pelo formulário) |
| `GET` | `/observacoes/:id` | Registro completo, com comunicação e escalonamento resolvidos |
| `POST` | `/observacoes` | Registrar (aceita `areaId` ou `tokenQr`) |
| `PUT` | `/observacoes/:id` | Atualização parcial (recalcula IIR e prazo) |
| `DELETE` | `/observacoes/:id` | Excluir |
| `POST` | `/observacoes/:id/foto` · `/assinatura` | Evidências |
| `GET` | `/observacoes/:id/comunicacao` | Plano de comunicação resolvido |
| `GET` | `/observacoes/:id/auditoria` | Histórico |
| `GET` / `POST` | `/causas` | Catálogo do Pareto |

---

## Telas

- **`/dashboard-bbs`** — o painel BBS, com filtros por cliente, centro e período.
- **`/observacoes`** — listagem com busca, filtros e indicador de prazo vencido.
- **`/observacoes/nova`** — formulário; aceita `?qr=<token>` e, nesse caso, exibe
  a área já identificada com os riscos esperados.
- **`/inspecao/:token`** — a tela de campo agora leva direto ao formulário.

## Dados de demonstração

O seed gera **545 observações** distribuídas em 6 meses e 8 áreas, com volume de
desvios caindo mês a mês. É determinístico (gerador LCG com semente fixa): rodar
duas vezes produz os mesmos números, o que permite conferir o painel entre
ambientes. Resultado: ICS 81,9% (Bom), ICI 4,5% (dentro da meta), tendência
↓ −60,9%.

As observações do seed não geram registro de auditoria individual — seriam 545
linhas de ruído. Observações criadas pela aplicação geram normalmente.

---

## O que vem depois

- **Planos de ação** — implementados na Etapa 7.
- **Envio de e-mail e WhatsApp** — a matriz resolve o "quem, como e quando" e a
  mensagem já é montada e registrada; falta só o transporte.
- **Nota SSMA dos terceiros** deixa de ser manual: as observações vinculadas a
  cada terceiro passam a calcular a nota do ranking (Etapa 3).
- **Pilares faltantes do ICSG e do Índice Global** — plano de ação, inspeções
  programadas, auditorias e treinamentos.
