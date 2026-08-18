import type { CSSProperties } from 'react';

/**
 * Conjunto de icones da plataforma.
 *
 * SVG inline, traco de 1.6, `currentColor` e grade de 24 — herdam cor e
 * tamanho do contexto, funcionam em qualquer fundo e nao dependem de fonte
 * instalada. Emoji foi retirado da interface por isso: renderiza diferente em
 * cada sistema, nao aceita cor e nao tem peso visual de produto.
 *
 * Os emojis permanecem apenas nos **modelos de e-mail e WhatsApp**, onde o
 * plano diretor os especificou e onde de fato ajudam a leitura no celular.
 */

const CAMINHOS = {
  /* --- Navegacao ------------------------------------------------------- */
  painel: 'M3 13h6V3H3v10Zm0 8h6v-6H3v6Zm12 0h6V11h-6v10Zm0-18v6h6V3h-6Z',
  alvo: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0-3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  lupa: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5.5-1.5L21 21',
  bussola: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5.5-5.5 2 2-5.5 5.5-2Z',
  grafico: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  saude: 'M6 3v5a4 4 0 0 0 8 0V3M8 3H4m10 0h-4m0 9v2a5 5 0 0 0 5 5 3.5 3.5 0 0 0 3.5-3.5v-2M20.5 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  envelope: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 .5 9 6 9-6',
  mensagem: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z',

  /* --- Entidades ------------------------------------------------------- */
  predio: 'M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M15 21V11h3a2 2 0 0 1 2 2v8M3 21h18M8 7h3M8 11h3M8 15h3',
  fabrica: 'M3 21V10l5 3.5V10l5 3.5V10l5 3.5V21H3Zm5-11V4H5v6M3 21h18M8 17h2m4 0h2',
  pasta: 'M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  documento: 'M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 0v5h5M8.5 13h7m-7 4h7',
  pessoa: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0',
  pessoas: 'M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-7 8.5a7 7 0 0 1 14 0M16.5 12a3.5 3.5 0 1 0-1.8-6.5M18 20.5a7 7 0 0 0-2.2-5.1',
  capacete: 'M3 17a9 9 0 0 1 18 0M2 17h20v2H2v-2ZM8 16V8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v8',
  local: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  mapa: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',
  parceria: 'm11 17 2 2a1.5 1.5 0 0 0 2.5-1.5l2 1a1.5 1.5 0 0 0 2-2.2L14 10l-2 1.5a2.5 2.5 0 0 1-3-4L11 5h4l6 3M3 8l4-3h3',
  premio: 'M12 15a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Zm-3 -.8L7.5 22l4.5-2.5L16.5 22 15 14.2',
  ferramenta: 'M14.5 6.5a4 4 0 0 0 5 5l-8.5 8.5a2.1 2.1 0 0 1-3-3l6.5-10.5Zm0 0L11 3H7L5 5v4l3.5 3.5',
  etiqueta: 'M3 11V5a2 2 0 0 1 2-2h6l10 10-8 8L3 11Zm5-4.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1.5-1.5',
  anexo: 'M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3l8-8',
  telefone: 'M6 3h3l2 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 2v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4 5.2 2 2 0 0 1 6 3Z',
  paleta: 'M12 21a9 9 0 1 1 0-18c5 0 9 3.6 9 8 0 2.2-1.8 3.5-4 3.5h-1.5a1.8 1.8 0 0 0-1.3 3c.4.5.3 1.3-.4 1.6-.6.2-1.2.4-1.8.4ZM7.5 10.5h.01M11 7.5h.01M15.5 9h.01',

  /* --- Estados --------------------------------------------------------- */
  alerta: 'M12 4 2.5 20h19L12 4Zm0 5.5v5m0 2.5h.01',
  bloqueado: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8',
  ok: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3.5-9 2.5 2.5 5-5',
  cadeado: 'M6 10h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Zm2 0V7a4 4 0 0 1 8 0v3m-4 5v2',
  chave: 'M15.5 9.5a4 4 0 1 0-3.6 4L11 15H9v2H7v2H3v-3l6.5-6.5a4 4 0 0 0 6-.01ZM16 7.5h.01',
  relogio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13.5V12l3 2',
  calor: 'M12 21a6 6 0 0 0 6-6c0-4-3-5.5-3-9-2.5 1.5-3 4-3 4s-1-1.5-1-3c-2.5 2-5 4.5-5 8a6 6 0 0 0 6 6Z',
  piramide: 'M12 3 2.5 20h19L12 3Zm-4.7 8.5h9.4m-7 4.5h4.6',
  interrogacao: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.3-11.3a2.3 2.3 0 1 1 3.3 2.1c-.6.3-1 .9-1 1.6v.6m0 3h.01',
  raio: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',

  /* --- Acoes ----------------------------------------------------------- */
  camera: 'M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Zm9 9.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  impressora: 'M7 9V4h10v5M7 19H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 15h10v6H7v-6Z',
  engrenagem:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.5-3.5c0 .5 0 1-.1 1.4l2 1.6-2 3.4-2.4-1a7.6 7.6 0 0 1-2.4 1.4L14.3 21h-4l-.3-2.6a7.6 7.6 0 0 1-2.4-1.4l-2.4 1-2-3.4 2-1.6a7.7 7.7 0 0 1 0-2.8l-2-1.6 2-3.4 2.4 1A7.6 7.6 0 0 1 10 4.6L10.3 2h4l.3 2.6c.9.3 1.7.8 2.4 1.4l2.4-1 2 3.4-2 1.6c.1.4.1.9.1 1.4Z',
  olho: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  seta: 'M5 12h14m-6-6 6 6-6 6',
  voltar: 'M19 12H5m6 6-6-6 6-6',
  mais: 'M12 5v14M5 12h14',
  escudo: 'M12 3 4 6v6c0 4.6 3.3 8.3 8 9.5 4.7-1.2 8-4.9 8-9.5V6l-8-3Zm-3 9 2.2 2.2L15.5 10',
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

interface IconeProps {
  nome: NomeIcone;
  /** Aresta do icone em pixels. Padrao 16 — o tamanho do texto ao lado. */
  tamanho?: number;
  className?: string;
  style?: CSSProperties;
  /** Rotulo acessivel. Sem ele o icone e decorativo e some do leitor de tela. */
  titulo?: string;
}

export function Icone({ nome, tamanho = 16, className, style, titulo }: IconeProps) {
  return (
    <svg
      className={className ? `icone ${className}` : 'icone'}
      style={style}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      focusable="false"
    >
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}

/**
 * Farol de classificacao.
 *
 * Substitui os circulos coloridos em emoji (🟢🟡🔴). A cor vem da faixa de
 * desempenho do pacote compartilhado, entao o significado continua sendo
 * definido num lugar so.
 */
export function Farol({ cor, titulo }: { cor: string; titulo?: string }) {
  return (
    <span
      className="farol"
      style={{ background: cor, boxShadow: `0 0 0 3px ${cor}22` }}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    />
  );
}
