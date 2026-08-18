# Etapa 8 — Pessoas, perfis e acessos

Fecha a lacuna que vinha sendo sinalizada desde a Etapa 1.1: **a API era aberta**
e o autor da auditoria vinha do cabeçalho `x-usuario`, que qualquer um podia
forjar. Agora toda rota exige sessão, cada perfil enxerga só o que lhe compete e
a trilha registra **quem** de verdade.

---

## Autenticação

- **Login**: `POST /auth/login` com e-mail e senha → devolve um **JWT** e a sessão.
- **Senha**: hash **scrypt** com sal por usuário, formato `scrypt$<sal>$<hash>`.
  Usa só `node:crypto` — sem dependência nativa para compilar.
- **Token**: carrega apenas o `sub` (id). Perfil e permissões são **relidos do
  banco a cada requisição**, então revogar acesso ou trocar o perfil de alguém
  tem efeito imediato, sem esperar o token expirar.
- **Expiração**: `JWT_EXPIRA_EM` (padrão `12h`).

Mensagem de erro **única** para e-mail inexistente, senha errada e usuário
inativo — não confirmamos quais e-mails existem na base. Quando o e-mail não
existe, ainda gastamos o tempo de uma verificação para não vazar por temporização.

### Variáveis de ambiente

| Variável | Padrão | Observação |
| --- | --- | --- |
| `JWT_SECRET` | valor de desenvolvimento | **Troque em produção.** Mínimo 16 caracteres. |
| `JWT_EXPIRA_EM` | `12h` | |
| `ADMIN_EMAIL` / `ADMIN_SENHA` | `admin@safetyguard.com.br` / `SafetyGuard2026` | Usados só pelo seed. O console avisa quando a senha é a padrão. |

---

## Perfis

| Perfil | O que faz |
| --- | --- |
| **Administrador** | Administra a plataforma, incluindo usuários. |
| **Diretoria** | Lê tudo e acompanha indicadores; não mexe em cadastro. |
| **Gerente** | Gerencia cadastros, planos de ação e escalonamento. |
| **Coordenador** | Trata planos e acompanha as áreas sob sua gestão. |
| **Supervisor** | Registra observações e trata os planos da equipe. |
| **Técnico de campo** | Registra observações. |
| **Cliente** | Vê apenas os dados do próprio contrato, sem editar. |

### Permissões

`cadastros:ler` · `cadastros:escrever` · `observacoes:ler` ·
`observacoes:escrever` · `planos:ler` · `planos:escrever` · `planos:escalonar` ·
`indicadores:ler` · `usuarios:gerenciar`

A matriz perfil → permissões vive em `packages/shared/src/schemas/usuario.ts`,
para que API e front usem **a mesma tabela**. Testes garantem invariantes que a
gente esqueceria de conferir na mão:

- quem escreve num recurso também lê;
- quem escalona plano também lê plano;
- só o `ADMIN` gerencia usuários;
- todo perfil só usa permissões que existem no catálogo.

> A checagem que vale é sempre a do **servidor**. O front usa a permissão apenas
> para esconder o que não interessa — quem forçar a URL vê a tela, mas as
> requisições voltam `403`.

---

## Como as rotas são protegidas

Cada módulo declara **uma** guarda, aplicada por método HTTP:

```ts
app.addHook('preHandler', guardaPorMetodo(app, {
  leitura: 'cadastros:ler',
  escrita: 'cadastros:escrever',
  // A tela de campo do QR Code e publica: o token e a credencial de leitura.
  excecoes: { '/api/v1/areas/qr/:token': null },
}));
```

`GET` exige a permissão de leitura; os demais verbos, a de escrita. Rotas fora
da regra ficam em `excecoes`, **visíveis** em vez de escondidas no meio dos
handlers. `null` libera a rota sem autenticação.

Exceções em uso hoje:

| Rota | Tratamento | Por quê |
| --- | --- | --- |
| `POST /auth/login`, `GET /auth/perfis` | público | é o que dá acesso |
| `GET /areas/qr/:token` | público | tela de campo; o token é a credencial |
| `GET /health` | público | monitoração |
| `GET /indicadores/bbs` | `indicadores:ler` | está no módulo de observações, mas é indicador |
| `POST /planos-acao/escalonar` | `planos:escalonar` | é POST, mas não é escrita comum |
| `GET /referencias/*` | só sessão válida | listas fixas, sem dado de negócio |

### Escopo por cliente

Perfis restritos (`CLIENTE`) têm `clienteId` obrigatório e são cercados por
**duas camadas**, porque filtrar a entrada não basta:

1. **Na entrada** — a guarda sobrescreve o `clienteId` da query. Não adianta o
   front mandar outro: o valor é descartado.
2. **Na saída** — um gancho `preSerialization` global barra qualquer payload cujo
   `clienteId` não seja o do usuário, devolvendo **404**. É o que fecha o acesso
   direto por id (`GET /observacoes/:id`), que a camada 1 não alcança.

O 404 é proposital: um 403 confirmaria que o registro existe.

Verificado com um usuário de perfil `CLIENTE`: listagens de observações, áreas e
planos devolvem só o próprio contrato; forçar outro `clienteId` na query não
muda nada; e o id de um registro de outro cliente responde 404 — enquanto o
mesmo id responde 200 para o administrador.

---

## Auditoria

`contextoDeAuditoria(request)` substituiu o antigo cabeçalho em **todos** os
módulos. O autor passa a ser `Nome <email>` do usuário autenticado.

Eventos de senha entram na trilha como `senha: → alterada pelo próprio usuário`
ou `→ redefinida por administrador`. **O conteúdo da senha nunca é registrado**,
nem em log nem em auditoria, e `senhaHash` jamais sai nas respostas da API.

---

## Proteções contra o tiro no pé

- Ninguém altera o **próprio perfil** (`AUTO_ALTERACAO_PERFIL`).
- Ninguém **desativa** ou **exclui** a si mesmo (`AUTO_DESATIVACAO`, `AUTO_EXCLUSAO`).

Sem isso, um administrador distraído tranca a plataforma inteira.

---

## Endpoints

| Método | Rota | Permissão |
| --- | --- | --- |
| `POST` | `/auth/login` | pública |
| `GET` | `/auth/perfis` | pública |
| `GET` | `/auth/eu` | sessão válida |
| `POST` | `/auth/trocar-senha` | sessão válida |
| `GET` | `/usuarios` | `usuarios:gerenciar` |
| `POST` | `/usuarios` | `usuarios:gerenciar` |
| `PUT` | `/usuarios/:id` | `usuarios:gerenciar` |
| `DELETE` | `/usuarios/:id` | `usuarios:gerenciar` |

---

## Telas

- **`/entrar`** — login, fora do shell administrativo.
- **`/usuarios`** — listagem, criação, ativação/desativação, redefinição de senha
  e o catálogo de perfis com suas permissões.
- **Navegação por permissão** — a sidebar só mostra o que o perfil alcança.
  Um técnico, por exemplo, não vê Dashboard BBS nem Pessoas e Acessos.
- **Sessão expirada** derruba para o login automaticamente, em vez de insistir
  com um token morto.

---

## O que vem depois

- **Vincular o usuário ao observador**: hoje `observador` ainda é texto livre no
  registro de campo; passa a ser o usuário autenticado.
- **Responsável do plano de ação** como usuário, para a cobrança por e-mail sair
  para um endereço real.
- **Refresh token** e política de expiração mais fina, se o uso em campo pedir.
- **Registro de tentativas de login** e bloqueio por excesso de falhas.
