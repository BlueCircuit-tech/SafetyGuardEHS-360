-- CreateEnum
CREATE TYPE "TipoRisco" AS ENUM ('FISICO', 'QUIMICO', 'BIOLOGICO', 'ERGONOMICO', 'ACIDENTE');

-- CreateEnum
CREATE TYPE "NivelControle" AS ENUM ('ELIMINACAO', 'SUBSTITUICAO', 'ENGENHARIA', 'ADMINISTRATIVO', 'EPI');

-- CreateEnum
CREATE TYPE "SituacaoRisco" AS ENUM ('IDENTIFICADO', 'EM_TRATAMENTO', 'CONTROLADO', 'MONITORADO');

-- CreateTable
CREATE TABLE "inventario_risco" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "areaId" TEXT,
    "funcao" VARCHAR(80),
    "tipo" "TipoRisco" NOT NULL,
    "perigo" VARCHAR(150) NOT NULL,
    "fonteGeradora" VARCHAR(200),
    "atividade" VARCHAR(200),
    "danosPossiveis" VARCHAR(500) NOT NULL,
    "severidade" INTEGER NOT NULL,
    "probabilidade" INTEGER NOT NULL,
    "exposicao" INTEGER NOT NULL,
    "frequencia" INTEGER NOT NULL,
    "iir" INTEGER NOT NULL,
    "grauRisco" VARCHAR(3) NOT NULL,
    "controlesExistentes" VARCHAR(1000),
    "nivelControleAtual" "NivelControle",
    "medidasPropostas" VARCHAR(1000),
    "planoAcaoId" TEXT,
    "situacao" "SituacaoRisco" NOT NULL DEFAULT 'IDENTIFICADO',
    "responsavel" VARCHAR(120),
    "reavaliarEm" DATE,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventario_risco_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventario_risco_clienteId_situacao_idx" ON "inventario_risco"("clienteId", "situacao");

-- CreateIndex
CREATE INDEX "inventario_risco_clienteId_iir_idx" ON "inventario_risco"("clienteId", "iir");

-- AddForeignKey
ALTER TABLE "inventario_risco" ADD CONSTRAINT "inventario_risco_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_risco" ADD CONSTRAINT "inventario_risco_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_risco" ADD CONSTRAINT "inventario_risco_planoAcaoId_fkey" FOREIGN KEY ("planoAcaoId") REFERENCES "plano_acao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
