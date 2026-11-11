import { montarCabecalhoInstitucional, situacaoDaValidade } from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { enviarEmail } from '../../lib/email.js';
import { obterEmpresaOuFalhar } from '../empresa/empresa.service.js';
import { documentacaoDoColaborador } from '../saude/colaborador-extras.routes.js';
import { DIAS_ALERTA_ASO } from '../saude/colaborador.service.js';
import { emailsDosContatos } from './notificacao.service.js';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface ResultadoAlertasDiarios {
  clientes: number;
  enviados: number;
  semDestinatario: number;
  falhas: number;
}

/**
 * Resumo diario de pendencias por cliente, enviado aos contatos hierarquicos
 * (SSMA, RH, supervisor, coordenador): ASO vencido ou a vencer em 35 dias,
 * documentos obrigatorios do colaborador faltando/vencidos, colaboradores
 * bloqueados, EPI com troca vencida e CA vencido. Uma mensagem por cliente,
 * so quando ha pendencia. Nunca lanca.
 */
export async function processarAlertasDiarios(): Promise<ResultadoAlertasDiarios> {
  const resultado: ResultadoAlertasDiarios = { clientes: 0, enviados: 0, semDestinatario: 0, falhas: 0 };
  try {
    const empresa = await obterEmpresaOuFalhar();
    const cabecalho = montarCabecalhoInstitucional(empresa);
    const hoje = new Date();
    const limiteAso = new Date(hoje.getTime() + DIAS_ALERTA_ASO * MS_POR_DIA);

    const clientes = await prisma.cliente.findMany({ where: { situacao: 'ATIVO' }, select: { id: true, nomeFantasia: true } });
    const casVencidos = await prisma.epi.findMany({ where: { ativo: true, validadeCa: { lt: hoje } }, select: { nome: true, ca: true } });

    for (const cliente of clientes) {
      const colaboradores = await prisma.colaborador.findMany({
        where: { clienteId: cliente.id, situacao: 'ATIVO' },
        select: {
          id: true,
          nome: true,
          bloqueado: true,
          motivoBloqueio: true,
          asos: { where: { tipo: { not: 'DEMISSIONAL' } }, orderBy: { dataExame: 'desc' }, take: 1, select: { validade: true } },
        },
      });
      if (colaboradores.length === 0) continue;
      resultado.clientes += 1;

      const asos: string[] = [];
      for (const c of colaboradores) {
        const [aso] = c.asos;
        if (!aso) asos.push(`${c.nome}: sem ASO registrado`);
        else if (aso.validade && aso.validade <= limiteAso) {
          const situacao = situacaoDaValidade(aso.validade, hoje, DIAS_ALERTA_ASO);
          asos.push(`${c.nome}: ASO ${situacao === 'VENCIDO' ? 'VENCIDO' : 'vence'} em ${aso.validade.toLocaleDateString('pt-BR')}`);
        }
      }

      const documentos: string[] = [];
      for (const c of colaboradores.slice(0, 300)) {
        const pasta = await documentacaoDoColaborador(c.id);
        const faltando = pasta.pendencias.filter((p) => !p.startsWith('ASO'));
        if (faltando.length > 0) documentos.push(`${c.nome}: ${faltando.join('; ')}`);
      }

      const bloqueados = colaboradores.filter((c) => c.bloqueado).map((c) => `${c.nome}: ${c.motivoBloqueio ?? 'sem motivo'}`);

      const trocas = await prisma.entregaEpi.findMany({
        where: { validadeTroca: { lt: hoje }, colaborador: { clienteId: cliente.id, situacao: 'ATIVO' } },
        select: { colaborador: { select: { nome: true } }, epi: { select: { nome: true } }, validadeTroca: true },
        take: 50,
      });

      const blocos = [
        asos.length ? `ASO vencido ou a vencer (${DIAS_ALERTA_ASO} dias):\n- ${asos.join('\n- ')}` : '',
        documentos.length ? `Documentacao pendente do colaborador:\n- ${documentos.slice(0, 50).join('\n- ')}` : '',
        bloqueados.length ? `Colaboradores bloqueados:\n- ${bloqueados.join('\n- ')}` : '',
        trocas.length ? `EPI com troca vencida:\n- ${trocas.map((t) => `${t.colaborador.nome}: ${t.epi.nome}`).join('\n- ')}` : '',
        casVencidos.length ? `EPI com CA vencido no catalogo:\n- ${casVencidos.map((e) => `${e.nome} (CA ${e.ca})`).join('\n- ')}` : '',
      ].filter(Boolean);

      if (blocos.length === 0) continue;

      const para = await emailsDosContatos(cliente.id, ['SSMA', 'RH', 'SUPERVISOR', 'COORDENADOR']);
      if (para.length === 0) {
        resultado.semDestinatario += 1;
        continue;
      }

      try {
        await enviarEmail({
          para,
          assunto: `[SSMA] Pendencias de ${cliente.nomeFantasia} — ${hoje.toLocaleDateString('pt-BR')}`,
          corpo: [`${cabecalho.nomeExibicao} — resumo diario de pendencias`, `Cliente: ${cliente.nomeFantasia}`, '', ...blocos.flatMap((b) => [b, '']), cabecalho.assinaturaEmail].join('\n'),
        });
        resultado.enviados += 1;
      } catch (erro) {
        resultado.falhas += 1;
        console.error(`[email] alerta diario falhou (${cliente.nomeFantasia}): ${erro instanceof Error ? erro.message : String(erro)}`);
      }
    }
  } catch (erro) {
    console.error(`[alertas] falha geral: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
  return resultado;
}
