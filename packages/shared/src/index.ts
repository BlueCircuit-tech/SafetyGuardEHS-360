/**
 * @safetyguard/shared
 *
 * Contrato de dominio compartilhado entre a API e o front-end:
 * validadores de documentos brasileiros, schemas Zod e composicao dos
 * blocos institucionais (cabecalho/rodape) da plataforma.
 */

export * from './br/cnpj.js';
export * from './br/cep.js';
export * from './br/telefone.js';
export * from './br/cnae.js';
export * from './br/uf.js';
export * from './schemas/comuns.js';
export * from './schemas/empresa-consultoria.js';
export * from './schemas/cliente.js';
export * from './schemas/terceiro.js';
export * from './institucional.js';

export const APP_NOME = 'SafetyGuard EHS 360';
export const APP_DESCRICAO = 'Gestao integrada de Seguranca, Saude e Meio Ambiente';
