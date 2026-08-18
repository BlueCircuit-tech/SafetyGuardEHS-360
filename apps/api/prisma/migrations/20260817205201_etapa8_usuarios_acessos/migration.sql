-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMIN', 'DIRETORIA', 'GERENTE', 'COORDENADOR', 'SUPERVISOR', 'TECNICO', 'CLIENTE');

-- CreateTable
CREATE TABLE "usuario" (
    "id" TEXT NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "senhaHash" VARCHAR(300) NOT NULL,
    "perfil" "Perfil" NOT NULL,
    "cargo" VARCHAR(80),
    "telefone" VARCHAR(11),
    "clienteId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoAcesso" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE INDEX "usuario_perfil_ativo_idx" ON "usuario"("perfil", "ativo");

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
