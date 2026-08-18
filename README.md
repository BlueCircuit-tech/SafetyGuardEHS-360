# SafetyGuard EHS 360

Plataforma de gestão integrada de **Segurança, Saúde e Meio Ambiente** para empresas
de consultoria em SST — inspeções de campo, planos de ação com escalonamento,
controle de exames ocupacionais, geração de documentos e dashboards.

Este repositório nasceu de um protótipo HTML de tela única (preservado em
[`prototype/index.html`](prototype/index.html)) e foi reescrito como aplicação real:
monorepo TypeScript com API, banco relacional e front-end.

**Estado atual:** Etapas 1.1 (Empresa de Consultoria), 2 (Clientes / Contratantes),
3 (Empresas Contratadas / Terceiros), 4 (Centros de Negócio / Unidades),
5 (Áreas e QR Code), 6 (Observações de campo / BBS), 7 (Planos de ação,
notificações e escalonamento), 8 (Pessoas, perfis e acessos), 9 (Saúde
ocupacional e documentos) e 10 (Dashboards executivo, gerencial e operacional)
implementadas ponta a ponta — **todos os indicadores calculados sobre dados
reais, com a API protegida por autenticação**. O roadmap abaixo mostra o que
ainda falta.

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Banco | PostgreSQL 16 (Docker) |
| ORM / migrations | Prisma 6 |
| API | Fastify 5 + Zod, TypeScript ESM |
| Front-end | React 18 + Vite 5 + React Hook Form |
| Domínio compartilhado | pacote `@safetyguard/shared` (schemas Zod, validadores BR) |
| Testes | Vitest |

A validação de negócio mora **num só lugar** (`packages/shared`) e é usada tanto pelo
navegador quanto pelo servidor — que sempre revalida, nunca confia no cliente.

---

## Estrutura

```
safetyguard-ehs-360/
├── apps/
│   ├── api/                    API Fastify + Prisma
│   │   ├── prisma/
│   │   │   ├── schema.prisma   modelo de dados
│   │   │   ├── migrations/     histórico versionado do banco
│   │   │   └── seed.ts         cria a matriz de demonstração
│   │   └── src/
│   │       ├── app.ts          composição do servidor
│   │       ├── env.ts          variáveis de ambiente validadas
│   │       ├── lib/            erros, auditoria, uploads
│   │       └── modules/        empresa, clientes, terceiros, centros, areas,
│   │                            observacoes, planos, saude, dashboards,
│   │                            usuarios, referências
│   └── web/                    console React (Vite)
│       └── src/
│           ├── componentes/    Campo, Layout, Toast, PréviaInstitucional
│           ├── lib/            cliente HTTP, máscaras, datas, mapeamento dos formulários
│           └── paginas/        EmpresaPage, Clientes*, Terceiros*, CentrosNegocio*,
│                                Areas*, LeituraQr, Observacoes*, DashboardBbs,
│                                PlanosAcao*, Comunicacao, Colaborador*,
│                                Documento*, Conformidade, Dashboard*,
│                                Login, Usuarios
├── packages/
│   └── shared/                 contrato de domínio
│       └── src/
│           ├── br/             CNPJ, CEP, telefone, CNAE, UF
│           ├── schemas/        schemas Zod (empresa, cliente, terceiro, centro,
│           │                    area, observacao, plano-acao, usuario,
│           │                    colaborador, aso, documento)
│           ├── indicadores/    ICS, ICI, ICSG, Índice Global, IIR, Bird, comunicação
│           └── institucional.ts  cabeçalho/rodapé de relatórios, e-mail e WhatsApp
├── docs/
│   ├── etapa-01-cadastro-empresa.md   campos e regras da matriz
│   ├── etapa-02-clientes.md           campos e regras dos contratantes
│   ├── etapa-03-terceiros.md          campos, ranking e conformidade
│   ├── etapa-04-centros-negocio.md    agrupamento por regional/unidade/contrato
│   ├── etapa-05-areas-qrcode.md       áreas de inspeção e QR Code
│   ├── etapa-06-observacoes-bbs.md    registro de campo e Dashboard BBS
│   ├── etapa-07-planos-acao.md        tratativa, notificações e escalonamento
│   ├── etapa-08-pessoas-acessos.md    autenticação, perfis e permissões
│   ├── etapa-09-saude-documentos.md   ASO, programas legais e conformidade
│   ├── etapa-10-dashboards.md         executivo, gerencial e operacional
│   ├── indicadores-ssma.md            fórmulas, pesos, faixas e matriz de comunicação
│   └── api.md                          referência dos endpoints
├── prototype/index.html        protótipo original (referência visual)
└── docker-compose.yml          PostgreSQL de desenvolvimento
```

---

## Como rodar

Pré-requisitos: **Node 20.11+**, **npm 10+** e **Docker** (para o Postgres).

```bash
cp .env.example .env
npm run setup
```

`npm run setup` instala as dependências, compila o pacote compartilhado, sobe o
Postgres, aplica as migrations e cria a empresa de demonstração.

Depois, com os dois servidores em paralelo:

```bash
npm run dev
```

- Console web: <http://localhost:5173>
- API: <http://localhost:3333> (health em `/health`)

O seed cria o administrador inicial — entre com
`admin@safetyguard.com.br` / `SafetyGuard2026` e troque a senha no primeiro
acesso (ou defina `ADMIN_EMAIL` e `ADMIN_SENHA` no `.env` antes de semear).

O Postgres do compose escuta na porta **5434** do host, para não conflitar com
outras instalações locais.

### Passo a passo manual

```bash
npm install
npm run build --workspace @safetyguard/shared
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

---

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | API + web em paralelo |
| `npm run build` | Compila shared → api → web |
| `npm run typecheck` | TypeScript estrito em todos os workspaces |
| `npm test` | Vitest (validadores, schemas, indicadores, conformidade, senha, auditoria) — 277 testes |
| `npm run lint` | ESLint |
| `npm run db:up` / `db:down` | Sobe / derruba o Postgres |
| `npm run db:migrate` | Cria e aplica migration a partir do schema |
| `npm run db:seed` | Cria a matriz de demonstração (idempotente) |
| `npm run db:studio` | Prisma Studio |

---

## Variáveis de ambiente

Ficam no `.env` da raiz (a API e o Vite leem do mesmo arquivo). Veja
[`.env.example`](.env.example).

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://…@localhost:5434/safetyguard` | Conexão do Prisma |
| `API_PORT` / `API_HOST` | `3333` / `0.0.0.0` | Porta da API |
| `CORS_ORIGIN` | `http://localhost:5173` | Origens liberadas (lista por vírgula) |
| `UPLOAD_DIR` / `UPLOAD_MAX_MB` | `./uploads` / `5` | Logo e evidências |
| `PUBLIC_APP_URL` | `http://localhost:5173` | **Endereço gravado no QR Code das áreas** — configure antes de imprimir as placas |
| `JWT_SECRET` | valor de desenvolvimento | **Troque em produção** (mín. 16 caracteres) |
| `JWT_EXPIRA_EM` | `12h` | Validade do token |
| `ADMIN_EMAIL` / `ADMIN_SENHA` | `admin@safetyguard.com.br` / `SafetyGuard2026` | Usuário criado pelo seed |
| `VITE_API_URL` | `http://localhost:3333` | URL da API usada pelo front |

A API falha ao iniciar se alguma variável obrigatória estiver ausente ou inválida.

---

## Etapa 1.1 — o que já funciona

- Formulário completo em 6 blocos, com máscaras e validação por campo
- **CNPJ com dígito verificador**, incluindo o formato **alfanumérico** de 2026
- Preenchimento de endereço por CEP (ViaCEP)
- Upload de logo (PNG/JPG/WEBP/SVG) servido pela própria API
- **Prévia ao vivo** de como o cadastro aparece no relatório, no e-mail e no WhatsApp
- **Trilha de auditoria** com diff campo a campo, autor e IP
- Registro único garantido pelo banco, não só pela aplicação

Detalhes de campos e regras: [`docs/etapa-01-cadastro-empresa.md`](docs/etapa-01-cadastro-empresa.md).

## Etapa 2 — o que já funciona

- Listagem com busca (nome, razão social, CNPJ, contrato, cidade), filtros por
  situação e grau de risco, ordenação e paginação
- Cards de resumo: contratos ativos/suspensos/encerrados e trabalhadores cobertos
- Formulário completo em 6 blocos, com CNPJ, CEP, telefones e CNAE mascarados
- **Perfil SSMA** (grau de risco NR-4, funcionários, meta do Índice Global, CIPA,
  SESMT) — a base do ranking e dos indicadores
- Vigência de contrato validada (fim ≥ início, encerramento exige data) e alerta
  de *vigência vencida* na listagem
- CNPJ e número de contrato únicos por matriz, com erro apontando o campo
- Logo e cor de destaque por cliente, usados nos relatórios e gráficos
- Trilha de auditoria por cliente
- `GET /clientes/opcoes` — lista pronta para o seletor de cliente dos dashboards

Detalhes: [`docs/etapa-02-clientes.md`](docs/etapa-02-clientes.md).

## Etapa 3 — o que já funciona

- Terceiros vinculados à operação de um cliente (o mesmo CNPJ pode atuar em
  clientes diferentes — são cadastros distintos, com nota e documentação próprias)
- **Ranking de desempenho SSMA** com faixas A/B/C/D e alerta de nota abaixo da meta
- Situação `BLOQUEADO` e indicador `pendenciaDocumental` (falta PGR, PCMSO ou pasta
  vencida) — a base do controle de liberação de acesso
- Filtros por cliente, situação, classe e documentação vencida
- Endereço opcional, mas tudo-ou-nada; nota exige data de avaliação
- Trilha de auditoria por terceiro

Detalhes: [`docs/etapa-03-terceiros.md`](docs/etapa-03-terceiros.md).
Endpoints: [`docs/api.md`](docs/api.md).

## Etapa 4 — o que já funciona

- Centros de negócio por **regional, unidade, tipo de contrato ou divisão**
- Código curto único, normalizado para maiúsculas (usado em relatórios e filtros)
- Vínculo opcional de cada cliente a um centro, com filtro na listagem
  (inclusive "sem centro") e coluna na tabela
- **Consolidado por centro**: clientes, terceiros e trabalhadores cobertos
- Exclusão bloqueada enquanto houver cliente vinculado, com contagem na mensagem
- Vínculo em lote para organizar clientes já cadastrados
- Trilha de auditoria por centro

Detalhes: [`docs/etapa-04-centros-negocio.md`](docs/etapa-04-centros-negocio.md).

## Etapa 5 — o que já funciona

- Áreas de inspeção por cliente, com setor, tipo, criticidade e riscos presentes
- **QR Code real** gerado no servidor (SVG), com token de 10 caracteres sem
  símbolos ambíguos — dá para digitar da placa se a câmera falhar
- **Tela de campo** em `/inspecao/:token`, fora do shell administrativo: abre no
  celular mostrando riscos, exigência de PT e controle de acesso
- **Folha de placas** pronta para imprimir, com filtro por cliente
- Emissão de novo QR como ação explícita e auditada (invalida placas impressas)
- Área inativa recusa a leitura; token malformado nem consulta o banco
- Frequência de inspeção sugerida por criticidade, com alerta quando o cadastro
  fica acima do sugerido
- Filtro por centro de negócio atravessando o cliente — o filtro em cascata do
  dashboard já funcionando

Detalhes: [`docs/etapa-05-areas-qrcode.md`](docs/etapa-05-areas-qrcode.md).

## Etapa 6 — o que já funciona

- **Registro de observações** pelos 5 tipos do plano (comportamento seguro,
  comportamento inseguro, condição insegura, melhoria, não conformidade)
- Fluxo de campo fechado: **QR Code → formulário já identificado** com cliente,
  área e riscos esperados
- **IIR calculado ao vivo** enquanto o inspetor escolhe severidade,
  probabilidade, exposição e frequência — com grau de risco derivado
- **Matriz de comunicação resolvida** por observação: ação requerida, canais,
  prazo, destinatários (roteados também pela causa) e degrau de escalonamento
- Causas **catalogadas**, não texto livre — é o que faz o Pareto ter sentido
- Foto obrigatória em condição insegura e não conformidade; GPS pelo dispositivo
- **Dashboard BBS** com ICS, ICI, ICSG, distribuição, dois Paretos, tendência
  mensal, mapa de calor por área e Pirâmide de Bird — filtrável por cliente,
  centro de negócio e período

Detalhes: [`docs/etapa-06-observacoes-bbs.md`](docs/etapa-06-observacoes-bbs.md).

## Etapa 7 — o que já funciona

- **Plano de ação** com código sequencial (`PA-0001`), aberto manualmente ou
  **automaticamente a partir da observação** — ação, criticidade, prazo e
  destinatários vindos da matriz de comunicação
- **Concluir exige prova**: evidência anexada ou descrição do que foi feito
- **Escalonamento automático e idempotente** — Supervisor → Coordenador →
  Gerente → Gerência Corporativa conforme o atraso, sem duplicar notificação
- **Notificações registradas** com a mensagem montada exatamente como sairia,
  usando a assinatura e o rodapé institucionais da Etapa 1.1
- **Dashboard de Comunicação** — alertas por canal, quantos por escalonamento e
  a situação de envio
- KPIs: em aberto, atrasados, **tempo médio de fechamento** e **aderência ao
  prazo**, mais a matriz de criticidade da carteira

Detalhes: [`docs/etapa-07-planos-acao.md`](docs/etapa-07-planos-acao.md).

## Etapa 8 — o que já funciona

- **Login com JWT** e senha em hash **scrypt** (só `node:crypto`, sem dependência
  nativa) — o texto puro nunca é persistido nem registrado
- **7 perfis** (Administrador, Diretoria, Gerente, Coordenador, Supervisor,
  Técnico, Cliente) e **9 permissões**, numa matriz única compartilhada entre API
  e front
- **Toda rota protegida** por uma guarda declarada por módulo; as exceções
  (login, QR de campo, health) ficam explícitas
- Perfil **Cliente** enxerga só o próprio contrato — o escopo é imposto pelo
  servidor, não pelo filtro que o front manda
- **Auditoria com o usuário real**, no lugar do antigo cabeçalho `x-usuario`
- Navegação por permissão; sessão expirada volta ao login sozinha
- Proteções contra travar a plataforma: ninguém altera o próprio perfil nem
  desativa a si mesmo

Detalhes: [`docs/etapa-08-pessoas-acessos.md`](docs/etapa-08-pessoas-acessos.md).

## Etapa 9 — o que já funciona

- **Colaboradores** com CPF validado, função, grau de risco (NR-4) e vínculo
  (próprio do cliente, de contratada ou da consultoria)
- **ASO** com histórico completo por pessoa — o novo periódico não apaga o
  anterior, e a validade é sugerida pela periodicidade do grau de risco
- Quem está **impedido de trabalhar** (sem ASO, ASO vencido ou inapto) aparece
  destacado, em vez de diluído numa contagem
- **Documentos legais** com catálogo de 15 tipos (PGR, PCMSO, LTCAT, PPP, PCA,
  PPR, laudos, AVCB, licença ambiental...), prazos típicos e exigência de RT
- **Revisão preserva a versão anterior** como substituída — a fiscalização pode
  pedir o que estava vigente numa data passada
- **Índice de Conformidade Legal (ICL)** e **fila de renovação** unindo ASO e
  documento, ordenada pelo que aperta primeiro
- Anexo em **PDF** ou imagem para atestado e documento

Detalhes: [`docs/etapa-09-saude-documentos.md`](docs/etapa-09-saude-documentos.md).

## Etapa 10 — o que já funciona

- **Três painéis** sobre a mesma base, com recortes diferentes: executivo (a
  nota e o ranking), gerencial (a causa) e operacional (a fila de hoje)
- **Índice Global SSMA** com a composição visível: o painel lista os pilares
  **sem fonte** e o motivo, em vez de esconder a lacuna dentro do número
- **Ranking de contratos** com a mesma composição aplicada cliente a cliente
- **Centros de negócio × meta** — compara com a `metaIndiceGlobal` da Etapa 4
- Dois pilares novos derivados de dado real: **Segurança** (pirâmide de Bird) e
  **Gestão de Riscos** (% de áreas com inspeção dentro da frequência cadastrada)
- **Painel operacional** com cards que levam à tela que resolve cada pendência

Detalhes: [`docs/etapa-10-dashboards.md`](docs/etapa-10-dashboards.md).

## Motor de indicadores

Fórmulas, pesos e faixas do plano diretor implementados como funções puras e
testadas em `packages/shared/src/indicadores/`:

- **BBS** — ICS, ICI, distribuição, Pareto, mapa de calor e tendência mensal
- **Índices compostos** — Índice Global SSMA, ICSG e Score de Maturidade, com
  renormalização quando um pilar não tem dados
- **IIR** — Índice Inteligente de Risco (Severidade × Probabilidade × Exposição ×
  Frequência) e derivação do grau da ocorrência
- **Pirâmide de Bird** — níveis A–F e razão entre base e topo
- **Matriz de Comunicação Automática** — canal, prazo, destinatários,
  roteamento por tipo de desvio e escalonamento por atraso

Especificação completa, incluindo as decisões tomadas sobre pontos ambíguos do
plano: [`docs/indicadores-ssma.md`](docs/indicadores-ssma.md).

> Desde a Etapa 6 estas funções rodam sobre **observações reais**. Os pilares
> que ainda não têm fonte (plano de ação, inspeções programadas, auditorias,
> treinamentos) são ignorados e os pesos, renormalizados — o resultado informa
> `pilaresSemDados` para deixar isso explícito.

---

## Roadmap

| Etapa | Escopo | Estado |
| --- | --- | :-: |
| 1.1 | Empresa de consultoria (matriz) | ✅ |
| 2 | Clientes / contratantes | ✅ |
| 3 | Empresas contratadas / terceiros | ✅ |
| 4 | Centros de negócio / unidades | ✅ |
| 5 | Áreas e QR Code | ✅ |
| — | Motor de indicadores (ICS, ICI, ICSG, IIR, Bird, comunicação) | ✅ |
| 6 | Registro de observações (BBS) + Dashboard BBS | ✅ |
| 7 | Planos de ação, notificações e escalonamento | ✅ |
| — | Envio real de e-mail/WhatsApp + agendador do escalonamento | ⬜ |
| 8 | Pessoas, perfis e acessos (autenticação) | ✅ |
| 9 | Saúde ocupacional e documentos (ASO, PGR, PCA, LTCAT, PPP) | ✅ |
| 10 | Dashboards executivo, gerencial e operacional | ✅ |

---

## Notas de arquitetura

- **Autenticação ativa (Etapa 8).** Toda rota exige sessão, exceto login, health
  e a tela de campo `/inspecao/:token` — pública por natureza, o token é a
  credencial de leitura. **Troque `JWT_SECRET` antes de expor a API.**
- **Notificações não são enviadas.** São montadas e registradas como `SIMULADA`;
  falta apenas o transporte (provedor de e-mail e API do WhatsApp Business). Até lá, o autor das
  alterações vem do cabeçalho `x-usuario` e a API não deve ser exposta publicamente.
- **Dados normalizados.** CNPJ, CEP, telefones e CNAE são gravados sem máscara; a
  formatação é aplicada na leitura. Nenhuma consulta depende de formatação.
- **Uploads em disco local.** Serve para desenvolvimento; em produção troque
  `lib/arquivos.ts` por um provedor de object storage.
- **Datas puras.** Vigências e data de fundação usam `@db.Date` e são formatadas a
  partir da string ISO, sem passar pelo fuso local — caso contrário, em UTC-3, toda
  data apareceria um dia antes.
- **Multi-tenant.** O modelo separa a matriz (consultoria) dos clientes atendidos;
  toda consulta de cliente é escopada pela matriz.
# SafetyGuardEHS-360
