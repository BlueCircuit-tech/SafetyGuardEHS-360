import { describe, expect, it } from 'vitest';
import {
  COR_DESTAQUE_PADRAO,
  META_INDICE_GLOBAL_PADRAO,
  clienteCreateSchema,
  clienteFiltroSchema,
  clienteUpdateSchema,
} from './cliente.js';

const clienteValido = {
  razaoSocial: 'Vale Verde Mineracao e Britagem S.A.',
  nomeFantasia: 'Vale Verde Mineracao',
  cnpj: '11.222.333/0001-81',
  numeroContrato: '4501',
  dataInicioContrato: '2024-02-01',
  grauRisco: '4',
  quantidadeFuncionarios: '640',
  contatoNome: 'Juliana Amaral',
  contatoEmail: 'Juliana.Amaral@ValeVerde.com.br',
  contatoTelefone: '(62) 3222-1010',
  cep: '75380-000',
  logradouro: 'Rodovia GO-060, km 42',
  numero: 'S/N',
  bairro: 'Zona Rural',
  cidade: 'Trindade',
  uf: 'go',
};

describe('clienteCreateSchema', () => {
  it('normaliza documentos, e-mail, UF e numeros vindos como texto', () => {
    const cliente = clienteCreateSchema.parse(clienteValido);

    expect(cliente.cnpj).toBe('11222333000181');
    expect(cliente.cep).toBe('75380000');
    expect(cliente.contatoTelefone).toBe('6232221010');
    expect(cliente.contatoEmail).toBe('juliana.amaral@valeverde.com.br');
    expect(cliente.uf).toBe('GO');
    expect(cliente.grauRisco).toBe(4);
    expect(cliente.quantidadeFuncionarios).toBe(640);
  });

  it('aplica os padroes de situacao, meta e cor', () => {
    const cliente = clienteCreateSchema.parse(clienteValido);

    expect(cliente.situacao).toBe('ATIVO');
    expect(cliente.metaIndiceGlobal).toBe(META_INDICE_GLOBAL_PADRAO);
    expect(cliente.corDestaque).toBe(COR_DESTAQUE_PADRAO);
    expect(cliente.possuiCipa).toBe(false);
  });

  it('converte opcionais vazios em null', () => {
    const cliente = clienteCreateSchema.parse({
      ...clienteValido,
      segmento: '',
      valorMensal: '',
      dataFimContrato: '',
      diaVencimento: '  ',
    });

    expect(cliente.segmento).toBeNull();
    expect(cliente.valorMensal).toBeNull();
    expect(cliente.dataFimContrato).toBeNull();
    expect(cliente.diaVencimento).toBeNull();
  });

  it('rejeita grau de risco fora da faixa da NR-4', () => {
    for (const grauRisco of ['0', '5']) {
      const resultado = clienteCreateSchema.safeParse({ ...clienteValido, grauRisco });
      expect(resultado.success).toBe(false);
      if (!resultado.success) {
        expect(resultado.error.issues[0]?.path).toEqual(['grauRisco']);
      }
    }
  });

  it('rejeita fim de contrato anterior ao inicio', () => {
    const resultado = clienteCreateSchema.safeParse({
      ...clienteValido,
      dataInicioContrato: '2026-06-01',
      dataFimContrato: '2026-01-01',
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues.some((issue) => issue.path[0] === 'dataFimContrato')).toBe(true);
    }
  });

  it('exige data de encerramento quando o contrato e marcado como encerrado', () => {
    const resultado = clienteCreateSchema.safeParse({ ...clienteValido, situacao: 'ENCERRADO' });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.message).toContain('data de encerramento');
    }
  });

  it('aceita contrato encerrado com data de fim', () => {
    const resultado = clienteCreateSchema.safeParse({
      ...clienteValido,
      situacao: 'ENCERRADO',
      dataFimContrato: '2025-12-31',
    });

    expect(resultado.success).toBe(true);
  });

  it('rejeita dia de vencimento fora de 1..31 e meta fora de 0..100', () => {
    expect(clienteCreateSchema.safeParse({ ...clienteValido, diaVencimento: '32' }).success).toBe(false);
    expect(clienteCreateSchema.safeParse({ ...clienteValido, metaIndiceGlobal: '120' }).success).toBe(false);
  });

  it('exige os campos obrigatorios da Etapa 2', () => {
    const resultado = clienteCreateSchema.safeParse({});
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const campos = resultado.error.issues.map((issue) => issue.path[0]);
      expect(campos).toEqual(
        expect.arrayContaining([
          'razaoSocial',
          'nomeFantasia',
          'cnpj',
          'numeroContrato',
          'dataInicioContrato',
          'grauRisco',
          'quantidadeFuncionarios',
          'contatoNome',
          'contatoEmail',
          'contatoTelefone',
          'cep',
          'logradouro',
          'numero',
          'bairro',
          'cidade',
          'uf',
        ]),
      );
    }
  });
});

describe('clienteUpdateSchema', () => {
  it('aceita atualizacao parcial', () => {
    expect(clienteUpdateSchema.safeParse({ situacao: 'SUSPENSO' }).success).toBe(true);
  });

  it('mantem a validacao dos campos enviados', () => {
    expect(clienteUpdateSchema.safeParse({ cnpj: '00000000000000' }).success).toBe(false);
  });

  it('continua validando a coerencia das datas no payload parcial', () => {
    const resultado = clienteUpdateSchema.safeParse({
      dataInicioContrato: '2026-06-01',
      dataFimContrato: '2026-05-01',
    });
    expect(resultado.success).toBe(false);
  });
});

describe('clienteFiltroSchema', () => {
  it('aplica paginacao e ordenacao padrao', () => {
    const filtro = clienteFiltroSchema.parse({});

    expect(filtro.pagina).toBe(1);
    expect(filtro.porPagina).toBe(20);
    expect(filtro.ordenarPor).toBe('nomeFantasia');
    expect(filtro.direcao).toBe('asc');
  });

  it('normaliza UF e converte numeros da query string', () => {
    const filtro = clienteFiltroSchema.parse({ uf: 'go', grauRisco: '3', pagina: '2' });

    expect(filtro.uf).toBe('GO');
    expect(filtro.grauRisco).toBe(3);
    expect(filtro.pagina).toBe(2);
  });

  it('limita o tamanho da pagina', () => {
    expect(clienteFiltroSchema.safeParse({ porPagina: '500' }).success).toBe(false);
  });
});

describe('mensagens de data', () => {
  it('trata data de inicio vazia como campo obrigatorio, nao como "Invalid date"', () => {
    const resultado = clienteCreateSchema.safeParse({ ...clienteValido, dataInicioContrato: '' });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const issue = resultado.error.issues.find((item) => item.path[0] === 'dataInicioContrato');
      expect(issue?.message).toBe('Data de inicio do contrato e obrigatoria.');
    }
  });

  it('devolve mensagem em pt-BR para data invalida', () => {
    const resultado = clienteCreateSchema.safeParse({ ...clienteValido, dataFimContrato: 'nao-e-data' });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.message).toBe('Data de fim do contrato invalida.');
    }
  });

  it('usa "obrigatorio" em vez de "ao menos 1 caracteres"', () => {
    const resultado = clienteCreateSchema.safeParse({ ...clienteValido, numeroContrato: '' });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.message).toBe('Numero do contrato e obrigatorio.');
    }
  });
});
