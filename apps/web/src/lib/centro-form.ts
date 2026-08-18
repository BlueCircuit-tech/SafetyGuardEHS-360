import {
  COR_DESTAQUE_CENTRO_PADRAO,
  META_INDICE_CENTRO_PADRAO,
  formatarTelefone,
  type CentroNegocioFormValues,
  type SituacaoCentro,
  type TipoCentroNegocio,
} from '@safetyguard/shared';

/** Centro de negócio como a API devolve. */
export interface CentroApi {
  id: string;
  empresaId: string;
  nome: string;
  codigo: string;
  tipo: TipoCentroNegocio;
  descricao: string | null;
  responsavelNome: string;
  responsavelCargo: string | null;
  responsavelEmail: string;
  responsavelTelefone: string | null;
  responsavelWhatsapp: string | null;
  cidade: string | null;
  uf: string | null;
  metaIndiceGlobal: number;
  situacao: SituacaoCentro;
  corDestaque: string;
  observacoes: string | null;
  criadoEm: string;
  atualizadoEm: string;
  quantidadeClientes: number;
  formatado: {
    responsavelTelefone: string | null;
    responsavelWhatsapp: string | null;
  };
}

export interface PaginaCentros {
  itens: CentroApi[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

export interface ResumoCentros {
  total: number;
  ativos: number;
  inativos: number;
  clientesSemCentro: number;
  centrosSemClientes: number;
}

export interface LinhaConsolidada {
  id: string;
  nome: string;
  codigo: string;
  tipo: TipoCentroNegocio;
  situacao: SituacaoCentro;
  corDestaque: string;
  metaIndiceGlobal: number;
  clientes: number;
  clientesAtivos: number;
  terceiros: number;
  funcionariosCobertos: number;
}

export interface Consolidado {
  centros: LinhaConsolidada[];
  clientesSemCentro: number;
}

export interface OpcaoCentro {
  id: string;
  nome: string;
  codigo: string;
  tipo: TipoCentroNegocio;
  situacao: SituacaoCentro;
  corDestaque: string;
}

export const VALORES_INICIAIS_CENTRO: CentroNegocioFormValues = {
  nome: '',
  codigo: '',
  tipo: '',
  descricao: '',
  responsavelNome: '',
  responsavelCargo: '',
  responsavelEmail: '',
  responsavelTelefone: '',
  responsavelWhatsapp: '',
  cidade: '',
  uf: '',
  metaIndiceGlobal: String(META_INDICE_CENTRO_PADRAO),
  situacao: 'ATIVO',
  corDestaque: COR_DESTAQUE_CENTRO_PADRAO,
  observacoes: '',
};

const texto = (valor: string | number | null | undefined): string =>
  valor === null || valor === undefined ? '' : String(valor);

export function centroParaFormulario(centro: CentroApi): CentroNegocioFormValues {
  return {
    nome: centro.nome,
    codigo: centro.codigo,
    tipo: centro.tipo,
    descricao: texto(centro.descricao),
    responsavelNome: centro.responsavelNome,
    responsavelCargo: texto(centro.responsavelCargo),
    responsavelEmail: centro.responsavelEmail,
    responsavelTelefone: centro.responsavelTelefone ? formatarTelefone(centro.responsavelTelefone) : '',
    responsavelWhatsapp: centro.responsavelWhatsapp ? formatarTelefone(centro.responsavelWhatsapp) : '',
    cidade: texto(centro.cidade),
    uf: texto(centro.uf),
    metaIndiceGlobal: texto(centro.metaIndiceGlobal),
    situacao: centro.situacao,
    corDestaque: centro.corDestaque,
    observacoes: texto(centro.observacoes),
  };
}

export const PILL_SITUACAO_CENTRO: Record<SituacaoCentro, string> = {
  ATIVO: 'ok',
  INATIVO: 'gray',
};

export const PILL_TIPO_CENTRO: Record<TipoCentroNegocio, string> = {
  REGIONAL: 'info',
  UNIDADE: 'purple',
  TIPO_CONTRATO: 'warn',
  DIVISAO: 'gray',
};
