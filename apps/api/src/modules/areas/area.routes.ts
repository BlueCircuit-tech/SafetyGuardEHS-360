import type { FastifyInstance } from 'fastify';
import type { Area } from '@prisma/client';
import QRCode from 'qrcode';
import { z } from 'zod';
import {
  FREQUENCIA_SUGERIDA_POR_CRITICIDADE,
  ROTULO_CRITICIDADE_AREA,
  ROTULO_TIPO_AREA,
  areaCreateSchema,
  areaFiltroSchema,
  areaUpdateSchema,
  formatarTelefone,
  isTokenQrValido,
  urlDaInspecao,
  type CriticidadeAreaCadastro,
  type TipoArea,
} from '@safetyguard/shared';
import {
  atualizarArea,
  criarArea,
  excluirArea,
  listarAreas,
  listarAuditoriaArea,
  listarOpcoesAreas,
  obterAreaOuFalhar,
  regenerarTokenQr,
  resolverTokenQr,
  resumoAreas,
} from './area.service.js';
import { RequisicaoInvalida } from '../../lib/erros.js';
import { contextoDeAuditoria } from '../../lib/autenticacao.js';
import { guardaPorMetodo } from '../../lib/guarda.js';
import { env } from '../../env.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador de area invalido.') });

/** Quebra o campo livre de riscos em lista, para o front exibir como pills. */
function listaDeRiscos(riscos: string | null): string[] {
  if (!riscos) return [];
  return riscos
    .split(';')
    .map((risco) => risco.trim())
    .filter(Boolean);
}

function serializar(area: Area) {
  const urlInspecao = urlDaInspecao(env.PUBLIC_APP_URL, area.tokenQr);

  return {
    ...area,
    latitude: area.latitude === null ? null : Number(area.latitude),
    longitude: area.longitude === null ? null : Number(area.longitude),
    riscos: listaDeRiscos(area.riscosPresentes),
    /** Endereco gravado no QR Code. */
    urlInspecao,
    /** Endpoint que devolve o SVG da placa. */
    urlQrCode: `${env.PUBLIC_API_URL}/api/v1/areas/${area.id}/qrcode.svg`,
    rotulos: {
      tipo: ROTULO_TIPO_AREA[area.tipo as TipoArea],
      criticidade: ROTULO_CRITICIDADE_AREA[area.criticidade as CriticidadeAreaCadastro],
    },
    /** Periodicidade sugerida para a criticidade — ajuda a conferir o cadastro. */
    frequenciaSugeridaDias: FREQUENCIA_SUGERIDA_POR_CRITICIDADE[area.criticidade as CriticidadeAreaCadastro],
    formatado: {
      responsavelTelefone: area.responsavelTelefone ? formatarTelefone(area.responsavelTelefone) : null,
      coordenadas:
        area.latitude === null || area.longitude === null
          ? null
          : `${Number(area.latitude).toFixed(6)}, ${Number(area.longitude).toFixed(6)}`,
    },
  };
}

export async function rotasAreas(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', guardaPorMetodo(app, {
    leitura: 'cadastros:ler',
    escrita: 'cadastros:escrever',
    // A tela de campo do QR Code e publica: o token e a credencial de leitura.
    excecoes: { '/api/v1/areas/qr/:token': null },
  }));

  app.get('/areas/resumo', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    return resumoAreas(clienteId);
  });

  app.get('/areas/opcoes', async (request) => {
    const { clienteId } = z.object({ clienteId: z.string().uuid().optional() }).parse(request.query);
    return listarOpcoesAreas(clienteId);
  });

  /**
   * Leitura do QR Code — primeiro passo do fluxo de campo.
   * Devolve tudo que o formulario de observacao precisa ja identificado.
   */
  app.get('/areas/qr/:token', async (request) => {
    const { token } = z.object({ token: z.string() }).parse(request.params);

    if (!isTokenQrValido(token.trim().toUpperCase())) {
      throw new RequisicaoInvalida('QR Code invalido.', 'QR_INVALIDO');
    }

    const area = await resolverTokenQr(token);
    return serializar(area);
  });

  app.get('/areas', async (request) => {
    const filtro = areaFiltroSchema.parse(request.query);
    const pagina = await listarAreas(filtro);
    return { ...pagina, itens: pagina.itens.map(serializar) };
  });

  app.get('/areas/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return serializar(await obterAreaOuFalhar(id));
  });

  /** SVG da placa — usado na tela e na folha de impressao. */
  app.get('/areas/:id/qrcode.svg', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const { escala } = z.object({ escala: z.coerce.number().int().min(1).max(16).default(6) }).parse(request.query);

    const area = await obterAreaOuFalhar(id);

    const svg = await QRCode.toString(urlDaInspecao(env.PUBLIC_APP_URL, area.tokenQr), {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      scale: escala,
    });

    return reply
      .type('image/svg+xml')
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', `inline; filename="qr-${area.codigo}.svg"`)
      .send(svg);
  });

  app.post('/areas', async (request, reply) => {
    const dados = areaCreateSchema.parse(request.body);
    const area = await criarArea(dados, contextoDeAuditoria(request));
    return reply.status(201).send(serializar(area));
  });

  app.put('/areas/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = areaUpdateSchema.parse(request.body);

    if (Object.keys(dados).length === 0) {
      throw new RequisicaoInvalida('Nenhum campo enviado para atualizacao.', 'PAYLOAD_VAZIO');
    }

    return serializar(await atualizarArea(id, dados, contextoDeAuditoria(request)));
  });

  app.delete('/areas/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    await excluirArea(id, contextoDeAuditoria(request));
    return reply.status(204).send();
  });

  /** Emite novo token — invalida as placas ja impressas. */
  app.post('/areas/:id/qrcode/regenerar', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    return serializar(await regenerarTokenQr(id, contextoDeAuditoria(request)));
  });

  app.get('/areas/:id/auditoria', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const { limite } = z.object({ limite: z.coerce.number().int().min(1).max(200).default(50) }).parse(request.query);
    return listarAuditoriaArea(id, limite);
  });
}
