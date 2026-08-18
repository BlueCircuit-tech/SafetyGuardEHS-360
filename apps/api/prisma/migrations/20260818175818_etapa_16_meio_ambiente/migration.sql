-- CreateEnum
CREATE TYPE "TipoOcorrenciaAmbiental" AS ENUM ('DERRAMAMENTO', 'VAZAMENTO', 'EMISSAO_NAO_CONTROLADA', 'DESCARTE_IRREGULAR', 'PRODUTO_QUIMICO', 'OUTRO');

-- CreateTable
CREATE TABLE "ocorrencia_ambiental" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "areaId" TEXT,
    "tipo" "TipoOcorrenciaAmbiental" NOT NULL,
    "data" DATE NOT NULL,
    "descricao" VARCHAR(2000) NOT NULL,
    "grauRisco" VARCHAR(3) NOT NULL,
    "volumeEstimado" VARCHAR(40),
    "contida" BOOLEAN NOT NULL DEFAULT false,
    "acaoImediata" VARCHAR(1000),
    "responsavel" VARCHAR(120) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ocorrencia_ambiental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicador_ambiental" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "competencia" DATE NOT NULL,
    "aguaM3" DECIMAL(14,2),
    "energiaKwh" DECIMAL(14,2),
    "residuosKg" DECIMAL(14,2),
    "residuosRecicladosKg" DECIMAL(14,2),
    "emissoesTco2" DECIMAL(14,3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "indicador_ambiental_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ocorrencia_ambiental_clienteId_data_idx" ON "ocorrencia_ambiental"("clienteId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "indicador_ambiental_clienteId_competencia_key" ON "indicador_ambiental"("clienteId", "competencia");

-- AddForeignKey
ALTER TABLE "ocorrencia_ambiental" ADD CONSTRAINT "ocorrencia_ambiental_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocorrencia_ambiental" ADD CONSTRAINT "ocorrencia_ambiental_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicador_ambiental" ADD CONSTRAINT "indicador_ambiental_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
