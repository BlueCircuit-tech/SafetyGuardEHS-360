-- CreateEnum
CREATE TYPE "TipoArea" AS ENUM ('PRODUCAO', 'MANUTENCAO', 'ARMAZENAGEM', 'LOGISTICA', 'UTILIDADES', 'LABORATORIO', 'OBRA', 'ADMINISTRATIVO', 'AREA_EXTERNA', 'OUTRO');

-- CreateEnum
CREATE TYPE "CriticidadeArea" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "SituacaoArea" AS ENUM ('ATIVA', 'INATIVA');

-- CreateTable
CREATE TABLE "area" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "setor" VARCHAR(80),
    "nome" VARCHAR(120) NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "tipo" "TipoArea" NOT NULL,
    "descricao" VARCHAR(500),
    "tokenQr" VARCHAR(16) NOT NULL,
    "criticidade" "CriticidadeArea" NOT NULL,
    "riscosPresentes" VARCHAR(300),
    "exigeAutorizacaoEntrada" BOOLEAN NOT NULL DEFAULT false,
    "exigePermissaoTrabalho" BOOLEAN NOT NULL DEFAULT false,
    "responsavelNome" VARCHAR(120),
    "responsavelCargo" VARCHAR(80),
    "responsavelEmail" VARCHAR(150),
    "responsavelTelefone" VARCHAR(11),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "pontoReferencia" VARCHAR(150),
    "frequenciaInspecaoDias" INTEGER NOT NULL DEFAULT 30,
    "situacao" "SituacaoArea" NOT NULL DEFAULT 'ATIVA',
    "observacoes" VARCHAR(1000),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "area_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "area_tokenQr_key" ON "area"("tokenQr");

-- CreateIndex
CREATE INDEX "area_clienteId_situacao_idx" ON "area"("clienteId", "situacao");

-- CreateIndex
CREATE INDEX "area_clienteId_criticidade_idx" ON "area"("clienteId", "criticidade");

-- CreateIndex
CREATE UNIQUE INDEX "area_clienteId_codigo_key" ON "area"("clienteId", "codigo");

-- AddForeignKey
ALTER TABLE "area" ADD CONSTRAINT "area_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
