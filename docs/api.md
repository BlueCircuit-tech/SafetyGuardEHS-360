# API — SafetyGuard EHS 360

Base: `http://localhost:3333`
Prefixo dos recursos: `/api/v1`

Todas as respostas são JSON. O cabeçalho opcional `x-usuario` identifica o autor
na trilha de auditoria (enquanto o módulo de autenticação não existe).

---

## Formato de erro

Todos os erros seguem o mesmo envelope:

```json
{
  "erro": {
    "codigo": "VALIDACAO",
    "mensagem": "Os dados enviados nao passaram na validacao.",
    "campos": {
      "cnpj": ["CNPJ invalido — confira os digitos verificadores."],
      "whatsapp": ["WhatsApp deve ser um celular valido com DDD (11 digitos)."]
    }
  }
}
```

| Código | HTTP | Quando |
| --- | :-: | --- |
| `VALIDACAO` | 422 | Payload reprovado pelo schema. `campos` traz as mensagens por campo. |
| `MATRIZ_NAO_CADASTRADA` | 404 | Etapa 1.1 ainda não concluída. |
| `MATRIZ_JA_CADASTRADA` | 409 | Tentou criar uma segunda matriz. |
| `DUPLICADO` | 409 | Violação de unicidade no banco (ex.: CNPJ repetido). |
| `FORMATO_NAO_SUPORTADO` | 400 | Upload de logo em formato não aceito. |
| `CEP_NAO_ENCONTRADO` / `CEP_INDISPONIVEL` | 404 / 503 | Consulta de CEP. |
| `ERRO_INTERNO` | 500 | Falha não tratada (detalhe só fora de produção). |

---

## Saúde

### `GET /health`

```json
{ "status": "ok", "app": "SafetyGuard EHS 360", "ambiente": "development", "banco": "ok" }
```

---

## Empresa de consultoria (Etapa 1.1)

### `GET /api/v1/empresa/status`

Diz se a etapa já foi concluída — o front usa para escolher entre criar e editar.

```json
{ "cadastrada": true, "etapa": "1.1 Empresa de Consultoria", "concluidaEm": "2026-08-17T15:03:58.319Z" }
```

### `GET /api/v1/empresa`

Retorna a matriz. `404 MATRIZ_NAO_CADASTRADA` quando ainda não existe.
Além dos campos crus (sem máscara), vem o bloco `formatado`:

```json
{
  "id": "7d3aca2a-…",
  "razaoSocial": "SafetyGuard Consultoria em Seguranca do Trabalho Ltda",
  "cnpj": "11222333000181",
  "telefone": "6233334444",
  "formatado": {
    "cnpj": "11.222.333/0001-81",
    "cep": "74230-020",
    "telefone": "(62) 3333-4444",
    "whatsapp": "(62) 99988-7766",
    "cnaePrincipal": "7120-1/00"
  }
}
```

### `POST /api/v1/empresa`

Cria a matriz. `201` em caso de sucesso. Campos e regras: ver
[`etapa-01-cadastro-empresa.md`](etapa-01-cadastro-empresa.md).
Aceita valores com ou sem máscara — a normalização é do servidor.

```bash
curl -X POST http://localhost:3333/api/v1/empresa \
  -H 'Content-Type: application/json' \
  -H 'x-usuario: rafael@safetyguard.com.br' \
  -d '{
    "razaoSocial": "SafetyGuard Consultoria em Seguranca do Trabalho Ltda",
    "nomeFantasia": "SafetyGuard EHS",
    "cnpj": "11.222.333/0001-81",
    "email": "contato@safetyguard.com.br",
    "telefone": "(62) 3333-4444",
    "cep": "74230-020",
    "logradouro": "Avenida T-63",
    "numero": "1200",
    "bairro": "Setor Bueno",
    "cidade": "Goiania",
    "uf": "GO",
    "responsavelTecnicoNome": "Rafael Martini",
    "responsavelTecnicoTipoRegistro": "CREA",
    "responsavelTecnicoRegistro": "12345/D"
  }'
```

### `PUT /api/v1/empresa`

Atualização parcial — envie só os campos que mudaram. Payload vazio devolve
`400 PAYLOAD_VAZIO`.

### `GET /api/v1/empresa/cabecalho`

Bloco institucional pronto para relatórios, e-mail e WhatsApp. É o que os
geradores de documento devem consumir — nunca montar o cabeçalho por conta própria.

```json
{
  "nomeExibicao": "SafetyGuard EHS",
  "cnpjFormatado": "11.222.333/0001-81",
  "enderecoLinha": "Avenida T-63, 1200 — Sala 1502 · Setor Bueno · Goiania/GO · CEP 74230-020",
  "contatoLinha": "(62) 3333-4444 · WhatsApp (62) 99988-7766 · contato@safetyguard.com.br",
  "responsavelTecnicoLinha": "Rafael Martini — CREA 12345/D/GO",
  "rodapeRelatorio": "Documento emitido eletronicamente…",
  "assinaturaEmail": "SafetyGuard EHS\n(62) 3333-4444 · …",
  "cabecalhoWhatsapp": "*SafetyGuard EHS 360* — notificacao automatica",
  "corPrimaria": "#059669",
  "corSecundaria": "#0e1a2b",
  "logoUrl": "/arquivos/logo-uuid.png",
  "geradoEm": "2026-08-17T15:04:48.187Z"
}
```

### `GET /api/v1/empresa/auditoria?limite=50`

Histórico de alterações, mais recentes primeiro.

```json
[
  {
    "acao": "ATUALIZACAO",
    "autor": "rafael@safetyguard.com.br",
    "ip": "127.0.0.1",
    "criadoEm": "2026-08-17T15:05:00.588Z",
    "alteracoes": { "nomeFantasia": { "de": "SafetyGuard EHS", "para": "SafetyGuard EHS 360" } }
  }
]
```

### `POST /api/v1/empresa/logo`

`multipart/form-data`, campo `arquivo`. PNG, JPG, WEBP ou SVG até 5 MB
(`UPLOAD_MAX_MB`). Substitui e apaga a logo anterior. Devolve a empresa atualizada.

```bash
curl -X POST http://localhost:3333/api/v1/empresa/logo -F 'arquivo=@logo.png'
```

### `DELETE /api/v1/empresa/logo`

Remove a logo e o arquivo do disco.

---

## Referências

### `GET /api/v1/referencias`

Listas fixas para os selects do formulário: `ufs`, `tiposRegistroResponsavelTecnico`,
`regimesTributarios`, `cnaesSugeridos`.

### `GET /api/v1/referencias/cep/:cep`

Consulta ViaCEP para preencher o endereço. Conveniência — a validação continua
sendo feita pelo schema no envio.

```json
{ "cep": "74230020", "logradouro": "Avenida T-63", "bairro": "Setor Bueno", "cidade": "Goiânia", "uf": "GO" }
```

---

## Arquivos estáticos

Uploads são servidos em `GET /arquivos/<nome>`. O campo `logoUrl` guarda o caminho
relativo (`/arquivos/logo-uuid.png`); o front resolve contra `VITE_API_URL`.

---

## Clientes / Contratantes (Etapa 2)

Todos os endpoints exigem a matriz cadastrada (`404 MATRIZ_NAO_CADASTRADA` caso
contrário). Campos e regras em
[`etapa-02-clientes.md`](etapa-02-clientes.md).

### `GET /api/v1/clientes`

Lista paginada. Parâmetros: `busca`, `situacao`, `grauRisco`, `uf`, `ordenarPor`,
`direcao`, `pagina`, `porPagina`.

```json
{
  "itens": [
    {
      "id": "e91ddfe9-…",
      "nomeFantasia": "Vale Verde Mineracao",
      "cnpj": "45017890000182",
      "numeroContrato": "4501",
      "dataInicioContrato": "2024-02-01T00:00:00.000Z",
      "situacao": "ATIVO",
      "grauRisco": 4,
      "quantidadeFuncionarios": 640,
      "metaIndiceGlobal": 85,
      "valorMensal": 28500,
      "diasParaFimContrato": null,
      "contratoVencido": false,
      "formatado": {
        "cnpj": "45.017.890/0001-82",
        "cep": "75380-000",
        "contatoTelefone": "(62) 3222-1010",
        "valorMensal": "R$ 28.500,00"
      }
    }
  ],
  "total": 3,
  "pagina": 1,
  "porPagina": 20,
  "totalPaginas": 1
}
```

`valorMensal` e `metaIndiceGlobal` saem como número (o banco usa `Decimal`).
`diasParaFimContrato` e `contratoVencido` são derivados na leitura.

### `GET /api/v1/clientes/resumo`

```json
{ "total": 3, "ativos": 3, "suspensos": 0, "encerrados": 0, "funcionariosCobertos": 1730 }
```

### `GET /api/v1/clientes/opcoes?incluirInativos=false`

Lista enxuta para os seletores de cliente dos dashboards e dos cadastros seguintes.

```json
[{ "id": "e91ddfe9-…", "nomeFantasia": "Vale Verde Mineracao", "numeroContrato": "4501", "situacao": "ATIVO", "corDestaque": "#059669", "grauRisco": 4 }]
```

### `POST /api/v1/clientes`

```bash
curl -X POST http://localhost:3333/api/v1/clientes \
  -H 'Content-Type: application/json' \
  -H 'x-usuario: rafael@safetyguard.com.br' \
  -d '{
    "razaoSocial": "Vale Verde Mineracao e Britagem S.A.",
    "nomeFantasia": "Vale Verde Mineracao",
    "cnpj": "45.017.890/0001-82",
    "numeroContrato": "4501",
    "dataInicioContrato": "2024-02-01",
    "grauRisco": 4,
    "quantidadeFuncionarios": 640,
    "contatoNome": "Juliana Amaral",
    "contatoEmail": "juliana.amaral@valeverde.com.br",
    "contatoTelefone": "(62) 3222-1010",
    "cep": "75380-000",
    "logradouro": "Rodovia GO-060, km 42",
    "numero": "S/N",
    "bairro": "Zona Rural",
    "cidade": "Trindade",
    "uf": "GO"
  }'
```

Conflitos devolvem o campo culpado:

```json
{
  "erro": {
    "codigo": "CNPJ_DUPLICADO",
    "mensagem": "Este CNPJ ja esta cadastrado para o cliente \"Vale Verde Mineracao\".",
    "campos": { "cnpj": ["CNPJ ja cadastrado para outro cliente."] }
  }
}
```

Códigos: `CNPJ_DUPLICADO` e `CONTRATO_DUPLICADO` (409).

### `PUT /api/v1/clientes/:id`

Atualização parcial. As validações de coerência da vigência continuam valendo
sobre os campos enviados.

### `DELETE /api/v1/clientes/:id`

`204`. Exclusão definitiva — o caminho normal é mudar `situacao` para `ENCERRADO`.

### `GET /api/v1/clientes/:id/auditoria?limite=50`

Mesmo formato da auditoria da matriz.

### `POST` / `DELETE` `/api/v1/clientes/:id/logo`

`multipart/form-data`, campo `arquivo`. Mesmas regras da logo da matriz.

---

## Empresas Contratadas / Terceiros (Etapa 3)

Campos e regras em [`etapa-03-terceiros.md`](etapa-03-terceiros.md).
Todo terceiro pertence a um cliente; o escopo pela matriz é aplicado em todas as
consultas.

### `GET /api/v1/terceiros`

Parâmetros: `busca`, `clienteId`, `situacao`, `grauRisco`, `classificacao` (A–D),
`documentacaoVencida=true`, `ordenarPor`, `direcao`, `pagina`, `porPagina`.

Além dos campos gravados, cada item traz os derivados:

```json
{
  "nomeFantasia": "AndaimeSul",
  "notaSsma": 58,
  "metaNotaSsma": 85,
  "classificacao": "D",
  "classificacaoRotulo": "Critico",
  "abaixoDaMeta": true,
  "situacao": "BLOQUEADO",
  "possuiPgr": true,
  "possuiPcmso": false,
  "documentacaoVencida": true,
  "diasParaVencimentoDocumentacao": -28,
  "pendenciaDocumental": true,
  "cliente": { "id": "e91ddfe9-…", "nomeFantasia": "Vale Verde Mineracao" }
}
```

Na ordenação por `notaSsma`, terceiros sem nota vão para o fim da lista.

### `GET /api/v1/terceiros/ranking?clienteId=…&limite=50`

Só terceiros já avaliados, ordenados por nota decrescente.

```json
[
  {
    "posicao": 1,
    "nomeFantasia": "Montalta",
    "cliente": { "id": "e91ddfe9-…", "nomeFantasia": "Vale Verde Mineracao" },
    "notaSsma": 92.5,
    "metaNotaSsma": 85,
    "abaixoDaMeta": false,
    "classificacao": "A",
    "classificacaoRotulo": "Excelente",
    "grauRisco": 4,
    "dataUltimaAvaliacao": "2026-07-31T00:00:00.000Z"
  }
]
```

### `GET /api/v1/terceiros/resumo?clienteId=…`

```json
{
  "total": 4,
  "ativos": 3,
  "bloqueados": 1,
  "documentacaoVencida": 1,
  "semAvaliacao": 1,
  "funcionariosAlocados": 105,
  "notaMedia": 85.45
}
```

### `POST /api/v1/terceiros`

```bash
curl -X POST http://localhost:3333/api/v1/terceiros \
  -H 'Content-Type: application/json' \
  -H 'x-usuario: rafael@safetyguard.com.br' \
  -d '{
    "clienteId": "e91ddfe9-…",
    "razaoSocial": "Montalta Servicos Industriais Ltda",
    "nomeFantasia": "Montalta",
    "cnpj": "61.011.230/0001-40",
    "atividadePrincipal": "Montagem eletromecanica",
    "dataInicioAtuacao": "2025-03-10",
    "quantidadeFuncionarios": 48,
    "grauRisco": 4,
    "notaSsma": 92.5,
    "dataUltimaAvaliacao": "2026-07-31",
    "possuiPgr": true,
    "possuiPcmso": true,
    "responsavelNome": "Everton Ferraz",
    "responsavelEmail": "everton.ferraz@montalta.com.br",
    "responsavelTelefone": "(62) 3211-5500"
  }'
```

CNPJ repetido **no mesmo cliente** devolve `409 CNPJ_TERCEIRO_DUPLICADO`. Em outro
cliente é permitido — são operações distintas.

Nota sem `dataUltimaAvaliacao` devolve `422` apontando `dataUltimaAvaliacao`.
Endereço preenchido pela metade devolve `422` nos campos que faltam.

### `PUT` / `DELETE` `/api/v1/terceiros/:id`

Atualização parcial e exclusão definitiva (o caminho normal é `situacao = ENCERRADO`).

### `GET /api/v1/terceiros/:id/auditoria` · `POST`/`DELETE` `/api/v1/terceiros/:id/logo`

Mesmo comportamento das etapas anteriores.
