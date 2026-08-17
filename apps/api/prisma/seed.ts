/**
 * Seed de demonstracao — cria a empresa de consultoria (matriz) e alguns
 * clientes de exemplo, caso ainda nao existam.
 * Idempotente: rodar de novo nao duplica nem sobrescreve os cadastros.
 */
import { PrismaClient } from '@prisma/client';
import {
  clienteCreateSchema,
  digitosVerificadoresCnpj,
  empresaConsultoriaCreateSchema,
  formatarCnpj,
  terceiroCreateSchema,
} from '@safetyguard/shared';

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

/** Monta um CNPJ valido a partir dos 12 primeiros digitos. */
const cnpjDemo = (base12: string) => base12 + digitosVerificadoresCnpj(base12);

const CLIENTES_DEMO = [
  {
    razaoSocial: 'Vale Verde Mineracao e Britagem S.A.',
    nomeFantasia: 'Vale Verde Mineracao',
    cnpj: cnpjDemo('450178900001'),
    cnaePrincipal: '0810-0/99',
    porte: 'GRANDE' as const,
    segmento: 'Mineracao',
    numeroContrato: '4501',
    dataInicioContrato: '2024-02-01',
    situacao: 'ATIVO' as const,
    escopoServicos: 'PGR, PCMSO, inspecoes mensais, treinamentos NR-22 e NR-33.',
    valorMensal: 28500,
    diaVencimento: 10,
    consultorResponsavel: 'Rafael Martini',
    grauRisco: 4,
    quantidadeFuncionarios: 640,
    metaIndiceGlobal: 85,
    possuiCipa: true,
    possuiSesmt: true,
    contatoNome: 'Juliana Amaral',
    contatoCargo: 'Coordenadora de SSMA',
    contatoEmail: 'juliana.amaral@valeverde.com.br',
    contatoTelefone: '(62) 3222-1010',
    contatoWhatsapp: '(62) 99111-2020',
    cep: '75380-000',
    logradouro: 'Rodovia GO-060, km 42',
    numero: 'S/N',
    bairro: 'Zona Rural',
    cidade: 'Trindade',
    uf: 'GO',
    corDestaque: '#059669',
  },
  {
    razaoSocial: 'Construtora Horizonte Engenharia Ltda',
    nomeFantasia: 'Construtora Horizonte',
    cnpj: cnpjDemo('880234500001'),
    cnaePrincipal: '4120-4/00',
    porte: 'MEDIO' as const,
    segmento: 'Construcao civil',
    numeroContrato: '8802',
    dataInicioContrato: '2025-06-15',
    dataFimContrato: '2026-12-31',
    situacao: 'ATIVO' as const,
    escopoServicos: 'PGR, laudos de altura, gestao de planos de acao e auditorias de canteiro.',
    valorMensal: 14200,
    diaVencimento: 5,
    consultorResponsavel: 'Leandro Barreto',
    grauRisco: 4,
    quantidadeFuncionarios: 210,
    metaIndiceGlobal: 80,
    possuiCipa: true,
    possuiSesmt: false,
    contatoNome: 'Paulo Siqueira',
    contatoCargo: 'Gerente de Obras',
    contatoEmail: 'paulo.siqueira@horizonteeng.com.br',
    contatoTelefone: '(62) 3555-4040',
    contatoWhatsapp: '(62) 99333-4040',
    cep: '74810-100',
    logradouro: 'Rua 87',
    numero: '450',
    complemento: 'Sala 2',
    bairro: 'Setor Sul',
    cidade: 'Goiania',
    uf: 'GO',
    corDestaque: '#ea580c',
  },
  {
    razaoSocial: 'AgroBrasil Energia e Bioenergia S.A.',
    nomeFantasia: 'AgroBrasil Energia',
    cnpj: cnpjDemo('120345600001'),
    cnaePrincipal: '1931-4/00',
    porte: 'GRANDE' as const,
    segmento: 'Agroindustria',
    numeroContrato: '1203',
    dataInicioContrato: '2023-09-01',
    situacao: 'ATIVO' as const,
    escopoServicos: 'PGR, PCA, LTCAT, gestao de ASO e programa de comportamento seguro.',
    valorMensal: 33900,
    diaVencimento: 15,
    consultorResponsavel: 'Rafael Martini',
    grauRisco: 3,
    quantidadeFuncionarios: 880,
    metaIndiceGlobal: 90,
    possuiCipa: true,
    possuiSesmt: true,
    contatoNome: 'Marta Silveira',
    contatoCargo: 'Diretora de Operacoes',
    contatoEmail: 'marta.silveira@agrobrasil.com.br',
    contatoTelefone: '(64) 3421-7700',
    contatoWhatsapp: '(64) 99888-7700',
    cep: '75901-970',
    logradouro: 'Avenida das Industrias',
    numero: '2100',
    bairro: 'Distrito Agroindustrial',
    cidade: 'Rio Verde',
    uf: 'GO',
    corDestaque: '#7c3aed',
  },
];

async function semearMatriz(): Promise<string> {
  const existente = await prisma.empresaConsultoria.findFirst();

  if (existente) {
    console.log(`Matriz ja cadastrada: ${existente.nomeFantasia} (${formatarCnpj(existente.cnpj)}).`);
    return existente.id;
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
  return empresa.id;
}

async function semearClientes(empresaId: string): Promise<void> {
  for (const bruto of CLIENTES_DEMO) {
    const dados = clienteCreateSchema.parse(bruto);

    const jaExiste = await prisma.cliente.findFirst({
      where: { empresaId, cnpj: dados.cnpj },
      select: { id: true },
    });

    if (jaExiste) {
      console.log(`Cliente ja cadastrado: ${dados.nomeFantasia}.`);
      continue;
    }

    const cliente = await prisma.cliente.create({ data: { ...dados, empresaId } });

    await prisma.registroAuditoria.create({
      data: {
        entidade: 'Cliente',
        entidadeId: cliente.id,
        acao: 'CRIACAO',
        autor: 'seed',
        alteracoes: { origem: { de: null, para: 'prisma/seed.ts' } },
      },
    });

    console.log(`Cliente criado: ${cliente.nomeFantasia} (contrato ${cliente.numeroContrato}).`);
  }
}

/** Terceiros de demonstracao, indexados pelo numero de contrato do cliente. */
const TERCEIROS_DEMO: Record<string, Array<Record<string, unknown>>> = {
  '4501': [
    {
      razaoSocial: 'Montalta Servicos Industriais Ltda',
      nomeFantasia: 'Montalta',
      cnpj: cnpjDemo('610112300001'),
      atividadePrincipal: 'Montagem eletromecanica',
      cnaePrincipal: '3321-0/00',
      porte: 'MEDIO',
      tipoVinculo: 'CONTRATO',
      numeroContrato: 'VV-TC-018',
      dataInicioAtuacao: '2025-03-10',
      quantidadeFuncionarios: 48,
      grauRisco: 4,
      notaSsma: 92.5,
      dataUltimaAvaliacao: '2026-07-31',
      metaNotaSsma: 85,
      possuiPgr: true,
      possuiPcmso: true,
      documentacaoValidaAte: '2027-03-09',
      areasAtuacao: 'Britagem — Planta 2; Oficina de manutencao',
      escopoServicos: 'Montagem e manutencao de transportadores de correia.',
      responsavelNome: 'Everton Ferraz',
      responsavelCargo: 'Preposto',
      responsavelEmail: 'everton.ferraz@montalta.com.br',
      responsavelTelefone: '(62) 3211-5500',
      responsavelWhatsapp: '(62) 99444-5500',
      cep: '74910-000',
      logradouro: 'Rua Industrial',
      numero: '340',
      bairro: 'Distrito Industrial',
      cidade: 'Aparecida de Goiania',
      uf: 'GO',
      corDestaque: '#2563eb',
    },
    {
      razaoSocial: 'AndaimeSul Estruturas Temporarias Ltda',
      nomeFantasia: 'AndaimeSul',
      cnpj: cnpjDemo('610223400001'),
      atividadePrincipal: 'Andaimes e acesso por corda',
      porte: 'EPP',
      tipoVinculo: 'ORDEM_SERVICO',
      numeroContrato: 'VV-OS-2291',
      dataInicioAtuacao: '2026-01-15',
      quantidadeFuncionarios: 12,
      grauRisco: 4,
      notaSsma: 58,
      dataUltimaAvaliacao: '2026-08-05',
      metaNotaSsma: 85,
      possuiPgr: true,
      possuiPcmso: false,
      documentacaoValidaAte: '2026-07-20',
      situacao: 'BLOQUEADO',
      areasAtuacao: 'Frente de lavra',
      responsavelNome: 'Marcio Prado',
      responsavelEmail: 'marcio@andaimesul.com.br',
      responsavelTelefone: '(62) 3255-7788',
      observacoes: 'Bloqueado ate regularizar PCMSO e renovar a pasta de documentos.',
      corDestaque: '#dc2626',
    },
  ],
  '8802': [
    {
      razaoSocial: 'PintuMax Pintura Industrial Eireli',
      nomeFantasia: 'PintuMax',
      cnpj: cnpjDemo('610334500001'),
      atividadePrincipal: 'Pintura industrial',
      porte: 'ME',
      tipoVinculo: 'OBRA',
      numeroContrato: 'CH-OB-77',
      dataInicioAtuacao: '2025-09-01',
      dataFimAtuacao: '2026-11-30',
      quantidadeFuncionarios: 22,
      grauRisco: 3,
      notaSsma: 78.4,
      dataUltimaAvaliacao: '2026-07-28',
      metaNotaSsma: 80,
      possuiPgr: true,
      possuiPcmso: true,
      documentacaoValidaAte: '2026-12-31',
      areasAtuacao: 'Canteiro — Torre B',
      responsavelNome: 'Sandra Lopes',
      responsavelCargo: 'Coordenadora de seguranca',
      responsavelEmail: 'sandra.lopes@pintumax.com.br',
      responsavelTelefone: '(62) 3600-1122',
      responsavelWhatsapp: '(62) 99600-1122',
      corDestaque: '#ea580c',
    },
  ],
  '1203': [
    {
      razaoSocial: 'TermoPlan Isolamento Termico Ltda',
      nomeFantasia: 'TermoPlan',
      cnpj: cnpjDemo('610445600001'),
      atividadePrincipal: 'Isolamento termico',
      porte: 'MEDIO',
      tipoVinculo: 'CONTRATO',
      numeroContrato: 'AB-TC-004',
      dataInicioAtuacao: '2024-05-20',
      quantidadeFuncionarios: 35,
      grauRisco: 3,
      metaNotaSsma: 90,
      possuiPgr: true,
      possuiPcmso: true,
      documentacaoValidaAte: '2027-05-19',
      areasAtuacao: 'Caldeiras; Linha de vapor',
      responsavelNome: 'Rogerio Tavares',
      responsavelEmail: 'rogerio@termoplan.com.br',
      responsavelTelefone: '(64) 3455-9090',
      corDestaque: '#16a34a',
    },
  ],
};

async function semearTerceiros(): Promise<void> {
  for (const [numeroContrato, terceiros] of Object.entries(TERCEIROS_DEMO)) {
    const cliente = await prisma.cliente.findFirst({ where: { numeroContrato }, select: { id: true, nomeFantasia: true } });
    if (!cliente) continue;

    for (const bruto of terceiros) {
      const dados = terceiroCreateSchema.parse({ ...bruto, clienteId: cliente.id });

      const jaExiste = await prisma.terceiro.findFirst({
        where: { clienteId: cliente.id, cnpj: dados.cnpj },
        select: { id: true },
      });

      if (jaExiste) {
        console.log(`Terceiro ja cadastrado: ${dados.nomeFantasia} (${cliente.nomeFantasia}).`);
        continue;
      }

      const terceiro = await prisma.terceiro.create({ data: dados });

      await prisma.registroAuditoria.create({
        data: {
          entidade: 'Terceiro',
          entidadeId: terceiro.id,
          acao: 'CRIACAO',
          autor: 'seed',
          alteracoes: { origem: { de: null, para: 'prisma/seed.ts' } },
        },
      });

      console.log(`Terceiro criado: ${terceiro.nomeFantasia} em ${cliente.nomeFantasia}.`);
    }
  }
}

async function main(): Promise<void> {
  const empresaId = await semearMatriz();
  await semearClientes(empresaId);
  await semearTerceiros();
}

main()
  .catch((erro) => {
    console.error('Falha no seed:', erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
