-- CreateEnum
CREATE TYPE "TipoAfastamento" AS ENUM ('DOENCA_COMUM', 'DOENCA_OCUPACIONAL', 'ACIDENTE_TRABALHO', 'ACIDENTE_TRAJETO', 'MATERNIDADE', 'PATERNIDADE', 'LICENCA_TRATAMENTO', 'OUTRO');

-- AlterTable
ALTER TABLE "area" ADD COLUMN     "coordPlantaX" DOUBLE PRECISION,
ADD COLUMN     "coordPlantaY" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "cliente" ADD COLUMN     "imagemPlantaUrl" VARCHAR(300);

-- CreateTable
CREATE TABLE "afastamento" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "acidenteId" TEXT,
    "tipo" "TipoAfastamento" NOT NULL,
    "dataInicio" DATE NOT NULL,
    "dataFim" DATE,
    "diasAfastamento" INTEGER NOT NULL DEFAULT 0,
    "cid" VARCHAR(10),
    "descricao" VARCHAR(500),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "afastamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "afastamento_clienteId_dataInicio_idx" ON "afastamento"("clienteId", "dataInicio");

-- CreateIndex
CREATE INDEX "afastamento_colaboradorId_dataInicio_idx" ON "afastamento"("colaboradorId", "dataInicio");

-- AddForeignKey
ALTER TABLE "afastamento" ADD CONSTRAINT "afastamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afastamento" ADD CONSTRAINT "afastamento_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afastamento" ADD CONSTRAINT "afastamento_acidenteId_fkey" FOREIGN KEY ("acidenteId") REFERENCES "acidente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
