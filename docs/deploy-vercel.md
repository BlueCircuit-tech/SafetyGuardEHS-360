# Deploy na Vercel — dois projetos

A aplicação sobe como **dois projetos separados** apontando para o mesmo
repositório, cada um com um Root Directory diferente:

| Projeto | Root Directory | O que é |
|---|---|---|
| `safetyguard-web` | `apps/web` | SPA React servida como estática |
| `safetyguard-api` | `apps/api` | Fastify rodando como função serverless |

Cada projeto tem o seu próprio `vercel.json`, já versionado. Nada precisa ser
configurado na aba de build — só o Root Directory e as variáveis de ambiente.

---

## 1. Criar os projetos

Para cada um, na Vercel: **Add New → Project → importar o repositório**.

Na tela de configuração, abra **Root Directory → Edit** e escolha a pasta
(`apps/web` ou `apps/api`). Esse é o único ajuste manual obrigatório — se ficar
na raiz, o build roda no lugar errado e a pasta `api/` não vira função.

Deixe **Framework Preset**, **Build Command** e **Output Directory** como estão:
o `vercel.json` de cada pasta já define tudo.

> O `npm install` roda na raiz do repositório, porque é lá que estão o
> `package-lock.json` e os workspaces. Os dois apps têm um script `prebuild`
> que compila `packages/shared` antes do próprio build, então a ordem se
> resolve sozinha.

---

## 2. Variáveis de ambiente

Em cada projeto: **Settings → Environment Variables**. Adicione uma a uma,
marcando os ambientes (Production, Preview, Development).

O `.env` local **não sobe** — está no `.gitignore`, e é assim que deve ser.

### Projeto da API (`apps/api`)

| Variável | Valor |
|---|---|
| `DATABASE_URL` | connection string do Supabase |
| `JWT_SECRET` | segredo longo e aleatório — **não reaproveite o de desenvolvimento** |
| `JWT_EXPIRA_EM` | `12h` |
| `CORS_ORIGIN` | `https://<seu-front>.vercel.app,https://*.vercel.app` |
| `PUBLIC_API_URL` | `https://<sua-api>.vercel.app` |
| `PUBLIC_APP_URL` | `https://<seu-front>.vercel.app` |
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` |
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | usuário do Brevo |
| `SMTP_PASS` | chave do Brevo |
| `SMTP_FROM` | `SafetyGuard Alertas <...>` |
| `ALERTA_EMAIL_COPIA` | e-mail que recebe cópia dos alertas |

`PUBLIC_APP_URL` aponta para o **front**, não para a API: é a base do link
gravado nos QR Codes das áreas.

### Projeto do front (`apps/web`)

| Variável | Valor |
|---|---|
| `VITE_API_URL` | `https://<sua-api>.vercel.app` |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | chave `anon` |

Só isso. **Nenhuma variável de servidor pode entrar aqui.**

### O que nunca vai para o front

O Vite embute qualquer `VITE_*` no JavaScript que o navegador baixa — é texto
legível para quem abrir o DevTools. Então:

- `SUPABASE_SERVICE_ROLE_KEY` ignora as políticas de RLS: com ela, qualquer
  visitante lê e escreve o banco inteiro. Ela é `SUPABASE_*`, nunca `VITE_*`.
- `DATABASE_URL`, `JWT_SECRET` e as `SMTP_*` seguem a mesma regra.

A chave `anon` é a exceção: ela é pública por design e protegida por RLS.

---

## 3. Ordem de subida

1. Suba a **API** primeiro e anote o domínio gerado.
2. Preencha `VITE_API_URL` no projeto do **front** com esse domínio e suba.
3. Volte à API e ajuste `CORS_ORIGIN` e `PUBLIC_APP_URL` com o domínio do front.
4. Redeploy da API para as variáveis novas valerem.

Variáveis de ambiente **só são lidas em novos deploys**. Alterar uma no painel
não afeta o que já está no ar — é preciso um Redeploy.

---

## 4. Conferir se funcionou

```
https://<sua-api>.vercel.app/api/ping
```

Devolve JSON com o commit publicado e quais variáveis obrigatórias existem
(apenas presença, nunca os valores). É a checagem mais rápida: se vier JSON, as
funções estão sendo criadas e roteadas.

```
https://<sua-api>.vercel.app/health
```

Vai além e toca o banco: `{"status":"ok","banco":"ok"}` confirma que a
`DATABASE_URL` está correta e o Supabase responde.

Depois disso, abra o front e faça login.

---

## 5. Banco de dados

As migrations **não rodam no deploy**. Aplique-as da sua máquina, apontando
para o Supabase:

```bash
cd apps/api && npx prisma migrate deploy
```

Com `DATABASE_URL` exportada no shell (no PowerShell,
`$env:DATABASE_URL = "..."` numa linha separada antes do comando).

O seed (`npx tsx prisma/seed.ts`) cria o administrador e uma massa de dados de
demonstração. Rode-o **uma vez só** — ele não é idempotente para os dados de
exemplo, e repetir gera duplicatas.

---

## 6. Se algo falhar

**`/api/ping` devolve HTML em vez de JSON** — o Root Directory do projeto da
API não é `apps/api`. Corrija em Settings → General e faça Redeploy.

**`/health` responde `banco: indisponivel`** — `DATABASE_URL` errada ou ausente.
O `/api/ping` mostra se a variável ao menos existe.

**Erro de CORS no navegador** — `CORS_ORIGIN` na API não inclui o domínio do
front. Lembre do Redeploy depois de corrigir.

**`Query engine binary not found` (Prisma)** — adicione ao `functions` do
`apps/api/vercel.json`:

```json
"includeFiles": "node_modules/.prisma/client/**"
```

**Uploads falham** — em produção os arquivos vão para o Supabase Storage, que
exige `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no projeto da API. Sem elas
o código cai no disco local, que na Vercel é efêmero e read-only.
