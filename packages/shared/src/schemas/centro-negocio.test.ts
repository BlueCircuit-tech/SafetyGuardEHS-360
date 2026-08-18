import { describe, expect, it } from 'vitest';
import {
  COR_DESTAQUE_CENTRO_PADRAO,
  META_INDICE_CENTRO_PADRAO,
  centroNegocioCreateSchema,
  centroNegocioFiltroSchema,
  centroNegocioUpdateSchema,
} from './centro-negocio.js';
import { clienteCreateSchema } from './cliente.js';

const centroValido = {
  nome: 'Regional Centro-Oeste',
  codigo: 'rco',
  tipo: 'REGIONAL' as const,
  responsavelNome: 'Rafael Martini',
  responsavelEmail: 'Rafael.Martini@SafetyGuard.com.br',
};

describe('centroNegocioCreateSchema', () => {
  it('normaliza o codigo para maiusculas', () => {
    const centro = centroNegocioCreateSchema.parse(centroValido);
    expect(centro.codigo).toBe('RCO');
  });

  it('troca espacos do codigo por hifen', () => {
    const centro = centroNegocioCreateSchema.parse({ ...centroValido, codigo: 'centro oeste' });
    expect(centro.codigo).toBe('CENTRO-OESTE');
  });

  it('rejeita codigo com caractere invalido', () => {
    const resultado = centroNegocioCreateSchema.safeParse({ ...centroValido, codigo: 'RCO@2026' });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.path).toEqual(['codigo']);
    }
  });

  it('normaliza o e-mail do responsavel', () => {
    const centro = centroNegocioCreateSchema.parse(centroValido);
    expect(centro.responsavelEmail).toBe('rafael.martini@safetyguard.com.br');
  });

  it('aplica os padroes de meta, situacao e cor', () => {
    const centro = centroNegocioCreateSchema.parse(centroValido);

    expect(centro.metaIndiceGlobal).toBe(META_INDICE_CENTRO_PADRAO);
    expect(centro.situacao).toBe('ATIVO');
    expect(centro.corDestaque).toBe(COR_DESTAQUE_CENTRO_PADRAO);
  });

  it('converte opcionais vazios em null', () => {
    const centro = centroNegocioCreateSchema.parse({
      ...centroValido,
      descricao: '',
      cidade: '   ',
      responsavelTelefone: '',
    });

    expect(centro.descricao).toBeNull();
    expect(centro.cidade).toBeNull();
    expect(centro.responsavelTelefone).toBeNull();
  });

  it('normaliza a UF e rejeita sigla invalida', () => {
    expect(centroNegocioCreateSchema.parse({ ...centroValido, uf: 'go' }).uf).toBe('GO');
    expect(centroNegocioCreateSchema.safeParse({ ...centroValido, uf: 'XX' }).success).toBe(false);
  });

  it('rejeita meta fora de 0..100 e tipo invalido', () => {
    expect(centroNegocioCreateSchema.safeParse({ ...centroValido, metaIndiceGlobal: '120' }).success).toBe(false);
    expect(centroNegocioCreateSchema.safeParse({ ...centroValido, tipo: 'FILIAL' }).success).toBe(false);
  });

  it('exige os campos obrigatorios da Etapa 4', () => {
    const resultado = centroNegocioCreateSchema.safeParse({});
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const campos = resultado.error.issues.map((issue) => issue.path[0]);
      expect(campos).toEqual(
        expect.arrayContaining(['nome', 'codigo', 'tipo', 'responsavelNome', 'responsavelEmail']),
      );
    }
  });

  it('exige celular no campo de WhatsApp', () => {
    expect(centroNegocioCreateSchema.safeParse({ ...centroValido, responsavelWhatsapp: '(62) 3333-4444' }).success).toBe(
      false,
    );
    expect(
      centroNegocioCreateSchema.safeParse({ ...centroValido, responsavelWhatsapp: '(62) 99988-7766' }).success,
    ).toBe(true);
  });
});

describe('centroNegocioUpdateSchema', () => {
  it('aceita atualizacao parcial', () => {
    expect(centroNegocioUpdateSchema.safeParse({ situacao: 'INATIVO' }).success).toBe(true);
  });

  it('mantem a validacao dos campos enviados', () => {
    expect(centroNegocioUpdateSchema.safeParse({ codigo: 'com espaco e @' }).success).toBe(false);
  });
});

describe('centroNegocioFiltroSchema', () => {
  it('aplica paginacao e ordenacao padrao', () => {
    const filtro = centroNegocioFiltroSchema.parse({});

    expect(filtro.ordenarPor).toBe('nome');
    expect(filtro.direcao).toBe('asc');
    expect(filtro.pagina).toBe(1);
  });

  it('normaliza a UF do filtro', () => {
    expect(centroNegocioFiltroSchema.parse({ uf: 'go' }).uf).toBe('GO');
  });
});

describe('vinculo do cliente com o centro', () => {
  const clienteBase = {
    razaoSocial: 'Vale Verde Mineracao e Britagem S.A.',
    nomeFantasia: 'Vale Verde Mineracao',
    cnpj: '11.222.333/0001-81',
    numeroContrato: '4501',
    dataInicioContrato: '2024-02-01',
    grauRisco: '4',
    quantidadeFuncionarios: '640',
    contatoNome: 'Juliana Amaral',
    contatoEmail: 'juliana@valeverde.com.br',
    contatoTelefone: '(62) 3222-1010',
    cep: '75380-000',
    logradouro: 'Rodovia GO-060',
    numero: 'S/N',
    bairro: 'Zona Rural',
    cidade: 'Trindade',
    uf: 'GO',
  };

  it('o centro de negocio e opcional', () => {
    const cliente = clienteCreateSchema.parse(clienteBase);
    expect(cliente.centroNegocioId).toBeNull();
  });

  it('trata string vazia como sem centro', () => {
    const cliente = clienteCreateSchema.parse({ ...clienteBase, centroNegocioId: '' });
    expect(cliente.centroNegocioId).toBeNull();
  });

  it('aceita um identificador valido', () => {
    const id = '3f1b7c2a-9d4e-4a1b-8c5d-0e2f6a7b8c9d';
    expect(clienteCreateSchema.parse({ ...clienteBase, centroNegocioId: id }).centroNegocioId).toBe(id);
  });

  it('rejeita identificador invalido', () => {
    expect(clienteCreateSchema.safeParse({ ...clienteBase, centroNegocioId: 'abc' }).success).toBe(false);
  });
});
