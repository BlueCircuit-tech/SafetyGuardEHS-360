-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoDocumento" ADD VALUE 'APR_AST';
ALTER TYPE "TipoDocumento" ADD VALUE 'PERMISSAO_TRABALHO';
ALTER TYPE "TipoDocumento" ADD VALUE 'FISPQ';
ALTER TYPE "TipoDocumento" ADD VALUE 'PAE';
ALTER TYPE "TipoDocumento" ADD VALUE 'PCMAT';
