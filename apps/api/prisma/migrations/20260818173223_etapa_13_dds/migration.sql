-- CreateTable
CREATE TABLE "tema_dds" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "categoria" VARCHAR(80),
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tema_dds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registro_dds" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "areaId" TEXT,
    "temaId" TEXT,
    "temaLivre" VARCHAR(150),
    "data" DATE NOT NULL,
    "lider" VARCHAR(120) NOT NULL,
    "participantes" INTEGER NOT NULL,
    "duracaoMinutos" INTEGER,
    "observacoes" VARCHAR(1000),
    "listaPresencaUrl" VARCHAR(300),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registro_dds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tema_dds_numero_key" ON "tema_dds"("numero");

-- CreateIndex
CREATE INDEX "registro_dds_clienteId_data_idx" ON "registro_dds"("clienteId", "data");

-- AddForeignKey
ALTER TABLE "registro_dds" ADD CONSTRAINT "registro_dds_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_dds" ADD CONSTRAINT "registro_dds_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_dds" ADD CONSTRAINT "registro_dds_temaId_fkey" FOREIGN KEY ("temaId") REFERENCES "tema_dds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
