-- CreateEnum
CREATE TYPE "TipoCentroNegocio" AS ENUM ('REGIONAL', 'UNIDADE', 'TIPO_CONTRATO', 'DIVISAO');

-- CreateEnum
CREATE TYPE "SituacaoCentro" AS ENUM ('ATIVO', 'INATIVO');

-- AlterTable
ALTER TABLE "cliente" ADD COLUMN     "centroNegocioId" TEXT;

-- CreateTable
CREATE TABLE "centro_negocio" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "tipo" "TipoCentroNegocio" NOT NULL,
    "descricao" VARCHAR(500),
    "responsavelNome" VARCHAR(120) NOT NULL,
    "responsavelCargo" VARCHAR(80),
    "responsavelEmail" VARCHAR(150) NOT NULL,
    "responsavelTelefone" VARCHAR(11),
    "responsavelWhatsapp" VARCHAR(11),
    "cidade" VARCHAR(80),
    "uf" CHAR(2),
    "metaIndiceGlobal" DECIMAL(5,2) NOT NULL DEFAULT 85,
    "situacao" "SituacaoCentro" NOT NULL DEFAULT 'ATIVO',
    "corDestaque" VARCHAR(7) NOT NULL DEFAULT '#0e1a2b',
    "observacoes" VARCHAR(1000),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "centro_negocio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "centro_negocio_empresaId_situacao_idx" ON "centro_negocio"("empresaId", "situacao");

-- CreateIndex
CREATE INDEX "centro_negocio_empresaId_nome_idx" ON "centro_negocio"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "centro_negocio_empresaId_codigo_key" ON "centro_negocio"("empresaId", "codigo");

-- CreateIndex
CREATE INDEX "cliente_centroNegocioId_idx" ON "cliente"("centroNegocioId");

-- AddForeignKey
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_centroNegocioId_fkey" FOREIGN KEY ("centroNegocioId") REFERENCES "centro_negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "centro_negocio" ADD CONSTRAINT "centro_negocio_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa_consultoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
