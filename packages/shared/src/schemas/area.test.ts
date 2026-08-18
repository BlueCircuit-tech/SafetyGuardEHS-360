import { describe, expect, it } from 'vitest';
import {
  ALFABETO_TOKEN_QR,
  FREQUENCIA_INSPECAO_PADRAO,
  FREQUENCIA_SUGERIDA_POR_CRITICIDADE,
  TAMANHO_TOKEN_QR,
  areaCreateSchema,
  areaFiltroSchema,
  areaUpdateSchema,
  isTokenQrValido,
  urlDaInspecao,
} from './area.js';

const CLIENTE_ID = '3f1b7c2a-9d4e-4a1b-8c5d-0e2f6a7b8c9d';

const areaValida = {
  clienteId: CLIENTE_ID,
  nome: 'Britagem — Planta 2',
  codigo: 'brt-p2',
  tipo: 'PRODUCAO' as const,
  criticidade: 'CRITICA' as const,
};

describe('areaCreateSchema', () => {
  it('normaliza o codigo para maiusculas', () => {
    expect(areaCreateSchema.parse(areaValida).codigo).toBe('BRT-P2');
  });

  it('troca espacos do codigo por hifen', () => {
    expect(areaCreateSchema.parse({ ...areaValida, codigo: 'torre b' }).codigo).toBe('TORRE-B');
  });

  it('rejeita codigo com caractere invalido', () => {
    const resultado = areaCreateSchema.safeParse({ ...areaValida, codigo: 'BRT#2' });
    expect(resultado.success).toBe(false);
    if (!resultado.success) expect(resultado.error.issues[0]?.path).toEqual(['codigo']);
  });

  it('aplica os padroes de frequencia e situacao', () => {
    const area = areaCreateSchema.parse(areaValida);

    expect(area.frequenciaInspecaoDias).toBe(FREQUENCIA_INSPECAO_PADRAO);
    expect(area.situacao).toBe('ATIVA');
    expect(area.exigePermissaoTrabalho).toBe(false);
    expect(area.exigeAutorizacaoEntrada).toBe(false);
  });

  it('converte opcionais vazios em null', () => {
    const area = areaCreateSchema.parse({
      ...areaValida,
      setor: '',
      riscosPresentes: '   ',
      responsavelEmail: '',
      latitude: '',
      longitude: '',
    });

    expect(area.setor).toBeNull();
    expect(area.riscosPresentes).toBeNull();
    expect(area.responsavelEmail).toBeNull();
    expect(area.latitude).toBeNull();
    expect(area.longitude).toBeNull();
  });

  it('aceita coordenadas completas', () => {
    const area = areaCreateSchema.parse({ ...areaValida, latitude: '-16.6864', longitude: '-49.2643' });

    expect(area.latitude).toBeCloseTo(-16.6864);
    expect(area.longitude).toBeCloseTo(-49.2643);
  });

  it('rejeita meia coordenada', () => {
    const soLatitude = areaCreateSchema.safeParse({ ...areaValida, latitude: '-16.6864' });
    expect(soLatitude.success).toBe(false);
    if (!soLatitude.success) expect(soLatitude.error.issues[0]?.path).toEqual(['longitude']);

    const soLongitude = areaCreateSchema.safeParse({ ...areaValida, longitude: '-49.2643' });
    expect(soLongitude.success).toBe(false);
    if (!soLongitude.success) expect(soLongitude.error.issues[0]?.path).toEqual(['latitude']);
  });

  it('rejeita coordenada fora do intervalo geografico', () => {
    expect(areaCreateSchema.safeParse({ ...areaValida, latitude: '95', longitude: '0' }).success).toBe(false);
    expect(areaCreateSchema.safeParse({ ...areaValida, latitude: '0', longitude: '200' }).success).toBe(false);
  });

  it('rejeita frequencia fora de 1..365', () => {
    expect(areaCreateSchema.safeParse({ ...areaValida, frequenciaInspecaoDias: '0' }).success).toBe(false);
    expect(areaCreateSchema.safeParse({ ...areaValida, frequenciaInspecaoDias: '400' }).success).toBe(false);
    expect(areaCreateSchema.safeParse({ ...areaValida, frequenciaInspecaoDias: '7' }).success).toBe(true);
  });

  it('exige cliente valido', () => {
    expect(areaCreateSchema.safeParse({ ...areaValida, clienteId: 'nao-e-uuid' }).success).toBe(false);
  });

  it('exige os campos obrigatorios da Etapa 5', () => {
    const resultado = areaCreateSchema.safeParse({});
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const campos = resultado.error.issues.map((issue) => issue.path[0]);
      expect(campos).toEqual(expect.arrayContaining(['clienteId', 'nome', 'codigo', 'tipo', 'criticidade']));
    }
  });

  it('nao aceita tokenQr vindo do formulario', () => {
    const area = areaCreateSchema.parse({ ...areaValida, tokenQr: 'HACKEADO1' } as never);
    expect('tokenQr' in area).toBe(false);
  });
});

describe('areaUpdateSchema', () => {
  it('aceita atualizacao parcial', () => {
    expect(areaUpdateSchema.safeParse({ situacao: 'INATIVA' }).success).toBe(true);
  });

  it('mantem a regra das coordenadas no payload parcial', () => {
    expect(areaUpdateSchema.safeParse({ latitude: '-16.6864' }).success).toBe(false);
    expect(areaUpdateSchema.safeParse({ latitude: '-16.6864', longitude: '-49.2643' }).success).toBe(true);
  });
});

describe('frequencia sugerida por criticidade', () => {
  it('quanto mais critica, mais frequente', () => {
    expect(FREQUENCIA_SUGERIDA_POR_CRITICIDADE.CRITICA).toBeLessThan(FREQUENCIA_SUGERIDA_POR_CRITICIDADE.ALTA);
    expect(FREQUENCIA_SUGERIDA_POR_CRITICIDADE.ALTA).toBeLessThan(FREQUENCIA_SUGERIDA_POR_CRITICIDADE.MEDIA);
    expect(FREQUENCIA_SUGERIDA_POR_CRITICIDADE.MEDIA).toBeLessThan(FREQUENCIA_SUGERIDA_POR_CRITICIDADE.BAIXA);
  });
});

describe('token do QR Code', () => {
  it('aceita token no formato esperado', () => {
    expect(isTokenQrValido('WUHM47E7NT')).toBe(true);
  });

  it('rejeita tamanho errado', () => {
    expect(isTokenQrValido('ABC')).toBe(false);
    expect(isTokenQrValido('WUHM47E7NTX')).toBe(false);
  });

  it('rejeita caracteres ambiguos, que ficam fora do alfabeto', () => {
    for (const ambiguo of ['0', '1', 'I', 'L', 'O']) {
      expect(ALFABETO_TOKEN_QR.includes(ambiguo)).toBe(false);
      expect(isTokenQrValido(`${ambiguo}UHM47E7NT`)).toBe(false);
    }
  });

  it('rejeita minusculas e valores nao textuais', () => {
    expect(isTokenQrValido('wuhm47e7nt')).toBe(false);
    expect(isTokenQrValido(undefined as unknown as string)).toBe(false);
  });

  it('tem o tamanho declarado', () => {
    expect('WUHM47E7NT').toHaveLength(TAMANHO_TOKEN_QR);
  });
});

describe('urlDaInspecao', () => {
  it('monta o endereco gravado no QR', () => {
    expect(urlDaInspecao('http://localhost:5173', 'WUHM47E7NT')).toBe('http://localhost:5173/inspecao/WUHM47E7NT');
  });

  it('tolera barra final na base', () => {
    expect(urlDaInspecao('https://app.safetyguard.com.br/', 'WUHM47E7NT')).toBe(
      'https://app.safetyguard.com.br/inspecao/WUHM47E7NT',
    );
  });
});

describe('areaFiltroSchema', () => {
  it('aplica paginacao e ordenacao padrao', () => {
    const filtro = areaFiltroSchema.parse({});

    expect(filtro.ordenarPor).toBe('nome');
    expect(filtro.pagina).toBe(1);
    expect(filtro.porPagina).toBe(20);
  });

  it('aceita filtrar por centro de negocio e criticidade', () => {
    const filtro = areaFiltroSchema.parse({ centroNegocioId: CLIENTE_ID, criticidade: 'CRITICA' });

    expect(filtro.centroNegocioId).toBe(CLIENTE_ID);
    expect(filtro.criticidade).toBe('CRITICA');
  });

  it('limita o tamanho da pagina', () => {
    expect(areaFiltroSchema.safeParse({ porPagina: '500' }).success).toBe(false);
    expect(areaFiltroSchema.parse({ porPagina: '200' }).porPagina).toBe(200);
  });
});
