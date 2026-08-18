-- CreateEnum
CREATE TYPE "TipoAuditoria" AS ENUM ('ISO_45001', 'ISO_14001', 'ISO_50001', 'INTERNA', 'CLIENTE', 'LEGAL');

-- CreateEnum
CREATE TYPE "SituacaoAuditoria" AS ENUM ('PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateTable
CREATE TABLE "auditoria" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" "TipoAuditoria" NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "dataRealizacao" DATE NOT NULL,
    "auditor" VARCHAR(120),
    "referencia" VARCHAR(120),
    "situacao" "SituacaoAuditoria" NOT NULL DEFAULT 'PLANEJADA',
    "requisitosAvaliados" INTEGER,
    "requisitosAtendidos" INTEGER,
    "ncMaiores" INTEGER NOT NULL DEFAULT 0,
    "ncMenores" INTEGER NOT NULL DEFAULT 0,
    "oportunidadesMelhoria" INTEGER NOT NULL DEFAULT 0,
    "observacoes" VARCHAR(1000),
    "relatorioUrl" VARCHAR(300),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auditoria_clienteId_dataRealizacao_idx" ON "auditoria"("clienteId", "dataRealizacao");

-- CreateIndex
CREATE INDEX "auditoria_tipo_situacao_idx" ON "auditoria"("tipo", "situacao");

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
