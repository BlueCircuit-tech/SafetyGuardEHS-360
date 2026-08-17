import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  empresaConsultoriaCreateSchema,
  empresaConsultoriaUpdateSchema,
  formatarCep,
  formatarCnae,
  formatarCnpj,
  formatarTelefone,
} from '@safetyguard/shared';
import type { EmpresaConsultoria } from '@prisma/client';
import { z } from 'zod';
import {
  atualizarEmpresa,
  criarEmpresa,
  definirLogo,
  listarAuditoriaEmpresa,
  obterCabecalhoInstitucional,
  obterEmpresa,
  obterEmpresaOuFalhar,
} from './empresa.service.js';
import { MIMES_IMAGEM_ACEITOS, removerArquivoPublico, salvarImagem } from '../../lib/arquivos.js';
import { RequisicaoInvalida } from '../../lib/erros.js';
import { uploadMaxBytes } from '../../env.js';
import type { ContextoAuditoria } from '../../lib/auditoria.js';

/**
 * Autor da alteracao. Enquanto a Etapa de autenticacao nao existe, aceitamos o
 * cabecalho `x-usuario` para que a trilha de auditoria ja nasca preenchida.
 */
function contextoDaRequisicao(request: FastifyRequest): ContextoAuditoria {
  const cabecalho = request.headers['x-usuario'];
  return {
    autor: (Array.isArray(cabecalho) ? cabecalho[0] : cabecalho) ?? 'sistema',
    ip: request.ip,
  };
}

/** Acrescenta os campos com mascara — o banco guarda sempre sem formatacao. */
function comFormatacao(empresa: EmpresaConsultoria) {
  return {
    ...empresa,
    formatado: {
      cnpj: formatarCnpj(empresa.cnpj),
      cep: formatarCep(empresa.cep),
      telefone: formatarTelefone(empresa.telefone),
      whatsapp: empresa.whatsapp ? formatarTelefone(empresa.whatsapp) : null,
      cnaePrincipal: empresa.cnaePrincipal ? formatarCnae(empresa.cnaePrincipal) : null,
      responsavelTecnicoTelefone: empresa.responsavelTecnicoTelefone
        ? formatarTelefone(empresa.responsavelTecnicoTelefone)
        : null,
    },
  };
}

export async function rotasEmpresa(app: FastifyInstance): Promise<void> {
  /** Situacao da Etapa 1 — usado pelo front para decidir entre criar e editar. */
  app.get('/empresa/status', async () => {
    const empresa = await obterEmpresa();
    return {
      cadastrada: Boolean(empresa),
      etapa: '1.1 Empresa de Consultoria',
      concluidaEm: empresa?.criadoEm ?? null,
    };
  });

  app.get('/empresa', async () => {
    const empresa = await obterEmpresaOuFalhar();
    return comFormatacao(empresa);
  });

  app.post('/empresa', async (request, reply) => {
    const dados = empresaConsultoriaCreateSchema.parse(request.body);
    const empresa = await criarEmpresa(dados, contextoDaRequisicao(request));
    return reply.status(201).send(comFormatacao(empresa));
  });

  app.put('/empresa', async (request) => {
    const dados = empresaConsultoriaUpdateSchema.parse(request.body);
    if (Object.keys(dados).length === 0) {
      throw new RequisicaoInvalida('Nenhum campo enviado para atualizacao.', 'PAYLOAD_VAZIO');
    }
    const empresa = await atualizarEmpresa(dados, contextoDaRequisicao(request));
    return comFormatacao(empresa);
  });

  /** Bloco institucional de relatorios, e-mails e WhatsApp. */
  app.get('/empresa/cabecalho', async () => obterCabecalhoInstitucional());

  app.get('/empresa/auditoria', async (request) => {
    const { limite } = z.object({ limite: z.coerce.number().int().min(1).max(200).default(50) }).parse(request.query);
    return listarAuditoriaEmpresa(limite);
  });

  /** Upload da logo usada no cabecalho dos documentos. */
  app.post('/empresa/logo', async (request) => {
    const empresa = await obterEmpresaOuFalhar();
    const arquivo = await request.file({ limits: { fileSize: uploadMaxBytes } });

    if (!arquivo) {
      throw new RequisicaoInvalida('Envie a logo no campo "arquivo" (multipart/form-data).', 'ARQUIVO_AUSENTE');
    }
    if (!MIMES_IMAGEM_ACEITOS.includes(arquivo.mimetype)) {
      throw new RequisicaoInvalida(
        `Formato ${arquivo.mimetype} nao suportado. Envie PNG, JPG, WEBP ou SVG.`,
        'FORMATO_NAO_SUPORTADO',
      );
    }

    const conteudo = await arquivo.toBuffer();
    const logoUrl = await salvarImagem(conteudo, arquivo.mimetype, 'logo');
    const atualizada = await definirLogo(logoUrl, contextoDaRequisicao(request));

    await removerArquivoPublico(empresa.logoUrl);

    return comFormatacao(atualizada);
  });

  app.delete('/empresa/logo', async (request) => {
    const empresa = await obterEmpresaOuFalhar();
    const atualizada = await definirLogo(null, contextoDaRequisicao(request));
    await removerArquivoPublico(empresa.logoUrl);
    return comFormatacao(atualizada);
  });
}
