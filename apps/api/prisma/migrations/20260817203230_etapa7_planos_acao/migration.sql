-- CreateEnum
CREATE TYPE "OrigemPlano" AS ENUM ('OBSERVACAO', 'AUDITORIA', 'INSPECAO', 'MANUAL');

-- CreateEnum
CREATE TYPE "CriticidadePlano" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "StatusPlano" AS ENUM ('ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "CanalNotificacao" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "StatusNotificacao" AS ENUM ('SIMULADA', 'ENVIADA', 'FALHOU');

-- CreateTable
CREATE TABLE "plano_acao" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "origem" "OrigemPlano" NOT NULL DEFAULT 'MANUAL',
    "observacaoId" TEXT,
    "clienteId" TEXT NOT NULL,
    "areaId" TEXT,
    "terceiroId" TEXT,
    "acao" VARCHAR(300) NOT NULL,
    "descricao" VARCHAR(1000),
    "responsavelNome" VARCHAR(120) NOT NULL,
    "responsavelCargo" VARCHAR(80),
    "responsavelEmail" VARCHAR(150),
    "criticidade" "CriticidadePlano" NOT NULL,
    "prazo" TIMESTAMP(3) NOT NULL,
    "status" "StatusPlano" NOT NULL DEFAULT 'ABERTO',
    "dataConclusao" TIMESTAMP(3),
    "evidenciaUrl" VARCHAR(300),
    "comentarioConclusao" VARCHAR(1000),
    "observacoes" VARCHAR(1000),
    "nivelEscalonamento" INTEGER NOT NULL DEFAULT 0,
    "dataUltimoEscalonamento" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plano_acao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacao" (
    "id" TEXT NOT NULL,
    "planoAcaoId" TEXT,
    "observacaoId" TEXT,
    "clienteId" TEXT NOT NULL,
    "canal" "CanalNotificacao" NOT NULL,
    "destinatarios" VARCHAR(300) NOT NULL,
    "assunto" VARCHAR(200),
    "corpo" TEXT NOT NULL,
    "nivelEscalonamento" INTEGER NOT NULL DEFAULT 0,
    "status" "StatusNotificacao" NOT NULL DEFAULT 'SIMULADA',
    "erro" VARCHAR(300),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plano_acao_codigo_key" ON "plano_acao"("codigo");

-- CreateIndex
CREATE INDEX "plano_acao_clienteId_status_prazo_idx" ON "plano_acao"("clienteId", "status", "prazo");

-- CreateIndex
CREATE INDEX "plano_acao_clienteId_criticidade_idx" ON "plano_acao"("clienteId", "criticidade");

-- CreateIndex
CREATE INDEX "plano_acao_status_prazo_idx" ON "plano_acao"("status", "prazo");

-- CreateIndex
CREATE INDEX "notificacao_clienteId_criadoEm_idx" ON "notificacao"("clienteId", "criadoEm");

-- CreateIndex
CREATE INDEX "notificacao_planoAcaoId_idx" ON "notificacao"("planoAcaoId");

-- AddForeignKey
ALTER TABLE "plano_acao" ADD CONSTRAINT "plano_acao_observacaoId_fkey" FOREIGN KEY ("observacaoId") REFERENCES "observacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plano_acao" ADD CONSTRAINT "plano_acao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plano_acao" ADD CONSTRAINT "plano_acao_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plano_acao" ADD CONSTRAINT "plano_acao_terceiroId_fkey" FOREIGN KEY ("terceiroId") REFERENCES "terceiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_planoAcaoId_fkey" FOREIGN KEY ("planoAcaoId") REFERENCES "plano_acao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_observacaoId_fkey" FOREIGN KEY ("observacaoId") REFERENCES "observacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
