import { z } from 'zod';
import { opcional, texto } from './comuns.js';

/**
 * Etapa 24 — Modelos de relatorio.
 *
 * Textos-base da consultoria em Markdown, com marcadores ({{cliente}},
 * {{periodo}}, ...) trocados na hora de usar. Os modelos podem ser escritos a
 * mao, importados do conjunto padrao ou gerados pelo assistente; o relatorio
 * final e redigido a partir do modelo preenchido mais as instrucoes do
 * consultor.
 */

export const CATEGORIAS_MODELO_RELATORIO = [
  'Inspecao',
  'Mensal',
  'Auditoria',
  'Acidente',
  'Treinamento',
  'Ambiental',
  'Outro',
] as const;

export type CategoriaModeloRelatorio = (typeof CATEGORIAS_MODELO_RELATORIO)[number];

export const ROTULO_CATEGORIA_MODELO_RELATORIO: Record<CategoriaModeloRelatorio, string> = {
  Inspecao: 'Inspeção',
  Mensal: 'Mensal',
  Auditoria: 'Auditoria',
  Acidente: 'Acidente',
  Treinamento: 'Treinamento',
  Ambiental: 'Ambiental',
  Outro: 'Outro',
};

/** Marcadores aceitos no conteudo dos modelos. */
export const MARCADORES_RELATORIO = [
  { marcador: '{{cliente}}', descricao: 'Nome fantasia do cliente escolhido ao usar o modelo.' },
  { marcador: '{{periodo}}', descricao: 'Periodo de referencia informado (ex.: outubro/2026).' },
  { marcador: '{{data}}', descricao: 'Data em que o relatorio foi preenchido.' },
  { marcador: '{{responsavel}}', descricao: 'Nome do responsavel pela elaboracao.' },
  { marcador: '{{consultoria}}', descricao: 'Nome fantasia da empresa de consultoria.' },
] as const;

export type MarcadorRelatorio = (typeof MARCADORES_RELATORIO)[number]['marcador'];

/**
 * Troca os marcadores `{{chave}}` pelos valores informados. Marcadores sem
 * valor (ou com valor vazio) ficam como estao, para o usuario enxergar o que
 * ainda falta preencher. Aceita espacos dentro das chaves (`{{ cliente }}`)
 * e nao diferencia maiusculas.
 */
export function aplicarMarcadores(conteudo: string, valores: Record<string, string>): string {
  const indice = new Map<string, string>();
  for (const [chave, valor] of Object.entries(valores)) {
    indice.set(chave.trim().toLowerCase(), valor);
  }
  return conteudo.replace(/\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g, (original, chave: string) => {
    const valor = indice.get(chave.toLowerCase());
    return valor && valor.trim() ? valor : original;
  });
}

/** Marcadores presentes num conteudo (sem repetir, na ordem em que aparecem). */
export function listarMarcadores(conteudo: string): string[] {
  const encontrados: string[] = [];
  for (const encontrado of conteudo.matchAll(/\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g)) {
    const chave = encontrado[1] ?? '';
    if (!chave) continue;
    const normalizada = `{{${chave.toLowerCase()}}}`;
    if (!encontrados.includes(normalizada)) encontrados.push(normalizada);
  }
  return encontrados;
}

const modeloRelatorioBaseSchema = z.object({
  titulo: texto(3, 150, 'Titulo'),
  categoria: opcional(z.enum(CATEGORIAS_MODELO_RELATORIO, { errorMap: () => ({ message: 'Categoria invalida.' }) })),
  descricao: opcional(z.string().trim().max(300, 'Descricao deve ter no maximo 300 caracteres.')),
  conteudo: texto(10, 60_000, 'Conteudo'),
  ativo: z.boolean().default(true),
});

export const modeloRelatorioCreateSchema = modeloRelatorioBaseSchema;
export const modeloRelatorioUpdateSchema = modeloRelatorioBaseSchema.partial();

export type ModeloRelatorioCreateInput = z.input<typeof modeloRelatorioCreateSchema>;
export type ModeloRelatorioCreateData = z.output<typeof modeloRelatorioCreateSchema>;
export type ModeloRelatorioUpdateData = z.output<typeof modeloRelatorioUpdateSchema>;

/** Pedido de geracao assistida de um modelo novo. */
export const modeloRelatorioGerarSchema = z.object({
  tema: texto(3, 200, 'Tema'),
  categoria: opcional(z.enum(CATEGORIAS_MODELO_RELATORIO, { errorMap: () => ({ message: 'Categoria invalida.' }) })),
  contexto: opcional(z.string().trim().max(4000, 'Contexto deve ter no maximo 4000 caracteres.')),
  clienteId: opcional(z.string().uuid('Cliente invalido.')),
});

export type ModeloRelatorioGerarData = z.output<typeof modeloRelatorioGerarSchema>;

/** Valores usados para trocar os marcadores de um modelo. */
export const modeloRelatorioPreencherSchema = z.object({
  clienteId: opcional(z.string().uuid('Cliente invalido.')),
  periodo: opcional(z.string().trim().max(80, 'Periodo deve ter no maximo 80 caracteres.')),
  responsavel: opcional(z.string().trim().max(120, 'Responsavel deve ter no maximo 120 caracteres.')),
});

export type ModeloRelatorioPreencherData = z.output<typeof modeloRelatorioPreencherSchema>;

/** Redacao assistida do relatorio final a partir do modelo preenchido. */
export const modeloRelatorioRedigirSchema = modeloRelatorioPreencherSchema.extend({
  instrucoes: texto(5, 8000, 'Instrucoes'),
});

export type ModeloRelatorioRedigirData = z.output<typeof modeloRelatorioRedigirSchema>;

export interface ModeloRelatorioPadrao {
  titulo: string;
  categoria: CategoriaModeloRelatorio;
  descricao: string;
  conteudo: string;
}

/**
 * Conjunto inicial importado pela tela ("Importar modelos padrao"). A
 * importacao e idempotente pelo titulo: quem ja existe nao e recriado.
 */
export const MODELOS_RELATORIO_PADRAO: readonly ModeloRelatorioPadrao[] = [
  {
    titulo: 'Relatório mensal de SSMA',
    categoria: 'Mensal',
    descricao: 'Fechamento mensal do contrato: atividades, indicadores, desvios, planos e recomendações.',
    conteudo: `# Relatório Mensal de SSMA — {{cliente}}

**Período:** {{periodo}}
**Elaborado por:** {{responsavel}} — {{consultoria}}
**Data de emissão:** {{data}}

## 1. Objetivo

Apresentar o resultado das atividades de Segurança, Saúde e Meio Ambiente realizadas em {{cliente}} no período de {{periodo}}, com os indicadores do mês, os desvios tratados e as recomendações para o período seguinte.

## 2. Atividades realizadas

- Inspeções de segurança realizadas nas áreas:
- Diálogos Diários de Segurança (DDS) conduzidos:
- Treinamentos e integrações ministrados:
- Reuniões de CIPA e comitês acompanhados:
- Auditorias comportamentais aplicadas:

## 3. Indicadores do período

- Taxa de frequência de acidentes:
- Taxa de gravidade:
- Dias sem acidente com afastamento:
- Observações de campo registradas:
- Planos de ação abertos / concluídos no prazo:
- Índice de conformidade de ASO e treinamentos:

## 4. Desvios e ocorrências relevantes

Descrever os principais desvios observados, a classificação de risco e o tratamento dado.

## 5. Planos de ação

- Em andamento:
- Concluídos no período:
- Vencidos sem tratativa:

## 6. Saúde ocupacional

Situação dos exames periódicos, afastamentos e campanhas de saúde do período.

## 7. Meio ambiente

Gestão de resíduos, ocorrências ambientais e consumo de recursos acompanhados.

## 8. Recomendações para o próximo período

-
-

## 9. Conclusão

Avaliação geral do desempenho em SSMA no período e próximos passos acordados com a liderança de {{cliente}}.

---
{{consultoria}} · {{responsavel}}`,
  },
  {
    titulo: 'Relatório de inspeção de segurança',
    categoria: 'Inspecao',
    descricao: 'Registro de inspeção de campo: escopo, constatações, riscos e ações recomendadas.',
    conteudo: `# Relatório de Inspeção de Segurança — {{cliente}}

**Data da inspeção:** {{data}}
**Período de referência:** {{periodo}}
**Inspetor responsável:** {{responsavel}} — {{consultoria}}

## 1. Escopo da inspeção

Áreas, setores e atividades inspecionadas, com os acompanhantes do cliente.

## 2. Metodologia

Inspeção visual com registro fotográfico, entrevista com os executantes e verificação documental (APR, PT, checklists de equipamentos).

## 3. Constatações

### 3.1 Conformidades

-

### 3.2 Não conformidades

| Item | Local | Descrição | Grau de risco | Ação recomendada | Prazo |
| --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |

## 4. Condições e comportamentos de destaque

Boas práticas observadas e comportamentos seguros a reconhecer.

## 5. Ações imediatas adotadas

Medidas tomadas no ato da inspeção (interdição, correção imediata, orientação).

## 6. Conclusão e recomendações

Avaliação geral da área inspecionada e prioridades de tratamento.

---
{{consultoria}} · {{responsavel}}`,
  },
  {
    titulo: 'Relatório de investigação de acidente',
    categoria: 'Acidente',
    descricao: 'Investigação de acidente ou incidente: descrição, análise de causas, medidas e lições aprendidas.',
    conteudo: `# Relatório de Investigação de Acidente — {{cliente}}

**Data de emissão:** {{data}}
**Responsável pela investigação:** {{responsavel}} — {{consultoria}}

## 1. Identificação do evento

- Data e hora da ocorrência:
- Local / área:
- Tipo de evento (acidente com ou sem afastamento, incidente, quase acidente):
- Pessoas envolvidas (nome, função, empresa):
- CAT emitida: sim / não — número:

## 2. Descrição do evento

Relato objetivo do que aconteceu, na sequência em que ocorreu, com base nas entrevistas e evidências coletadas.

## 3. Lesões e danos

Natureza da lesão, parte do corpo atingida, atendimento prestado, afastamento previsto e danos materiais.

## 4. Análise de causas

### 4.1 Causas imediatas

- Atos inseguros:
- Condições inseguras:

### 4.2 Causas básicas

- Fatores pessoais:
- Fatores de trabalho:

### 4.3 Causa raiz

Conclusão da análise (5 porquês / Ishikawa) sobre a falha de gestão que permitiu o evento.

## 5. Medidas corretivas e preventivas

| Ação | Responsável | Prazo | Situação |
| --- | --- | --- | --- |
|  |  |  |  |

## 6. Lições aprendidas

Mensagem a divulgar nos DDS e nas demais áreas com exposição semelhante.

## 7. Equipe de investigação

Nomes, funções e assinaturas dos participantes.

---
{{consultoria}} · {{responsavel}}`,
  },
  {
    titulo: 'Relatório de treinamento',
    categoria: 'Treinamento',
    descricao: 'Registro de treinamento ministrado: conteúdo, carga horária, participantes e avaliação.',
    conteudo: `# Relatório de Treinamento — {{cliente}}

**Período:** {{periodo}}
**Instrutor:** {{responsavel}} — {{consultoria}}
**Data de emissão:** {{data}}

## 1. Identificação do treinamento

- Tema / norma de referência (ex.: NR-35 Trabalho em altura):
- Modalidade (inicial, periódico, eventual):
- Carga horária:
- Local e data(s) de realização:

## 2. Objetivo

Competências que o treinamento se propôs a desenvolver.

## 3. Conteúdo programático

-
-
-

## 4. Participantes

| Nome | Função | Setor | Presença | Nota / aprovação |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 5. Metodologia e recursos

Exposição dialogada, exercícios práticos, vídeos, materiais entregues.

## 6. Avaliação

Resultado da avaliação de aprendizagem e da avaliação de reação dos participantes.

## 7. Observações e recomendações

Pontos de atenção, reciclagens necessárias e próximos treinamentos sugeridos.

---
{{consultoria}} · {{responsavel}}`,
  },
];
