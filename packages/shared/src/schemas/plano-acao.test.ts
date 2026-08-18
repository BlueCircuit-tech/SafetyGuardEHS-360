import { describe, expect, it } from 'vitest';
import {
  PRAZO_PADRAO_POR_CRITICIDADE,
  criticidadePeloGrau,
  estaEmAberto,
  planoAcaoCreateSchema,
  planoAcaoFiltroSchema,
  planoAcaoUpdateSchema,
} from './plano-acao.js';
import { montarMensagensAlerta } from '../indicadores/mensagens.js';
import { resolverComunicacao } from '../indicadores/comunicacao.js';
import { montarCabecalhoInstitucional } from '../institucional.js';
import { empresaConsultoriaCreateSchema } from './empresa-consultoria.js';

const AREA_ID = '3f1b7c2a-9d4e-4a1b-8c5d-0e2f6a7b8c9d';

const base = {
  acao: 'Isolar a area e emitir laudo de liberacao',
  responsavelNome: 'Joao Amaral',
  criticidade: 'ALTA' as const,
  prazo: '2026-09-01T12:00:00.000Z',
  areaId: AREA_ID,
};

describe('criticidade e prazo', () => {
  it('deriva a criticidade do grau de risco da ocorrencia', () => {
    expect(criticidadePeloGrau('I')).toBe('CRITICA');
    expect(criticidadePeloGrau('II')).toBe('MEDIA');
    expect(criticidadePeloGrau('III')).toBe('BAIXA');
    expect(criticidadePeloGrau(null)).toBe('MEDIA');
  });

  it('quanto mais critico, menor o prazo', () => {
    expect(PRAZO_PADRAO_POR_CRITICIDADE.CRITICA).toBe(0);
    expect(PRAZO_PADRAO_POR_CRITICIDADE.CRITICA).toBeLessThan(PRAZO_PADRAO_POR_CRITICIDADE.ALTA);
    expect(PRAZO_PADRAO_POR_CRITICIDADE.ALTA).toBeLessThan(PRAZO_PADRAO_POR_CRITICIDADE.MEDIA);
    expect(PRAZO_PADRAO_POR_CRITICIDADE.MEDIA).toBeLessThan(PRAZO_PADRAO_POR_CRITICIDADE.BAIXA);
  });

  it('sabe quais status ainda consomem prazo', () => {
    expect(estaEmAberto('ABERTO')).toBe(true);
    expect(estaEmAberto('EM_ANDAMENTO')).toBe(true);
    expect(estaEmAberto('CONCLUIDO')).toBe(false);
    expect(estaEmAberto('CANCELADO')).toBe(false);
  });
});

describe('planoAcaoCreateSchema', () => {
  it('aceita um plano manual completo', () => {
    const plano = planoAcaoCreateSchema.parse(base);

    expect(plano.status).toBe('ABERTO');
    expect(plano.origem).toBe('MANUAL');
    expect(plano.prazo).toBeInstanceOf(Date);
    expect(plano.dataConclusao).toBeNull();
  });

  it('exige os campos obrigatorios', () => {
    const resultado = planoAcaoCreateSchema.safeParse({});
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const campos = resultado.error.issues.map((issue) => issue.path[0]);
      expect(campos).toEqual(expect.arrayContaining(['acao', 'responsavelNome', 'criticidade', 'prazo']));
    }
  });

  it('exige a observacao quando a origem e OBSERVACAO', () => {
    const resultado = planoAcaoCreateSchema.safeParse({ ...base, origem: 'OBSERVACAO', observacaoId: '' });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues.some((issue) => issue.path[0] === 'observacaoId')).toBe(true);
    }
  });

  it('nao deixa concluir sem evidencia nem comentario', () => {
    const resultado = planoAcaoCreateSchema.safeParse({ ...base, status: 'CONCLUIDO' });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.message).toContain('evidencia');
    }
  });

  it('aceita conclusao com evidencia', () => {
    expect(
      planoAcaoCreateSchema.safeParse({ ...base, status: 'CONCLUIDO', evidenciaUrl: '/arquivos/foto.png' }).success,
    ).toBe(true);
  });

  it('aceita conclusao com comentario descritivo', () => {
    expect(
      planoAcaoCreateSchema.safeParse({ ...base, status: 'CONCLUIDO', comentarioConclusao: 'Corrigido e conferido.' })
        .success,
    ).toBe(true);
  });

  it('rejeita data de conclusao em plano ainda aberto', () => {
    const resultado = planoAcaoCreateSchema.safeParse({
      ...base,
      status: 'EM_ANDAMENTO',
      dataConclusao: '2026-09-01T12:00:00.000Z',
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues.some((issue) => issue.path[0] === 'dataConclusao')).toBe(true);
    }
  });

  it('devolve mensagem em pt-BR para prazo ausente', () => {
    const resultado = planoAcaoCreateSchema.safeParse({ ...base, prazo: '' });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const issue = resultado.error.issues.find((item) => item.path[0] === 'prazo');
      expect(issue?.message).toBe('Prazo e obrigatoria.');
    }
  });
});

describe('planoAcaoUpdateSchema', () => {
  it('aceita atualizacao parcial', () => {
    expect(planoAcaoUpdateSchema.safeParse({ status: 'EM_ANDAMENTO' }).success).toBe(true);
  });

  it('mantem a exigencia de evidencia ao concluir', () => {
    expect(planoAcaoUpdateSchema.safeParse({ status: 'CONCLUIDO' }).success).toBe(false);
    expect(planoAcaoUpdateSchema.safeParse({ status: 'CONCLUIDO', comentarioConclusao: 'Feito.' }).success).toBe(true);
  });
});

describe('planoAcaoFiltroSchema', () => {
  it('ordena por prazo crescente por padrao', () => {
    const filtro = planoAcaoFiltroSchema.parse({});
    expect(filtro.ordenarPor).toBe('prazo');
    expect(filtro.direcao).toBe('asc');
  });

  it('aceita o recorte de atrasados', () => {
    expect(planoAcaoFiltroSchema.parse({ atrasados: 'true' }).atrasados).toBe('true');
  });
});

describe('montarMensagensAlerta', () => {
  const empresa = empresaConsultoriaCreateSchema.parse({
    razaoSocial: 'SafetyGuard Consultoria em SST Ltda',
    nomeFantasia: 'SafetyGuard',
    cnpj: '11.222.333/0001-81',
    email: 'contato@safetyguard.com.br',
    telefone: '(62) 3333-4444',
    cep: '74000-000',
    logradouro: 'Avenida T-63',
    numero: '1200',
    bairro: 'Setor Bueno',
    cidade: 'Goiania',
    uf: 'GO',
    responsavelTecnicoNome: 'Rafael Martini',
    responsavelTecnicoTipoRegistro: 'CREA',
    responsavelTecnicoRegistro: '12345/D',
  });

  const cabecalho = montarCabecalhoInstitucional(empresa);

  const contextoBase = {
    cabecalho,
    cliente: 'Vale Verde Mineracao',
    area: 'Britagem — Planta 2',
    classificacao: 'Condicao Insegura',
    grauRisco: 'I',
    tipo: 'Falta de sinalizacao',
    descricao: 'Area sem sinalizacao de advertencia no acesso principal.',
    responsavel: 'Joao Amaral',
    dataHora: new Date('2026-08-04T13:45:00'),
    regra: resolverComunicacao('CONDICAO_INSEGURA', 'I'),
  };

  it('monta o assunto no formato do plano diretor', () => {
    const { emailAssunto } = montarMensagensAlerta(contextoBase);

    expect(emailAssunto).toContain('ALERTA SSMA');
    expect(emailAssunto).toContain('Condicao Insegura');
    expect(emailAssunto).toContain('Falta de sinalizacao');
    expect(emailAssunto.startsWith('🚨')).toBe(true);
  });

  it('inclui os detalhes e a acao requerida no corpo do e-mail', () => {
    const { emailCorpo } = montarMensagensAlerta(contextoBase);

    expect(emailCorpo).toContain('Cliente: Vale Verde Mineracao');
    expect(emailCorpo).toContain('Grau de Risco: I');
    expect(emailCorpo).toContain('Ação requerida: Isolar area.');
    expect(emailCorpo).toContain('Prazo: Imediato');
  });

  it('assina o e-mail com o bloco institucional da matriz', () => {
    const { emailCorpo } = montarMensagensAlerta(contextoBase);

    expect(emailCorpo).toContain(cabecalho.assinaturaEmail);
    expect(emailCorpo).toContain(cabecalho.rodapeRelatorio);
  });

  it('usa o cabecalho de WhatsApp configurado na matriz', () => {
    const { whatsapp } = montarMensagensAlerta(contextoBase);

    expect(whatsapp.startsWith(cabecalho.cabecalhoWhatsapp)).toBe(true);
    expect(whatsapp).toContain('*ALERTA SSMA*');
    expect(whatsapp).toContain('Ação: Isolar area');
  });

  it('omite a linha de empresa quando nao ha terceiro', () => {
    const { emailCorpo, whatsapp } = montarMensagensAlerta(contextoBase);

    expect(emailCorpo).not.toContain('• Empresa:');
    expect(whatsapp).not.toContain('Empresa:');
  });

  it('inclui a empresa contratada quando informada', () => {
    const { emailCorpo, whatsapp } = montarMensagensAlerta({ ...contextoBase, terceiro: 'Montalta' });

    expect(emailCorpo).toContain('• Empresa: Montalta');
    expect(whatsapp).toContain('Empresa: Montalta');
  });

  it('muda o texto quando e escalonamento', () => {
    const { emailAssunto, emailCorpo } = montarMensagensAlerta({ ...contextoBase, nivelAcionado: 'GERENTE' });

    expect(emailAssunto).toContain('ESCALONAMENTO SSMA');
    expect(emailCorpo).toContain('não foi concluída no prazo');
    expect(emailCorpo).toContain('Gerente');
  });

  it('usa emoji menos urgente para prazos longos', () => {
    const { emailAssunto } = montarMensagensAlerta({
      ...contextoBase,
      regra: resolverComunicacao('CONDICAO_INSEGURA', 'II'),
    });

    expect(emailAssunto.startsWith('📋')).toBe(true);
  });
});
