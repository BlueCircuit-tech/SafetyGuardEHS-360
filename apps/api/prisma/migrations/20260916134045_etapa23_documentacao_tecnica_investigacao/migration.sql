-- CreateEnum
CREATE TYPE "SituacaoOs" AS ENUM ('EMITIDA', 'ASSINADA', 'SUBSTITUIDA');

-- CreateEnum
CREATE TYPE "SituacaoApr" AS ENUM ('RASCUNHO', 'APROVADA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "ResultadoChecklist" AS ENUM ('APTO', 'NAO_APTO');

-- AlterTable
ALTER TABLE "acidente" ADD COLUMN     "cincoPorques" JSONB,
ADD COLUMN     "ishikawa" JSONB;

-- AlterTable
ALTER TABLE "documento_ssma" ADD COLUMN     "versao" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "versaoAnteriorId" TEXT,
ADD COLUMN     "vigente" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "observacao" ADD COLUMN     "assinaturaEm" TIMESTAMP(3),
ADD COLUMN     "assinaturaHash" VARCHAR(64),
ADD COLUMN     "assinaturaPor" VARCHAR(120);

-- CreateTable
CREATE TABLE "ordem_servico" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "funcao" VARCHAR(80) NOT NULL,
    "setor" VARCHAR(80),
    "grauRisco" "GrauRiscoFuncao" NOT NULL,
    "riscos" JSONB NOT NULL,
    "episObrigatorios" JSONB NOT NULL,
    "treinamentosExigidos" JSONB NOT NULL,
    "medidasPreventivas" VARCHAR(2000),
    "situacao" "SituacaoOs" NOT NULL DEFAULT 'EMITIDA',
    "geradaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geradaPor" VARCHAR(120) NOT NULL,
    "cienciaEm" TIMESTAMP(3),
    "cienciaAssinaturaUrl" VARCHAR(300),
    "cienciaHash" VARCHAR(64),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordem_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apr" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "areaId" TEXT,
    "terceiroId" TEXT,
    "codigo" VARCHAR(20) NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "atividade" VARCHAR(200) NOT NULL,
    "local" VARCHAR(200),
    "dataInicio" DATE NOT NULL,
    "dataFim" DATE,
    "responsavel" VARCHAR(120) NOT NULL,
    "etapas" JSONB NOT NULL,
    "situacao" "SituacaoApr" NOT NULL DEFAULT 'RASCUNHO',
    "aprovadaPor" VARCHAR(120),
    "aprovadaEm" TIMESTAMP(3),
    "aprovacaoHash" VARCHAR(64),
    "arquivoUrl" VARCHAR(300),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelo_checklist" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "tipoEquipamento" VARCHAR(80) NOT NULL,
    "itens" JSONB NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelo_checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execucao_checklist" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "areaId" TEXT,
    "colaboradorId" TEXT,
    "equipamentoIdentificacao" VARCHAR(120) NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executadoPor" VARCHAR(120) NOT NULL,
    "respostas" JSONB NOT NULL,
    "resultado" "ResultadoChecklist" NOT NULL,
    "fotoUrl" VARCHAR(300),
    "hash" VARCHAR(64),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execucao_checklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ordem_servico_codigo_key" ON "ordem_servico"("codigo");

-- CreateIndex
CREATE INDEX "ordem_servico_clienteId_situacao_idx" ON "ordem_servico"("clienteId", "situacao");

-- CreateIndex
CREATE INDEX "ordem_servico_colaboradorId_versao_idx" ON "ordem_servico"("colaboradorId", "versao");

-- CreateIndex
CREATE INDEX "apr_clienteId_situacao_idx" ON "apr"("clienteId", "situacao");

-- CreateIndex
CREATE INDEX "apr_areaId_dataInicio_idx" ON "apr"("areaId", "dataInicio");

-- CreateIndex
CREATE UNIQUE INDEX "apr_codigo_versao_key" ON "apr"("codigo", "versao");

-- CreateIndex
CREATE INDEX "modelo_checklist_clienteId_ativo_idx" ON "modelo_checklist"("clienteId", "ativo");

-- CreateIndex
CREATE INDEX "execucao_checklist_clienteId_dataHora_idx" ON "execucao_checklist"("clienteId", "dataHora");

-- CreateIndex
CREATE INDEX "execucao_checklist_modeloId_dataHora_idx" ON "execucao_checklist"("modeloId", "dataHora");

-- CreateIndex
CREATE UNIQUE INDEX "documento_ssma_versaoAnteriorId_key" ON "documento_ssma"("versaoAnteriorId");

-- CreateIndex
CREATE INDEX "documento_ssma_clienteId_vigente_idx" ON "documento_ssma"("clienteId", "vigente");

-- AddForeignKey
ALTER TABLE "documento_ssma" ADD CONSTRAINT "documento_ssma_versaoAnteriorId_fkey" FOREIGN KEY ("versaoAnteriorId") REFERENCES "documento_ssma"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordem_servico" ADD CONSTRAINT "ordem_servico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordem_servico" ADD CONSTRAINT "ordem_servico_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apr" ADD CONSTRAINT "apr_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apr" ADD CONSTRAINT "apr_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apr" ADD CONSTRAINT "apr_terceiroId_fkey" FOREIGN KEY ("terceiroId") REFERENCES "terceiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modelo_checklist" ADD CONSTRAINT "modelo_checklist_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucao_checklist" ADD CONSTRAINT "execucao_checklist_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucao_checklist" ADD CONSTRAINT "execucao_checklist_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "modelo_checklist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucao_checklist" ADD CONSTRAINT "execucao_checklist_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucao_checklist" ADD CONSTRAINT "execucao_checklist_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

