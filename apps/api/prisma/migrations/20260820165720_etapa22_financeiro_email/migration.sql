-- CreateTable
CREATE TABLE "parametros_financeiros" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT,
    "custoAcidenteComAfastamento" DOUBLE PRECISION NOT NULL DEFAULT 50000,
    "custoAcidenteSemAfastamento" DOUBLE PRECISION NOT NULL DEFAULT 5000,
    "custoDiaAfastamento" DOUBLE PRECISION NOT NULL DEFAULT 300,
    "custoHoraParadaProducao" DOUBLE PRECISION NOT NULL DEFAULT 2000,
    "custoMultaNrMedia" DOUBLE PRECISION NOT NULL DEFAULT 20000,
    "fatorPreventivoBbs" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "valorContratoMensal" DOUBLE PRECISION,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parametros_financeiros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parametros_financeiros_clienteId_key" ON "parametros_financeiros"("clienteId");

-- AddForeignKey
ALTER TABLE "parametros_financeiros" ADD CONSTRAINT "parametros_financeiros_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
