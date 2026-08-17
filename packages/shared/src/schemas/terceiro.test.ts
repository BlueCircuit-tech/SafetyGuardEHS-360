import { describe, expect, it } from 'vitest';
import {
  COR_DESTAQUE_TERCEIRO_PADRAO,
  META_NOTA_SSMA_PADRAO,
  classificarNotaSsma,
  rotuloClassificacao,
  terceiroCreateSchema,
  terceiroFiltroSchema,
  terceiroUpdateSchema,
} from './terceiro.js';

const CLIENTE_ID = '3f1b7c2a-9d4e-4a1b-8c5d-0e2f6a7b8c9d';

const terceiroValido = {
  clienteId: CLIENTE_ID,
  razaoSocial: 'Montalta Servicos Industriais Ltda',
  nomeFantasia: 'Montalta',
  cnpj: '11.222.333/0001-81',
  atividadePrincipal: 'Montagem eletromecanica',
  dataInicioAtuacao: '2025-03-10',
  quantidadeFuncionarios: '48',
  grauRisco: '4',
  responsavelNome: 'Everton Ferraz',
  responsavelEmail: 'Everton.Ferraz@Montalta.com.br',
  responsavelTelefone: '(62) 3211-5500',
};

describe('classificarNotaSsma', () => {
  it('mapeia a nota para a faixa correta do ranking', () => {
    expect(classificarNotaSsma(100)).toBe('A');
    expect(classificarNotaSsma(90)).toBe('A');
    expect(classificarNotaSsma(89.9)).toBe('B');
    expect(classificarNotaSsma(75)).toBe('B');
    expect(classificarNotaSsma(74.9)).toBe('C');
    expect(classificarNotaSsma(60)).toBe('C');
    expect(classificarNotaSsma(59.9)).toBe('D');
    expect(classificarNotaSsma(0)).toBe('D');
  });

  it('devolve null quando o terceiro ainda nao foi avaliado', () => {
    expect(classificarNotaSsma(null)).toBeNull();
    expect(classificarNotaSsma(undefined)).toBeNull();
    expect(rotuloClassificacao(null)).toBe('Nao avaliado');
  });

  it('rotula cada faixa', () => {
    expect(rotuloClassificacao('A')).toBe('Excelente');
    expect(rotuloClassificacao('D')).toBe('Critico');
  });
});

describe('terceiroCreateSchema', () => {
  it('normaliza documentos, e-mail e numeros vindos como texto', () => {
    const terceiro = terceiroCreateSchema.parse(terceiroValido);

    expect(terceiro.cnpj).toBe('11222333000181');
    expect(terceiro.responsavelTelefone).toBe('6232115500');
    expect(terceiro.responsavelEmail).toBe('everton.ferraz@montalta.com.br');
    expect(terceiro.quantidadeFuncionarios).toBe(48);
    expect(terceiro.grauRisco).toBe(4);
  });

  it('aplica os padroes de situacao, vinculo, meta e cor', () => {
    const terceiro = terceiroCreateSchema.parse(terceiroValido);

    expect(terceiro.situacao).toBe('ATIVO');
    expect(terceiro.tipoVinculo).toBe('CONTRATO');
    expect(terceiro.metaNotaSsma).toBe(META_NOTA_SSMA_PADRAO);
    expect(terceiro.corDestaque).toBe(COR_DESTAQUE_TERCEIRO_PADRAO);
    expect(terceiro.possuiPgr).toBe(false);
    expect(terceiro.notaSsma).toBeNull();
  });

  it('exige a data da avaliacao quando ha nota lancada', () => {
    const resultado = terceiroCreateSchema.safeParse({ ...terceiroValido, notaSsma: '92.5' });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.path).toEqual(['dataUltimaAvaliacao']);
    }
  });

  it('aceita nota acompanhada da data da avaliacao', () => {
    const terceiro = terceiroCreateSchema.parse({
      ...terceiroValido,
      notaSsma: '92.5',
      dataUltimaAvaliacao: '2026-07-31',
    });

    expect(terceiro.notaSsma).toBe(92.5);
    expect(classificarNotaSsma(terceiro.notaSsma)).toBe('A');
  });

  it('rejeita nota fora de 0..100', () => {
    const base = { ...terceiroValido, dataUltimaAvaliacao: '2026-07-31' };
    expect(terceiroCreateSchema.safeParse({ ...base, notaSsma: '101' }).success).toBe(false);
    expect(terceiroCreateSchema.safeParse({ ...base, notaSsma: '-1' }).success).toBe(false);
  });

  it('aceita o bloco de endereco totalmente vazio', () => {
    const terceiro = terceiroCreateSchema.parse(terceiroValido);
    expect(terceiro.cep).toBeNull();
    expect(terceiro.cidade).toBeNull();
  });

  it('rejeita endereco preenchido pela metade', () => {
    const resultado = terceiroCreateSchema.safeParse({
      ...terceiroValido,
      cep: '74910-000',
      logradouro: 'Rua Industrial',
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const campos = resultado.error.issues.map((issue) => issue.path[0]);
      expect(campos).toEqual(expect.arrayContaining(['numero', 'bairro', 'cidade', 'uf']));
      expect(campos).not.toContain('cep');
    }
  });

  it('aceita o endereco completo', () => {
    const resultado = terceiroCreateSchema.safeParse({
      ...terceiroValido,
      cep: '74910-000',
      logradouro: 'Rua Industrial',
      numero: '340',
      bairro: 'Distrito Industrial',
      cidade: 'Aparecida de Goiania',
      uf: 'go',
    });

    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data.uf).toBe('GO');
  });

  it('rejeita fim de atuacao anterior ao inicio', () => {
    const resultado = terceiroCreateSchema.safeParse({
      ...terceiroValido,
      dataInicioAtuacao: '2026-06-01',
      dataFimAtuacao: '2026-01-01',
    });
    expect(resultado.success).toBe(false);
  });

  it('exige data de encerramento ao encerrar a atuacao', () => {
    const resultado = terceiroCreateSchema.safeParse({ ...terceiroValido, situacao: 'ENCERRADO' });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.message).toContain('data de encerramento');
    }
  });

  it('exige cliente valido', () => {
    expect(terceiroCreateSchema.safeParse({ ...terceiroValido, clienteId: 'nao-e-uuid' }).success).toBe(false);
  });

  it('exige os campos obrigatorios da Etapa 3', () => {
    const resultado = terceiroCreateSchema.safeParse({});
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const campos = resultado.error.issues.map((issue) => issue.path[0]);
      expect(campos).toEqual(
        expect.arrayContaining([
          'clienteId',
          'razaoSocial',
          'nomeFantasia',
          'cnpj',
          'atividadePrincipal',
          'dataInicioAtuacao',
          'quantidadeFuncionarios',
          'grauRisco',
          'responsavelNome',
          'responsavelEmail',
          'responsavelTelefone',
        ]),
      );
    }
  });
});

describe('terceiroUpdateSchema', () => {
  it('aceita atualizacao parcial', () => {
    expect(terceiroUpdateSchema.safeParse({ situacao: 'BLOQUEADO' }).success).toBe(true);
  });

  it('mantem a validacao dos campos enviados', () => {
    expect(terceiroUpdateSchema.safeParse({ cnpj: '00000000000000' }).success).toBe(false);
  });

  it('continua exigindo a data da avaliacao ao lancar nota', () => {
    expect(terceiroUpdateSchema.safeParse({ notaSsma: '70' }).success).toBe(false);
    expect(terceiroUpdateSchema.safeParse({ notaSsma: '70', dataUltimaAvaliacao: '2026-08-01' }).success).toBe(true);
  });
});

describe('terceiroFiltroSchema', () => {
  it('aplica paginacao e ordenacao padrao', () => {
    const filtro = terceiroFiltroSchema.parse({});
    expect(filtro.ordenarPor).toBe('nomeFantasia');
    expect(filtro.pagina).toBe(1);
    expect(filtro.porPagina).toBe(20);
  });

  it('aceita ordenar pela nota e filtrar por classificacao', () => {
    const filtro = terceiroFiltroSchema.parse({ ordenarPor: 'notaSsma', direcao: 'desc', classificacao: 'D' });
    expect(filtro.ordenarPor).toBe('notaSsma');
    expect(filtro.direcao).toBe('desc');
    expect(filtro.classificacao).toBe('D');
  });

  it('rejeita classificacao invalida', () => {
    expect(terceiroFiltroSchema.safeParse({ classificacao: 'F' }).success).toBe(false);
  });
});
