-- CreateEnum
CREATE TYPE "PorteEmpresa" AS ENUM ('MEI', 'ME', 'EPP', 'MEDIO', 'GRANDE');

-- CreateEnum
CREATE TYPE "SituacaoContrato" AS ENUM ('ATIVO', 'SUSPENSO', 'ENCERRADO');

-- CreateTable
CREATE TABLE "cliente" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "razaoSocial" VARCHAR(150) NOT NULL,
    "nomeFantasia" VARCHAR(120) NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "inscricaoEstadual" VARCHAR(20),
    "inscricaoMunicipal" VARCHAR(20),
    "cnaePrincipal" VARCHAR(7),
    "porte" "PorteEmpresa",
    "segmento" VARCHAR(80),
    "site" VARCHAR(150),
    "numeroContrato" VARCHAR(40) NOT NULL,
    "dataInicioContrato" DATE NOT NULL,
    "dataFimContrato" DATE,
    "situacao" "SituacaoContrato" NOT NULL DEFAULT 'ATIVO',
    "escopoServicos" VARCHAR(500),
    "valorMensal" DECIMAL(12,2),
    "diaVencimento" SMALLINT,
    "consultorResponsavel" VARCHAR(120),
    "grauRisco" INTEGER NOT NULL,
    "quantidadeFuncionarios" INTEGER NOT NULL,
    "metaIndiceGlobal" DECIMAL(5,2) NOT NULL DEFAULT 85,
    "possuiCipa" BOOLEAN NOT NULL DEFAULT false,
    "possuiSesmt" BOOLEAN NOT NULL DEFAULT false,
    "contatoNome" VARCHAR(120) NOT NULL,
    "contatoCargo" VARCHAR(80),
    "contatoEmail" VARCHAR(150) NOT NULL,
    "contatoTelefone" VARCHAR(11) NOT NULL,
    "contatoWhatsapp" VARCHAR(11),
    "cep" VARCHAR(8) NOT NULL,
    "logradouro" VARCHAR(150) NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "complemento" VARCHAR(80),
    "bairro" VARCHAR(80) NOT NULL,
    "cidade" VARCHAR(80) NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "logoUrl" VARCHAR(300),
    "corDestaque" VARCHAR(7) NOT NULL DEFAULT '#2563eb',
    "observacoes" VARCHAR(1000),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cliente_empresaId_situacao_idx" ON "cliente"("empresaId", "situacao");

-- CreateIndex
CREATE INDEX "cliente_empresaId_nomeFantasia_idx" ON "cliente"("empresaId", "nomeFantasia");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_empresaId_cnpj_key" ON "cliente"("empresaId", "cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_empresaId_numeroContrato_key" ON "cliente"("empresaId", "numeroContrato");

-- AddForeignKey
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresa_consultoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
