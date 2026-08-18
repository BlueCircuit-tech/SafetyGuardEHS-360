-- CreateEnum
CREATE TYPE "VinculoColaborador" AS ENUM ('CLIENTE', 'TERCEIRO', 'CONSULTORIA');

-- CreateEnum
CREATE TYPE "SituacaoColaborador" AS ENUM ('ATIVO', 'AFASTADO', 'DESLIGADO');

-- CreateEnum
CREATE TYPE "GrauRiscoFuncao" AS ENUM ('BAIXO', 'MEDIO', 'ALTO');

-- CreateEnum
CREATE TYPE "TipoAso" AS ENUM ('ADMISSIONAL', 'PERIODICO', 'RETORNO_AO_TRABALHO', 'MUDANCA_DE_RISCO', 'DEMISSIONAL');

-- CreateEnum
CREATE TYPE "ResultadoAso" AS ENUM ('APTO', 'APTO_COM_RESTRICAO', 'INAPTO');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('PGR', 'PCMSO', 'LTCAT', 'PPP', 'PCA', 'PPR', 'LAUDO_INSALUBRIDADE', 'LAUDO_PERICULOSIDADE', 'LAUDO_ERGONOMICO', 'AVCB', 'LICENCA_AMBIENTAL', 'ART_RT', 'CERTIFICADO_TREINAMENTO', 'PROCEDIMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "AbrangenciaDocumento" AS ENUM ('CLIENTE', 'AREA', 'TERCEIRO', 'COLABORADOR');

-- CreateEnum
CREATE TYPE "SituacaoDocumento" AS ENUM ('ATIVO', 'SUBSTITUIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "colaborador" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vinculo" "VinculoColaborador" NOT NULL,
    "terceiroId" TEXT,
    "areaId" TEXT,
    "nome" VARCHAR(120) NOT NULL,
    "cpf" VARCHAR(11) NOT NULL,
    "matricula" VARCHAR(30),
    "dataNascimento" DATE,
    "funcao" VARCHAR(80) NOT NULL,
    "setor" VARCHAR(80),
    "grauRisco" "GrauRiscoFuncao" NOT NULL DEFAULT 'MEDIO',
    "riscosOcupacionais" VARCHAR(300),
    "dataAdmissao" DATE,
    "dataDesligamento" DATE,
    "email" VARCHAR(150),
    "telefone" VARCHAR(11),
    "situacao" "SituacaoColaborador" NOT NULL DEFAULT 'ATIVO',
    "observacoes" VARCHAR(1000),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aso" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo" "TipoAso" NOT NULL,
    "dataExame" DATE NOT NULL,
    "validade" DATE,
    "resultado" "ResultadoAso" NOT NULL,
    "restricoes" VARCHAR(500),
    "medicoNome" VARCHAR(120) NOT NULL,
    "medicoCrm" VARCHAR(20) NOT NULL,
    "medicoCoordenador" VARCHAR(120),
    "riscosAvaliados" VARCHAR(300),
    "examesComplementares" VARCHAR(500),
    "observacoes" VARCHAR(1000),
    "arquivoUrl" VARCHAR(300),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento_ssma" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "abrangencia" "AbrangenciaDocumento" NOT NULL,
    "areaId" TEXT,
    "terceiroId" TEXT,
    "colaboradorId" TEXT,
    "tipo" "TipoDocumento" NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "numero" VARCHAR(50),
    "revisao" VARCHAR(20),
    "descricao" VARCHAR(1000),
    "dataEmissao" DATE NOT NULL,
    "validade" DATE,
    "responsavelNome" VARCHAR(120),
    "responsavelRegistro" VARCHAR(40),
    "numeroArt" VARCHAR(40),
    "situacao" "SituacaoDocumento" NOT NULL DEFAULT 'ATIVO',
    "observacoes" VARCHAR(1000),
    "arquivoUrl" VARCHAR(300),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documento_ssma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "colaborador_clienteId_situacao_idx" ON "colaborador"("clienteId", "situacao");

-- CreateIndex
CREATE INDEX "colaborador_terceiroId_idx" ON "colaborador"("terceiroId");

-- CreateIndex
CREATE UNIQUE INDEX "colaborador_clienteId_cpf_key" ON "colaborador"("clienteId", "cpf");

-- CreateIndex
CREATE INDEX "aso_colaboradorId_dataExame_idx" ON "aso"("colaboradorId", "dataExame");

-- CreateIndex
CREATE INDEX "aso_validade_idx" ON "aso"("validade");

-- CreateIndex
CREATE INDEX "documento_ssma_clienteId_situacao_idx" ON "documento_ssma"("clienteId", "situacao");

-- CreateIndex
CREATE INDEX "documento_ssma_clienteId_tipo_idx" ON "documento_ssma"("clienteId", "tipo");

-- CreateIndex
CREATE INDEX "documento_ssma_validade_idx" ON "documento_ssma"("validade");

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_terceiroId_fkey" FOREIGN KEY ("terceiroId") REFERENCES "terceiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aso" ADD CONSTRAINT "aso_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_ssma" ADD CONSTRAINT "documento_ssma_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_ssma" ADD CONSTRAINT "documento_ssma_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_ssma" ADD CONSTRAINT "documento_ssma_terceiroId_fkey" FOREIGN KEY ("terceiroId") REFERENCES "terceiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_ssma" ADD CONSTRAINT "documento_ssma_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
