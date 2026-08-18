-- CreateEnum
CREATE TYPE "MedidaDisciplinar" AS ENUM ('ORIENTACAO_VERBAL', 'ADVERTENCIA_ESCRITA', 'SUSPENSAO', 'DESLIGAMENTO', 'RECICLAGEM_TREINAMENTO');

-- CreateEnum
CREATE TYPE "MotivacaoConsequencia" AS ENUM ('CLIENTE', 'INTERNA', 'AUDITORIA', 'REINCIDENCIA');

-- CreateTable
CREATE TABLE "consequencia" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "observacaoId" TEXT,
    "liderNome" VARCHAR(120) NOT NULL,
    "data" DATE NOT NULL,
    "comportamento" VARCHAR(200) NOT NULL,
    "detalhamento" VARCHAR(2000) NOT NULL,
    "medida" "MedidaDisciplinar" NOT NULL,
    "motivacao" "MotivacaoConsequencia" NOT NULL DEFAULT 'INTERNA',
    "responsavelSst" VARCHAR(120),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consequencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consequencia_colaboradorId_data_idx" ON "consequencia"("colaboradorId", "data");

-- AddForeignKey
ALTER TABLE "consequencia" ADD CONSTRAINT "consequencia_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consequencia" ADD CONSTRAINT "consequencia_observacaoId_fkey" FOREIGN KEY ("observacaoId") REFERENCES "observacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
