import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

// .env local do app tem precedencia; o .env da raiz do monorepo e o padrao.
config();
config({ path: resolve(process.cwd(), '../../.env') });

const defaultNodeEnv = process.env.VERCEL ? 'production' : 'development';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default(defaultNodeEnv),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL nao configurada — copie o .env.example para .env.'),
  API_PORT: z.coerce.number().int().positive().default(3333),
  API_HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  UPLOAD_MAX_MB: z.coerce.number().positive().default(5),
  PUBLIC_API_URL: z.string().url().default('http://localhost:3333'),
  /** Base do link gravado no QR Code das areas. */
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),
  /**
   * Segredo de assinatura do JWT. Em producao **precisa** ser trocado —
   * o valor padrao existe so para o ambiente de desenvolvimento subir.
   */
  JWT_SECRET: z.string().min(16, 'JWT_SECRET deve ter ao menos 16 caracteres.').default('desenvolvimento-safetyguard-trocar'),
  JWT_EXPIRA_EM: z.string().default('12h'),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  /** E-mail adicional que recebe cópia de todos os alertas (monitoramento). */
  ALERTA_EMAIL_COPIA: z.string().optional(),

  // Supabase — Storage e autenticação server-side
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
});

const resultado = envSchema.safeParse(process.env);

if (!resultado.success) {
  const detalhes = resultado.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
  throw new Error(`Variaveis de ambiente invalidas:\n${detalhes}`);
}

export const env = resultado.data;

/** Origens liberadas no CORS, aceitando lista separada por virgula. */
export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origem) => origem.trim())
  .filter(Boolean);

const defaultUploadDir = process.env.VERCEL ? '/tmp/uploads' : resolve(process.cwd(), env.UPLOAD_DIR);

export const uploadDir = defaultUploadDir;
export const uploadMaxBytes = Math.round(env.UPLOAD_MAX_MB * 1024 * 1024);
export const isProducao = env.NODE_ENV === 'production';
