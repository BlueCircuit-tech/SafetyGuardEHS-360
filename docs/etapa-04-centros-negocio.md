# Etapa 4 — Centros de Negócio / Unidades

Agrupamento **intermediário entre a matriz e os clientes**, usado quando a
consultoria organiza a operação por regional, por unidade ou por tipo de
contrato.

```
Matriz (1.1)
   └── Centro de Negócio (4)   ← "Regional Centro-Oeste", "Contratos de Obra"
          └── Cliente (2)      ← cada cliente aponta para no máximo um centro
                 └── Terceiro (3)
```

O filtro "Centro de Negócio" do dashboard **desce em cascata**: escolher um
centro restringe clientes e, por consequência, os terceiros deles.

---

## Como o modelo foi decidido

O enunciado citava dois usos — *"várias unidades de um mesmo cliente"* e
*"organizar a operação por regional"* — e terminava em *"vincular cada cli…"*.

A leitura adotada: **o centro fica acima do cliente e o cliente é vinculado a
ele**. Isso funciona para os dois casos porque, no modelo atual, **o Cliente já
representa um contrato específico** (tem `numeroContrato` único). Uma empresa
com três plantas atendidas vira três clientes — "Cliente X Sorocaba",
"Cliente X Indaiatuba", "Cliente X Taubaté" — e todos podem apontar para o mesmo
centro (`REGIONAL`), ou cada um para o seu (`UNIDADE`).

O campo `tipo` do centro deixa a intenção explícita em vez de ficar implícita no
nome.

> Se, em vez disso, você precisar de **um cliente pertencendo a vários centros ao
> mesmo tempo**, o vínculo vira uma tabela N:N. Diga e eu troco — é uma migration.

**O vínculo é opcional.** Cliente sem centro continua funcionando por completo;
ele apenas não aparece quando o dashboard é filtrado por centro. A listagem
mostra quantos estão nessa situação e dá um atalho para eles.

---

## Campos do cadastro

Legenda: **O** = obrigatório · *(pd)* = tem valor padrão

### Bloco 1 — Identificação

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `nome` | texto (2–120) | ✔ | Ex.: "Regional Centro-Oeste". |
| `codigo` | texto (1–20) | ✔ | Único por matriz. Normalizado para **maiúsculas**, espaços viram hífen; aceita letras, números, `.`, `-` e `_`. É o identificador curto usado em relatórios, filtros e exportações. |
| `tipo` | enum | ✔ | `REGIONAL`, `UNIDADE`, `TIPO_CONTRATO`, `DIVISAO`. |
| `descricao` | texto (≤500) | | O que o agrupamento reúne. |

### Bloco 2 — Responsável

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `responsavelNome` | texto (3–120) | ✔ | |
| `responsavelCargo` | texto (≤80) | | |
| `responsavelEmail` | e-mail | ✔ | Normalizado para minúsculas. |
| `responsavelTelefone` | telefone | | Fixo ou celular com DDD válido. |
| `responsavelWhatsapp` | celular | | Precisa ser celular (11 díg.). |

### Bloco 3 — Gestão

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `cidade` | texto (≤80) | | Referência geográfica do centro. |
| `uf` | sigla | | Uma das 27 UFs. |
| `metaIndiceGlobal` | 0–100 *(pd 85)* | | Meta do Índice Global SSMA do centro — referência do comparativo entre centros. |
| `situacao` | enum *(pd `ATIVO`)* | | `ATIVO`, `INATIVO`. Centro inativo some dos seletores. |
| `corDestaque` | cor hex *(pd `#0e1a2b`)* | | Cor do centro nos gráficos. |
| `observacoes` | texto (≤1000) | | |

### No cadastro de Cliente

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `centroNegocioId` | referência | | Bloco "Agrupamento". Vazio = sem centro. |

---

## Regras de negócio

1. **Depende da Etapa 1.1** — o centro pertence à matriz.
2. **Código único por matriz**, com mensagem apontando o campo
   (`CODIGO_CENTRO_DUPLICADO`). O código chega normalizado, então `rco` e `RCO`
   colidem como deveriam.
3. **Exclusão bloqueada com clientes vinculados.** A API responde
   `409 CENTRO_COM_CLIENTES` informando quantos são — apagar o centro deixaria os
   clientes órfãos sem aviso. O caminho é desvincular ou mudar para `INATIVO`.
   A garantia final é do banco (`onDelete: Restrict`).
4. **Vínculo opcional**, como descrito acima.
5. **Trilha de auditoria** com diff campo a campo, autor e IP.

---

## Endpoints

| Método | Rota | Para quê |
| --- | --- | --- |
| `GET` | `/centros-negocio` | Lista paginada com busca e filtros |
| `GET` | `/centros-negocio/resumo` | Cards: total, ativos, clientes sem centro, centros ociosos |
| `GET` | `/centros-negocio/consolidado` | Comparativo: clientes, terceiros e trabalhadores por centro |
| `GET` | `/centros-negocio/opcoes` | Lista enxuta para os seletores |
| `GET` | `/centros-negocio/:id` | Cadastro completo (com `quantidadeClientes`) |
| `POST` | `/centros-negocio` | Criar |
| `PUT` | `/centros-negocio/:id` | Atualização parcial |
| `DELETE` | `/centros-negocio/:id` | Excluir (bloqueado se houver clientes) |
| `POST` | `/centros-negocio/:id/clientes` | Vincular clientes em lote |
| `GET` | `/centros-negocio/:id/auditoria` | Histórico de alterações |

`GET /clientes` ganhou dois parâmetros: `centroNegocioId` e
`semCentroNegocio=true`. A resposta de cliente passa a incluir o bloco
`centroNegocio` (`id`, `nome`, `codigo`, `corDestaque`).

### Vínculo em lote

Útil na organização inicial, quando já existem clientes cadastrados:

```bash
curl -X POST http://localhost:3333/api/v1/centros-negocio/<id>/clientes \
  -H 'Content-Type: application/json' \
  -d '{"clienteIds": ["<uuid-1>", "<uuid-2>"]}'
```

---

## Consolidado por centro

`GET /centros-negocio/consolidado` é a base do comparativo entre centros no
dashboard executivo:

```json
{
  "centros": [
    {
      "codigo": "RCO",
      "nome": "Regional Centro-Oeste",
      "tipo": "REGIONAL",
      "clientes": 2,
      "clientesAtivos": 2,
      "terceiros": 3,
      "funcionariosCobertos": 1520,
      "metaIndiceGlobal": 88
    }
  ],
  "clientesSemCentro": 0
}
```

---

## O que vem depois

- **Etapa 5 — Áreas e QR Code:** implementada
  ([`etapa-05-areas-qrcode.md`](etapa-05-areas-qrcode.md)). O filtro por centro já
  atravessa cliente → área.
- **Índice Global por centro:** `metaIndiceGlobal` já está aqui; o valor
  realizado depende dos eventos de campo (ver
  [`indicadores-ssma.md`](indicadores-ssma.md)).
