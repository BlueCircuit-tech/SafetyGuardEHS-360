import type { Permissao } from '@safetyguard/shared';
import type { NomeIcone } from '../componentes/Icone';

/**
 * Mapa de navegação do sistema.
 *
 * Fonte única para a tela Início, a barra lateral, o painel de módulos, os
 * hubs (Indicadores, Relatórios, Configurações) e o título da topbar. A
 * organização segue o mapa por temas: nove blocos, cada um com a pergunta
 * que ele responde e os seus sub-itens.
 *
 * Um item sem `rota` é um recurso previsto que ainda não tem tela própria —
 * aparece no mapa marcado como "em breve" para o mapa ficar completo sem
 * prometer link quebrado.
 */

export interface LinkNav {
  titulo: string;
  /** Complemento curto mostrado sob o título. */
  descricao?: string;
  rota?: string;
  permissao?: Permissao;
  /** Quando a mesma rota aparece em mais de um tema, este é o que dá nome à topbar. */
  canonico?: boolean;
}

export interface BlocoNav {
  titulo: string;
  icone: NomeIcone;
  itens: LinkNav[];
}

export interface TemaNav {
  slug: string;
  numero: number;
  titulo: string;
  /** A pergunta ou frase que resume o tema. */
  subtitulo: string;
  /** Cor de destaque, no formato hex. */
  cor: string;
  icone: NomeIcone;
  blocos: BlocoNav[];
}

export const TEMAS: TemaNav[] = [
  {
    slug: 'rotina-seguranca',
    numero: 1,
    titulo: 'Rotina de Segurança',
    subtitulo: 'O que acontece todos os dias na operação.',
    cor: '#1d4ed8',
    icone: 'capacete',
    blocos: [
      {
        titulo: 'Diálogo e Comportamento',
        icone: 'pessoas',
        itens: [
          { titulo: 'BBS – Observações Comportamentais', descricao: 'Registro seguro de comportamentos', rota: '/observacoes', permissao: 'observacoes:ler' },
          { titulo: 'DDS Digital', descricao: 'Diálogo diário de segurança', rota: '/dds', permissao: 'observacoes:ler' },
        ],
      },
      {
        titulo: 'Inspeções',
        icone: 'lupa',
        itens: [
          { titulo: 'Checklists de Pré-Uso', descricao: 'Verificação com foto e carimbo', rota: '/checklists', permissao: 'observacoes:ler' },
          { titulo: 'Inspeções de Segurança', descricao: 'Por área, via QR Code', rota: '/areas', permissao: 'cadastros:ler' },
        ],
      },
      {
        titulo: 'Análise de Risco',
        icone: 'alerta',
        itens: [{ titulo: 'APR – Análise Preliminar de Risco', descricao: 'Por etapa da atividade', rota: '/aprs', permissao: 'observacoes:ler' }],
      },
      {
        titulo: 'Ordens e Orientações',
        icone: 'documento',
        itens: [{ titulo: 'Ordens de Serviço', descricao: 'Por função (NR-1), com ciência dos colaboradores', rota: '/ordens-servico', permissao: 'saude:ler' }],
      },
      {
        titulo: 'Tratativas',
        icone: 'alvo',
        itens: [{ titulo: 'Planos de Ação', descricao: 'Evidências, prazos e responsáveis', rota: '/planos-acao', permissao: 'planos:ler' }],
      },
    ],
  },
  {
    slug: 'ocorrencias',
    numero: 2,
    titulo: 'Ocorrências e Investigação',
    subtitulo: 'Entender, tratar e evitar a repetição.',
    cor: '#dc2626',
    icone: 'alerta',
    blocos: [
      {
        titulo: 'Acidentes',
        icone: 'alerta',
        itens: [{ titulo: 'Acidentes e CAT', descricao: 'Registro e comunicação', rota: '/acidentes', permissao: 'planos:ler' }],
      },
      {
        titulo: 'Investigação',
        icone: 'lupa',
        itens: [{ titulo: 'Ishikawa, 5 Porquês e causa raiz', descricao: 'Dentro do registro do acidente', rota: '/acidentes', permissao: 'planos:ler' }],
      },
      {
        titulo: 'Consequências',
        icone: 'escudo',
        itens: [
          { titulo: 'Gestão de Consequências', descricao: 'Medidas disciplinares', rota: '/consequencias', permissao: 'planos:ler' },
          { titulo: 'Reincidência', descricao: 'Histórico e tendências', rota: '/consequencias', permissao: 'planos:ler' },
        ],
      },
      {
        titulo: 'Evidências',
        icone: 'pasta',
        itens: [{ titulo: 'Relatório Diário de SSMA', descricao: 'Fotos, documentos e relatórios', rota: '/acidentes/relatorio-diario', permissao: 'planos:ler' }],
      },
    ],
  },
  {
    slug: 'riscos',
    numero: 3,
    titulo: 'Gestão de Riscos – GRO/PGR',
    subtitulo: 'Onde estão os riscos e como controlá-los?',
    cor: '#15803d',
    icone: 'escudo',
    blocos: [
      {
        titulo: 'Identificação e Avaliação',
        icone: 'mapa',
        itens: [
          { titulo: 'Inventário de Riscos', descricao: 'Identificação, avaliação e classificação', rota: '/riscos', permissao: 'cadastros:ler' },
          { titulo: 'Produtos Químicos', descricao: 'Inventário, GHS e FDS', rota: '/quimicos', permissao: 'cadastros:ler' },
          { titulo: 'Ergonomia', descricao: 'Avaliação e checklist NR-17', rota: '/ergonomia', permissao: 'cadastros:ler' },
        ],
      },
      {
        titulo: 'Controles',
        icone: 'ok',
        itens: [{ titulo: 'Medidas de prevenção', descricao: 'Hierarquia de controles', rota: '/riscos', permissao: 'cadastros:ler' }],
      },
      {
        titulo: 'Mapeamento',
        icone: 'local',
        itens: [
          { titulo: 'Áreas e locais', descricao: 'Coordenadas de planta', rota: '/areas', permissao: 'cadastros:ler' },
          { titulo: 'Mapa de calor', descricao: 'Desvios por área', rota: '/mapa-planta', permissao: 'indicadores:ler' },
        ],
      },
      {
        titulo: 'Integração',
        icone: 'link',
        itens: [
          { titulo: 'APR', rota: '/aprs', permissao: 'observacoes:ler' },
          { titulo: 'Inspeções', rota: '/checklists', permissao: 'observacoes:ler' },
          { titulo: 'BBS', rota: '/observacoes', permissao: 'observacoes:ler' },
          { titulo: 'Planos de Ação', rota: '/planos-acao', permissao: 'planos:ler' },
        ],
      },
    ],
  },
  {
    slug: 'saude-ocupacional',
    numero: 4,
    titulo: 'Saúde Ocupacional',
    subtitulo: 'Gestão da saúde, exposição e documentação.',
    cor: '#ea580c',
    icone: 'saude',
    blocos: [
      {
        titulo: 'Colaboradores',
        icone: 'pessoas',
        itens: [
          { titulo: 'Colaboradores', descricao: 'Cadastro, ASO, exames e PPP', rota: '/colaboradores', permissao: 'saude:ler' },
          { titulo: 'Relatório de ASO', descricao: 'Admissional, periódico, demissional; vencidos e válidos', rota: '/relatorios/aso', permissao: 'saude:ler' },
          { titulo: 'Liberação de equipe', descricao: 'Quem pode trabalhar: documentos, ASO e bloqueios', rota: '/liberacao-equipe', permissao: 'saude:ler' },
        ],
      },
      {
        titulo: 'Afastamentos',
        icone: 'relogio',
        itens: [{ titulo: 'Absenteísmo', descricao: 'Indicadores e histórico', rota: '/absenteismo', permissao: 'saude:ler' }],
      },
      {
        titulo: 'Documentação',
        icone: 'documento',
        itens: [{ titulo: 'Documentos Legais', descricao: 'PGR, PCMSO, LTCAT, com versões', rota: '/documentos', permissao: 'saude:ler' }],
      },
      {
        titulo: 'Capacitação',
        icone: 'premio',
        itens: [{ titulo: 'Treinamentos', descricao: 'Matriz de capacitação e NRs', rota: '/treinamentos', permissao: 'saude:ler' }],
      },
      {
        titulo: 'EPIs',
        icone: 'capacete',
        itens: [{ titulo: 'EPI e Estoque', descricao: 'Entregas NR-06 e reposição', rota: '/epis', permissao: 'cadastros:ler' }],
      },
    ],
  },
  {
    slug: 'conformidade',
    numero: 5,
    titulo: 'Conformidade Legal e Auditorias',
    subtitulo: 'Estamos cumprindo nossas obrigações?',
    cor: '#6d28d9',
    icone: 'piramide',
    blocos: [
      {
        titulo: 'Legislação',
        icone: 'piramide',
        itens: [
          { titulo: 'Conformidade Legal', descricao: 'ASO e documentos vigentes', rota: '/conformidade', permissao: 'indicadores:ler' },
          { titulo: 'CIPA', descricao: 'Mandato, eleição e documentos (NR-5)', rota: '/cipa', permissao: 'cadastros:ler' },
          { titulo: 'Brigada de Incêndio', descricao: 'Brigadistas, extintores e organograma', rota: '/brigada', permissao: 'cadastros:ler' },
        ],
      },
      {
        titulo: 'Documentos',
        icone: 'documento',
        itens: [{ titulo: 'Controle de documentos', descricao: 'Validade e versões', rota: '/documentos', permissao: 'saude:ler' }],
      },
      {
        titulo: 'Auditorias',
        icone: 'lupa',
        itens: [
          { titulo: 'Auditorias', descricao: 'Internas, ISO 45001 e ISO 14001', rota: '/auditorias', permissao: 'cadastros:ler' },
          { titulo: 'Não Conformidades', descricao: 'Desvios, evidências e planos de ação', rota: '/auditorias', permissao: 'cadastros:ler' },
        ],
      },
      {
        titulo: 'Monitoramento',
        icone: 'relogio',
        itens: [{ titulo: 'Pendências e prazos', descricao: 'Fila do dia por responsável', rota: '/dashboard-operacional', permissao: 'planos:ler' }],
      },
    ],
  },
  {
    slug: 'meio-ambiente',
    numero: 6,
    titulo: 'Meio Ambiente e ESG',
    subtitulo: 'Sustentabilidade para o futuro.',
    cor: '#0f766e',
    icone: 'mapa',
    blocos: [
      {
        titulo: 'Meio Ambiente',
        icone: 'mapa',
        itens: [{ titulo: 'Meio Ambiente', descricao: 'Ocorrências ambientais, inspeções e tratativas', rota: '/meio-ambiente', permissao: 'observacoes:ler' }],
      },
      {
        titulo: 'Indicadores e ESG',
        icone: 'grafico',
        itens: [{ titulo: 'Indicadores ESG', descricao: 'Ambientais e desempenho', rota: '/meio-ambiente', permissao: 'observacoes:ler' }],
      },
      {
        titulo: 'Sustentabilidade',
        icone: 'premio',
        itens: [{ titulo: 'Aspectos e impactos', descricao: 'Levantamento ISO 14001 e documentos ambientais', rota: '/meio-ambiente', permissao: 'observacoes:ler' }],
      },
    ],
  },
  {
    slug: 'indicadores',
    numero: 7,
    titulo: 'Indicadores e Dashboards',
    subtitulo: 'Dados que geram decisões.',
    cor: '#0369a1',
    icone: 'grafico',
    blocos: [
      {
        titulo: 'Operacional',
        icone: 'bussola',
        itens: [{ titulo: 'Dashboard Operacional', descricao: 'Fila do dia, pendências e vencimentos', rota: '/dashboard-operacional', permissao: 'planos:ler', canonico: true }],
      },
      {
        titulo: 'Gerencial',
        icone: 'grafico',
        itens: [
          { titulo: 'Dashboard Gerencial', descricao: 'Áreas críticas, causas e reincidências', rota: '/dashboard-gerencial', permissao: 'indicadores:ler' },
          { titulo: 'Benchmark', descricao: 'Desempenho por supervisor', rota: '/benchmark-supervisores', permissao: 'indicadores:ler' },
        ],
      },
      {
        titulo: 'Estratégico',
        icone: 'alvo',
        itens: [{ titulo: 'Dashboard Executivo', descricao: 'Índice Global, maturidade e ranking', rota: '/dashboard-executivo', permissao: 'indicadores:ler' }],
      },
      {
        titulo: 'Inteligência',
        icone: 'raio',
        itens: [
          { titulo: 'SafetyGuard Intelligence', descricao: 'Alertas automáticos e análise preditiva', rota: '/inteligencia', permissao: 'indicadores:ler' },
          { titulo: 'Dashboard BBS', descricao: 'Comportamento × condição', rota: '/dashboard-bbs', permissao: 'indicadores:ler' },
          { titulo: 'Mapa de calor', descricao: 'Áreas por coordenada de planta', rota: '/mapa-planta', permissao: 'indicadores:ler', canonico: true },
        ],
      },
      {
        titulo: 'Financeiro',
        icone: 'painel',
        itens: [{ titulo: 'Indicadores Financeiros', descricao: 'Custo evitado, ROI e retorno das ações', rota: '/indicadores-financeiros', permissao: 'indicadores:ler' }],
      },
    ],
  },
  {
    slug: 'empresas',
    numero: 8,
    titulo: 'Gestão de Empresas e Terceiros',
    subtitulo: 'Parceiros e estrutura do negócio.',
    cor: '#b45309',
    icone: 'fabrica',
    blocos: [
      {
        titulo: 'Clientes',
        icone: 'parceria',
        itens: [{ titulo: 'Clientes', descricao: 'Empresas atendidas e contratos', rota: '/clientes', permissao: 'cadastros:ler' }],
      },
      {
        titulo: 'Terceiros',
        icone: 'pessoas',
        itens: [{ titulo: 'Terceiros', descricao: 'Contratadas, documentação e ranking SSMA', rota: '/terceiros', permissao: 'cadastros:ler' }],
      },
      {
        titulo: 'Centros de Negócio',
        icone: 'local',
        itens: [{ titulo: 'Centros de Negócio', descricao: 'Regionais, unidades e contratos', rota: '/centros-negocio', permissao: 'cadastros:ler' }],
      },
      {
        titulo: 'Áreas',
        icone: 'etiqueta',
        itens: [{ titulo: 'Áreas e QR Code', descricao: 'Locais de trabalho', rota: '/areas', permissao: 'cadastros:ler', canonico: true }],
      },
      {
        titulo: 'Responsáveis',
        icone: 'pessoa',
        itens: [{ titulo: 'Responsáveis por área', descricao: 'Em breve' }],
      },
    ],
  },
  {
    slug: 'administracao',
    numero: 9,
    titulo: 'Administração do Sistema',
    subtitulo: 'Dados mestres, acessos e estrutura.',
    cor: '#475569',
    icone: 'engrenagem',
    blocos: [
      {
        titulo: 'Usuários e Acessos',
        icone: 'cadeado',
        itens: [{ titulo: 'Usuários', descricao: 'Perfis e permissões', rota: '/usuarios', permissao: 'usuarios:gerenciar' }],
      },
      {
        titulo: 'Empresa',
        icone: 'predio',
        itens: [{ titulo: 'Empresa', descricao: 'Dados da consultoria', rota: '/empresa', permissao: 'cadastros:ler' }],
      },
      {
        titulo: 'Configurações',
        icone: 'engrenagem',
        itens: [
          { titulo: 'Parâmetros financeiros', descricao: 'Custos por tipo de desvio', rota: '/indicadores-financeiros', permissao: 'indicadores:ler' },
          { titulo: 'Regras de escalonamento', descricao: 'Alertas e comunicação automática', rota: '/comunicacao', permissao: 'planos:ler' },
        ],
      },
      {
        titulo: 'Dados Mestres',
        icone: 'pasta',
        itens: [
          { titulo: 'Fornecedores', descricao: 'Cadastro com telefone e e-mail', rota: '/fornecedores', permissao: 'cadastros:ler' },
          { titulo: 'Planilha financeira', descricao: 'Receitas, despesas e notas fiscais', rota: '/financeiro/planilha', permissao: 'indicadores:ler' },
          { titulo: 'Cartão de ponto', descricao: 'Horas trabalhadas por cliente e valor hora', rota: '/ponto' },
        ],
      },
    ],
  },
];

/** Itens da barra lateral. */
export interface ItemBarra {
  titulo: string;
  rota: string;
  icone: NomeIcone;
  /** Quando o item abre o painel de módulos em vez de navegar. */
  painel?: boolean;
}

export const BARRA: ItemBarra[] = [
  { titulo: 'Início', rota: '/inicio', icone: 'bussola' },
  { titulo: 'Módulos', rota: '/modulos', icone: 'painel', painel: true },
  { titulo: 'Indicadores', rota: '/indicadores', icone: 'grafico' },
  { titulo: 'Relatórios', rota: '/relatorios', icone: 'documento' },
  { titulo: 'Notificações', rota: '/comunicacao', icone: 'envelope' },
  { titulo: 'Configurações', rota: '/configuracoes', icone: 'engrenagem' },
  { titulo: 'Ajuda', rota: '/ajuda', icone: 'interrogacao' },
];

/** Fluxo do sistema, do dia a dia à estratégia. */
export const FLUXO: Array<{ etapa: string; cor: string; icone: NomeIcone }> = [
  { etapa: 'Planejar', cor: '#1d4ed8', icone: 'documento' },
  { etapa: 'Identificar riscos', cor: '#15803d', icone: 'escudo' },
  { etapa: 'Prevenir', cor: '#ea580c', icone: 'capacete' },
  { etapa: 'Executar', cor: '#6d28d9', icone: 'engrenagem' },
  { etapa: 'Verificar', cor: '#0f766e', icone: 'ok' },
  { etapa: 'Corrigir', cor: '#dc2626', icone: 'alvo' },
  { etapa: 'Medir', cor: '#0369a1', icone: 'grafico' },
  { etapa: 'Melhorar', cor: '#047857', icone: 'raio' },
];

/** Perfis de uso, do operacional à diretoria. */
export const PERFIS_USO: Array<{ titulo: string; descricao: string }> = [
  { titulo: 'Operacional', descricao: 'Uso no dia a dia' },
  { titulo: 'Técnico / Analista', descricao: 'Gestão e análise' },
  { titulo: 'Supervisor / Gestor', descricao: 'Acompanhamento' },
  { titulo: 'Diretoria / Executivo', descricao: 'Estratégia e decisão' },
];

/** Relatórios e documentos gerados pelo sistema, reunidos no hub Relatórios. */
export const RELATORIOS: LinkNav[] = [
  { titulo: 'Relatório mensal (Excel)', descricao: 'O que foi realizado e as pendências do mês, por cliente', rota: '/relatorios/mensal', permissao: 'indicadores:ler' },
  { titulo: 'Relatório de ASO', descricao: 'Lista por colaborador com filtro vencido/válido e Excel', rota: '/relatorios/aso', permissao: 'saude:ler' },
  { titulo: 'Relatório fotográfico', descricao: 'Fotos das observações e evidências dos planos, por período', rota: '/relatorios/fotografico', permissao: 'indicadores:ler' },
  { titulo: 'Modelos de relatório', descricao: 'Textos-base da consultoria, com geração assistida', rota: '/relatorios/modelos', permissao: 'indicadores:ler' },
  { titulo: 'Relatório Diário de SSMA', descricao: 'Fechamento do dia com acidentes, desvios e evidências', rota: '/acidentes/relatorio-diario', permissao: 'planos:ler' },
  { titulo: 'Apresentação de plano de ação', descricao: 'Aberta a partir de um plano, pronta para projetar', rota: '/planos-acao', permissao: 'planos:ler' },
  { titulo: 'PPP – Perfil Profissiográfico', descricao: 'Gerado a partir da ficha do colaborador', rota: '/colaboradores', permissao: 'saude:ler' },
  { titulo: 'Conformidade Legal', descricao: 'ASO e documentos vigentes por empresa', rota: '/conformidade', permissao: 'indicadores:ler' },
  { titulo: 'Dashboard Executivo', descricao: 'Índice Global, maturidade e ranking para a diretoria', rota: '/dashboard-executivo', permissao: 'indicadores:ler' },
  { titulo: 'Ranking SSMA de terceiros', descricao: 'Desempenho das empresas contratadas', rota: '/terceiros', permissao: 'cadastros:ler' },
  { titulo: 'Benchmark de supervisores', descricao: 'Comparativo de desempenho', rota: '/benchmark-supervisores', permissao: 'indicadores:ler' },
];

/** Rotas que não estão no mapa de temas (hubs e telas de apoio). */
const TITULOS_EXTRAS: Array<{ prefixo: string; secao: string; titulo: string }> = [
  { prefixo: '/inicio', secao: 'Início', titulo: 'Mapa de navegação' },
  { prefixo: '/modulos', secao: 'Módulos', titulo: 'Todos os módulos' },
  { prefixo: '/indicadores', secao: 'Indicadores', titulo: 'Indicadores e Dashboards' },
  { prefixo: '/relatorios', secao: 'Relatórios', titulo: 'Relatórios e documentos' },
  { prefixo: '/configuracoes', secao: 'Configurações', titulo: 'Empresas, acessos e parâmetros' },
  { prefixo: '/ajuda', secao: 'Ajuda', titulo: 'Como usar o sistema' },
  { prefixo: '/comunicacao', secao: 'Notificações', titulo: 'Comunicação Automática' },
];

export interface TituloRota {
  secao: string;
  titulo: string;
  cor?: string;
  tema?: TemaNav;
  canonico?: boolean;
}

/** Encontra tema e título para a rota atual, preferindo a correspondência mais longa. */
export function tituloDaRota(pathname: string): TituloRota | null {
  let melhor: (TituloRota & { tamanho: number }) | null = null;

  const considerar = (prefixo: string, candidato: TituloRota) => {
    const bate = pathname === prefixo || pathname.startsWith(`${prefixo}/`);
    if (!bate) return;
    const maisLongo = !melhor || prefixo.length > melhor.tamanho;
    const empateCanonico = melhor && prefixo.length === melhor.tamanho && candidato.canonico && !melhor.canonico;
    if (maisLongo || empateCanonico) {
      melhor = { ...candidato, tamanho: prefixo.length };
    }
  };

  for (const extra of TITULOS_EXTRAS) considerar(extra.prefixo, { secao: extra.secao, titulo: extra.titulo });

  for (const tema of TEMAS) {
    considerar(`/modulos/${tema.slug}`, { secao: 'Módulos', titulo: tema.titulo, cor: tema.cor, tema });
    for (const bloco of tema.blocos) {
      for (const item of bloco.itens) {
        if (item.rota) considerar(item.rota, { secao: tema.titulo, titulo: item.titulo, cor: tema.cor, tema, canonico: item.canonico });
      }
    }
  }

  return melhor;
}

export function temaPorSlug(slug: string | undefined): TemaNav | undefined {
  return TEMAS.find((tema) => tema.slug === slug);
}
