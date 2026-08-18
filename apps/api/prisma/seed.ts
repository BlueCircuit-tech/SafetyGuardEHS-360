/**
 * Seed de demonstracao — cria a empresa de consultoria (matriz) e alguns
 * clientes de exemplo, caso ainda nao existam.
 * Idempotente: rodar de novo nao duplica nem sobrescreve os cadastros.
 */
import { PrismaClient } from '@prisma/client';
import { gerarHashSenha } from '../src/lib/senha.js';
import { randomInt } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ALFABETO_TOKEN_QR,
  TAMANHO_TOKEN_QR,
  areaCreateSchema,
  PRAZO_PADRAO_POR_CRITICIDADE,
  calcularIir,
  causaDesvioCreateSchema,
  criticidadePeloGrau,
  centroNegocioCreateSchema,
  grauRiscoPeloIir,
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

/** Centros de negocio de demonstracao, com os contratos que cada um agrupa. */
const CENTROS_DEMO = [
  {
    dados: {
      nome: 'Regional Centro-Oeste',
      codigo: 'RCO',
      tipo: 'REGIONAL' as const,
      descricao: 'Clientes industriais de Goias e entorno.',
      responsavelNome: 'Rafael Martini',
      responsavelCargo: 'Gerente Regional',
      responsavelEmail: 'rafael.martini@safetyguard.com.br',
      responsavelTelefone: '(62) 99988-7766',
      cidade: 'Goiania',
      uf: 'GO',
      metaIndiceGlobal: 88,
      corDestaque: '#059669',
    },
    contratos: ['4501', '1203'],
  },
  {
    dados: {
      nome: 'Contratos de Obra',
      codigo: 'OBRA',
      tipo: 'TIPO_CONTRATO' as const,
      descricao: 'Canteiros e obras civis, com vigencia por projeto.',
      responsavelNome: 'Leandro Barreto',
      responsavelCargo: 'Coordenador de Obras',
      responsavelEmail: 'leandro.barreto@safetyguard.com.br',
      responsavelTelefone: '(62) 3333-4455',
      cidade: 'Goiania',
      uf: 'GO',
      metaIndiceGlobal: 80,
      corDestaque: '#ea580c',
    },
    contratos: ['8802'],
  },
];

async function semearCentros(empresaId: string): Promise<void> {
  for (const { dados: bruto, contratos } of CENTROS_DEMO) {
    const dados = centroNegocioCreateSchema.parse(bruto);

    let centro = await prisma.centroNegocio.findFirst({
      where: { empresaId, codigo: dados.codigo },
      select: { id: true, nome: true },
    });

    if (centro) {
      console.log(`Centro ja cadastrado: ${centro.nome}.`);
    } else {
      centro = await prisma.centroNegocio.create({ data: { ...dados, empresaId } });

      await prisma.registroAuditoria.create({
        data: {
          entidade: 'CentroNegocio',
          entidadeId: centro.id,
          acao: 'CRIACAO',
          autor: 'seed',
          alteracoes: { origem: { de: null, para: 'prisma/seed.ts' } },
        },
      });

      console.log(`Centro criado: ${centro.nome} (${dados.codigo}).`);
    }

    const vinculados = await prisma.cliente.updateMany({
      where: { empresaId, numeroContrato: { in: contratos }, centroNegocioId: null },
      data: { centroNegocioId: centro.id },
    });

    if (vinculados.count > 0) {
      console.log(`  ${vinculados.count} cliente(s) vinculado(s) a ${centro.nome}.`);
    }
  }
}

/** Areas de inspecao por numero de contrato do cliente. */
const AREAS_DEMO: Record<string, Array<Record<string, unknown>>> = {
  '4501': [
    {
      nome: 'Britagem — Planta 2',
      codigo: 'BRT-P2',
      setor: 'Planta 2',
      tipo: 'PRODUCAO',
      criticidade: 'CRITICA',
      riscosPresentes: 'Ruido; Poeira / particulados; Maquinas e equipamentos',
      exigeAutorizacaoEntrada: true,
      exigePermissaoTrabalho: true,
      responsavelNome: 'Joao Amaral',
      responsavelCargo: 'Supervisor de Producao',
      responsavelEmail: 'joao.amaral@valeverde.com.br',
      latitude: -16.6864,
      longitude: -49.2643,
      pontoReferencia: 'Ao lado do transportador TC-04',
      frequenciaInspecaoDias: 7,
    },
    {
      nome: 'Oficina de manutencao',
      codigo: 'OFI-01',
      setor: 'Planta 2',
      tipo: 'MANUTENCAO',
      criticidade: 'ALTA',
      riscosPresentes: 'Trabalho a quente; Maquinas e equipamentos; Ergonomia',
      exigePermissaoTrabalho: true,
      responsavelNome: 'Jose Ribamar Filho',
      responsavelEmail: 'jose.ribamar@valeverde.com.br',
      frequenciaInspecaoDias: 15,
    },
    {
      nome: 'Frente de lavra',
      codigo: 'LAV-01',
      setor: 'Mina',
      tipo: 'AREA_EXTERNA',
      criticidade: 'CRITICA',
      riscosPresentes: 'Movimentacao de cargas; Poeira / particulados; Ruido',
      exigeAutorizacaoEntrada: true,
      frequenciaInspecaoDias: 7,
    },
  ],
  '8802': [
    {
      nome: 'Canteiro — Torre B',
      codigo: 'TOR-B',
      setor: 'Canteiro central',
      tipo: 'OBRA',
      criticidade: 'CRITICA',
      riscosPresentes: 'Trabalho em altura; Movimentacao de cargas; Eletricidade',
      exigeAutorizacaoEntrada: true,
      exigePermissaoTrabalho: true,
      responsavelNome: 'Paulo Siqueira',
      responsavelCargo: 'Gerente de Obras',
      responsavelEmail: 'paulo.siqueira@horizonteeng.com.br',
      frequenciaInspecaoDias: 7,
    },
    {
      nome: 'Almoxarifado de obra',
      codigo: 'ALM-01',
      setor: 'Canteiro central',
      tipo: 'ARMAZENAGEM',
      criticidade: 'MEDIA',
      riscosPresentes: 'Ergonomia; Movimentacao de cargas',
      frequenciaInspecaoDias: 30,
    },
  ],
  '1203': [
    {
      nome: 'Casa de caldeiras',
      codigo: 'CLD-01',
      setor: 'Utilidades',
      tipo: 'UTILIDADES',
      criticidade: 'CRITICA',
      riscosPresentes: 'Calor; Ruido; Espaco confinado; Trabalho a quente',
      exigeAutorizacaoEntrada: true,
      exigePermissaoTrabalho: true,
      responsavelNome: 'Elias Ferraz',
      responsavelEmail: 'elias.ferraz@agrobrasil.com.br',
      frequenciaInspecaoDias: 7,
    },
    {
      nome: 'Subestacao eletrica',
      codigo: 'SUB-01',
      setor: 'Utilidades',
      tipo: 'UTILIDADES',
      criticidade: 'ALTA',
      riscosPresentes: 'Eletricidade',
      exigeAutorizacaoEntrada: true,
      exigePermissaoTrabalho: true,
      frequenciaInspecaoDias: 15,
    },
    {
      nome: 'Refeitorio central',
      codigo: 'REF-01',
      setor: 'Apoio',
      tipo: 'ADMINISTRATIVO',
      criticidade: 'BAIXA',
      riscosPresentes: 'Risco biologico',
      frequenciaInspecaoDias: 90,
    },
  ],
};

/** Mesmo alfabeto do servico — token estavel e sem caracteres ambiguos. */
function sortearTokenQr(): string {
  let token = '';
  for (let i = 0; i < TAMANHO_TOKEN_QR; i += 1) {
    token += ALFABETO_TOKEN_QR[randomInt(ALFABETO_TOKEN_QR.length)];
  }
  return token;
}

async function semearAreas(): Promise<void> {
  for (const [numeroContrato, areas] of Object.entries(AREAS_DEMO)) {
    const cliente = await prisma.cliente.findFirst({
      where: { numeroContrato },
      select: { id: true, nomeFantasia: true },
    });
    if (!cliente) continue;

    for (const bruto of areas) {
      const dados = areaCreateSchema.parse({ ...bruto, clienteId: cliente.id });

      const jaExiste = await prisma.area.findFirst({
        where: { clienteId: cliente.id, codigo: dados.codigo },
        select: { id: true },
      });

      if (jaExiste) {
        console.log(`Area ja cadastrada: ${dados.nome} (${cliente.nomeFantasia}).`);
        continue;
      }

      const area = await prisma.area.create({ data: { ...dados, tokenQr: sortearTokenQr() } });

      await prisma.registroAuditoria.create({
        data: {
          entidade: 'Area',
          entidadeId: area.id,
          acao: 'CRIACAO',
          autor: 'seed',
          alteracoes: { origem: { de: null, para: 'prisma/seed.ts' } },
        },
      });

      console.log(`Area criada: ${area.nome} [${area.codigo}] QR ${area.tokenQr} — ${cliente.nomeFantasia}.`);
    }
  }
}

/* ==========================================================================
   Observacoes de campo (BBS)
   ========================================================================== */

/** Catalogo de causas — os mesmos desvios dos Paretos do plano diretor. */
const CAUSAS_DEMO = [
  // Comportamentos inseguros
  { codigo: 'EPI-NAO-USO', descricao: 'Nao utilizacao de EPI', tipo: 'COMPORTAMENTO_INSEGURO', destinatarioSugerido: 'Supervisor', peso: 28 },
  { codigo: 'SEM-AUTORIZACAO', descricao: 'Trabalho sem autorizacao', tipo: 'COMPORTAMENTO_INSEGURO', destinatarioSugerido: 'Coordenacao', peso: 18 },
  { codigo: 'FERRAMENTA-USO', descricao: 'Uso inadequado de ferramentas', tipo: 'COMPORTAMENTO_INSEGURO', destinatarioSugerido: 'Supervisor', peso: 11 },
  { codigo: 'CELULAR', descricao: 'Uso de celular em area operacional', tipo: 'COMPORTAMENTO_INSEGURO', destinatarioSugerido: 'Supervisor', peso: 8 },
  { codigo: 'PROCEDIMENTO', descricao: 'Nao cumprimento de procedimentos', tipo: 'COMPORTAMENTO_INSEGURO', destinatarioSugerido: 'Supervisor', peso: 7 },
  { codigo: 'ALTURA-SEM-CINTO', descricao: 'Trabalho em altura sem cinto', tipo: 'COMPORTAMENTO_INSEGURO', destinatarioSugerido: 'SSMA', peso: 5 },
  { codigo: 'IMPROVISACAO', descricao: 'Improvisacao', tipo: 'COMPORTAMENTO_INSEGURO', destinatarioSugerido: 'Supervisor', peso: 5 },
  // Condicoes inseguras
  { codigo: 'SINALIZACAO', descricao: 'Falta de sinalizacao', tipo: 'CONDICAO_INSEGURA', destinatarioSugerido: 'SSMA', peso: 15 },
  { codigo: 'PISO', descricao: 'Piso irregular', tipo: 'CONDICAO_INSEGURA', destinatarioSugerido: 'Manutencao', peso: 12 },
  { codigo: 'FERRAMENTA-DANIF', descricao: 'Ferramenta danificada', tipo: 'CONDICAO_INSEGURA', destinatarioSugerido: 'Manutencao', peso: 9 },
  { codigo: 'VAZAMENTO', descricao: 'Vazamento de oleo', tipo: 'CONDICAO_INSEGURA', destinatarioSugerido: 'Meio Ambiente', peso: 7 },
  { codigo: 'ILUMINACAO', descricao: 'Iluminacao inadequada', tipo: 'CONDICAO_INSEGURA', destinatarioSugerido: 'Manutencao', peso: 5 },
  { codigo: 'PROTECAO-MAQUINA', descricao: 'Protecao de maquina removida', tipo: 'CONDICAO_INSEGURA', destinatarioSugerido: 'Manutencao', peso: 4 },
  { codigo: 'EXTINTOR', descricao: 'Extintor vencido', tipo: 'CONDICAO_INSEGURA', destinatarioSugerido: 'SSMA', peso: 3 },
  // Nao conformidades
  { codigo: 'NC-PROCEDIMENTO', descricao: 'Procedimento nao seguido', tipo: 'NAO_CONFORMIDADE', destinatarioSugerido: 'SSMA', peso: 6 },
  { codigo: 'NC-DOCUMENTO', descricao: 'Documentacao ausente ou vencida', tipo: 'NAO_CONFORMIDADE', destinatarioSugerido: 'SSMA', peso: 4 },
];

const OBSERVADORES = [
  'Rafael Martini',
  'Leandro Barreto',
  'Marina Duarte',
  'Elias Ferraz',
  'Sandra Lopes',
];

const DESCRICOES: Record<string, string[]> = {
  COMPORTAMENTO_SEGURO: [
    'Equipe utilizando todos os EPIs exigidos para a atividade.',
    'Checklist do equipamento preenchido antes da partida.',
    'Uso correto de trava-quedas na atividade em altura.',
    'Isolamento da area montado antes do inicio do servico.',
    'Bloqueio LOTO aplicado corretamente na manutencao.',
    'DDS realizado com toda a equipe antes do turno.',
  ],
  COMPORTAMENTO_INSEGURO: [
    'Colaborador executando a atividade sem o EPI exigido.',
    'Atividade iniciada sem a liberacao formal do supervisor.',
    'Ferramenta utilizada de forma diferente da recomendada pelo fabricante.',
    'Uso de celular durante a operacao do equipamento.',
    'Procedimento operacional nao seguido na sequencia prevista.',
  ],
  CONDICAO_INSEGURA: [
    'Area sem sinalizacao de advertencia no acesso principal.',
    'Piso com desnivel e risco de tropeco na rota de circulacao.',
    'Ferramenta com cabo trincado disponivel para uso.',
    'Vazamento de oleo proximo ao painel, com risco de escorregamento.',
    'Iluminacao insuficiente para a inspecao visual do equipamento.',
  ],
  MELHORIA_IDENTIFICADA: [
    'Sugerida demarcacao de rota de fuga no piso.',
    'Proposta de reposicionamento do extintor para acesso mais rapido.',
    'Sugerido ponto de hidratacao mais proximo da frente de trabalho.',
  ],
  NAO_CONFORMIDADE: [
    'Permissao de trabalho vencida durante a execucao do servico.',
    'Registro de treinamento nao localizado para o colaborador em atividade.',
  ],
};

const ACOES_IMEDIATAS = [
  'Atividade interrompida e colaborador orientado no ato.',
  'Area isolada ate a correcao.',
  'Item retirado de uso e encaminhado para a manutencao.',
  'Orientacao registrada e reforcada no DDS seguinte.',
];

/**
 * Gerador pseudoaleatorio deterministico (LCG).
 * Roda o seed duas vezes e os dados saem iguais — importante para conferir
 * numeros do painel entre ambientes.
 */
function criarSorteio(semente: number) {
  let estado = semente;
  return () => {
    estado = (estado * 1664525 + 1013904223) % 4294967296;
    return estado / 4294967296;
  };
}

const sortear = criarSorteio(20260817);

function escolher<T>(lista: readonly T[]): T {
  return lista[Math.floor(sortear() * lista.length)]!;
}

function escolherPorPeso<T extends { peso: number }>(lista: readonly T[]): T {
  const total = lista.reduce((soma, item) => soma + item.peso, 0);
  let ponto = sortear() * total;
  for (const item of lista) {
    ponto -= item.peso;
    if (ponto <= 0) return item;
  }
  return lista[lista.length - 1]!;
}

/** Placeholder de evidencia: condicao insegura e NC exigem foto. */
async function gerarEvidenciaDemo(): Promise<string> {
  const diretorio = join(process.cwd(), 'uploads');
  await mkdir(diretorio, { recursive: true });

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320">',
    '<rect width="480" height="320" fill="#0e1a2b"/>',
    '<rect x="16" y="16" width="448" height="288" fill="none" stroke="#059669" stroke-width="3" stroke-dasharray="10 6"/>',
    '<text x="240" y="150" font-family="Segoe UI, sans-serif" font-size="26" fill="#9fd8c4" text-anchor="middle">Evidencia de demonstracao</text>',
    '<text x="240" y="186" font-family="Segoe UI, sans-serif" font-size="15" fill="#7e8da0" text-anchor="middle">SafetyGuard EHS 360 — dados de seed</text>',
    '</svg>',
  ].join('');

  await writeFile(join(diretorio, 'evidencia-demo.svg'), svg, 'utf-8');
  return '/arquivos/evidencia-demo.svg';
}

/**
 * Distribuicao alvo por mes: o volume de desvios cai ao longo do periodo,
 * para a tendencia mostrar melhora — como no exemplo do plano diretor.
 */
const MESES_DE_HISTORICO = 6;

async function semearObservacoes(): Promise<void> {
  const jaExistem = await prisma.observacao.count();
  if (jaExistem > 0) {
    console.log(`Observacoes ja cadastradas (${jaExistem}). Nada a fazer.`);
    return;
  }

  // Catalogo de causas
  const causasPorId = new Map<string, { id: string; tipo: string; peso: number }>();
  for (const bruta of CAUSAS_DEMO) {
    const { peso, ...dadosBrutos } = bruta;
    const dados = causaDesvioCreateSchema.parse(dadosBrutos);
    const causa = await prisma.causaDesvio.upsert({
      where: { codigo: dados.codigo },
      update: {},
      create: dados,
    });
    causasPorId.set(causa.id, { id: causa.id, tipo: causa.tipo, peso });
  }
  console.log(`Catalogo de causas: ${causasPorId.size} itens.`);

  const causasPorTipo = (tipo: string) => [...causasPorId.values()].filter((causa) => causa.tipo === tipo);

  const areas = await prisma.area.findMany({ select: { id: true, clienteId: true, criticidade: true } });
  if (areas.length === 0) {
    console.log('Nenhuma area cadastrada — observacoes nao semeadas.');
    return;
  }

  const terceiros = await prisma.terceiro.findMany({ select: { id: true, clienteId: true } });
  const fotoUrl = await gerarEvidenciaDemo();

  const agora = new Date();
  const registros: Array<Record<string, unknown>> = [];

  for (let mesAtras = MESES_DE_HISTORICO - 1; mesAtras >= 0; mesAtras -= 1) {
    // Desvios caem ~12% ao mes; seguros sobem levemente.
    const fatorDesvio = 1 + mesAtras * 0.28;
    const seguros = Math.round(62 + (MESES_DE_HISTORICO - mesAtras) * 3);
    const comportamentosInseguros = Math.round(7 * fatorDesvio);
    const condicoesInseguras = Math.round(2.4 * fatorDesvio);
    const melhorias = 2;
    const naoConformidades = mesAtras % 3 === 0 ? 1 : 0;

    const plano: Array<[string, number]> = [
      ['COMPORTAMENTO_SEGURO', seguros],
      ['COMPORTAMENTO_INSEGURO', comportamentosInseguros],
      ['CONDICAO_INSEGURA', condicoesInseguras],
      ['MELHORIA_IDENTIFICADA', melhorias],
      ['NAO_CONFORMIDADE', naoConformidades],
    ];

    for (const [tipo, quantidade] of plano) {
      for (let i = 0; i < quantidade; i += 1) {
        const area = escolher(areas);
        const dia = 1 + Math.floor(sortear() * 27);
        const dataHora = new Date(agora.getFullYear(), agora.getMonth() - mesAtras, dia, 8 + Math.floor(sortear() * 9), 15);

        const ehDesvio = tipo === 'COMPORTAMENTO_INSEGURO' || tipo === 'CONDICAO_INSEGURA' || tipo === 'NAO_CONFORMIDADE';
        const candidatas = causasPorTipo(tipo);
        const causa = ehDesvio && candidatas.length > 0 ? escolherPorPeso(candidatas) : null;

        // Terceiro envolvido em parte dos desvios.
        const doCliente = terceiros.filter((terceiro) => terceiro.clienteId === area.clienteId);
        const terceiro = ehDesvio && doCliente.length > 0 && sortear() < 0.45 ? escolher(doCliente) : null;

        let severidade: number | null = null;
        let probabilidade: number | null = null;
        let exposicao: number | null = null;
        let frequencia: number | null = null;
        let iir: number | null = null;
        let grauRisco: string | null = null;

        if (ehDesvio) {
          const critica = area.criticidade === 'CRITICA';
          severidade = 1 + Math.floor(sortear() * (critica ? 5 : 3));
          probabilidade = 1 + Math.floor(sortear() * 4);
          exposicao = 1 + Math.floor(sortear() * 4);
          frequencia = 1 + Math.floor(sortear() * 3);
          const resultado = calcularIir({ severidade, probabilidade, exposicao, frequencia });
          iir = resultado.valor;
          grauRisco = grauRiscoPeloIir(iir);
        }

        registros.push({
          areaId: area.id,
          clienteId: area.clienteId,
          terceiroId: terceiro?.id ?? null,
          causaId: causa?.id ?? null,
          dataHora,
          tipo,
          descricao: escolher(DESCRICOES[tipo] ?? ['Observacao de campo registrada.']),
          observador: escolher(OBSERVADORES),
          severidade,
          probabilidade,
          exposicao,
          frequencia,
          iir,
          grauRisco,
          fotoUrl: tipo === 'CONDICAO_INSEGURA' || tipo === 'NAO_CONFORMIDADE' ? fotoUrl : null,
          acaoImediata: ehDesvio ? escolher(ACOES_IMEDIATAS) : null,
          situacao: mesAtras > 1 ? 'CONCLUIDA' : ehDesvio ? 'EM_TRATATIVA' : 'REGISTRADA',
        });
      }
    }
  }

  // Algumas ocorrencias da Piramide de Bird, sobre desvios ja registrados.
  const ocorrencias = ['B_SERIOUS', 'C_MINOR', 'C_MINOR', 'C_MINOR', 'D_MAJOR_NEAR_MISS', 'E_NEAR_MISS', 'E_NEAR_MISS'];
  const candidatosBird = registros.filter((registro) => registro.tipo === 'CONDICAO_INSEGURA');
  ocorrencias.forEach((classificacao, indice) => {
    const alvo = candidatosBird[indice];
    if (alvo) alvo.classificacaoBird = classificacao;
  });
  for (let i = 0; i < 6; i += 1) {
    const alvo = registros[registros.length - 1 - i];
    if (alvo && alvo.tipo === 'COMPORTAMENTO_SEGURO') alvo.classificacaoBird = 'F_FIRST_AID';
  }

  await prisma.observacao.createMany({ data: registros as never });

  const porTipo = await prisma.observacao.groupBy({
    by: ['tipo'],
    orderBy: { tipo: 'asc' },
    _count: { _all: true },
  });

  console.log(`Observacoes criadas: ${registros.length}`);
  for (const linha of porTipo) {
    console.log(`  ${linha.tipo.padEnd(24)} ${linha._count._all}`);
  }
}

/* ==========================================================================
   Planos de acao
   ========================================================================== */

const ACOES_CORRETIVAS: Record<string, string[]> = {
  COMPORTAMENTO_INSEGURO: [
    'Reciclar treinamento de uso de EPI com a equipe da area.',
    'Reforcar o procedimento no DDS e registrar presenca.',
    'Revisar a liberacao de atividade com o supervisor responsavel.',
    'Aplicar orientacao formal e acompanhar a proxima execucao.',
  ],
  CONDICAO_INSEGURA: [
    'Corrigir a condicao e registrar evidencia fotografica.',
    'Abrir ordem de manutencao e isolar a area ate a correcao.',
    'Substituir o item danificado e conferir os similares da area.',
    'Instalar sinalizacao definitiva no acesso.',
  ],
  NAO_CONFORMIDADE: [
    'Regularizar a documentacao e anexar comprovante.',
    'Revisar o procedimento e retreinar os envolvidos.',
  ],
};

const RESPONSAVEIS_PLANO = [
  { nome: 'Joao Amaral', cargo: 'Supervisor de Producao' },
  { nome: 'Leandro Barreto', cargo: 'Coordenador de Obras' },
  { nome: 'Elias Ferraz', cargo: 'Coordenador de Utilidades' },
  { nome: 'Sandra Lopes', cargo: 'Coordenadora de Seguranca' },
];

const COMENTARIOS_CONCLUSAO = [
  'Correcao executada e conferida em campo.',
  'Treinamento aplicado; equipe orientada e registro arquivado.',
  'Item substituido e area liberada apos inspecao.',
];

/**
 * Abre planos para parte dos desvios registrados, com estagios variados
 * (concluidos no prazo, concluidos em atraso, em andamento e atrasados) para
 * que os KPIs de tempo medio e aderencia tenham sentido.
 */
async function semearPlanosDeAcao(): Promise<void> {
  const jaExistem = await prisma.planoAcao.count();
  if (jaExistem > 0) {
    console.log(`Planos de acao ja cadastrados (${jaExistem}). Nada a fazer.`);
    return;
  }

  const desvios = await prisma.observacao.findMany({
    where: { tipo: { in: ['COMPORTAMENTO_INSEGURO', 'CONDICAO_INSEGURA', 'NAO_CONFORMIDADE'] } },
    orderBy: { dataHora: 'asc' },
    select: {
      id: true,
      clienteId: true,
      areaId: true,
      terceiroId: true,
      tipo: true,
      descricao: true,
      dataHora: true,
      grauRisco: true,
      prazoLimite: true,
    },
  });

  if (desvios.length === 0) {
    console.log('Nenhum desvio registrado — planos nao semeados.');
    return;
  }

  const agora = new Date();
  const registros: Array<Record<string, unknown>> = [];
  let sequencial = 1;

  // Abre plano para ~70% dos desvios.
  for (const desvio of desvios) {
    if (sortear() > 0.7) continue;

    const criticidade = criticidadePeloGrau(desvio.grauRisco);
    const horas = PRAZO_PADRAO_POR_CRITICIDADE[criticidade];
    const prazo = desvio.prazoLimite ?? new Date(desvio.dataHora.getTime() + horas * 60 * 60 * 1000);
    const responsavel = escolher(RESPONSAVEIS_PLANO);
    const acoes = ACOES_CORRETIVAS[desvio.tipo] ?? ['Tratar o desvio registrado.'];

    const idade = (agora.getTime() - desvio.dataHora.getTime()) / (24 * 60 * 60 * 1000);
    const sorte = sortear();

    let status: string;
    let dataConclusao: Date | null = null;
    let comentarioConclusao: string | null = null;
    let nivelEscalonamento = 0;

    if (idade > 60) {
      // Desvios antigos ja foram tratados.
      status = 'CONCLUIDO';
      // 80% fecharam dentro do prazo.
      const atraso = sorte < 0.8 ? -sortear() * 12 : sortear() * 72;
      dataConclusao = new Date(prazo.getTime() + atraso * 60 * 60 * 1000);
      if (dataConclusao > agora) dataConclusao = agora;
      comentarioConclusao = escolher(COMENTARIOS_CONCLUSAO);
    } else if (idade > 20) {
      status = sorte < 0.6 ? 'CONCLUIDO' : 'EM_ANDAMENTO';
      if (status === 'CONCLUIDO') {
        dataConclusao = new Date(prazo.getTime() - sortear() * 24 * 60 * 60 * 1000);
        comentarioConclusao = escolher(COMENTARIOS_CONCLUSAO);
      } else {
        // Em aberto e vencido ha tempo: ja escalonou.
        nivelEscalonamento = prazo < agora ? Math.min(3, Math.floor((agora.getTime() - prazo.getTime()) / (24 * 60 * 60 * 1000))) : 0;
      }
    } else {
      status = sorte < 0.35 ? 'EM_ANDAMENTO' : 'ABERTO';
      nivelEscalonamento = prazo < agora ? 1 : 0;
    }

    registros.push({
      codigo: `PA-${String(sequencial++).padStart(4, '0')}`,
      origem: 'OBSERVACAO',
      observacaoId: desvio.id,
      clienteId: desvio.clienteId,
      areaId: desvio.areaId,
      terceiroId: desvio.terceiroId,
      acao: escolher(acoes),
      descricao: desvio.descricao,
      responsavelNome: responsavel.nome,
      responsavelCargo: responsavel.cargo,
      criticidade,
      prazo,
      status,
      dataConclusao,
      comentarioConclusao,
      nivelEscalonamento,
      dataUltimoEscalonamento: nivelEscalonamento > 0 ? agora : null,
      criadoEm: desvio.dataHora,
    });
  }

  await prisma.planoAcao.createMany({ data: registros as never });

  const porStatus = await prisma.planoAcao.groupBy({
    by: ['status'],
    orderBy: { status: 'asc' },
    _count: { _all: true },
  });

  console.log(`Planos de acao criados: ${registros.length}`);
  for (const linha of porStatus) {
    console.log(`  ${linha.status.padEnd(14)} ${linha._count._all}`);
  }
}

/* ==========================================================================
   Usuarios
   ========================================================================== */

/**
 * Cria o administrador inicial. A senha vem do ambiente para nao ficar
 * fixa no repositorio; o console avisa quando ela e a padrao de exemplo.
 */
async function semearAdministrador(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@safetyguard.com.br').toLowerCase();
  const senha = process.env.ADMIN_SENHA ?? 'SafetyGuard2026';

  const existente = await prisma.usuario.findUnique({ where: { email }, select: { id: true } });
  if (existente) {
    console.log(`Administrador ja cadastrado: ${email}.`);
    return;
  }

  await prisma.usuario.create({
    data: {
      nome: 'Administrador SafetyGuard',
      email,
      senhaHash: await gerarHashSenha(senha),
      perfil: 'ADMIN',
      cargo: 'Administrador da plataforma',
      ativo: true,
    },
  });

  console.log(`Administrador criado: ${email}`);
  if (!process.env.ADMIN_SENHA) {
    console.log('  ATENCAO: senha padrao de desenvolvimento. Defina ADMIN_SENHA no .env e troque no primeiro acesso.');
  }
}


/* ==========================================================================
   Etapa 9 — Colaboradores, ASO e documentos
   ========================================================================== */

const NOMES_DEMO = [
  'Adriana Peixoto', 'Bruno Sales', 'Camila Torres', 'Diego Lacerda', 'Elaine Rocha',
  'Fabio Andrade', 'Gisele Moraes', 'Heitor Campos', 'Isabela Freitas', 'Joao Vitor Braga',
  'Karina Lopes', 'Leandro Pires', 'Mariana Coelho', 'Nelson Barreto', 'Olivia Tavares',
  'Paulo Rezende', 'Queila Martins', 'Rodrigo Assis', 'Simone Vasques', 'Tiago Nogueira',
  'Ursula Prado', 'Vinicius Bastos', 'Wanessa Lima', 'Xavier Fontes', 'Yara Siqueira',
  'Zeca Albuquerque', 'Alice Monteiro', 'Bernardo Sa', 'Carla Ventura', 'Daniel Ferrari',
  'Eduarda Pinho', 'Felipe Zanetti', 'Giovana Duarte', 'Henrique Bulhoes', 'Ines Carvalho',
  'Julio Cesar Mota', 'Katia Bianchi', 'Lucas Amaral', 'Marcela Quintao', 'Nilton Ribas',
];

const FUNCOES_DEMO = [
  { funcao: 'Operador de empilhadeira', grauRisco: 'ALTO' as const, riscos: 'Movimentacao de cargas; Ruido; Vibracao' },
  { funcao: 'Soldador', grauRisco: 'ALTO' as const, riscos: 'Trabalho a quente; Fumos metalicos; Radiacao nao ionizante' },
  { funcao: 'Eletricista de manutencao', grauRisco: 'ALTO' as const, riscos: 'Eletricidade; Trabalho em altura' },
  { funcao: 'Mecanico industrial', grauRisco: 'MEDIO' as const, riscos: 'Maquinas e equipamentos; Ruido' },
  { funcao: 'Auxiliar de producao', grauRisco: 'MEDIO' as const, riscos: 'Ruido; Ergonomia' },
  { funcao: 'Tecnico de laboratorio', grauRisco: 'MEDIO' as const, riscos: 'Produtos quimicos; Risco biologico' },
  { funcao: 'Operador de ponte rolante', grauRisco: 'ALTO' as const, riscos: 'Movimentacao de cargas; Trabalho em altura' },
  { funcao: 'Conferente de expedicao', grauRisco: 'BAIXO' as const, riscos: 'Ergonomia' },
  { funcao: 'Analista administrativo', grauRisco: 'BAIXO' as const, riscos: 'Ergonomia' },
  { funcao: 'Pintor industrial', grauRisco: 'ALTO' as const, riscos: 'Produtos quimicos; Trabalho em altura' },
];

const MEDICOS_DEMO = [
  { nome: 'Dra. Beatriz Continentino', crm: 'CRM-GO 18442' },
  { nome: 'Dr. Marcos Aurelio Tavares', crm: 'CRM-GO 22107' },
  { nome: 'Dra. Simone Kawakami', crm: 'CRM-SP 145980' },
];

const COORDENADOR_PCMSO = 'Dr. Marcos Aurelio Tavares';

/** CPF valido a partir de um indice — dois digitos verificadores calculados. */
function cpfDeterministico(indice: number): string {
  // A base comeca em 100.000.000 para nunca cair em sequencia de digito
  // repetido (111.111.111-11 passa no calculo, mas nao e CPF valido).
  const base = String(100000000 + ((indice * 7919) % 800000000));

  const calcular = (parcial: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < parcial.length; i += 1) soma += Number(parcial[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const primeiro = calcular(base, 10);
  const segundo = calcular(`${base}${primeiro}`, 11);

  return `${base}${primeiro}${segundo}`;
}

function diasAtras(dias: number): Date {
  const data = new Date();
  data.setHours(0, 0, 0, 0);
  data.setDate(data.getDate() - dias);
  return data;
}

function somarMeses(data: Date, meses: number): Date {
  const resultado = new Date(data.getTime());
  const dia = resultado.getDate();
  resultado.setMonth(resultado.getMonth() + meses);
  if (resultado.getDate() !== dia) resultado.setDate(0);
  return resultado;
}

/**
 * Colaboradores e ASO.
 *
 * A distribuicao e proposital: a maioria em dia, uma parcela a vencer nos
 * proximos 30 dias, alguns vencidos e alguns sem nenhum exame. Sem essa
 * mistura o painel de conformidade nasce todo verde e nao mostra nada.
 */
async function semearColaboradores(): Promise<void> {
  const jaExiste = await prisma.colaborador.count();
  if (jaExiste > 0) {
    console.log(`Colaboradores ja cadastrados: ${jaExiste}.`);
    return;
  }

  const clientes = await prisma.cliente.findMany({
    select: { id: true, terceiros: { select: { id: true } }, areas: { select: { id: true } } },
  });

  if (clientes.length === 0) {
    console.log('Sem clientes — colaboradores nao semeados.');
    return;
  }

  let indice = 0;
  const criados: { id: string; grauRisco: 'BAIXO' | 'MEDIO' | 'ALTO'; admissao: Date }[] = [];

  for (const cliente of clientes) {
    const quantidade = 6 + Math.floor(sortear() * 4);

    for (let i = 0; i < quantidade; i += 1) {
      const perfil = escolher(FUNCOES_DEMO);
      const daContratada = cliente.terceiros.length > 0 && sortear() < 0.45;
      const admissao = diasAtras(200 + Math.floor(sortear() * 1500));

      const colaborador = await prisma.colaborador.create({
        data: {
          clienteId: cliente.id,
          vinculo: daContratada ? 'TERCEIRO' : 'CLIENTE',
          terceiroId: daContratada ? escolher(cliente.terceiros).id : null,
          areaId: cliente.areas.length > 0 ? escolher(cliente.areas).id : null,
          nome: NOMES_DEMO[indice % NOMES_DEMO.length]!,
          cpf: cpfDeterministico(indice),
          matricula: `M${String(1000 + indice)}`,
          funcao: perfil.funcao,
          grauRisco: perfil.grauRisco,
          riscosOcupacionais: perfil.riscos,
          dataAdmissao: admissao,
          situacao: 'ATIVO',
        },
        select: { id: true, grauRisco: true },
      });

      criados.push({ id: colaborador.id, grauRisco: colaborador.grauRisco, admissao });
      indice += 1;
    }
  }

  console.log(`Colaboradores criados: ${criados.length}`);
  await semearAsos(criados);
}

async function semearAsos(
  colaboradores: { id: string; grauRisco: 'BAIXO' | 'MEDIO' | 'ALTO'; admissao: Date }[],
): Promise<void> {
  let total = 0;
  const contagem = { emDia: 0, aVencer: 0, vencido: 0, semAso: 0 };

  for (const [posicao, colaborador] of colaboradores.entries()) {
    // A mistura e por posicao, e nao sorteada: assim o painel de demonstracao
    // sempre nasce com vencido, a vencer e sem-exame, em qualquer base.
    const faixa = posicao % 12;
    const semAso = faixa === 0;
    const vencido = faixa === 1 || faixa === 2;
    const aVencer = faixa === 3 || faixa === 4;

    if (semAso) {
      contagem.semAso += 1;
      continue;
    }

    const meses = colaborador.grauRisco === 'ALTO' ? 12 : 24;

    // Um sorteio por exame: nome e CRM tem de ser do mesmo medico.
    const medicoAdmissional = escolher(MEDICOS_DEMO);
    const medicoPeriodico = escolher(MEDICOS_DEMO);

    // Admissional, sempre.
    await prisma.aso.create({
      data: {
        colaboradorId: colaborador.id,
        tipo: 'ADMISSIONAL',
        dataExame: colaborador.admissao,
        validade: somarMeses(colaborador.admissao, meses),
        resultado: 'APTO',
        medicoNome: medicoAdmissional.nome,
        medicoCrm: medicoAdmissional.crm,
        medicoCoordenador: COORDENADOR_PCMSO,
      },
    });
    total += 1;

    // Periodico mais recente, posicionado para produzir a mistura desejada.
    let diasDesdeOExame: number;
    if (vencido) {
      diasDesdeOExame = meses * 30 + 20 + Math.floor(sortear() * 90);
      contagem.vencido += 1;
    } else if (aVencer) {
      diasDesdeOExame = meses * 30 - 15 - Math.floor(sortear() * 15);
      contagem.aVencer += 1;
    } else {
      diasDesdeOExame = Math.floor(sortear() * (meses * 30 - 120));
      contagem.emDia += 1;
    }

    const dataExame = diasAtras(diasDesdeOExame);
    const restricao = sortear() < 0.12;

    await prisma.aso.create({
      data: {
        colaboradorId: colaborador.id,
        tipo: 'PERIODICO',
        dataExame,
        validade: somarMeses(dataExame, meses),
        resultado: restricao ? 'APTO_COM_RESTRICAO' : 'APTO',
        restricoes: restricao ? 'Evitar exposicao continua a ruido acima de 85 dB(A).' : null,
        medicoNome: medicoPeriodico.nome,
        medicoCrm: medicoPeriodico.crm,
        medicoCoordenador: COORDENADOR_PCMSO,
        riscosAvaliados: 'Ruido; Ergonomia',
        examesComplementares: 'Audiometria; Acuidade visual',
      },
    });
    total += 1;
  }

  console.log(`ASOs criados: ${total}`);
  console.log(
    `  em dia ${contagem.emDia} | a vencer ${contagem.aVencer} | vencidos ${contagem.vencido} | sem ASO ${contagem.semAso}`,
  );
}

const DOCUMENTOS_DEMO = [
  { tipo: 'PGR' as const, titulo: 'PGR — Programa de Gerenciamento de Riscos', meses: 24, rt: 'Rafael Martini' },
  { tipo: 'PCMSO' as const, titulo: 'PCMSO — Programa de Controle Medico', meses: 12, rt: 'Dr. Marcos Aurelio Tavares' },
  { tipo: 'LTCAT' as const, titulo: 'LTCAT — Laudo Tecnico das Condicoes Ambientais', meses: 12, rt: 'Rafael Martini' },
  { tipo: 'PCA' as const, titulo: 'PCA — Programa de Conservacao Auditiva', meses: 12, rt: 'Rafael Martini' },
  { tipo: 'PPR' as const, titulo: 'PPR — Programa de Protecao Respiratoria', meses: 12, rt: 'Rafael Martini' },
  { tipo: 'LAUDO_ERGONOMICO' as const, titulo: 'AEP — Avaliacao Ergonomica Preliminar', meses: 24, rt: 'Ana Paula Serra' },
  { tipo: 'AVCB' as const, titulo: 'AVCB — Auto de Vistoria do Corpo de Bombeiros', meses: 12, rt: null },
  { tipo: 'LICENCA_AMBIENTAL' as const, titulo: 'Licenca de Operacao', meses: 48, rt: null },
];

/** Documentos legais por cliente, com a mesma mistura de vigencia dos ASOs. */
async function semearDocumentos(): Promise<void> {
  const jaExiste = await prisma.documentoSsma.count();
  if (jaExiste > 0) {
    console.log(`Documentos ja cadastrados: ${jaExiste}.`);
    return;
  }

  const clientes = await prisma.cliente.findMany({
    select: { id: true, terceiros: { select: { id: true } } },
  });

  let total = 0;

  for (const cliente of clientes) {
    for (const modelo of DOCUMENTOS_DEMO) {
      // Nem todo cliente tem todos os programas — a lacuna tambem e informacao.
      if (sortear() < 0.15) continue;

      const sorte = sortear();
      let emissao: Date;

      if (sorte < 0.15) emissao = diasAtras(modelo.meses * 30 + 30 + Math.floor(sortear() * 120)); // vencido
      else if (sorte < 0.3) emissao = diasAtras(modelo.meses * 30 - 20); // a vencer
      else emissao = diasAtras(Math.floor(sortear() * (modelo.meses * 30 - 120)));

      await prisma.documentoSsma.create({
        data: {
          clienteId: cliente.id,
          abrangencia: 'CLIENTE',
          tipo: modelo.tipo,
          titulo: modelo.titulo,
          numero: `DOC-${String(1000 + total)}`,
          revisao: '00',
          dataEmissao: emissao,
          validade: somarMeses(emissao, modelo.meses),
          responsavelNome: modelo.rt,
          responsavelRegistro: modelo.rt ? 'CREA-GO 12345/D' : null,
          numeroArt: modelo.rt ? `ART-${String(20000 + total)}` : null,
          situacao: 'ATIVO',
        },
      });
      total += 1;
    }

    // Pasta documental das contratadas: PGR proprio de cada terceiro.
    for (const terceiro of cliente.terceiros) {
      if (sortear() < 0.35) continue;

      const emissao = diasAtras(Math.floor(sortear() * 700));
      await prisma.documentoSsma.create({
        data: {
          clienteId: cliente.id,
          abrangencia: 'TERCEIRO',
          terceiroId: terceiro.id,
          tipo: 'PGR',
          titulo: 'PGR da empresa contratada',
          dataEmissao: emissao,
          validade: somarMeses(emissao, 24),
          responsavelNome: 'Responsavel tecnico da contratada',
          responsavelRegistro: 'CREA-GO 54321/D',
          situacao: 'ATIVO',
        },
      });
      total += 1;
    }
  }

  console.log(`Documentos criados: ${total}`);
}


/* ==========================================================================
   Etapa 11 — Treinamentos e Matriz de Capacitacao
   ========================================================================== */

/** Requisitos por funcao — espelha as funcoes usadas em FUNCOES_DEMO. */
const REQUISITOS_DEMO: Record<string, string[]> = {
  'Operador de empilhadeira': ['NR-11 — Operacao de Empilhadeira', 'Integracao de Seguranca'],
  'Soldador': ['NR-34 — Trabalho a Quente', 'NR-35 — Trabalho em Altura', 'Integracao de Seguranca'],
  'Eletricista de manutencao': ['NR-10 — Seguranca em Instalacoes Eletricas (Basico)', 'NR-35 — Trabalho em Altura', 'Integracao de Seguranca'],
  'Mecanico industrial': ['NR-12 — Seguranca em Maquinas e Equipamentos', 'Integracao de Seguranca'],
  'Auxiliar de producao': ['Integracao de Seguranca'],
  'Tecnico de laboratorio': ['Integracao de Seguranca'],
  'Operador de ponte rolante': ['NR-11 — Operacao de Empilhadeira', 'NR-35 — Trabalho em Altura', 'Integracao de Seguranca'],
  'Conferente de expedicao': ['Integracao de Seguranca'],
  'Pintor industrial': ['NR-35 — Trabalho em Altura', 'NR-33 — Espaco Confinado (Trabalhador Autorizado)', 'Integracao de Seguranca'],
};

const INSTRUTORES_DEMO = ['SENAI Sao Paulo', 'Instrutor interno — SSMA', 'Consultoria TreinaSeg'];

/**
 * Catalogo, matriz e realizacoes.
 *
 * Distribuicao por posicao (nao sorteada): a matriz de demonstracao sempre
 * nasce com em-dia, a-vencer, vencido e sem-treinamento — senao o painel
 * nasce todo verde e nao mostra nada.
 */
async function semearTreinamentos(): Promise<void> {
  const jaExiste = await prisma.treinamento.count();
  if (jaExiste > 0) {
    console.log(`Treinamentos ja cadastrados: ${jaExiste}.`);
    return;
  }

  const { CATALOGO_TREINAMENTOS_SUGERIDO } = await import('@safetyguard/shared');

  const idPorNome = new Map<string, string>();
  for (const modelo of CATALOGO_TREINAMENTOS_SUGERIDO) {
    const treinamento = await prisma.treinamento.create({
      data: {
        nome: modelo.nome,
        norma: modelo.norma,
        cargaHorariaHoras: modelo.cargaHorariaHoras,
        validadeMeses: modelo.validadeMeses,
      },
      select: { id: true, nome: true },
    });
    idPorNome.set(treinamento.nome, treinamento.id);
  }
  console.log(`Catalogo de treinamentos: ${idPorNome.size}`);

  let requisitos = 0;
  for (const [funcao, nomes] of Object.entries(REQUISITOS_DEMO)) {
    for (const nome of nomes) {
      const treinamentoId = idPorNome.get(nome);
      if (!treinamentoId) continue;
      await prisma.requisitoCapacitacao.create({ data: { funcao, treinamentoId } });
      requisitos += 1;
    }
  }
  console.log(`Requisitos da matriz: ${requisitos}`);

  const colaboradores = await prisma.colaborador.findMany({
    where: { situacao: { not: 'DESLIGADO' } },
    select: { id: true, funcao: true },
  });

  const catalogoPorId = new Map(
    (await prisma.treinamento.findMany({ select: { id: true, validadeMeses: true } })).map((t) => [t.id, t]),
  );

  let realizacoes = 0;
  const contagem = { emDia: 0, aVencer: 0, vencido: 0, sem: 0 };
  let posicao = 0;

  for (const colaborador of colaboradores) {
    const exigidos = REQUISITOS_DEMO[colaborador.funcao] ?? [];

    for (const nome of exigidos) {
      const treinamentoId = idPorNome.get(nome);
      if (!treinamentoId) continue;

      const faixa = posicao % 10;
      posicao += 1;

      // 1 em 10 nunca fez o treinamento exigido — a lacuna mais grave.
      if (faixa === 0) {
        contagem.sem += 1;
        continue;
      }

      const meses = catalogoPorId.get(treinamentoId)?.validadeMeses ?? 12;
      let diasDesde: number;
      if (faixa === 1 || faixa === 2) {
        diasDesde = meses * 30 + 15 + Math.floor(sortear() * 60); // vencido
        contagem.vencido += 1;
      } else if (faixa === 3) {
        diasDesde = meses * 30 - 12 - Math.floor(sortear() * 12); // a vencer
        contagem.aVencer += 1;
      } else {
        diasDesde = Math.floor(sortear() * Math.max(30, meses * 30 - 90)); // em dia
        contagem.emDia += 1;
      }

      const dataRealizacao = diasAtras(diasDesde);
      await prisma.treinamentoRealizado.create({
        data: {
          colaboradorId: colaborador.id,
          treinamentoId,
          dataRealizacao,
          validade: somarMeses(dataRealizacao, meses),
          instrutor: escolher(INSTRUTORES_DEMO),
        },
      });
      realizacoes += 1;
    }
  }

  console.log(`Realizacoes criadas: ${realizacoes}`);
  console.log(
    `  em dia ${contagem.emDia} | a vencer ${contagem.aVencer} | vencidos ${contagem.vencido} | sem treinamento ${contagem.sem}`,
  );
}


/* ==========================================================================
   Etapa 12 — Auditorias
   ========================================================================== */

/** Auditorias com scores variados — a nota do pilar nasce com conteudo. */
async function semearAuditorias(): Promise<void> {
  const jaExiste = await prisma.auditoria.count();
  if (jaExiste > 0) {
    console.log(`Auditorias ja cadastradas: ${jaExiste}.`);
    return;
  }

  const clientes = await prisma.cliente.findMany({ select: { id: true, nomeFantasia: true } });
  if (clientes.length === 0) return;

  const MODELOS = [
    { tipo: 'ISO_45001' as const, titulo: 'Auditoria de manutencao ISO 45001', avaliados: 120, atendidos: 112, ncMaiores: 0, ncMenores: 4, diasAtras: 45, auditor: 'Bureau Veritas' },
    { tipo: 'ISO_14001' as const, titulo: 'Auditoria de manutencao ISO 14001', avaliados: 96, atendidos: 90, ncMaiores: 1, ncMenores: 3, diasAtras: 90, auditor: 'DNV' },
    { tipo: 'INTERNA' as const, titulo: 'Auditoria interna semestral SSMA', avaliados: 80, atendidos: 68, ncMaiores: 2, ncMenores: 5, diasAtras: 30, auditor: 'Equipe SSMA — SafetyGuard' },
    { tipo: 'CLIENTE' as const, titulo: 'Auditoria de contrato do cliente', avaliados: 60, atendidos: 57, ncMaiores: 0, ncMenores: 2, diasAtras: 120, auditor: 'Auditoria corporativa do cliente' },
    { tipo: 'LEGAL' as const, titulo: 'Verificacao de requisitos legais NRs', avaliados: 150, atendidos: 131, ncMaiores: 3, ncMenores: 8, diasAtras: 60, auditor: 'Consultoria juridica SST' },
  ];

  let total = 0;
  for (const [indice, cliente] of clientes.entries()) {
    // Cada cliente recebe 2 auditorias concluidas + 1 planejada.
    for (let n = 0; n < 2; n += 1) {
      const modelo = MODELOS[(indice + n) % MODELOS.length]!;
      await prisma.auditoria.create({
        data: {
          clienteId: cliente.id,
          tipo: modelo.tipo,
          titulo: `${modelo.titulo} — ${cliente.nomeFantasia}`,
          dataRealizacao: diasAtras(modelo.diasAtras + indice * 7),
          auditor: modelo.auditor,
          situacao: 'CONCLUIDA',
          requisitosAvaliados: modelo.avaliados,
          requisitosAtendidos: modelo.atendidos - (indice % 3),
          ncMaiores: modelo.ncMaiores,
          ncMenores: modelo.ncMenores,
        },
      });
      total += 1;
    }

    await prisma.auditoria.create({
      data: {
        clienteId: cliente.id,
        tipo: 'INTERNA',
        titulo: `Auditoria interna programada — ${cliente.nomeFantasia}`,
        dataRealizacao: diasAtras(-30 - indice * 10),
        situacao: 'PLANEJADA',
      },
    });
    total += 1;
  }

  console.log(`Auditorias criadas: ${total}`);
}


/* ==========================================================================
   Etapa 13 — DDS Digital
   ========================================================================== */

/** Temas extraidos do acervo "100 Temas de DDS Prontos" (90 temas no doc). */
const TEMAS_DDS: Array<{ numero: number; titulo: string; categoria: string }> = [
  { numero: 1, titulo: "Importância do uso correto do EPI", categoria: "Uso e conservação de EPIs" },
  { numero: 2, titulo: "Como conservar seu EPI", categoria: "Uso e conservação de EPIs" },
  { numero: 3, titulo: "EPI não é enfeite: por que usar sempre", categoria: "Uso e conservação de EPIs" },
  { numero: 4, titulo: "Protetor auditivo e a perda de audição", categoria: "Uso e conservação de EPIs" },
  { numero: 5, titulo: "Óculos de proteção e a visão", categoria: "Uso e conservação de EPIs" },
  { numero: 6, titulo: "Calçado de segurança", categoria: "Uso e conservação de EPIs" },
  { numero: 7, titulo: "Luvas certas para cada tarefa", categoria: "Uso e conservação de EPIs" },
  { numero: 8, titulo: "Proteção respiratória", categoria: "Uso e conservação de EPIs" },
  { numero: 9, titulo: "Cinto de segurança em altura", categoria: "Uso e conservação de EPIs" },
  { numero: 10, titulo: "Higienização dos EPIs", categoria: "Uso e conservação de EPIs" },
  { numero: 11, titulo: "Quase-acidente também é aviso", categoria: "Prevenção de acidentes" },
  { numero: 12, titulo: "Atos inseguros x condições inseguras", categoria: "Prevenção de acidentes" },
  { numero: 13, titulo: "Pressa é inimiga da segurança", categoria: "Prevenção de acidentes" },
  { numero: 14, titulo: "Atenção plena na tarefa", categoria: "Prevenção de acidentes" },
  { numero: 15, titulo: "Distração e celular no trabalho", categoria: "Prevenção de acidentes" },
  { numero: 16, titulo: "Cuidado ao subir e descer escadas", categoria: "Prevenção de acidentes" },
  { numero: 17, titulo: "Pisos molhados e quedas", categoria: "Prevenção de acidentes" },
  { numero: 18, titulo: "Choque elétrico: como evitar", categoria: "Prevenção de acidentes" },
  { numero: 19, titulo: "Queimaduras no trabalho", categoria: "Prevenção de acidentes" },
  { numero: 20, titulo: "Acidentes de trajeto", categoria: "Prevenção de acidentes" },
  { numero: 21, titulo: "Postura correta ao sentar", categoria: "Ergonomia e saúde" },
  { numero: 22, titulo: "Levantamento manual de cargas", categoria: "Ergonomia e saúde" },
  { numero: 23, titulo: "Pausas e ginástica laboral", categoria: "Ergonomia e saúde" },
  { numero: 24, titulo: "LER/DORT: como prevenir", categoria: "Ergonomia e saúde" },
  { numero: 25, titulo: "Trabalho repetitivo", categoria: "Ergonomia e saúde" },
  { numero: 26, titulo: "Iluminação e a saúde dos olhos", categoria: "Ergonomia e saúde" },
  { numero: 27, titulo: "Hidratação no trabalho", categoria: "Ergonomia e saúde" },
  { numero: 28, titulo: "Sono e fadiga", categoria: "Ergonomia e saúde" },
  { numero: 29, titulo: "Alongamento antes da jornada", categoria: "Ergonomia e saúde" },
  { numero: 30, titulo: "Saúde mental e estresse", categoria: "Ergonomia e saúde" },
  { numero: 31, titulo: "Como usar o extintor", categoria: "Incêndio e emergências" },
  { numero: 32, titulo: "Tipos de extintores", categoria: "Incêndio e emergências" },
  { numero: 33, titulo: "Rota de fuga: você sabe a sua?", categoria: "Incêndio e emergências" },
  { numero: 34, titulo: "Plano de abandono de área", categoria: "Incêndio e emergências" },
  { numero: 35, titulo: "Primeiros socorros básicos", categoria: "Incêndio e emergências" },
  { numero: 36, titulo: "Parada cardiorrespiratória: o que fazer", categoria: "Incêndio e emergências" },
  { numero: 37, titulo: "Vazamento de gás", categoria: "Incêndio e emergências" },
  { numero: 38, titulo: "Brigada de incêndio", categoria: "Incêndio e emergências" },
  { numero: 39, titulo: "Ponto de encontro", categoria: "Incêndio e emergências" },
  { numero: 40, titulo: "Combate a princípio de incêndio", categoria: "Incêndio e emergências" },
  { numero: 41, titulo: "Trabalho em altura", categoria: "Riscos específicos" },
  { numero: 42, titulo: "Espaço confinado", categoria: "Riscos específicos" },
  { numero: 43, titulo: "Trabalho a quente (solda)", categoria: "Riscos específicos" },
  { numero: 44, titulo: "Movimentação de máquinas", categoria: "Riscos específicos" },
  { numero: 45, titulo: "Empilhadeira e pedestres", categoria: "Riscos específicos" },
  { numero: 46, titulo: "Produtos químicos e FISPQ", categoria: "Riscos específicos" },
  { numero: 47, titulo: "Ruído ocupacional", categoria: "Riscos específicos" },
  { numero: 48, titulo: "Calor e exposição ao sol", categoria: "Riscos específicos" },
  { numero: 49, titulo: "Eletricidade: NR-10 na prática", categoria: "Riscos específicos" },
  { numero: 50, titulo: "Bloqueio e etiquetagem (LOTO)", categoria: "Riscos específicos" },
  { numero: 51, titulo: "Programa 5S", categoria: "Organização e comportamento" },
  { numero: 52, titulo: "Organização do posto de trabalho", categoria: "Organização e comportamento" },
  { numero: 53, titulo: "Comunicação de condições inseguras", categoria: "Organização e comportamento" },
  { numero: 54, titulo: "Sinalização de segurança", categoria: "Organização e comportamento" },
  { numero: 55, titulo: "Trabalho em equipe e segurança", categoria: "Organização e comportamento" },
  { numero: 56, titulo: "Liderança e exemplo em SST", categoria: "Organização e comportamento" },
  { numero: 57, titulo: "Por que registrar tudo", categoria: "Organização e comportamento" },
  { numero: 58, titulo: "CIPA: o que faz", categoria: "Organização e comportamento" },
  { numero: 59, titulo: "Importância dos treinamentos", categoria: "Organização e comportamento" },
  { numero: 60, titulo: "Cultura de segurança", categoria: "Organização e comportamento" },
  { numero: 61, titulo: "SIPAT: por que participar", categoria: "Datas e campanhas" },
  { numero: 62, titulo: "Abril Verde", categoria: "Datas e campanhas" },
  { numero: 63, titulo: "Segurança fora do trabalho também", categoria: "Datas e campanhas" },
  { numero: 64, titulo: "Segurança em casa", categoria: "Datas e campanhas" },
  { numero: 65, titulo: "Direção defensiva", categoria: "Datas e campanhas" },
  { numero: 66, titulo: "Álcool e drogas no trabalho", categoria: "Datas e campanhas" },
  { numero: 67, titulo: "Tabagismo", categoria: "Datas e campanhas" },
  { numero: 68, titulo: "Alimentação saudável", categoria: "Datas e campanhas" },
  { numero: 69, titulo: "Vacinação", categoria: "Datas e campanhas" },
  { numero: 70, titulo: "Setembro Amarelo e saúde mental", categoria: "Datas e campanhas" },
  { numero: 71, titulo: "Segurança no almoxarifado", categoria: "Específicos por setor" },
  { numero: 72, titulo: "Segurança na obra", categoria: "Específicos por setor" },
  { numero: 73, titulo: "Segurança no escritório", categoria: "Específicos por setor" },
  { numero: 74, titulo: "Segurança na cozinha industrial", categoria: "Específicos por setor" },
  { numero: 75, titulo: "Segurança na manutenção", categoria: "Específicos por setor" },
  { numero: 76, titulo: "Segurança no transporte de cargas", categoria: "Específicos por setor" },
  { numero: 77, titulo: "Segurança em laboratórios", categoria: "Específicos por setor" },
  { numero: 78, titulo: "Segurança na limpeza", categoria: "Específicos por setor" },
  { numero: 79, titulo: "Segurança com ferramentas manuais", categoria: "Específicos por setor" },
  { numero: 80, titulo: "Segurança em trabalho noturno", categoria: "Específicos por setor" },
  { numero: 81, titulo: "Reportar não é dedurar", categoria: "Atitude e prevenção contínua" },
  { numero: 82, titulo: "Aprendendo com acidentes passados", categoria: "Atitude e prevenção contínua" },
  { numero: 83, titulo: "Checklist antes de iniciar a tarefa", categoria: "Atitude e prevenção contínua" },
  { numero: 84, titulo: "Permissão de trabalho (PT)", categoria: "Atitude e prevenção contínua" },
  { numero: 85, titulo: "Inspeção de rotina", categoria: "Atitude e prevenção contínua" },
  { numero: 86, titulo: "Diálogo aberto sobre riscos", categoria: "Atitude e prevenção contínua" },
  { numero: 87, titulo: "Pequenos cuidados, grandes resultados", categoria: "Atitude e prevenção contínua" },
  { numero: 88, titulo: "Você é responsável pela sua segurança", categoria: "Atitude e prevenção contínua" },
  { numero: 89, titulo: "Cuidar do colega também é segurança", categoria: "Atitude e prevenção contínua" },
  { numero: 90, titulo: "Encerrando a jornada com segurança", categoria: "Atitude e prevenção contínua" },
];

const LIDERES_DDS = ['Rafael Martini', 'Marina Duarte', 'Enio Dias Filho', 'Carla Nunes'];

async function semearDds(): Promise<void> {
  const jaExiste = await prisma.temaDds.count();
  if (jaExiste > 0) {
    console.log(`Temas de DDS ja cadastrados: ${jaExiste}.`);
    return;
  }

  await prisma.temaDds.createMany({ data: TEMAS_DDS });
  console.log(`Temas de DDS: ${TEMAS_DDS.length}`);

  const temas = await prisma.temaDds.findMany({ select: { id: true }, orderBy: { numero: 'asc' } });
  const clientes = await prisma.cliente.findMany({
    select: { id: true, areas: { select: { id: true } } },
  });

  // Um DDS por dia util nos ultimos 21 dias, por cliente — constancia real.
  let registros = 0;
  for (const [indiceCliente, cliente] of clientes.entries()) {
    for (let dia = 1; dia <= 30; dia += 1) {
      const data = diasAtras(dia);
      const diaSemana = data.getDay();
      if (diaSemana === 0 || diaSemana === 6) continue;
      // Nem todo dia foi registrado — 85% de constancia e mais realista que 100%.
      if ((dia + indiceCliente) % 7 === 0) continue;

      await prisma.registroDds.create({
        data: {
          clienteId: cliente.id,
          areaId: cliente.areas.length > 0 ? escolher(cliente.areas).id : null,
          temaId: escolher(temas).id,
          data,
          lider: escolher(LIDERES_DDS),
          participantes: 6 + Math.floor(sortear() * 14),
          duracaoMinutos: 10 + Math.floor(sortear() * 10),
        },
      });
      registros += 1;
    }
  }

  console.log(`Registros de DDS: ${registros}`);
}


/* ==========================================================================
   Etapa 14 — EPI e Estoque
   ========================================================================== */

const EPIS_DEMO = [
  { nome: 'Capacete de seguranca classe B', ca: '31469', validadeDias: 400, estoque: 45, minimo: 10 },
  { nome: 'Oculos de protecao incolor', ca: '10346', validadeDias: 200, estoque: 8, minimo: 15 },
  { nome: 'Protetor auricular tipo plug', ca: '5674', validadeDias: 90, estoque: 120, minimo: 50 },
  { nome: 'Luva de vaqueta', ca: '29659', validadeDias: -20, estoque: 30, minimo: 12 },
  { nome: 'Botina de seguranca com bico composite', ca: '41093', validadeDias: 600, estoque: 22, minimo: 8 },
  { nome: 'Cinto de seguranca tipo paraquedista', ca: '35519', validadeDias: 25, estoque: 6, minimo: 4 },
  { nome: 'Respirador PFF2', ca: '38508', validadeDias: 300, estoque: 200, minimo: 80 },
];

async function semearEpis(): Promise<void> {
  const jaExiste = await prisma.epi.count();
  if (jaExiste > 0) {
    console.log(`EPIs ja cadastrados: ${jaExiste}.`);
    return;
  }

  const criados: string[] = [];
  for (const modelo of EPIS_DEMO) {
    const epi = await prisma.epi.create({
      data: {
        nome: modelo.nome,
        ca: modelo.ca,
        validadeCa: diasAtras(-modelo.validadeDias),
        estoqueAtual: modelo.estoque,
        estoqueMinimo: modelo.minimo,
      },
      select: { id: true },
    });
    criados.push(epi.id);
  }
  console.log(`EPIs criados: ${criados.length}`);

  const colaboradores = await prisma.colaborador.findMany({
    where: { situacao: 'ATIVO' },
    select: { id: true },
    take: 12,
  });

  let entregas = 0;
  for (const [indice, colaborador] of colaboradores.entries()) {
    const epiId = criados[indice % criados.length]!;
    await prisma.entregaEpi.create({
      data: {
        epiId,
        colaboradorId: colaborador.id,
        data: diasAtras(3 + indice * 2),
        quantidade: 1,
        motivo: indice % 4 === 0 ? 'SUBSTITUICAO' : 'PRIMEIRA_ENTREGA',
      },
    });
    await prisma.epi.update({ where: { id: epiId }, data: { estoqueAtual: { decrement: 1 } } });
    entregas += 1;
  }
  console.log(`Entregas de EPI: ${entregas}`);
}


/* ==========================================================================
   Etapa 16 — Meio Ambiente e ESG
   ========================================================================== */

/**
 * Leituras mensais ESG dos ultimos 6 meses.
 * Nenhuma ocorrencia ambiental e semeada: a meta e zero, e o estado inicial
 * honesto e o historico limpo — a nota do pilar nasce em 100.
 */
async function semearMeioAmbiente(): Promise<void> {
  const jaExiste = await prisma.indicadorAmbiental.count();
  if (jaExiste > 0) {
    console.log(`Leituras ESG ja cadastradas: ${jaExiste}.`);
    return;
  }

  const clientes = await prisma.cliente.findMany({ select: { id: true } });
  const agora = new Date();
  let leituras = 0;

  for (const [indice, cliente] of clientes.entries()) {
    for (let mes = 1; mes <= 6; mes += 1) {
      const competencia = new Date(agora.getFullYear(), agora.getMonth() - mes, 1);
      const base = 1 + indice * 0.35;
      const residuos = Math.round((3000 + mes * 120) * base);

      await prisma.indicadorAmbiental.create({
        data: {
          clienteId: cliente.id,
          competencia,
          aguaM3: Math.round((420 - mes * 8) * base),
          energiaKwh: Math.round((38000 - mes * 600) * base),
          residuosKg: residuos,
          residuosRecicladosKg: Math.round(residuos * (0.52 + mes * 0.015)),
          emissoesTco2: Math.round((12.4 - mes * 0.2) * base * 1000) / 1000,
        },
      });
      leituras += 1;
    }
  }

  console.log(`Leituras ESG: ${leituras}`);
}

async function main(): Promise<void> {
  await semearAdministrador();
  const empresaId = await semearMatriz();
  await semearClientes(empresaId);
  await semearCentros(empresaId);
  await semearTerceiros();
  await semearAreas();
  await semearObservacoes();
  await semearPlanosDeAcao();
  await semearColaboradores();
  await semearDocumentos();
  await semearTreinamentos();
  await semearAuditorias();
  await semearDds();
  await semearEpis();
  await semearMeioAmbiente();
}

main()
  .catch((erro) => {
    console.error('Falha no seed:', erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
