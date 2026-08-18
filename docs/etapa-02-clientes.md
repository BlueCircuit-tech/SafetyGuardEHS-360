# Etapa 2 — Clientes / Contratantes

Cada empresa para a qual a consultoria presta serviço (ex.: uma mineradora, uma
construtora, uma montadora) tem cadastro próprio. É a **chave de segmentação da
plataforma**:

| Para que serve | Campo que sustenta |
| --- | --- |
| Ranking por cliente | `nomeFantasia`, `metaIndiceGlobal`, `corDestaque` |
| Filtro de todos os dashboards | `id`, `situacao` (via `GET /clientes/opcoes`) |
| Dimensionamento de equipes e programas | `grauRisco`, `quantidadeFuncionarios`, `possuiCipa`, `possuiSesmt` |
| Escopo de inspeções, planos e documentos | vínculo com a matriz + `numeroContrato` |
| Cobrança e vigência | `valorMensal`, `diaVencimento`, datas do contrato |

Todo cliente pertence à **empresa de consultoria** cadastrada na Etapa 1.1 — sem a
matriz, a API responde `404 MATRIZ_NAO_CADASTRADA` e a tela orienta a concluir a
etapa anterior.

---

## Campos do cadastro

Legenda: **O** = obrigatório · *(pd)* = tem valor padrão

### Bloco 1 — Identificação

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `razaoSocial` | texto (3–150) | ✔ | Nome jurídico, como no cartão CNPJ. |
| `nomeFantasia` | texto (2–120) | ✔ | Nome curto exibido no ranking e nos filtros. |
| `cnpj` | documento | ✔ | Único por matriz. Valida dígitos verificadores; aceita o formato alfanumérico (2026+). Gravado sem máscara. |
| `inscricaoEstadual` | texto (≤20) | | Aceita `ISENTO`. |
| `inscricaoMunicipal` | texto (≤20) | | |
| `cnaePrincipal` | CNAE | | Subclasse de 7 dígitos. Deve ser coerente com o grau de risco. |
| `porte` | enum | | `MEI`, `ME`, `EPP`, `MEDIO`, `GRANDE`. |
| `segmento` | texto (≤80) | | Campo livre com sugestões (Mineração, Construção civil, Agroindústria…). |
| `site` | URL (≤150) | | |

### Bloco 2 — Contrato

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `numeroContrato` | texto (1–40) | ✔ | Único por matriz. É o identificador que aparece nos relatórios. |
| `dataInicioContrato` | data | ✔ | Início da vigência. |
| `dataFimContrato` | data | | Vazio = prazo indeterminado. Não pode ser anterior ao início. |
| `situacao` | enum *(pd `ATIVO`)* | | `ATIVO`, `SUSPENSO`, `ENCERRADO`. Marcar como `ENCERRADO` exige `dataFimContrato`. |
| `escopoServicos` | texto (≤500) | | O que está contratado (PGR, PCMSO, inspeções, treinamentos…). |
| `valorMensal` | decimal ≥ 0 | | Formatado em BRL na leitura. |
| `diaVencimento` | inteiro 1–31 | | |
| `consultorResponsavel` | texto (≤120) | | Vira vínculo de usuário na etapa de acessos. |

### Bloco 3 — Perfil SSMA

Alimenta o ranking, os indicadores e o dimensionamento das equipes.

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `grauRisco` | inteiro 1–4 | ✔ | Grau de risco da NR-4, Quadro I. Define obrigatoriedade de SESMT. |
| `quantidadeFuncionarios` | inteiro ≥ 1 | ✔ | Somado no card "trabalhadores cobertos" e usado nas taxas de frequência/gravidade. |
| `metaIndiceGlobal` | 0–100 *(pd 85)* | | Meta do Índice Global SSMA deste cliente — referência do ranking e dos alertas. |
| `possuiCipa` | booleano *(pd false)* | | |
| `possuiSesmt` | booleano *(pd false)* | | |

### Bloco 4 — Interlocutor no cliente

Quem recebe relatórios, alertas e notificações deste contrato.

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `contatoNome` | texto (3–120) | ✔ | |
| `contatoCargo` | texto (≤80) | | |
| `contatoEmail` | e-mail | ✔ | Normalizado para minúsculas. |
| `contatoTelefone` | telefone | ✔ | Fixo ou celular com DDD válido. |
| `contatoWhatsapp` | celular | | Precisa ser celular (11 díg. começando com 9). |

### Bloco 5 — Endereço da sede

Endereço administrativo. As frentes de trabalho entram na etapa de unidades e áreas.

| Campo | Tipo | O |
| --- | --- | :-: |
| `cep` | CEP | ✔ |
| `logradouro` | texto (3–150) | ✔ |
| `numero` | texto (1–20) | ✔ |
| `complemento` | texto (≤80) | |
| `bairro` | texto (2–80) | ✔ |
| `cidade` | texto (2–80) | ✔ |
| `uf` | sigla | ✔ |

O formulário consulta o ViaCEP e preenche o bloco automaticamente.

### Bloco 6 — Identidade e anotações

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `logoUrl` | arquivo | | `POST /clientes/:id/logo` (PNG, JPG, WEBP ou SVG, até 5 MB). |
| `corDestaque` | cor hex *(pd `#2563eb`)* | | Cor da série do cliente nos gráficos comparativos. |
| `observacoes` | texto (≤1000) | | Particularidades do contrato, restrições de acesso. |

---

## Regras de negócio

1. **Depende da Etapa 1.1.** Nenhum cliente pode ser criado sem a matriz cadastrada.
2. **CNPJ e número de contrato são únicos** dentro da matriz. A checagem no serviço
   devolve a mensagem no campo certo; a garantia real são os índices
   `@@unique([empresaId, cnpj])` e `@@unique([empresaId, numeroContrato])`.
3. **Coerência da vigência.** Fim não pode preceder o início; situação `ENCERRADO`
   exige data de fim. Contrato `ATIVO` com fim no passado é sinalizado na listagem
   como *vigência vencida* (campo derivado `contratoVencido`).
4. **Encerrar em vez de excluir.** Em SSMA o histórico precisa ser preservado — o
   caminho normal é mudar a situação para `ENCERRADO`. `DELETE` existe para
   cadastros criados por engano e a interface avisa disso antes de confirmar.
5. **Trilha de auditoria** igual à da matriz: criação, atualização e exclusão com
   diff campo a campo, autor e IP.
6. **Dados normalizados.** CNPJ, CEP, telefones e CNAE gravados sem máscara; a
   formatação vem no bloco `formatado` da resposta.

---

## Endpoints

Detalhes e exemplos em [`api.md`](api.md).

| Método | Rota | Para quê |
| --- | --- | --- |
| `GET` | `/clientes` | Lista paginada com busca e filtros |
| `GET` | `/clientes/resumo` | Contadores da listagem e dos dashboards |
| `GET` | `/clientes/opcoes` | Lista enxuta para seletores de dashboard |
| `GET` | `/clientes/:id` | Cadastro completo |
| `POST` | `/clientes` | Criar |
| `PUT` | `/clientes/:id` | Atualização parcial |
| `DELETE` | `/clientes/:id` | Exclusão definitiva |
| `GET` | `/clientes/:id/auditoria` | Histórico de alterações |
| `POST`/`DELETE` | `/clientes/:id/logo` | Logo do cliente |

### Busca e filtros

`GET /clientes` aceita `busca` (nome fantasia, razão social, CNPJ, número do
contrato ou cidade), `situacao`, `grauRisco`, `uf`, `ordenarPor`
(`nomeFantasia` | `razaoSocial` | `criadoEm` | `grauRisco` | `quantidadeFuncionarios`),
`direcao` (`asc`/`desc`), `pagina` e `porPagina` (máx. 100).

---

## O que vem depois

- **Etapa 3 — Empresas Contratadas / Terceiros:** as terceirizadas que atuam
  dentro da operação de cada cliente ([`etapa-03-terceiros.md`](etapa-03-terceiros.md)).
- **Etapa 4 — Centros de Negócio:** agrupamento acima do cliente, por regional,
  unidade ou tipo de contrato ([`etapa-04-centros-negocio.md`](etapa-04-centros-negocio.md)).
- **Etapa 5 — Áreas e QR Code:** cada cliente terá suas áreas de inspeção, com QR
  Code por área.
- **Ranking e dashboards:** `metaIndiceGlobal`, `grauRisco` e
  `quantidadeFuncionarios` já são a base dos indicadores; faltam os eventos
  (inspeções e planos de ação) para calcular o Índice Global de cada cliente.
