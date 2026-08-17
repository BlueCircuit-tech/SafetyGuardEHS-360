-- CreateEnum
CREATE TYPE "SituacaoTerceiro" AS ENUM ('ATIVO', 'SUSPENSO', 'BLOQUEADO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "TipoVinculoTerceiro" AS ENUM ('CONTRATO', 'ORDEM_SERVICO', 'OBRA', 'SERVICO_EVENTUAL');

-- CreateTable
CREATE TABLE "terceiro" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "razaoSocial" VARCHAR(150) NOT NULL,
    "nomeFantasia" VARCHAR(120) NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "inscricaoEstadual" VARCHAR(20),
    "cnaePrincipal" VARCHAR(7),
    "porte" "PorteEmpresa",
    "atividadePrincipal" VARCHAR(120) NOT NULL,
    "tipoVinculo" "TipoVinculoTerceiro" NOT NULL DEFAULT 'CONTRATO',
    "numeroContrato" VARCHAR(40),
    "dataInicioAtuacao" DATE NOT NULL,
    "dataFimAtuacao" DATE,
    "situacao" "SituacaoTerceiro" NOT NULL DEFAULT 'ATIVO',
    "escopoServicos" VARCHAR(500),
    "areasAtuacao" VARCHAR(300),
    "quantidadeFuncionarios" INTEGER NOT NULL,
    "grauRisco" INTEGER NOT NULL,
    "notaSsma" DECIMAL(5,2),
    "dataUltimaAvaliacao" DATE,
    "metaNotaSsma" DECIMAL(5,2) NOT NULL DEFAULT 85,
    "possuiPgr" BOOLEAN NOT NULL DEFAULT false,
    "possuiPcmso" BOOLEAN NOT NULL DEFAULT false,
    "documentacaoValidaAte" DATE,
    "responsavelNome" VARCHAR(120) NOT NULL,
    "responsavelCargo" VARCHAR(80),
    "responsavelEmail" VARCHAR(150) NOT NULL,
    "responsavelTelefone" VARCHAR(11) NOT NULL,
    "responsavelWhatsapp" VARCHAR(11),
    "cep" VARCHAR(8),
    "logradouro" VARCHAR(150),
    "numero" VARCHAR(20),
    "complemento" VARCHAR(80),
    "bairro" VARCHAR(80),
    "cidade" VARCHAR(80),
    "uf" CHAR(2),
    "logoUrl" VARCHAR(300),
    "corDestaque" VARCHAR(7) NOT NULL DEFAULT '#7c3aed',
    "observacoes" VARCHAR(1000),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terceiro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "terceiro_clienteId_situacao_idx" ON "terceiro"("clienteId", "situacao");

-- CreateIndex
CREATE INDEX "terceiro_clienteId_nomeFantasia_idx" ON "terceiro"("clienteId", "nomeFantasia");

-- CreateIndex
CREATE INDEX "terceiro_notaSsma_idx" ON "terceiro"("notaSsma");

-- CreateIndex
CREATE UNIQUE INDEX "terceiro_clienteId_cnpj_key" ON "terceiro"("clienteId", "cnpj");

-- AddForeignKey
ALTER TABLE "terceiro" ADD CONSTRAINT "terceiro_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
