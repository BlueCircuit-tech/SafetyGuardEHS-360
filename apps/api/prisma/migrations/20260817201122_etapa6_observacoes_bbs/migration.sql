-- CreateEnum
CREATE TYPE "TipoObservacao" AS ENUM ('COMPORTAMENTO_SEGURO', 'COMPORTAMENTO_INSEGURO', 'CONDICAO_INSEGURA', 'MELHORIA_IDENTIFICADA', 'NAO_CONFORMIDADE');

-- CreateEnum
CREATE TYPE "SituacaoObservacao" AS ENUM ('REGISTRADA', 'EM_TRATATIVA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ClassificacaoBird" AS ENUM ('A_MAJOR', 'B_SERIOUS', 'C_MINOR', 'D_MAJOR_NEAR_MISS', 'E_NEAR_MISS', 'F_FIRST_AID');

-- CreateEnum
CREATE TYPE "GrauRiscoOcorrencia" AS ENUM ('I', 'II', 'III');

-- CreateTable
CREATE TABLE "causa_desvio" (
    "id" TEXT NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "descricao" VARCHAR(120) NOT NULL,
    "tipo" "TipoObservacao" NOT NULL,
    "destinatarioSugerido" VARCHAR(60),
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "causa_desvio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observacao" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "terceiroId" TEXT,
    "causaId" TEXT,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" "TipoObservacao" NOT NULL,
    "descricao" VARCHAR(1000) NOT NULL,
    "observador" VARCHAR(120) NOT NULL,
    "severidade" INTEGER,
    "probabilidade" INTEGER,
    "exposicao" INTEGER,
    "frequencia" INTEGER,
    "iir" INTEGER,
    "grauRisco" "GrauRiscoOcorrencia",
    "classificacaoBird" "ClassificacaoBird",
    "fotoUrl" VARCHAR(300),
    "assinaturaUrl" VARCHAR(300),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "acaoImediata" VARCHAR(500),
    "situacao" "SituacaoObservacao" NOT NULL DEFAULT 'REGISTRADA',
    "observacoes" VARCHAR(1000),
    "prazoLimite" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "observacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "causa_desvio_codigo_key" ON "causa_desvio"("codigo");

-- CreateIndex
CREATE INDEX "causa_desvio_tipo_ativa_idx" ON "causa_desvio"("tipo", "ativa");

-- CreateIndex
CREATE INDEX "observacao_clienteId_dataHora_idx" ON "observacao"("clienteId", "dataHora");

-- CreateIndex
CREATE INDEX "observacao_clienteId_tipo_dataHora_idx" ON "observacao"("clienteId", "tipo", "dataHora");

-- CreateIndex
CREATE INDEX "observacao_areaId_dataHora_idx" ON "observacao"("areaId", "dataHora");

-- CreateIndex
CREATE INDEX "observacao_terceiroId_dataHora_idx" ON "observacao"("terceiroId", "dataHora");

-- CreateIndex
CREATE INDEX "observacao_causaId_idx" ON "observacao"("causaId");

-- AddForeignKey
ALTER TABLE "observacao" ADD CONSTRAINT "observacao_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observacao" ADD CONSTRAINT "observacao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observacao" ADD CONSTRAINT "observacao_terceiroId_fkey" FOREIGN KEY ("terceiroId") REFERENCES "terceiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observacao" ADD CONSTRAINT "observacao_causaId_fkey" FOREIGN KEY ("causaId") REFERENCES "causa_desvio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
