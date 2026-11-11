-- CreateEnum
CREATE TYPE "TipoLancamento" AS ENUM ('RECEITA', 'DESPESA');

-- CreateEnum
CREATE TYPE "SituacaoLancamento" AS ENUM ('PENDENTE', 'PAGO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "SituacaoCipa" AS ENUM ('PLANEJAMENTO', 'PROCESSO_ELEITORAL', 'EM_MANDATO', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "FuncaoBrigada" AS ENUM ('COORDENADOR', 'CHEFE', 'LIDER', 'BRIGADISTA');

-- CreateEnum
CREATE TYPE "TipoExtintor" AS ENUM ('AGUA', 'PO_ABC', 'PO_BC', 'CO2', 'ESPUMA', 'CLASSE_K', 'OUTRO');

-- CreateEnum
CREATE TYPE "SituacaoExtintor" AS ENUM ('OK', 'VENCIDO', 'EM_MANUTENCAO', 'OBSTRUIDO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoDocumento" ADD VALUE 'FICHA_REGISTRO';
ALTER TYPE "TipoDocumento" ADD VALUE 'CONTRATO_TRABALHO';
ALTER TYPE "TipoDocumento" ADD VALUE 'ACORDO_COMPENSACAO_HORAS';
ALTER TYPE "TipoDocumento" ADD VALUE 'ORDEM_SERVICO';
ALTER TYPE "TipoDocumento" ADD VALUE 'FICHA_EPI';
ALTER TYPE "TipoDocumento" ADD VALUE 'PGRSS';
ALTER TYPE "TipoDocumento" ADD VALUE 'PGRS';
ALTER TYPE "TipoDocumento" ADD VALUE 'CTR_MANIFESTO';
ALTER TYPE "TipoDocumento" ADD VALUE 'INVENTARIO_RESIDUOS';

-- AlterTable
ALTER TABLE "acidente" ADD COLUMN     "diasDebitados" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lesaoPermanente" VARCHAR(40),
ALTER COLUMN "parteCorpoAtingida" SET DATA TYPE VARCHAR(300);

-- AlterTable
ALTER TABLE "afastamento" ADD COLUMN     "funcao" VARCHAR(80),
ADD COLUMN     "liderNome" VARCHAR(120),
ADD COLUMN     "providencias" JSONB,
ADD COLUMN     "setor" VARCHAR(80);

-- AlterTable
ALTER TABLE "apr" ADD COLUMN     "modelo" VARCHAR(10) NOT NULL DEFAULT 'APR',
ADD COLUMN     "tiposServico" JSONB;

-- AlterTable
ALTER TABLE "cliente" ADD COLUMN     "tokenQr" VARCHAR(64);

-- AlterTable
ALTER TABLE "colaborador" ADD COLUMN     "bloqueado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bloqueadoEm" TIMESTAMP(3),
ADD COLUMN     "fotoUrl" VARCHAR(300),
ADD COLUMN     "liderNome" VARCHAR(120),
ADD COLUMN     "motivoBloqueio" VARCHAR(300),
ADD COLUMN     "tokenCarteirinha" VARCHAR(64);

-- AlterTable
ALTER TABLE "empresa_consultoria" ADD COLUMN     "textoPadraoOs" TEXT,
ADD COLUMN     "urlPlataformaTreinamentos" VARCHAR(300);

-- AlterTable
ALTER TABLE "entrega_epi" ADD COLUMN     "assinaturaEm" TIMESTAMP(3),
ADD COLUMN     "assinaturaHash" VARCHAR(64),
ADD COLUMN     "assinaturaUrl" VARCHAR(300),
ADD COLUMN     "validadeTroca" DATE;

-- AlterTable
ALTER TABLE "epi" ADD COLUMN     "categoria" VARCHAR(60),
ADD COLUMN     "estoqueReferencia" INTEGER;

-- AlterTable
ALTER TABLE "ordem_servico" ADD COLUMN     "arquivoAssinadoUrl" VARCHAR(300);

-- AlterTable
ALTER TABLE "plano_acao" ADD COLUMN     "cobrancaChefiaEm" TIMESTAMP(3),
ADD COLUMN     "fotoInicialUrl" VARCHAR(300);

-- AlterTable
ALTER TABLE "registro_dds" ADD COLUMN     "conteudo" TEXT,
ADD COLUMN     "geradoPorIa" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "valorHora" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "contato_cliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "cargo" VARCHAR(80),
    "nivel" VARCHAR(30) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "telefone" VARCHAR(11),
    "whatsapp" VARCHAR(11),
    "recebeAlertas" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" VARCHAR(300),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contato_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anexo_epi" (
    "id" TEXT NOT NULL,
    "epiId" TEXT NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "tipo" VARCHAR(20) NOT NULL,
    "url" VARCHAR(300) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexo_epi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entrada_epi" (
    "id" TEXT NOT NULL,
    "epiId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "custoUnitario" DECIMAL(10,2),
    "notaFiscal" VARCHAR(40),
    "fornecedor" VARCHAR(120),
    "observacoes" VARCHAR(300),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entrada_epi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fornecedor" (
    "id" TEXT NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "cnpj" VARCHAR(14),
    "categoria" VARCHAR(80),
    "contatoNome" VARCHAR(120),
    "telefone" VARCHAR(11),
    "whatsapp" VARCHAR(11),
    "email" VARCHAR(150),
    "site" VARCHAR(150),
    "observacoes" VARCHAR(500),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamento_financeiro" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT,
    "fornecedorId" TEXT,
    "tipo" "TipoLancamento" NOT NULL,
    "categoria" VARCHAR(80) NOT NULL,
    "descricao" VARCHAR(200) NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "data" DATE NOT NULL,
    "vencimento" DATE,
    "situacao" "SituacaoLancamento" NOT NULL DEFAULT 'PENDENTE',
    "notaFiscal" VARCHAR(40),
    "observacoes" VARCHAR(500),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lancamento_financeiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registro_ponto" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "clienteId" TEXT,
    "data" DATE NOT NULL,
    "entrada" TIMESTAMP(3) NOT NULL,
    "saida" TIMESTAMP(3),
    "intervaloMinutos" INTEGER NOT NULL DEFAULT 0,
    "atividade" VARCHAR(300),
    "horasTrabalhadas" DECIMAL(6,2),
    "valorHora" DECIMAL(10,2),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registro_ponto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cipa" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "gestao" VARCHAR(20) NOT NULL,
    "dataInicioMandato" DATE NOT NULL,
    "dataFimMandato" DATE NOT NULL,
    "situacao" "SituacaoCipa" NOT NULL DEFAULT 'PLANEJAMENTO',
    "cronograma" JSONB,
    "membros" JSONB,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cipa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cipa_documento" (
    "id" TEXT NOT NULL,
    "cipaId" TEXT NOT NULL,
    "tipo" VARCHAR(30) NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "url" VARCHAR(300) NOT NULL,
    "data" DATE,
    "observacoes" VARCHAR(300),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cipa_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacao_ergonomica" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "areaId" TEXT,
    "funcao" VARCHAR(80),
    "data" DATE NOT NULL,
    "avaliador" VARCHAR(120) NOT NULL,
    "tipo" VARCHAR(12) NOT NULL DEFAULT 'CHECKLIST',
    "itens" JSONB NOT NULL,
    "pontuacao" INTEGER,
    "nivelRisco" VARCHAR(10),
    "conclusao" TEXT,
    "recomendacoes" TEXT,
    "arquivoUrl" VARCHAR(300),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avaliacao_ergonomica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produto_quimico" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "areaId" TEXT,
    "nome" VARCHAR(150) NOT NULL,
    "fabricante" VARCHAR(120),
    "numeroCas" VARCHAR(20),
    "estadoFisico" VARCHAR(12),
    "pictogramas" JSONB,
    "palavraAdvertencia" VARCHAR(10),
    "frasesPerigo" VARCHAR(500),
    "classificacao" VARCHAR(200),
    "localArmazenamento" VARCHAR(150),
    "quantidadeEstoque" DECIMAL(12,2),
    "unidade" VARCHAR(10),
    "episNecessarios" VARCHAR(300),
    "medidasControle" VARCHAR(500),
    "fdsUrl" VARCHAR(300),
    "fdsValidade" DATE,
    "observacoes" VARCHAR(500),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produto_quimico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brigadista" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "areaId" TEXT,
    "funcaoBrigada" "FuncaoBrigada" NOT NULL DEFAULT 'BRIGADISTA',
    "turno" VARCHAR(40),
    "dataTreinamento" DATE,
    "validadeTreinamento" DATE,
    "certificadoUrl" VARCHAR(300),
    "fotoUrl" VARCHAR(300),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" VARCHAR(300),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brigadista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extintor" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "areaId" TEXT,
    "numero" VARCHAR(30) NOT NULL,
    "tipo" "TipoExtintor" NOT NULL,
    "capacidade" VARCHAR(20),
    "localizacao" VARCHAR(150) NOT NULL,
    "validadeCarga" DATE,
    "validadeTesteHidrostatico" DATE,
    "ultimaInspecao" DATE,
    "situacao" "SituacaoExtintor" NOT NULL DEFAULT 'OK',
    "observacoes" VARCHAR(300),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extintor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aspecto_ambiental" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "areaId" TEXT,
    "atividade" VARCHAR(150) NOT NULL,
    "aspecto" VARCHAR(150) NOT NULL,
    "impacto" VARCHAR(200) NOT NULL,
    "condicao" VARCHAR(12) NOT NULL DEFAULT 'NORMAL',
    "severidade" INTEGER NOT NULL,
    "probabilidade" INTEGER NOT NULL,
    "significancia" INTEGER NOT NULL,
    "significativo" BOOLEAN NOT NULL DEFAULT false,
    "controles" VARCHAR(500),
    "requisitoLegal" VARCHAR(200),
    "responsavel" VARCHAR(120),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aspecto_ambiental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelo_relatorio" (
    "id" TEXT NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "categoria" VARCHAR(60),
    "descricao" VARCHAR(300),
    "conteudo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelo_relatorio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contato_cliente_clienteId_nivel_idx" ON "contato_cliente"("clienteId", "nivel");

-- CreateIndex
CREATE INDEX "anexo_epi_epiId_idx" ON "anexo_epi"("epiId");

-- CreateIndex
CREATE INDEX "entrada_epi_epiId_data_idx" ON "entrada_epi"("epiId", "data");

-- CreateIndex
CREATE INDEX "fornecedor_nome_idx" ON "fornecedor"("nome");

-- CreateIndex
CREATE INDEX "lancamento_financeiro_data_tipo_idx" ON "lancamento_financeiro"("data", "tipo");

-- CreateIndex
CREATE INDEX "lancamento_financeiro_clienteId_data_idx" ON "lancamento_financeiro"("clienteId", "data");

-- CreateIndex
CREATE INDEX "registro_ponto_usuarioId_data_idx" ON "registro_ponto"("usuarioId", "data");

-- CreateIndex
CREATE INDEX "registro_ponto_clienteId_data_idx" ON "registro_ponto"("clienteId", "data");

-- CreateIndex
CREATE INDEX "cipa_clienteId_situacao_idx" ON "cipa"("clienteId", "situacao");

-- CreateIndex
CREATE INDEX "cipa_documento_cipaId_idx" ON "cipa_documento"("cipaId");

-- CreateIndex
CREATE INDEX "avaliacao_ergonomica_clienteId_data_idx" ON "avaliacao_ergonomica"("clienteId", "data");

-- CreateIndex
CREATE INDEX "produto_quimico_clienteId_nome_idx" ON "produto_quimico"("clienteId", "nome");

-- CreateIndex
CREATE INDEX "brigadista_clienteId_ativo_idx" ON "brigadista"("clienteId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "brigadista_clienteId_colaboradorId_key" ON "brigadista"("clienteId", "colaboradorId");

-- CreateIndex
CREATE INDEX "extintor_clienteId_situacao_idx" ON "extintor"("clienteId", "situacao");

-- CreateIndex
CREATE UNIQUE INDEX "extintor_clienteId_numero_key" ON "extintor"("clienteId", "numero");

-- CreateIndex
CREATE INDEX "aspecto_ambiental_clienteId_significativo_idx" ON "aspecto_ambiental"("clienteId", "significativo");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_tokenQr_key" ON "cliente"("tokenQr");

-- CreateIndex
CREATE UNIQUE INDEX "colaborador_tokenCarteirinha_key" ON "colaborador"("tokenCarteirinha");

-- AddForeignKey
ALTER TABLE "contato_cliente" ADD CONSTRAINT "contato_cliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexo_epi" ADD CONSTRAINT "anexo_epi_epiId_fkey" FOREIGN KEY ("epiId") REFERENCES "epi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrada_epi" ADD CONSTRAINT "entrada_epi_epiId_fkey" FOREIGN KEY ("epiId") REFERENCES "epi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento_financeiro" ADD CONSTRAINT "lancamento_financeiro_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento_financeiro" ADD CONSTRAINT "lancamento_financeiro_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_ponto" ADD CONSTRAINT "registro_ponto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_ponto" ADD CONSTRAINT "registro_ponto_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cipa" ADD CONSTRAINT "cipa_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cipa_documento" ADD CONSTRAINT "cipa_documento_cipaId_fkey" FOREIGN KEY ("cipaId") REFERENCES "cipa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacao_ergonomica" ADD CONSTRAINT "avaliacao_ergonomica_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacao_ergonomica" ADD CONSTRAINT "avaliacao_ergonomica_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_quimico" ADD CONSTRAINT "produto_quimico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produto_quimico" ADD CONSTRAINT "produto_quimico_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brigadista" ADD CONSTRAINT "brigadista_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brigadista" ADD CONSTRAINT "brigadista_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brigadista" ADD CONSTRAINT "brigadista_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extintor" ADD CONSTRAINT "extintor_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extintor" ADD CONSTRAINT "extintor_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspecto_ambiental" ADD CONSTRAINT "aspecto_ambiental_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aspecto_ambiental" ADD CONSTRAINT "aspecto_ambiental_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

