# Etapa 5 — Áreas e QR Code

A área é o **ponto de leitura da inspeção de campo**. Cada uma tem um QR Code
próprio que, ao ser lido no celular, abre uma tela já identificada com cliente,
área, riscos presentes e exigências de acesso.

```
Matriz (1.1) → Centro de Negócio (4) → Cliente (2) → Área (5)
                                            └── Terceiro (3)
```

É o primeiro passo do fluxo operacional do plano diretor:

```
QR Code → formulário → fotos → assinatura → SharePoint/API
   ↑                                              ↓
 (aqui)                          plano de ação · e-mail · WhatsApp · dashboard
```

---

## Campos do cadastro

Legenda: **O** = obrigatório · *(pd)* = tem valor padrão

### Bloco 1 — Identificação

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `clienteId` | referência | ✔ | Cliente dono da área. |
| `nome` | texto (2–120) | ✔ | Ex.: "Britagem — Planta 2". |
| `codigo` | texto (1–20) | ✔ | Único **por cliente**. Impresso na placa. Normalizado para maiúsculas, espaços viram hífen. |
| `setor` | texto (≤80) | | Agrupamento livre dentro do cliente (planta, unidade, prédio). |
| `tipo` | enum | ✔ | `PRODUCAO`, `MANUTENCAO`, `ARMAZENAGEM`, `LOGISTICA`, `UTILIDADES`, `LABORATORIO`, `OBRA`, `ADMINISTRATIVO`, `AREA_EXTERNA`, `OUTRO`. |
| `descricao` | texto (≤500) | | |
| `situacao` | enum *(pd `ATIVA`)* | | `ATIVA`, `INATIVA`. Área inativa **recusa a leitura do QR**. |

### Bloco 2 — Risco e controle de acesso

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `criticidade` | enum | ✔ | `BAIXA`, `MEDIA`, `ALTA`, `CRITICA`. Define a prioridade e sugere a frequência. |
| `frequenciaInspecaoDias` | 1–365 *(pd 30)* | | Periodicidade mínima. O formulário avisa quando ficar acima do sugerido. |
| `riscosPresentes` | texto (≤300) | | Separados por `;`. A API devolve também como lista em `riscos`. |
| `exigeAutorizacaoEntrada` | booleano *(pd false)* | | Aparece em destaque na tela de campo. |
| `exigePermissaoTrabalho` | booleano *(pd false)* | | Idem — é o aviso de PT. |

Frequência sugerida por criticidade:

| Criticidade | Sugestão |
| --- | :-: |
| Crítica | 7 dias |
| Alta | 15 dias |
| Média | 30 dias |
| Baixa | 90 dias |

É **sugestão, não trava**: o formulário alerta e deixa salvar, porque a
periodicidade real costuma vir do contrato.

### Bloco 3 — Responsável pela área

`responsavelNome`, `responsavelCargo`, `responsavelEmail`, `responsavelTelefone` —
todos opcionais. É quem receberá a notificação quando uma observação for
registrada aqui.

### Bloco 4 — Localização física

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `latitude` / `longitude` | decimal | | **Andam juntas** — meia coordenada não localiza nada, e o schema rejeita. Servem para conferir o GPS capturado na observação. |
| `pontoReferencia` | texto (≤150) | | Ex.: "Ao lado do transportador TC-04". |
| `observacoes` | texto (≤1000) | | |

---

## QR Code

### Token

Cada área recebe um `tokenQr` de **10 caracteres**, gerado pelo servidor com um
alfabeto **sem caracteres ambíguos** — `0/O` e `1/I/L` ficam de fora, para que
alguém consiga digitar o código lendo da placa quando a câmera falhar.

O token **não faz parte do formulário**: não é enviado nem editado no cadastro.
Isso é deliberado — se editar a área mudasse o token, toda edição invalidaria as
placas já impressas.

### Link gravado

```
{PUBLIC_APP_URL}/inspecao/{token}
```

`PUBLIC_APP_URL` é a variável de ambiente que aponta para o endereço público do
app (padrão `http://localhost:5173`). **Configure-a antes de imprimir as
placas** — o QR grava a URL absoluta.

### Endpoints

| Método | Rota | Para quê |
| --- | --- | --- |
| `GET` | `/areas/qr/:token` | Leitura do QR — devolve área + cliente + centro |
| `GET` | `/areas/:id/qrcode.svg?escala=6` | SVG da placa (correção de erro M) |
| `POST` | `/areas/:id/qrcode/regenerar` | Emite novo token |

`GET /areas/qr/:token` responde:

- `400 QR_INVALIDO` — o texto não tem forma de token (nem consulta o banco);
- `404 QR_NAO_RECONHECIDO` — token bem formado, mas sem área;
- `409 AREA_INATIVA` — área existe, porém não aceita inspeção.

### Emitir novo QR

`POST /areas/:id/qrcode/regenerar` troca o token. É uma ação **explícita e
auditada**, não um efeito colateral da edição, porque invalida as placas
impressas. Use quando o QR for comprometido (foto vazada, placa adulterada).

### Folha de impressão

A listagem tem a aba **"Folha de placas"**, que renderiza todas as áreas do
filtro atual em cartões prontos para imprimir (3 por linha, sem quebra no meio
do cartão). Cada placa traz cliente, nome, código, o QR e o token por extenso.

---

## Tela de campo (`/inspecao/:token`)

O destino do QR fica **fora do shell administrativo**: sem sidebar, sem topbar,
layout de cartão único. É aberta no celular, muitas vezes com luva e sob sol.

Mostra, nesta ordem: cliente, nome e código da área, criticidade, avisos de PT e
acesso controlado, riscos presentes, ponto de referência e responsável.

O botão principal leva ao **formulário de observação** já identificado
(`/observacoes/nova?qr=<token>`) — o fluxo de campo funciona ponta a ponta.

---

## Regras de negócio

1. **Depende da Etapa 2** — a área pertence a um cliente; a tela avisa e bloqueia
   o botão quando não há cliente cadastrado.
2. **Código único por cliente** (`@@unique([clienteId, codigo])`), com mensagem
   no campo (`CODIGO_AREA_DUPLICADO`).
3. **Token único global**, gerado com repetição em caso de colisão.
4. **Coordenadas tudo-ou-nada.**
5. **Área inativa recusa leitura** — o QR continua existindo, mas responde 409.
6. **Trilha de auditoria** com diff campo a campo; a troca de token aparece como
   `tokenQr: de → para`.

---

## Endpoints (demais)

| Método | Rota | Para quê |
| --- | --- | --- |
| `GET` | `/areas` | Lista paginada com busca e filtros |
| `GET` | `/areas/resumo` | Cards: total, ativas, críticas, altas, com PT |
| `GET` | `/areas/opcoes?clienteId=` | Lista enxuta para seletores |
| `GET` | `/areas/:id` | Cadastro completo |
| `POST` | `/areas` | Criar (gera o token) |
| `PUT` | `/areas/:id` | Atualização parcial |
| `DELETE` | `/areas/:id` | Excluir |
| `GET` | `/areas/:id/auditoria` | Histórico de alterações |

Filtros de `GET /areas`: `busca` (nome, código, setor, riscos, ponto de
referência ou **token**), `clienteId`, `centroNegocioId`, `tipo`, `criticidade`,
`situacao`, `ordenarPor`, `direcao`, `pagina`, `porPagina` (máx. 200).

O filtro por `centroNegocioId` atravessa o cliente — é o filtro em cascata do
dashboard funcionando na prática.

---

## O que vem depois

A **Etapa 6 (registro de observações)** já está implementada
([`etapa-06-observacoes-bbs.md`](etapa-06-observacoes-bbs.md)) e:

- fecha o fluxo do QR Code (a leitura passa a abrir o formulário);
- liga os indicadores: ICS, ICI, distribuição BBS, Pareto, tendência,
  Pirâmide de Bird e o pilar BBS do Índice Global
  ([`indicadores-ssma.md`](indicadores-ssma.md));
- alimenta o **mapa de calor por área**, que já tem o cálculo pronto e só espera
  os eventos;
- dispara a **matriz de comunicação** (e-mail/WhatsApp/escalonamento), também já
  implementada e sem gatilho.

O campo `areasAtuacao` do terceiro (texto livre) passa a poder virar vínculo real
com estas áreas.
