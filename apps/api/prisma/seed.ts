/**
 * Seed da Etapa 1 — cria a empresa de consultoria (matriz) caso ainda nao exista.
 * Idempotente: rodar de novo nao duplica nem sobrescreve o cadastro.
 */
import { PrismaClient } from '@prisma/client';
import { empresaConsultoriaCreateSchema, formatarCnpj } from '@safetyguard/shared';

const prisma = new PrismaClient();

const MATRIZ_DEMO = {
  razaoSocial: 'SafetyGuard Consultoria em Seguranca do Trabalho Ltda',
  nomeFantasia: 'SafetyGuard EHS',
  cnpj: '11.222.333/0001-81',
  inscricaoEstadual: 'ISENTO',
  inscricaoMunicipal: '9988771',
  cnaePrincipal: '7120-1/00',
  naturezaJuridica: 'Sociedade Empresaria Limitada',
  regimeTributario: 'SIMPLES_NACIONAL' as const,
  dataFundacao: '2016-03-14',

  email: 'contato@safetyguard.com.br',
  emailFinanceiro: 'financeiro@safetyguard.com.br',
  telefone: '(62) 3333-4444',
  whatsapp: '(62) 99988-7766',
  site: 'https://safetyguard.com.br',

  cep: '74230-020',
  logradouro: 'Avenida T-63',
  numero: '1200',
  complemento: 'Sala 1502 — Ed. Concept Office',
  bairro: 'Setor Bueno',
  cidade: 'Goiania',
  uf: 'GO',

  responsavelTecnicoNome: 'Rafael Martini',
  responsavelTecnicoCargo: 'Engenheiro de Seguranca do Trabalho',
  responsavelTecnicoTipoRegistro: 'CREA' as const,
  responsavelTecnicoRegistro: '12345/D',
  responsavelTecnicoUfRegistro: 'GO',
  responsavelTecnicoEmail: 'rafael.martini@safetyguard.com.br',
  responsavelTecnicoTelefone: '(62) 99988-7766',

  corPrimaria: '#059669',
  corSecundaria: '#0e1a2b',
  rodapeRelatorio:
    'Documento emitido eletronicamente pela plataforma SafetyGuard EHS 360. Reproducao parcial proibida.',
  cabecalhoWhatsapp: '*SafetyGuard EHS 360* — notificacao automatica',
  timezone: 'America/Sao_Paulo',
};

async function main(): Promise<void> {
  const existente = await prisma.empresaConsultoria.findFirst();

  if (existente) {
    console.log(`Matriz ja cadastrada: ${existente.nomeFantasia} (${formatarCnpj(existente.cnpj)}). Nada a fazer.`);
    return;
  }

  const dados = empresaConsultoriaCreateSchema.parse(MATRIZ_DEMO);
  const empresa = await prisma.empresaConsultoria.create({ data: dados });

  await prisma.registroAuditoria.create({
    data: {
      entidade: 'EmpresaConsultoria',
      entidadeId: empresa.id,
      acao: 'CRIACAO',
      autor: 'seed',
      alteracoes: { origem: { de: null, para: 'prisma/seed.ts' } },
    },
  });

  console.log(`Matriz criada: ${empresa.nomeFantasia} (${formatarCnpj(empresa.cnpj)}).`);
}

main()
  .catch((erro) => {
    console.error('Falha no seed:', erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
