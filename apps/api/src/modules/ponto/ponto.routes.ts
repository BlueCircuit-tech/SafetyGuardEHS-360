import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  mesAtual,
  pontoCreateSchema,
  pontoFiltroSchema,
  pontoUpdateSchema,
  valorHoraSchema,
  type UsuarioSessao,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { Conflito, NaoEncontrado, RequisicaoInvalida } from '../../lib/erros.js';
import { calcularDiferenca, registrarAuditoria } from '../../lib/auditoria.js';
import { NaoAutenticado, SemPermissao, contextoDeAuditoria } from '../../lib/autenticacao.js';
import {
  INCLUIR_VINCULOS_PONTO,
  calcularResumo,
  gerarRelatorioExcel,
  horasDoTurno,
  listarRegistros,
  serializarRegistro,
  type EscopoPonto,
} from './ponto.service.js';

const paramsSchema = z.object({ id: z.string().uuid('Identificador invalido.') });

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function sessaoDe(request: FastifyRequest): UsuarioSessao {
  if (!request.usuario) throw new NaoAutenticado();
  return request.usuario;
}

function gerenciaUsuarios(usuario: UsuarioSessao): boolean {
  return usuario.permissoes.includes('usuarios:gerenciar');
}

/**
 * Escopo da consulta: usuario comum so enxerga os proprios registros; quem
 * gerencia usuarios pode pedir um usuario especifico ou todos (sem `usuarioId`).
 */
function escopoDe(request: FastifyRequest): EscopoPonto {
  const usuario = sessaoDe(request);
  const filtro = pontoFiltroSchema.parse(request.query);
  const mes = filtro.mes ?? mesAtual();

  if (gerenciaUsuarios(usuario)) {
    return { mes, usuarioId: filtro.usuarioId, clienteId: filtro.clienteId };
  }
  if (filtro.usuarioId && filtro.usuarioId !== usuario.id) throw new SemPermissao('usuarios:gerenciar');
  return { mes, usuarioId: usuario.id, clienteId: filtro.clienteId };
}

/** Carrega o registro e garante que quem pede e o dono ou gerencia usuarios. */
async function carregarRegistroDoUsuario(request: FastifyRequest, id: string) {
  const usuario = sessaoDe(request);
  const registro = await prisma.registroPonto.findUnique({ where: { id }, include: INCLUIR_VINCULOS_PONTO });
  if (!registro) throw new NaoEncontrado('Registro de ponto nao encontrado.', 'PONTO_NAO_ENCONTRADO');
  if (registro.usuarioId !== usuario.id && !gerenciaUsuarios(usuario)) throw new SemPermissao('usuarios:gerenciar');
  return registro;
}

async function valorHoraDoUsuario(usuarioId: string): Promise<number | null> {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { valorHora: true } });
  return usuario?.valorHora === null || usuario?.valorHora === undefined ? null : Number(usuario.valorHora);
}

async function validarCliente(clienteId: string | null | undefined): Promise<void> {
  if (!clienteId) return;
  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true } });
  if (!cliente) throw new NaoEncontrado('Cliente nao encontrado.', 'CLIENTE_NAO_ENCONTRADO');
}

/**
 * Etapa 24 — Cartao de ponto.
 *
 * Qualquer usuario logado registra o proprio ponto (sem `guardaPorMetodo`):
 * a permissao aqui e "ser o dono do registro". Quem tem `usuarios:gerenciar`
 * enxerga e ajusta o ponto de todos e define o valor/hora de cada consultor.
 */
export async function registrarRotasPonto(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.autenticar);

  app.get('/ponto', async (request) => {
    return listarRegistros(escopoDe(request));
  });

  app.get('/ponto/resumo', async (request) => {
    const escopo = escopoDe(request);
    const itens = await listarRegistros(escopo);
    const resumo = calcularResumo(escopo.mes, escopo.usuarioId, itens);

    // Dados do usuario focado (valor/hora atual e turno aberto, de qualquer mes).
    const alvo = escopo.usuarioId ?? sessaoDe(request).id;
    const [usuario, registroAberto] = await Promise.all([
      prisma.usuario.findUnique({ where: { id: alvo }, select: { id: true, nome: true, valorHora: true } }),
      prisma.registroPonto.findFirst({
        where: { usuarioId: alvo, saida: null },
        orderBy: { entrada: 'desc' },
        include: INCLUIR_VINCULOS_PONTO,
      }),
    ]);

    return {
      ...resumo,
      usuario: usuario
        ? { id: usuario.id, nome: usuario.nome, valorHora: usuario.valorHora === null ? null : Number(usuario.valorHora) }
        : null,
      registroAberto: registroAberto ? serializarRegistro(registroAberto) : null,
    };
  });

  app.get('/ponto/relatorio.xlsx', async (request, reply) => {
    const escopo = escopoDe(request);
    const itens = await listarRegistros(escopo);
    const resumo = calcularResumo(escopo.mes, escopo.usuarioId, itens);

    const workbook = gerarRelatorioExcel(escopo.mes, itens, resumo);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    reply.header('Content-Type', MIME_XLSX);
    reply.header('Content-Disposition', `attachment; filename="cartao-de-ponto-${escopo.mes}.xlsx"`);
    return reply.send(buffer);
  });

  /** Lista de consultores para o seletor de quem gerencia usuarios. */
  app.get('/ponto/usuarios', async (request) => {
    const usuario = sessaoDe(request);
    if (!gerenciaUsuarios(usuario)) throw new SemPermissao('usuarios:gerenciar');

    const itens = await prisma.usuario.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, perfil: true, valorHora: true },
    });
    return itens.map((item) => ({ ...item, valorHora: item.valorHora === null ? null : Number(item.valorHora) }));
  });

  app.post('/ponto', async (request, reply) => {
    const usuario = sessaoDe(request);
    const dados = pontoCreateSchema.parse(request.body);
    await validarCliente(dados.clienteId);

    // Um turno aberto por vez: a tela pede para encerrar antes de abrir outro.
    if (!dados.saida) {
      const aberto = await prisma.registroPonto.findFirst({
        where: { usuarioId: usuario.id, saida: null },
        select: { id: true, entrada: true },
      });
      if (aberto) {
        throw new Conflito('Voce ja tem um turno aberto. Encerre-o antes de registrar outra entrada.', 'PONTO_ABERTO', {
          detalhes: { registroId: aberto.id, entrada: aberto.entrada },
        });
      }
    }

    const valorHora = await valorHoraDoUsuario(usuario.id);
    const horasTrabalhadas = horasDoTurno(dados.entrada, dados.saida, dados.intervaloMinutos);

    const registro = await prisma.$transaction(async (tx) => {
      const criado = await tx.registroPonto.create({
        data: { ...dados, usuarioId: usuario.id, valorHora, horasTrabalhadas },
        include: INCLUIR_VINCULOS_PONTO,
      });
      await registrarAuditoria(tx, {
        entidade: 'RegistroPonto',
        entidadeId: criado.id,
        acao: 'CRIACAO',
        alteracoes: calcularDiferenca({}, { ...dados, usuarioId: usuario.id, valorHora, horasTrabalhadas }),
        contexto: contextoDeAuditoria(request),
      });
      return criado;
    });

    return reply.status(201).send(serializarRegistro(registro));
  });

  app.put('/ponto/:id', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const dados = pontoUpdateSchema.parse(request.body);
    const atual = await carregarRegistroDoUsuario(request, id);
    await validarCliente(dados.clienteId);

    // Recalcula as horas com os valores mesclados (o que veio + o que ja estava).
    const entrada = dados.entrada ?? atual.entrada;
    const saida = dados.saida === undefined ? atual.saida : dados.saida;
    const intervaloMinutos = dados.intervaloMinutos ?? atual.intervaloMinutos;

    if (saida && saida.getTime() <= entrada.getTime()) {
      throw new RequisicaoInvalida('Saida deve ser depois da entrada.', 'VALIDACAO', {
        campos: { saida: ['Saida deve ser depois da entrada.'] },
      });
    }
    const horasTrabalhadas = horasDoTurno(entrada, saida, intervaloMinutos);
    if (saida && horasTrabalhadas === null) {
      throw new RequisicaoInvalida('Intervalo maior que o proprio turno.', 'VALIDACAO', {
        campos: { intervaloMinutos: ['Intervalo maior que o proprio turno.'] },
      });
    }

    const registro = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.registroPonto.update({
        where: { id },
        data: { ...dados, horasTrabalhadas },
        include: INCLUIR_VINCULOS_PONTO,
      });
      const diferenca = calcularDiferenca(
        serializarRegistro(atual) as unknown as Record<string, unknown>,
        { ...serializarRegistro(atualizado), usuario: undefined, cliente: undefined } as unknown as Record<string, unknown>,
      );
      if (Object.keys(diferenca).length > 0) {
        await registrarAuditoria(tx, {
          entidade: 'RegistroPonto',
          entidadeId: id,
          acao: 'ATUALIZACAO',
          alteracoes: diferenca,
          contexto: contextoDeAuditoria(request),
        });
      }
      return atualizado;
    });

    return serializarRegistro(registro);
  });

  app.delete('/ponto/:id', async (request, reply) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await carregarRegistroDoUsuario(request, id);

    await prisma.$transaction(async (tx) => {
      await tx.registroPonto.delete({ where: { id } });
      await registrarAuditoria(tx, {
        entidade: 'RegistroPonto',
        entidadeId: id,
        acao: 'EXCLUSAO',
        alteracoes: {
          data: { de: atual.data, para: null },
          entrada: { de: atual.entrada, para: null },
          horasTrabalhadas: { de: atual.horasTrabalhadas === null ? null : Number(atual.horasTrabalhadas), para: null },
        },
        contexto: contextoDeAuditoria(request),
      });
    });

    return reply.status(204).send();
  });

  /** Fecha o turno aberto: saida = agora e calcula as horas. */
  app.post('/ponto/:id/encerrar', async (request) => {
    const { id } = paramsSchema.parse(request.params);
    const atual = await carregarRegistroDoUsuario(request, id);

    if (atual.saida) throw new Conflito('Este turno ja foi encerrado.', 'PONTO_JA_ENCERRADO');

    const saida = new Date();
    if (saida.getTime() <= atual.entrada.getTime()) {
      throw new RequisicaoInvalida('A entrada esta no futuro — ajuste o horario antes de encerrar.', 'ENTRADA_NO_FUTURO');
    }
    const horasTrabalhadas = horasDoTurno(atual.entrada, saida, atual.intervaloMinutos);
    if (horasTrabalhadas === null) {
      throw new RequisicaoInvalida('Intervalo maior que o proprio turno — reduza o intervalo antes de encerrar.', 'INTERVALO_INVALIDO');
    }

    const registro = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.registroPonto.update({
        where: { id },
        data: { saida, horasTrabalhadas },
        include: INCLUIR_VINCULOS_PONTO,
      });
      await registrarAuditoria(tx, {
        entidade: 'RegistroPonto',
        entidadeId: id,
        acao: 'ATUALIZACAO',
        alteracoes: { saida: { de: null, para: saida }, horasTrabalhadas: { de: null, para: horasTrabalhadas } },
        contexto: contextoDeAuditoria(request),
      });
      return atualizado;
    });

    return serializarRegistro(registro);
  });

  /** Valor/hora do consultor: o proprio define o seu; gerente define o de qualquer um. */
  app.put('/ponto/valor-hora', async (request) => {
    const usuario = sessaoDe(request);
    const dados = valorHoraSchema.parse(request.body);
    const alvoId = dados.usuarioId ?? usuario.id;

    if (alvoId !== usuario.id && !gerenciaUsuarios(usuario)) throw new SemPermissao('usuarios:gerenciar');

    const alvo = await prisma.usuario.findUnique({ where: { id: alvoId }, select: { id: true, nome: true, valorHora: true } });
    if (!alvo) throw new NaoEncontrado('Usuario nao encontrado.', 'USUARIO_NAO_ENCONTRADO');

    const anterior = alvo.valorHora === null ? null : Number(alvo.valorHora);
    const atualizado = await prisma.$transaction(async (tx) => {
      const salvo = await tx.usuario.update({
        where: { id: alvoId },
        data: { valorHora: dados.valorHora },
        select: { id: true, nome: true, valorHora: true },
      });
      if (anterior !== dados.valorHora) {
        await registrarAuditoria(tx, {
          entidade: 'Usuario',
          entidadeId: alvoId,
          acao: 'ATUALIZACAO',
          alteracoes: { valorHora: { de: anterior, para: dados.valorHora } },
          contexto: contextoDeAuditoria(request),
        });
      }
      return salvo;
    });

    return { id: atualizado.id, nome: atualizado.nome, valorHora: atualizado.valorHora === null ? null : Number(atualizado.valorHora) };
  });
}
