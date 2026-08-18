-- CreateTable
CREATE TABLE "treinamento" (
    "id" TEXT NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "norma" VARCHAR(40),
    "descricao" VARCHAR(500),
    "cargaHorariaHoras" DECIMAL(6,1) NOT NULL,
    "validadeMeses" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treinamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisito_capacitacao" (
    "id" TEXT NOT NULL,
    "funcao" VARCHAR(80) NOT NULL,
    "treinamentoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requisito_capacitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treinamento_realizado" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "treinamentoId" TEXT NOT NULL,
    "dataRealizacao" DATE NOT NULL,
    "validade" DATE,
    "instrutor" VARCHAR(120),
    "cargaHorariaHoras" DECIMAL(6,1),
    "observacoes" VARCHAR(500),
    "certificadoUrl" VARCHAR(300),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treinamento_realizado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "treinamento_nome_key" ON "treinamento"("nome");

-- CreateIndex
CREATE INDEX "requisito_capacitacao_funcao_idx" ON "requisito_capacitacao"("funcao");

-- CreateIndex
CREATE UNIQUE INDEX "requisito_capacitacao_funcao_treinamentoId_key" ON "requisito_capacitacao"("funcao", "treinamentoId");

-- CreateIndex
CREATE INDEX "treinamento_realizado_colaboradorId_treinamentoId_dataReali_idx" ON "treinamento_realizado"("colaboradorId", "treinamentoId", "dataRealizacao");

-- CreateIndex
CREATE INDEX "treinamento_realizado_validade_idx" ON "treinamento_realizado"("validade");

-- AddForeignKey
ALTER TABLE "requisito_capacitacao" ADD CONSTRAINT "requisito_capacitacao_treinamentoId_fkey" FOREIGN KEY ("treinamentoId") REFERENCES "treinamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treinamento_realizado" ADD CONSTRAINT "treinamento_realizado_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treinamento_realizado" ADD CONSTRAINT "treinamento_realizado_treinamentoId_fkey" FOREIGN KEY ("treinamentoId") REFERENCES "treinamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
