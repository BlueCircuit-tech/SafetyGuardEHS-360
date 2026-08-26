// Endpoint de diagnostico do deploy. Nao importa nada do projeto de proposito:
// se /api/ping responder JSON, as funcoes serverless estao sendo criadas e
// roteadas, e qualquer falha restante esta na app Fastify ou nas variaveis de
// ambiente. Se devolver o HTML do SPA, o problema e a configuracao do projeto
// na Vercel — a pasta api/ nao esta virando funcao.
//
// Reporta apenas a presenca das variaveis, nunca os valores.

const OBRIGATORIAS = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
];

export default function handler(req, res) {
  const ambiente = Object.fromEntries(
    OBRIGATORIAS.map((nome) => [nome, Boolean(process.env[nome])]),
  );

  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(
    JSON.stringify(
      {
        ok: true,
        runtime: process.version,
        regiao: process.env.VERCEL_REGION ?? null,
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
        ambiente,
      },
      null,
      2,
    ),
  );
}
