-- CreateEnum
CREATE TYPE "MotivoEntregaEpi" AS ENUM ('PRIMEIRA_ENTREGA', 'SUBSTITUICAO', 'PERDA', 'DANIFICADO');

-- CreateTable
CREATE TABLE "epi" (
    "id" TEXT NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "ca" VARCHAR(20) NOT NULL,
    "validadeCa" DATE,
    "fornecedor" VARCHAR(120),
    "custoUnitario" DECIMAL(10,2),
    "vidaUtilMeses" INTEGER,
    "estoqueAtual" INTEGER NOT NULL DEFAULT 0,
    "estoqueMinimo" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "epi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entrega_epi" (
    "id" TEXT NOT NULL,
    "epiId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "motivo" "MotivoEntregaEpi" NOT NULL DEFAULT 'PRIMEIRA_ENTREGA',
    "observacoes" VARCHAR(500),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entrega_epi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "epi_validadeCa_idx" ON "epi"("validadeCa");

-- CreateIndex
CREATE UNIQUE INDEX "epi_nome_ca_key" ON "epi"("nome", "ca");

-- CreateIndex
CREATE INDEX "entrega_epi_colaboradorId_data_idx" ON "entrega_epi"("colaboradorId", "data");

-- CreateIndex
CREATE INDEX "entrega_epi_epiId_data_idx" ON "entrega_epi"("epiId", "data");

-- AddForeignKey
ALTER TABLE "entrega_epi" ADD CONSTRAINT "entrega_epi_epiId_fkey" FOREIGN KEY ("epiId") REFERENCES "epi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrega_epi" ADD CONSTRAINT "entrega_epi_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
