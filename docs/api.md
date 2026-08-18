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

---

## Centros de Negócio / Unidades (Etapa 4)

Campos e regras em [`etapa-04-centros-negocio.md`](etapa-04-centros-negocio.md).

### `GET /api/v1/centros-negocio`

Parâmetros: `busca`, `tipo`, `situacao`, `uf`, `ordenarPor`, `direcao`,
`pagina`, `porPagina`. Cada item traz `quantidadeClientes`.

### `GET /api/v1/centros-negocio/consolidado`

Comparativo entre centros — base do filtro por centro nos dashboards.

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

### `GET /api/v1/centros-negocio/resumo`

```json
{ "total": 2, "ativos": 2, "inativos": 0, "clientesSemCentro": 0, "centrosSemClientes": 0 }
```

### `GET /api/v1/centros-negocio/opcoes?incluirInativos=false`

Lista enxuta para os seletores do cadastro de cliente e dos dashboards.

### `POST /api/v1/centros-negocio`

```bash
curl -X POST http://localhost:3333/api/v1/centros-negocio \
  -H 'Content-Type: application/json' \
  -H 'x-usuario: rafael@safetyguard.com.br' \
  -d '{
    "nome": "Regional Centro-Oeste",
    "codigo": "RCO",
    "tipo": "REGIONAL",
    "responsavelNome": "Rafael Martini",
    "responsavelEmail": "rafael.martini@safetyguard.com.br",
    "cidade": "Goiania",
    "uf": "GO",
    "metaIndiceGlobal": 88
  }'
```

O código é normalizado para maiúsculas (espaços viram hífen). Código repetido
devolve `409 CODIGO_CENTRO_DUPLICADO`.

### `DELETE /api/v1/centros-negocio/:id`

`204` quando não há clientes vinculados. Caso contrário:

```json
{
  "erro": {
    "codigo": "CENTRO_COM_CLIENTES",
    "mensagem": "Este centro tem 1 cliente(s) vinculado(s). Desvincule-os ou mude a situacao para Inativo.",
    "detalhes": { "clientesVinculados": 1 }
  }
}
```

### `POST /api/v1/centros-negocio/:id/clientes`

Vínculo em lote: `{ "clienteIds": ["<uuid>", "…"] }` → `{ "vinculados": 2 }`.

### Reflexo em `/clientes`

`GET /clientes` ganhou `centroNegocioId=<uuid>` e `semCentroNegocio=true`.
A resposta de cliente passa a incluir:

```json
{ "centroNegocioId": "…", "centroNegocio": { "id": "…", "nome": "Regional Centro-Oeste", "codigo": "RCO", "corDestaque": "#059669" } }
```

---

## Áreas e QR Code (Etapa 5)

Campos e regras em [`etapa-05-areas-qrcode.md`](etapa-05-areas-qrcode.md).

### `GET /api/v1/areas/qr/:token`

Leitura do QR Code — primeiro passo do fluxo de campo.

```json
{
  "nome": "Britagem — Planta 2",
  "codigo": "BRT-P2",
  "setor": "Planta 2",
  "criticidade": "CRITICA",
  "rotulos": { "tipo": "Producao", "criticidade": "Critica" },
  "riscos": ["Ruido", "Poeira / particulados", "Maquinas e equipamentos"],
  "exigePermissaoTrabalho": true,
  "exigeAutorizacaoEntrada": true,
  "urlInspecao": "http://localhost:5173/inspecao/WUHM47E7NT",
  "urlQrCode": "http://localhost:3333/api/v1/areas/<id>/qrcode.svg",
  "formatado": { "coordenadas": "-16.686400, -49.264300" },
  "cliente": {
    "nomeFantasia": "Vale Verde Mineracao",
    "numeroContrato": "4501",
    "centroNegocio": { "codigo": "RCO", "nome": "Regional Centro-Oeste" }
  }
}
```

Erros: `400 QR_INVALIDO` (token malformado — nem consulta o banco),
`404 QR_NAO_RECONHECIDO`, `409 AREA_INATIVA`.

### `GET /api/v1/areas/:id/qrcode.svg?escala=6`

Devolve `image/svg+xml` com correção de erro nível M. Usado na tela e na folha
de impressão.

### `POST /api/v1/areas/:id/qrcode/regenerar`

Emite um novo token. **Invalida as placas impressas** — ação explícita e
auditada (`tokenQr: de → para` na trilha).

### `GET /api/v1/areas`

Filtros: `busca` (nome, código, setor, riscos, ponto de referência ou token),
`clienteId`, `centroNegocioId`, `tipo`, `criticidade`, `situacao`, `ordenarPor`,
`direcao`, `pagina`, `porPagina` (máx. 200).

`centroNegocioId` atravessa o cliente — filtro em cascata centro → cliente → área.

### `GET /api/v1/areas/resumo?clienteId=`

```json
{ "total": 8, "ativas": 8, "inativas": 0, "criticas": 4, "altas": 2, "comPermissaoTrabalho": 5 }
```

### `POST /api/v1/areas`

```bash
curl -X POST http://localhost:3333/api/v1/areas \
  -H 'Content-Type: application/json' \
  -d '{
    "clienteId": "<uuid>",
    "nome": "Britagem — Planta 2",
    "codigo": "BRT-P2",
    "setor": "Planta 2",
    "tipo": "PRODUCAO",
    "criticidade": "CRITICA",
    "riscosPresentes": "Ruido; Poeira; Maquinas",
    "exigePermissaoTrabalho": true,
    "latitude": -16.6864,
    "longitude": -49.2643,
    "frequenciaInspecaoDias": 7
  }'
```

O `tokenQr` é gerado pelo servidor e ignorado se enviado no payload.
Código repetido no mesmo cliente devolve `409 CODIGO_AREA_DUPLICADO`.
Latitude sem longitude (ou vice-versa) devolve `422`.

---

## Observações e indicadores BBS (Etapa 6)

Campos e regras em [`etapa-06-observacoes-bbs.md`](etapa-06-observacoes-bbs.md).

### `GET /api/v1/indicadores/bbs`

Painel completo, calculado sobre as observações. Filtros: `clienteId`,
`centroNegocioId`, `areaId`, `terceiroId`, `tipo`, `situacao`, `de`, `ate`,
`meses` (1–24), `topCausas` (3–20).

```json
{
  "bbs": {
    "totalBbs": 531,
    "totalRegistros": 545,
    "ics": 81.9,
    "ici": 4.5,
    "classificacaoIcs": { "nivel": "BOM", "rotulo": "Bom", "emoji": "🟡" },
    "distribuicao": [{ "rotulo": "Comportamento Seguro", "quantidade": 435, "percentual": 81.9 }]
  },
  "icsg": { "valor": 86.4, "pesoConsiderado": 60, "pilaresSemDados": ["PLANO_ACAO_CONCLUIDO", "INSPECOES_REALIZADAS", "TREINAMENTOS"] },
  "pareto": {
    "comportamentosInseguros": [{ "causa": "Nao utilizacao de EPI", "quantidade": 29, "percentual": 40.3, "acumulado": 40.3, "dentroDos80": true }],
    "condicoesInseguras": [{ "causa": "Falta de sinalizacao", "quantidade": 9 }]
  },
  "tendencia": { "direcao": "MELHORANDO", "simbolo": "↓", "variacao": -60.9, "pontos": [{ "periodo": "Marco/26", "total": 23 }] },
  "mapaCalor": [{ "area": "Subestacao eletrica (SUB-01)", "criticidade": "ALTA", "emoji": "🔴" }],
  "piramideBird": { "base": 96, "totalOcorrencias": 7, "niveis": [{ "codigo": "B", "quantidade": 1, "razaoParaBase": 96 }] }
}
```

### `POST /api/v1/observacoes`

Aceita `areaId` **ou** `tokenQr` (o do QR Code da área).

```bash
curl -X POST http://localhost:3333/api/v1/observacoes \
  -H 'Content-Type: application/json' \
  -H 'x-usuario: rafael@safetyguard.com.br' \
  -d '{
    "tokenQr": "WUHM47E7NT",
    "tipo": "CONDICAO_INSEGURA",
    "causaId": "<uuid>",
    "descricao": "Guarda-corpo da passarela solto no acesso ao transportador.",
    "observador": "Rafael Martini",
    "severidade": 5, "probabilidade": 4, "exposicao": 3, "frequencia": 2,
    "fotoUrl": "/arquivos/evidencia.png",
    "acaoImediata": "Area isolada."
  }'
```

A resposta traz o risco e a comunicação já resolvidos:

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
  "escalonamento": { "rotuloNivel": "Supervisor", "vencida": false },
  "prazoLimite": "2026-08-17T20:23:50.306Z"
}
```

Validações de `422`: desvio sem `causaId`; condição insegura ou não conformidade
sem `fotoUrl`; fatores de risco preenchidos pela metade; meia coordenada de GPS;
`classificacaoBird = ATOS_E_CONDICOES`; data no futuro.
`409 TERCEIRO_FORA_DO_CLIENTE` quando o terceiro não atua no cliente da área.

### `GET /api/v1/observacoes` · `/resumo` · `/tipos`

`/tipos` devolve os 5 tipos com as regras de cada um (`exigeFoto`,
`exigeCausa`, `contaNoBbs`) — é o que o formulário de campo consome.

### `GET` / `POST` `/api/v1/causas`

Catálogo do Pareto. `GET /causas?tipo=CONDICAO_INSEGURA`.

### `POST /api/v1/observacoes/:id/foto` · `/assinatura`

`multipart/form-data`, campo `arquivo`.

---

## Planos de ação e notificações (Etapa 7)

Campos e regras em [`etapa-07-planos-acao.md`](etapa-07-planos-acao.md).

### `POST /api/v1/observacoes/:id/plano-acao`

Abre o plano com ação, criticidade, prazo e destinatários derivados da matriz de
comunicação, e registra as notificações na mesma transação.

```json
{
  "codigo": "PA-0074",
  "acao": "Isolar area",
  "criticidade": "CRITICA",
  "prazo": "2026-08-17T20:36:48.035Z",
  "atrasado": true,
  "nivelAtual": "Supervisor",
  "rotulos": { "origem": "Observacao de campo" }
}
```

`409 TIPO_NAO_ABRE_PLANO` para comportamento seguro e melhoria.
`409 PLANO_JA_ABERTO` quando a observação já tem plano em aberto (traz o código).

### `GET /api/v1/planos-acao/resumo`

```json
{
  "abertos": 4, "emAndamento": 5, "concluidos": 65,
  "atrasados": 6, "escalonados": 5,
  "tempoMedioFechamentoDias": 4.8, "aderenciaAoPrazo": 80, "percentualConcluido": 87.8
}
```

### `GET /api/v1/planos-acao/por-criticidade`

```json
[{ "criticidade": "CRITICA", "prazoPadraoHoras": 0, "total": 7, "emAberto": 2, "atrasados": 2, "concluidos": 5 }]
```

### `POST /api/v1/planos-acao/escalonar`

Varre os planos vencidos e sobe de nível. **Idempotente.**

```json
{ "avaliados": 6, "escalonados": [{ "codigo": "PA-0070", "de": 1, "para": 3, "nivel": "Gerencia Corporativa" }] }
```

### `PUT /api/v1/planos-acao/:id`

Concluir sem `evidenciaUrl` nem `comentarioConclusao` devolve `422`.
Concluir sem `dataConclusao` carimba o momento atual.

### `GET /api/v1/notificacoes` · `/notificacoes/resumo`

Log das mensagens montadas, com `assunto`, `corpo`, `destinatarios`, `canal`,
`nivelEscalonamento` e `status` (`SIMULADA` enquanto não há provedor).

```json
{ "total": 4, "email": 2, "whatsapp": 2, "simuladas": 4, "enviadas": 0, "falhas": 0, "porEscalonamento": 2 }
```

---

## Autenticação e usuários (Etapa 8)

**Toda rota exige `Authorization: Bearer <token>`**, exceto: `GET /health`,
`POST /api/v1/auth/login`, `GET /api/v1/auth/perfis` e
`GET /api/v1/areas/qr/:token` (tela de campo — o token do QR é a credencial).

Campos e regras em [`etapa-08-pessoas-acessos.md`](etapa-08-pessoas-acessos.md).

### `POST /api/v1/auth/login`

```bash
curl -X POST http://localhost:3333/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@safetyguard.com.br","senha":"SafetyGuard2026"}'
```

```json
{
  "token": "eyJhbGciOi…",
  "usuario": {
    "id": "…", "nome": "Administrador SafetyGuard", "perfil": "ADMIN",
    "clienteId": null,
    "permissoes": ["cadastros:ler", "cadastros:escrever", "…"]
  }
}
```

E-mail inexistente, senha errada e usuário inativo devolvem a **mesma**
mensagem (`401 NAO_AUTENTICADO`, "E-mail ou senha invalidos.").

### `GET /api/v1/auth/eu` · `GET /api/v1/auth/perfis` · `POST /api/v1/auth/trocar-senha`

`/auth/eu` devolve a sessão atual. `/auth/perfis` lista os perfis com suas
permissões e se exigem vínculo com cliente.

### `GET` / `POST` / `PUT` / `DELETE` `/api/v1/usuarios`

Exigem `usuarios:gerenciar`. `senhaHash` nunca aparece nas respostas.

Erros próprios: `409 EMAIL_DUPLICADO`, `400 AUTO_ALTERACAO_PERFIL`,
`400 AUTO_DESATIVACAO`, `400 AUTO_EXCLUSAO`.

### Erros de acesso

| Código | HTTP | Quando |
| --- | :-: | --- |
| `NAO_AUTENTICADO` | 401 | Sem token, token inválido/expirado, usuário inativo |
| `SEM_PERMISSAO` | 403 | Perfil sem a permissão exigida (o campo `detalhes.permissao` diz qual) |

---

## Saúde ocupacional e documentos (Etapa 9)

Cadastros exigem `saude:ler` / `saude:escrever`; o painel exige `indicadores:ler`.
Campos e regras em [`etapa-09-saude-documentos.md`](etapa-09-saude-documentos.md).

### `GET /api/v1/colaboradores`

Filtros: `busca`, `clienteId`, `terceiroId`, `areaId`, `vinculo`, `grauRisco`,
`situacao`, `asoIrregular`, `ordenarPor`, `direcao`, `pagina`, `porPagina`.

Cada item traz a situação derivada do exame:

```json
{
  "nome": "Adriana Peixoto", "cpfFormatado": "100.000.000-19",
  "funcao": "Operador de ponte rolante", "grauRisco": "ALTO",
  "asoAtual": { "tipo": "PERIODICO", "validade": "2026-06-02", "resultado": "APTO" },
  "situacaoAso": "VENCIDO", "diasParaVencerAso": -77, "impedido": true
}
```

`situacaoAso` é `VIGENTE` · `A_VENCER` · `VENCIDO` · `SEM_VALIDADE` · `SEM_ASO`.

### `POST /api/v1/asos`

`validade` em branco é calculada pela periodicidade do grau de risco
(alto = 12 meses; demais = 24). Demissional não aceita validade e marca o
colaborador como desligado.

Erros próprios: `409 CPF_DUPLICADO`, `409 COLABORADOR_COM_HISTORICO`,
`400 EXAME_ANTES_DA_ADMISSAO`, `400 TERCEIRO_DE_OUTRO_CLIENTE`,
`400 AREA_DE_OUTRO_CLIENTE`, `400 ALVO_DE_OUTRO_CLIENTE`, `400 DOCUMENTO_NAO_ATIVO`.

### `GET /api/v1/documentos` · `GET /api/v1/documentos/catalogo`

O catálogo devolve os 15 tipos com `validadeMeses`, `exigeResponsavelTecnico` e
`categoria`. `POST /documentos/:id/revisao` cria a nova versão e marca a anterior
como `SUBSTITUIDO`.

### `GET /api/v1/conformidade`

```json
{
  "icl": { "valor": 78.6, "saude": 72.7, "documentos": 87.5, "pesoConsiderado": 100 },
  "saude": { "colaboradoresAtivos": 22, "impedidos": 6, "semAso": 2, "percentualConformidade": 72.7 },
  "documentos": { "total": 24, "vencidos": 3, "percentualConformidade": 87.5, "porTipo": [] },
  "renovacao": { "janelaDias": 90, "total": 15, "vencidos": 7, "criticos": 0, "itens": [] },
  "porCliente": []
}
```

Parâmetros: `clienteId`, `terceiroId`, `janelaDias` (1–365, padrão 90).
`GET /api/v1/conformidade/renovacoes` devolve só a fila.

### Anexos

`POST /asos/:id/arquivo` e `POST /documentos/:id/arquivo` aceitam
**PDF, PNG, JPG ou WEBP** em `multipart/form-data` no campo `arquivo`.
Upload de logo e evidência continua aceitando só imagem.

---

## Dashboards consolidados (Etapa 10)

Três recortes da mesma base. Parâmetros comuns: `clienteId`, `centroNegocioId`,
`meses` (1–36, padrão 12). Detalhes em
[`etapa-10-dashboards.md`](etapa-10-dashboards.md).

| Rota | Permissão |
| --- | --- |
| `GET /api/v1/dashboards/executivo` | `indicadores:ler` |
| `GET /api/v1/dashboards/gerencial` | `indicadores:ler` |
| `GET /api/v1/dashboards/operacional` | `planos:ler` |

### `GET /api/v1/dashboards/executivo`

```json
{
  "indiceGlobal": { "valor": 94.1, "pesoConsiderado": 80, "pilares": [], "pilaresSemDados": [] },
  "cobertura": {
    "pesoConsiderado": 80,
    "pilaresSemDados": [{ "pilar": "AUDITORIAS", "motivo": "Modulo de auditorias ainda nao implementado." }]
  },
  "maturidade": { "valor": 85.2 },
  "seguranca": {
    "nota": 99.3, "acidentes": 4, "quaseAcidentes": 3, "registros": 546,
    "observacao": "Proxy pela piramide de Bird. A Taxa de Frequencia exige homem-hora trabalhada."
  },
  "riscos": { "nota": 100, "totalAreas": 8, "emDia": 8, "atrasadas": 0, "nuncaInspecionadas": 0 },
  "conformidade": { "icl": 78.6, "impedidos": 6, "documentosVencidos": 3 },
  "ranking": [], "centros": [], "tendencia": {}, "piramideBird": {}, "carteira": {}
}
```

`cobertura.pilaresSemDados` é a parte que **não** aparece no número: cada pilar
sem fonte vem com o motivo. `seguranca.observacao` declara que a nota é um proxy.

### `GET /api/v1/dashboards/gerencial`

ICSG, `pareto` (comportamentos e condições), `mapaCalor`, `piramideBird`,
`planos`, `inspecoes` (com `linhas` por área) e `terceiros` com a nota de cada
contratada.

### `GET /api/v1/dashboards/operacional`

```json
{
  "fila": {
    "planosAtrasados": 6, "planosVencendo": 2, "escalonamentosPendentes": 0,
    "observacoesSemTratativa": 1, "areasSemInspecao": 0,
    "colaboradoresImpedidos": 6, "renovacoesEm30Dias": 12
  },
  "planos": [], "observacoes": [], "areasAtrasadas": [], "renovacoes": [], "impedidos": []
}
```
