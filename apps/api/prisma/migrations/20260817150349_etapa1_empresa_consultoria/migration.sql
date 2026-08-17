-- CreateEnum
CREATE TYPE "TipoRegistroRt" AS ENUM ('CREA', 'CRM', 'CREFITO', 'COREN', 'CRQ', 'MTE', 'OUTRO');

-- CreateEnum
CREATE TYPE "RegimeTributario" AS ENUM ('SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'MEI');

-- CreateEnum
CREATE TYPE "AcaoAuditoria" AS ENUM ('CRIACAO', 'ATUALIZACAO', 'EXCLUSAO');

-- CreateTable
CREATE TABLE "empresa_consultoria" (
    "id" TEXT NOT NULL,
    "chaveMatriz" TEXT NOT NULL DEFAULT 'MATRIZ',
    "razaoSocial" VARCHAR(150) NOT NULL,
    "nomeFantasia" VARCHAR(120) NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "inscricaoEstadual" VARCHAR(20),
    "inscricaoMunicipal" VARCHAR(20),
    "cnaePrincipal" VARCHAR(7),
    "naturezaJuridica" VARCHAR(120),
    "regimeTributario" "RegimeTributario",
    "dataFundacao" DATE,
    "email" VARCHAR(150) NOT NULL,
    "emailFinanceiro" VARCHAR(150),
    "telefone" VARCHAR(11) NOT NULL,
    "whatsapp" VARCHAR(11),
    "site" VARCHAR(150),
    "cep" VARCHAR(8) NOT NULL,
    "logradouro" VARCHAR(150) NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "complemento" VARCHAR(80),
    "bairro" VARCHAR(80) NOT NULL,
    "cidade" VARCHAR(80) NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "responsavelTecnicoNome" VARCHAR(120) NOT NULL,
    "responsavelTecnicoCargo" VARCHAR(80),
    "responsavelTecnicoTipoRegistro" "TipoRegistroRt" NOT NULL,
    "responsavelTecnicoRegistro" VARCHAR(40) NOT NULL,
    "responsavelTecnicoUfRegistro" CHAR(2),
    "responsavelTecnicoEmail" VARCHAR(150),
    "responsavelTecnicoTelefone" VARCHAR(11),
    "logoUrl" VARCHAR(300),
    "corPrimaria" VARCHAR(7) NOT NULL DEFAULT '#059669',
    "corSecundaria" VARCHAR(7) NOT NULL DEFAULT '#0e1a2b',
    "assinaturaEmail" VARCHAR(500),
    "rodapeRelatorio" VARCHAR(500),
    "cabecalhoWhatsapp" VARCHAR(160),
    "timezone" VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresa_consultoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registro_auditoria" (
    "id" TEXT NOT NULL,
    "entidade" VARCHAR(60) NOT NULL,
    "entidadeId" VARCHAR(60) NOT NULL,
    "acao" "AcaoAuditoria" NOT NULL,
    "alteracoes" JSONB,
    "autor" VARCHAR(150),
    "ip" VARCHAR(60),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresa_consultoria_chaveMatriz_key" ON "empresa_consultoria"("chaveMatriz");

-- CreateIndex
CREATE UNIQUE INDEX "empresa_consultoria_cnpj_key" ON "empresa_consultoria"("cnpj");

-- CreateIndex
CREATE INDEX "registro_auditoria_entidade_entidadeId_criadoEm_idx" ON "registro_auditoria"("entidade", "entidadeId", "criadoEm");
