import {
  ROTULO_GRAU_RISCO_FUNCAO,
  ROTULO_NIVEL_CONTROLE,
  ROTULO_RESULTADO_ASO,
  ROTULO_TIPO_ASO,
  ROTULO_TIPO_RISCO,
  ROTULO_VINCULO_COLABORADOR,
  formatarCnpj,
  formatarCpf,
  montarCabecalhoInstitucional,
  type GrauRiscoFuncao,
  type NivelControle,
  type ResultadoAso,
  type TipoAso,
  type TipoRisco,
  type VinculoColaborador,
} from '@safetyguard/shared';
import { prisma } from '../../db.js';
import { NaoEncontrado } from '../../lib/erros.js';
import { obterEmpresaOuFalhar } from '../empresa/empresa.service.js';

/**
 * PPP — Perfil Profissiografico Previdenciario (secao 17 do plano diretor).
 *
 * O PPP nao e um cadastro novo: e a **consolidacao** do que a plataforma ja
 * tem sobre o colaborador — vinculo, funcao, riscos do inventario (Etapa 19),
 * historico de ASO (Etapa 9), EPI entregue (Etapa 14) e o responsavel tecnico
 * da consultoria (Etapa 1.1).
 *
 * Montamos os **dados** do PPP, nao o formulario oficial do INSS: o layout
 * legal muda por portaria e a emissao definitiva passa pelo eSocial (S-2240).
 * O que a plataforma entrega e a fonte rastreavel para preencher e conferir —
 * e cada bloco diz de onde veio.
 */

export interface PppMontado {
  geradoEm: Date;
  /** De onde cada bloco saiu — a rastreabilidade que auditoria pede. */
  fontes: Record<string, string>;
  cabecalho: ReturnType<typeof montarCabecalhoInstitucional>;
  empregador: { razaoSocial: string; cnpjFormatado: string; unidade: string | null };
  trabalhador: {
    nome: string;
    cpfFormatado: string;
    matricula: string | null;
    dataNascimento: Date | null;
    funcao: string;
    setor: string | null;
    grauRisco: string;
    dataAdmissao: Date | null;
    dataDesligamento: Date | null;
    vinculo: string;
  };
  /** Periodo do registro — admissao ate desligamento (ou hoje). */
  periodo: { de: Date | null; ate: Date };
  fatoresDeRisco: Array<{
    tipo: string;
    perigo: string;
    fonteGeradora: string | null;
    atividade: string | null;
    intensidade: string;
    tecnicaUtilizada: string;
    controleColetivo: string | null;
    origem: 'AREA' | 'FUNCAO';
  }>;
  examesMedicos: Array<{ tipo: string; data: Date; resultado: string; medico: string; crm: string }>;
  epiFornecidos: Array<{ nome: string; ca: string; ultimaEntrega: Date; quantidade: number }>;
  responsavelTecnico: {
    nome: string;
    cargo: string | null;
    registro: string;
    tipoRegistro: string;
    uf: string | null;
  };
  /** Lacunas que impedem o PPP de ser emitido como esta. */
  pendencias: string[];
}

/**
 * Monta o PPP de um colaborador.
 *
 * As pendencias sao parte do resultado, nao um erro: o documento incompleto
 * ainda serve para o tecnico ver o que falta antes de emitir.
 */
export async function montarPpp(colaboradorId: string): Promise<PppMontado> {
  const empresa = await obterEmpresaOuFalhar();

  const colaborador = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    include: {
      cliente: { select: { razaoSocial: true, nomeFantasia: true, cnpj: true } },
      area: { select: { id: true, nome: true } },
      asos: {
        orderBy: { dataExame: 'asc' },
        select: { tipo: true, dataExame: true, resultado: true, medicoNome: true, medicoCrm: true },
      },
      entregasEpi: {
        orderBy: { data: 'desc' },
        select: { data: true, quantidade: true, epi: { select: { nome: true, ca: true } } },
      },
    },
  });

  if (!colaborador) throw new NaoEncontrado('Colaborador nao encontrado.', 'COLABORADOR_NAO_ENCONTRADO');

  /*
   * Fatores de risco: o inventario da area onde ele trabalha MAIS o da funcao
   * que ele exerce. Sem inventario, o PPP nasce sem fator de risco — e a
   * pendencia mais grave, porque e justamente o que o INSS analisa.
   */
  const riscos = await prisma.inventarioRisco.findMany({
    where: {
      clienteId: colaborador.clienteId,
      OR: [
        ...(colaborador.areaId ? [{ areaId: colaborador.areaId }] : []),
        { funcao: { equals: colaborador.funcao, mode: 'insensitive' as const } },
      ],
    },
    orderBy: { iir: 'desc' },
  });

  const fatoresDeRisco = riscos.map((risco) => ({
    tipo: ROTULO_TIPO_RISCO[risco.tipo as TipoRisco],
    perigo: risco.perigo,
    fonteGeradora: risco.fonteGeradora,
    atividade: risco.atividade,
    // O PPP pede intensidade/concentracao medida. O que temos e a avaliacao
    // qualitativa do inventario — declarada como tal, nao disfarcada de medicao.
    intensidade: `Avaliacao qualitativa — IIR ${risco.iir} (grau ${risco.grauRisco})`,
    tecnicaUtilizada: 'Analise qualitativa de risco (S x P x E x F)',
    controleColetivo: risco.nivelControleAtual
      ? ROTULO_NIVEL_CONTROLE[risco.nivelControleAtual as NivelControle]
      : null,
    origem: (risco.areaId && risco.areaId === colaborador.areaId ? 'AREA' : 'FUNCAO') as 'AREA' | 'FUNCAO',
  }));

  // EPI: uma linha por modelo, com a entrega mais recente.
  const porEpi = new Map<string, { nome: string; ca: string; ultimaEntrega: Date; quantidade: number }>();
  for (const entrega of colaborador.entregasEpi) {
    const chave = `${entrega.epi.nome}|${entrega.epi.ca}`;
    const atual = porEpi.get(chave);
    porEpi.set(chave, {
      nome: entrega.epi.nome,
      ca: entrega.epi.ca,
      ultimaEntrega: atual ? atual.ultimaEntrega : entrega.data,
      quantidade: (atual?.quantidade ?? 0) + entrega.quantidade,
    });
  }

  const pendencias: string[] = [];
  if (fatoresDeRisco.length === 0) {
    pendencias.push(
      'Sem fatores de risco: cadastre o inventario de riscos da area ou da funcao (o INSS analisa exatamente isso).',
    );
  }
  if (colaborador.asos.length === 0) pendencias.push('Sem historico de ASO registrado.');
  if (!colaborador.dataAdmissao) pendencias.push('Data de admissao nao informada no cadastro.');
  if (!colaborador.matricula) pendencias.push('Matricula nao informada no cadastro.');
  if (porEpi.size === 0) pendencias.push('Nenhuma entrega de EPI registrada para este colaborador.');

  return {
    geradoEm: new Date(),
    fontes: {
      empregador: 'Cadastro do cliente (Etapa 2)',
      trabalhador: 'Cadastro de colaboradores (Etapa 9)',
      fatoresDeRisco: 'Inventario de riscos da area e da funcao (Etapa 19)',
      examesMedicos: 'Historico de ASO (Etapa 9)',
      epiFornecidos: 'Fichas de entrega NR-06 (Etapa 14)',
      responsavelTecnico: 'Cadastro da empresa de consultoria (Etapa 1.1)',
    },
    cabecalho: montarCabecalhoInstitucional(empresa),
    empregador: {
      razaoSocial: colaborador.cliente.razaoSocial,
      cnpjFormatado: formatarCnpj(colaborador.cliente.cnpj),
      unidade: colaborador.cliente.nomeFantasia,
    },
    trabalhador: {
      nome: colaborador.nome,
      cpfFormatado: formatarCpf(colaborador.cpf),
      matricula: colaborador.matricula,
      dataNascimento: colaborador.dataNascimento,
      funcao: colaborador.funcao,
      setor: colaborador.setor,
      grauRisco: ROTULO_GRAU_RISCO_FUNCAO[colaborador.grauRisco as GrauRiscoFuncao],
      dataAdmissao: colaborador.dataAdmissao,
      dataDesligamento: colaborador.dataDesligamento,
      vinculo: ROTULO_VINCULO_COLABORADOR[colaborador.vinculo as VinculoColaborador],
    },
    periodo: { de: colaborador.dataAdmissao, ate: colaborador.dataDesligamento ?? new Date() },
    fatoresDeRisco,
    examesMedicos: colaborador.asos.map((aso) => ({
      tipo: ROTULO_TIPO_ASO[aso.tipo as TipoAso],
      data: aso.dataExame,
      resultado: ROTULO_RESULTADO_ASO[aso.resultado as ResultadoAso],
      medico: aso.medicoNome,
      crm: aso.medicoCrm,
    })),
    epiFornecidos: [...porEpi.values()],
    responsavelTecnico: {
      nome: empresa.responsavelTecnicoNome,
      cargo: empresa.responsavelTecnicoCargo,
      registro: empresa.responsavelTecnicoRegistro,
      tipoRegistro: empresa.responsavelTecnicoTipoRegistro,
      uf: empresa.responsavelTecnicoUfRegistro,
    },
    pendencias,
  };
}
