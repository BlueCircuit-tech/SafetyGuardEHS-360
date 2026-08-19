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
export * from './br/cpf.js';
export * from './br/uf.js';
export * from './schemas/comuns.js';
export * from './schemas/empresa-consultoria.js';
export * from './schemas/centro-negocio.js';
export * from './schemas/cliente.js';
export * from './schemas/terceiro.js';
export * from './schemas/area.js';
export * from './schemas/observacao.js';
export * from './schemas/plano-acao.js';
export * from './schemas/usuario.js';
export * from './schemas/colaborador.js';
export * from './schemas/aso.js';
export * from './schemas/documento.js';
export * from './schemas/treinamento.js';
export * from './schemas/auditoria.js';
export * from './schemas/dds.js';
export * from './schemas/epi.js';
export * from './schemas/consequencia.js';
export * from './schemas/meio-ambiente.js';
export * from './schemas/acidente.js';
export * from './schemas/risco-inventario.js';
export * from './schemas/afastamento.js';
export * from './indicadores/index.js';
export * from './institucional.js';

export const APP_NOME = 'SafetyGuard EHS 360';
export const APP_DESCRICAO = 'Gestao integrada de Seguranca, Saude e Meio Ambiente';
