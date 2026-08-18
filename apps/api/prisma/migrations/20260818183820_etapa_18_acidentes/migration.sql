-- CreateEnum
CREATE TYPE "TipoAcidente" AS ENUM ('TIPICO', 'TRAJETO', 'DOENCA_OCUPACIONAL');

-- CreateEnum
CREATE TYPE "SituacaoInvestigacao" AS ENUM ('ABERTA', 'EM_INVESTIGACAO', 'CONCLUIDA');

-- AlterEnum
ALTER TYPE "AbrangenciaDocumento" ADD VALUE 'OCORRENCIA';

-- AlterTable
ALTER TABLE "documento_ssma" ADD COLUMN     "observacaoId" TEXT;

-- CreateTable
CREATE TABLE "acidente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "areaId" TEXT,
    "colaboradorId" TEXT,
    "observacaoId" TEXT,
    "planoAcaoId" TEXT,
    "data" DATE NOT NULL,
    "tipo" "TipoAcidente" NOT NULL,
    "descricao" VARCHAR(2000) NOT NULL,
    "parteCorpoAtingida" VARCHAR(120),
    "comAfastamento" BOOLEAN NOT NULL DEFAULT false,
    "diasAfastamento" INTEGER NOT NULL DEFAULT 0,
    "catNumero" VARCHAR(40),
    "catEmitidaEm" DATE,
    "situacaoInvestigacao" "SituacaoInvestigacao" NOT NULL DEFAULT 'ABERTA',
    "investigador" VARCHAR(120),
    "causaRaiz" VARCHAR(1000),
    "fatoresContribuintes" VARCHAR(1000),
    "investigacaoConcluidaEm" DATE,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acidente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "acidente_clienteId_data_idx" ON "acidente"("clienteId", "data");

-- AddForeignKey
ALTER TABLE "documento_ssma" ADD CONSTRAINT "documento_ssma_observacaoId_fkey" FOREIGN KEY ("observacaoId") REFERENCES "observacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acidente" ADD CONSTRAINT "acidente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acidente" ADD CONSTRAINT "acidente_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acidente" ADD CONSTRAINT "acidente_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acidente" ADD CONSTRAINT "acidente_observacaoId_fkey" FOREIGN KEY ("observacaoId") REFERENCES "observacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acidente" ADD CONSTRAINT "acidente_planoAcaoId_fkey" FOREIGN KEY ("planoAcaoId") REFERENCES "plano_acao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
