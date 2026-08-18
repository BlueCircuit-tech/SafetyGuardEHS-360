-- CreateEnum
CREATE TYPE "PrioridadeNotificacao" AS ENUM ('CRITICA', 'ALTA', 'MEDIA', 'BAIXA');

-- AlterEnum
ALTER TYPE "CanalNotificacao" ADD VALUE 'VOZ';

-- AlterTable
ALTER TABLE "notificacao" ADD COLUMN     "agrupada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canalFallback" VARCHAR(20),
ADD COLUMN     "prioridade" "PrioridadeNotificacao" NOT NULL DEFAULT 'MEDIA';

-- AlterTable
ALTER TABLE "plano_acao" ADD COLUMN     "dataInicioTratativa" TIMESTAMP(3);
