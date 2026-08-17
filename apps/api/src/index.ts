import { criarApp } from './app.js';
import { env } from './env.js';
import { prisma } from './db.js';

async function main(): Promise<void> {
  const app = await criarApp();

  const encerrar = async (sinal: string) => {
    app.log.info(`Sinal ${sinal} recebido — encerrando.`);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void encerrar('SIGINT'));
  process.on('SIGTERM', () => void encerrar('SIGTERM'));

  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  app.log.info(`SafetyGuard EHS 360 API em http://localhost:${env.API_PORT}/api/v1`);
}

main().catch((erro) => {
  console.error('Falha ao iniciar a API:', erro);
  process.exit(1);
});
