import { describe, expect, it } from 'vitest';
import {
  COR_PRIMARIA_PADRAO,
  TIMEZONE_PADRAO,
  empresaConsultoriaCreateSchema,
  empresaConsultoriaUpdateSchema,
} from './empresa-consultoria.js';
import { montarCabecalhoInstitucional } from '../institucional.js';

const empresaValida = {
  razaoSocial: 'SafetyGuard Consultoria em SST Ltda',
  nomeFantasia: 'SafetyGuard',
  cnpj: '11.222.333/0001-81',
  email: 'Contato@SafetyGuard.com.br',
  telefone: '(62) 3333-4444',
  whatsapp: '(62) 99988-7766',
  cep: '74000-000',
  logradouro: 'Avenida T-63',
  numero: '1200',
  bairro: 'Setor Bueno',
  cidade: 'Goiania',
  uf: 'go',
  responsavelTecnicoNome: 'Rafael Martini',
  responsavelTecnicoTipoRegistro: 'CREA' as const,
  responsavelTecnicoRegistro: '12345/D',
};

describe('empresaConsultoriaCreateSchema', () => {
  it('normaliza documentos, e-mail e UF', () => {
    const empresa = empresaConsultoriaCreateSchema.parse(empresaValida);

    expect(empresa.cnpj).toBe('11222333000181');
    expect(empresa.cep).toBe('74000000');
    expect(empresa.telefone).toBe('6233334444');
    expect(empresa.whatsapp).toBe('62999887766');
    expect(empresa.email).toBe('contato@safetyguard.com.br');
    expect(empresa.uf).toBe('GO');
  });

  it('aplica os padroes de marca e fuso horario', () => {
    const empresa = empresaConsultoriaCreateSchema.parse(empresaValida);

    expect(empresa.corPrimaria).toBe(COR_PRIMARIA_PADRAO);
    expect(empresa.timezone).toBe(TIMEZONE_PADRAO);
    expect(empresa.ativa).toBe(true);
  });

  it('converte campos opcionais vazios em null', () => {
    const empresa = empresaConsultoriaCreateSchema.parse({
      ...empresaValida,
      complemento: '   ',
      site: '',
      inscricaoEstadual: '',
    });

    expect(empresa.complemento).toBeNull();
    expect(empresa.site).toBeNull();
    expect(empresa.inscricaoEstadual).toBeNull();
  });

  it('rejeita CNPJ invalido apontando o campo', () => {
    const resultado = empresaConsultoriaCreateSchema.safeParse({ ...empresaValida, cnpj: '11222333000182' });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.path).toEqual(['cnpj']);
    }
  });

  it('rejeita WhatsApp que nao seja celular', () => {
    const resultado = empresaConsultoriaCreateSchema.safeParse({ ...empresaValida, whatsapp: '(62) 3333-4444' });
    expect(resultado.success).toBe(false);
  });

  it('rejeita data de fundacao no futuro', () => {
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const resultado = empresaConsultoriaCreateSchema.safeParse({ ...empresaValida, dataFundacao: amanha });
    expect(resultado.success).toBe(false);
  });

  it('rejeita cor fora do formato hexadecimal', () => {
    const resultado = empresaConsultoriaCreateSchema.safeParse({ ...empresaValida, corPrimaria: 'verde' });
    expect(resultado.success).toBe(false);
  });

  it('exige os campos obrigatorios da Etapa 1', () => {
    const resultado = empresaConsultoriaCreateSchema.safeParse({});
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const campos = resultado.error.issues.map((issue) => issue.path[0]);
      expect(campos).toEqual(
        expect.arrayContaining([
          'razaoSocial',
          'nomeFantasia',
          'cnpj',
          'email',
          'telefone',
          'cep',
          'logradouro',
          'numero',
          'bairro',
          'cidade',
          'uf',
          'responsavelTecnicoNome',
          'responsavelTecnicoTipoRegistro',
          'responsavelTecnicoRegistro',
        ]),
      );
    }
  });
});

describe('empresaConsultoriaUpdateSchema', () => {
  it('aceita atualizacao parcial', () => {
    const resultado = empresaConsultoriaUpdateSchema.safeParse({ nomeFantasia: 'SafetyGuard EHS' });
    expect(resultado.success).toBe(true);
  });

  it('mantem a validacao dos campos enviados', () => {
    const resultado = empresaConsultoriaUpdateSchema.safeParse({ cnpj: '00000000000000' });
    expect(resultado.success).toBe(false);
  });
});

describe('montarCabecalhoInstitucional', () => {
  const empresa = empresaConsultoriaCreateSchema.parse({
    ...empresaValida,
    complemento: 'Sala 1502',
    site: 'https://safetyguard.com.br',
  });

  it('monta as linhas usadas em relatorios e e-mails', () => {
    const cabecalho = montarCabecalhoInstitucional(empresa);

    expect(cabecalho.nomeExibicao).toBe('SafetyGuard');
    expect(cabecalho.cnpjFormatado).toBe('11.222.333/0001-81');
    expect(cabecalho.enderecoLinha).toBe(
      'Avenida T-63, 1200 — Sala 1502 · Setor Bueno · Goiania/GO · CEP 74000-000',
    );
    expect(cabecalho.contatoLinha).toContain('(62) 3333-4444');
    expect(cabecalho.contatoLinha).toContain('WhatsApp (62) 99988-7766');
    expect(cabecalho.responsavelTecnicoLinha).toBe('Rafael Martini — CREA 12345/D');
  });

  it('gera rodape e assinatura padrao quando nao informados', () => {
    const cabecalho = montarCabecalhoInstitucional(empresa);

    expect(cabecalho.rodapeRelatorio).toContain('CNPJ 11.222.333/0001-81');
    expect(cabecalho.assinaturaEmail).toContain('SafetyGuard');
    expect(cabecalho.cabecalhoWhatsapp).toContain('SafetyGuard EHS 360');
  });

  it('respeita os textos personalizados da empresa', () => {
    const cabecalho = montarCabecalhoInstitucional({
      ...empresa,
      rodapeRelatorio: 'Documento controlado — proibida a reproducao.',
    });

    expect(cabecalho.rodapeRelatorio).toBe('Documento controlado — proibida a reproducao.');
  });
});
