# Etapa 3 — Empresas Contratadas / Terceiros

Empresas terceirizadas que atuam **dentro da operação de um cliente** e que também
recebem nota e posição no ranking de desempenho SSMA.

```
Matriz (1.1) → Cliente (2) → Terceiro (3)
```

O terceiro nunca existe solto: ele pertence a um cliente. É isso que permite
responder "quais terceiros estão bloqueados na Vale Verde?" e "qual o ranking de
desempenho dentro deste contrato?".

> **O mesmo CNPJ pode ser cadastrado em mais de um cliente.** São registros
> distintos de propósito: nota, documentação, áreas de atuação e efetivo são por
> operação. A unicidade é `(cliente, CNPJ)`, não global.

---

## Campos do cadastro

Legenda: **O** = obrigatório · *(pd)* = tem valor padrão

### Bloco 1 — Onde atua

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `clienteId` | referência | ✔ | Cliente em cuja operação o terceiro atua. |
| `tipoVinculo` | enum *(pd `CONTRATO`)* | | `CONTRATO`, `ORDEM_SERVICO`, `OBRA`, `SERVICO_EVENTUAL`. |
| `numeroContrato` | texto (≤40) | | Contrato ou OS do terceiro com o cliente. |
| `dataInicioAtuacao` | data | ✔ | |
| `dataFimAtuacao` | data | | Vazio = sem prazo. Não pode preceder o início. |
| `situacao` | enum *(pd `ATIVO`)* | | `ATIVO`, `SUSPENSO`, `BLOQUEADO`, `ENCERRADO`. `ENCERRADO` exige data de fim. |
| `areasAtuacao` | texto (≤300) | | Frentes do cliente onde o terceiro trabalha. |
| `escopoServicos` | texto (≤500) | | |

### Bloco 2 — Identificação

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `razaoSocial` | texto (3–150) | ✔ | |
| `nomeFantasia` | texto (2–120) | ✔ | Nome exibido no ranking. |
| `cnpj` | documento | ✔ | Único **por cliente**. Valida dígitos verificadores; aceita o formato alfanumérico (2026+). |
| `atividadePrincipal` | texto (3–120) | ✔ | O que executa na operação (montagem, pintura, andaimes…). Campo livre com sugestões. |
| `cnaePrincipal` | CNAE | | Subclasse de 7 dígitos. |
| `porte` | enum | | `MEI`, `ME`, `EPP`, `MEDIO`, `GRANDE`. |
| `inscricaoEstadual` | texto (≤20) | | |

### Bloco 3 — Desempenho SSMA

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `grauRisco` | inteiro 1–4 | ✔ | Grau de risco NR-4 da atividade executada. |
| `quantidadeFuncionarios` | inteiro ≥ 1 | ✔ | Efetivo alocado na operação do cliente. |
| `notaSsma` | 0–100 | | Nota que posiciona no ranking. Vazio = ainda não avaliado. |
| `dataUltimaAvaliacao` | data | | **Obrigatória quando há nota** — nota sem data de referência não serve para auditoria. |
| `metaNotaSsma` | 0–100 *(pd 85)* | | Referência do alerta "abaixo da meta". |

### Bloco 4 — Documentação e conformidade

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `possuiPgr` | booleano *(pd false)* | | PGR entregue e vigente. |
| `possuiPcmso` | booleano *(pd false)* | | PCMSO entregue e vigente. |
| `documentacaoValidaAte` | data | | Vencimento da pasta de documentos. |

### Bloco 5 — Preposto / responsável

| Campo | Tipo | O |
| --- | --- | :-: |
| `responsavelNome` | texto (3–120) | ✔ |
| `responsavelCargo` | texto (≤80) | |
| `responsavelEmail` | e-mail | ✔ |
| `responsavelTelefone` | telefone | ✔ |
| `responsavelWhatsapp` | celular | |

### Bloco 6 — Endereço da sede *(bloco inteiro opcional)*

`cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`.

Diferente do cliente, o endereço do terceiro é opcional — mas **não pode ficar
pela metade**: se qualquer campo for preenchido, todos passam a ser exigidos
(exceto `complemento`).

### Bloco 7 — Identidade e anotações

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `logoUrl` | arquivo | | `POST /terceiros/:id/logo`. |
| `corDestaque` | cor hex *(pd `#7c3aed`)* | | Cor da barra no ranking. |
| `observacoes` | texto (≤1000) | | |

---

## Ranking e classificação

A nota (0–100) vira uma letra:

| Classe | Faixa | Rótulo |
| :-: | :-: | --- |
| **A** | ≥ 90 | Excelente |
| **B** | ≥ 75 | Adequado |
| **C** | ≥ 60 | Requer atenção |
| **D** | < 60 | Crítico |

A conversão vive em `classificarNotaSsma()` (`packages/shared/src/schemas/terceiro.ts`),
usada pela API e pela prévia do formulário — uma implementação só.

**Terceiro sem nota não ocupa posição no ranking.** Ele aparece na listagem como
"sem avaliação" e é contado em `resumo.semAvaliacao`. Na ordenação por nota, os
não avaliados vão para o fim (`nulls: 'last'`), nunca para o topo.

> **Estado atual da nota.** Enquanto as inspeções (Etapa 6) não existem, `notaSsma`
> é lançada manualmente no cadastro. Quando os eventos de campo entrarem, o campo
> passa a ser calculado e o formulário deixa de aceitar edição direta. A estrutura
> de ranking, faixas e alertas já está pronta para essa troca.

---

## Campos derivados na leitura

Calculados pela API, não armazenados:

| Campo | Significado |
| --- | --- |
| `classificacao` / `classificacaoRotulo` | Letra e rótulo da faixa. `null` se não avaliado. |
| `abaixoDaMeta` | `notaSsma < metaNotaSsma`. |
| `diasParaFimAtuacao` / `atuacaoVencida` | Vigência da atuação (vencida só conta se a situação for `ATIVO`). |
| `diasParaVencimentoDocumentacao` / `documentacaoVencida` | Validade da pasta de documentos. |
| `pendenciaDocumental` | Falta PGR **ou** PCMSO **ou** pasta vencida — é o que impede a liberação de acesso. |

---

## Regras de negócio

1. **Depende da Etapa 2.** Sem cliente cadastrado não há onde alocar o terceiro; a
   tela avisa e bloqueia o botão de cadastro.
2. **CNPJ único por cliente** — garantido por `@@unique([clienteId, cnpj])` e com
   mensagem apontando o campo (`CNPJ_TERCEIRO_DUPLICADO`).
3. **Nota exige data de avaliação.** Sem a data, a nota não é auditável.
4. **Endereço tudo-ou-nada**, como descrito acima.
5. **`BLOQUEADO` é situação de primeira classe** — não é uma observação em texto
   livre. É o estado que o controle de acesso vai consultar.
6. **Encerrar em vez de excluir**, para preservar o histórico de desempenho.
7. **Trilha de auditoria** com diff campo a campo, autor e IP, igual às etapas
   anteriores.

---

## Endpoints

Exemplos em [`api.md`](api.md).

| Método | Rota | Para quê |
| --- | --- | --- |
| `GET` | `/terceiros` | Lista paginada com busca e filtros |
| `GET` | `/terceiros/ranking` | Ranking de desempenho (só avaliados) |
| `GET` | `/terceiros/resumo` | Cards: ativos, bloqueados, doc. vencida, nota média |
| `GET` | `/terceiros/:id` | Cadastro completo |
| `POST` | `/terceiros` | Criar |
| `PUT` | `/terceiros/:id` | Atualização parcial |
| `DELETE` | `/terceiros/:id` | Exclusão definitiva |
| `GET` | `/terceiros/:id/auditoria` | Histórico de alterações |
| `POST`/`DELETE` | `/terceiros/:id/logo` | Logo |

### Busca e filtros

`GET /terceiros` aceita `busca` (nome fantasia, razão social, CNPJ, contrato ou
atividade), `clienteId`, `situacao`, `grauRisco`, `classificacao` (A–D),
`documentacaoVencida=true`, `ordenarPor`
(`nomeFantasia` | `razaoSocial` | `notaSsma` | `grauRisco` | `quantidadeFuncionarios` | `criadoEm`),
`direcao`, `pagina` e `porPagina`.

---

## O que vem depois

- **Etapa 4 — Unidades e Áreas:** as áreas do cliente onde o terceiro atua deixam
  de ser texto livre (`areasAtuacao`) e viram vínculo real, com QR Code.
- **Etapa 6 — Inspeções:** cada observação passa a apontar para o terceiro
  responsável, e a `notaSsma` deixa de ser manual.
- **Controle de acesso:** `pendenciaDocumental` e `situacao = BLOQUEADO` são os
  campos que a liberação de entrada vai consultar.
