# SafetyGuard EHS 360

Plataforma de gestão integrada de **Segurança, Saúde e Meio Ambiente** para empresas
de consultoria em SST — inspeções de campo, planos de ação com escalonamento,
controle de exames ocupacionais, geração de documentos e dashboards.

Este repositório nasceu de um protótipo HTML de tela única (preservado em
[`prototype/index.html`](prototype/index.html)) e foi reescrito como aplicação real:
monorepo TypeScript com API, banco relacional e front-end.

**Estado atual:** Etapas 1.1 (Empresa de Consultoria), 2 (Clientes / Contratantes)
e 3 (Empresas Contratadas / Terceiros) implementadas ponta a ponta. As demais
estão mapeadas no roadmap abaixo.

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
│   │       └── modules/        empresa, clientes, terceiros, referências
│   └── web/                    console React (Vite)
│       └── src/
│           ├── componentes/    Campo, Layout, Toast, PréviaInstitucional
│           ├── lib/            cliente HTTP, máscaras, datas, mapeamento dos formulários
│           └── paginas/        EmpresaPage, Clientes*, Terceiros*
├── packages/
│   └── shared/                 contrato de domínio
│       └── src/
│           ├── br/             CNPJ, CEP, telefone, CNAE, UF
│           ├── schemas/        schemas Zod (comuns, empresa, cliente, terceiro)
│           └── institucional.ts  cabeçalho/rodapé de relatórios, e-mail e WhatsApp
├── docs/
│   ├── etapa-01-cadastro-empresa.md   campos e regras da matriz
│   ├── etapa-02-clientes.md           campos e regras dos contratantes
│   ├── etapa-03-terceiros.md          campos, ranking e conformidade
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
| `npm test` | Vitest (validadores, schemas, auditoria) — 74 testes |
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

---

## Roadmap

| Etapa | Escopo | Estado |
| --- | --- | :-: |
| 1.1 | Empresa de consultoria (matriz) | ✅ |
| 2 | Clientes / contratantes | ✅ |
| 3 | Empresas contratadas / terceiros | ✅ |
| 4 | Unidades e áreas (QR Code) | ⬜ |
| 5 | Pessoas, perfis e acessos (autenticação) | ⬜ |
| 6 | Inspeções, planos de ação e escalonamento | ⬜ |
| 7 | Saúde ocupacional e documentos (ASO, PGR, PCA, LTCAT, PPP) | ⬜ |
| 8 | Dashboards executivo, gerencial e operacional | ⬜ |

---

## Notas de arquitetura

- **Sem autenticação ainda.** A Etapa 5 traz usuários e perfis. Até lá, o autor das
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
