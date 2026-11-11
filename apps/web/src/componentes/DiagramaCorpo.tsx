import { Fragment } from 'react';
import { PARTES_CORPO, ROTULO_PARTE_CORPO, type ParteCorpo } from '@safetyguard/shared';

/**
 * Diagrama anatomico (vista anterior e posterior) para marcar as partes do
 * corpo atingidas num acidente. Cada regiao desenhada e clicavel e alterna o
 * codigo de `PARTES_CORPO`; lados esquerdo e direito compartilham o mesmo
 * codigo (ambos os bracos = BRACOS). Abaixo do desenho ha a mesma escolha em
 * checkboxes — alternativa acessivel para teclado e leitor de tela, e o unico
 * jeito de marcar "Multiplas regioes".
 */

interface DiagramaCorpoProps {
  selecionadas: ParteCorpo[];
  aoAlternar: (parte: ParteCorpo) => void;
  somenteLeitura?: boolean;
}

type Forma =
  | { tipo: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { tipo: 'rect'; x: number; y: number; w: number; h: number; r?: number }
  | { tipo: 'path'; d: string };

interface Regiao {
  parte: ParteCorpo;
  /** Texto do tooltip quando difere do rotulo padrao (ex.: "Nuca"). */
  titulo?: string;
  formas: Forma[];
}

/*
 * Coordenadas de UMA figura centrada em x = 90 (largura util ~ 40..140,
 * altura 0..290). A vista posterior e a mesma figura deslocada 180px, com as
 * regioes do tronco trocadas pelas de costas.
 */

/** Espelha uma forma no eixo vertical da figura (x = 90). */
function espelhar(forma: Forma): Forma {
  if (forma.tipo === 'ellipse') return { ...forma, cx: 180 - forma.cx };
  if (forma.tipo === 'rect') return { ...forma, x: 180 - forma.x - forma.w };
  return forma;
}

/** A forma e o seu espelho (membro esquerdo e direito). */
function par(forma: Forma): Forma[] {
  return [forma, espelhar(forma)];
}

const MEMBROS: Regiao[] = [
  { parte: 'OMBROS', formas: par({ tipo: 'ellipse', cx: 62, cy: 61, rx: 12, ry: 9 }) },
  {
    parte: 'BRACOS',
    formas: [
      ...par({ tipo: 'rect', x: 46, y: 68, w: 13, h: 38, r: 6 }),
      ...par({ tipo: 'rect', x: 44, y: 117, w: 12, h: 33, r: 5 }),
    ],
  },
  { parte: 'COTOVELOS', formas: par({ tipo: 'ellipse', cx: 51, cy: 111, rx: 7, ry: 6 }) },
  { parte: 'PULSOS', formas: par({ tipo: 'rect', x: 44, y: 150, w: 12, h: 7, r: 2 }) },
  { parte: 'MAOS', formas: par({ tipo: 'ellipse', cx: 50, cy: 168, rx: 8, ry: 11 }) },
  { parte: 'COXAS', formas: par({ tipo: 'rect', x: 71, y: 148, w: 18, h: 50, r: 7 }) },
  { parte: 'JOELHOS', formas: par({ tipo: 'ellipse', cx: 80, cy: 204, rx: 9, ry: 7 }) },
  { parte: 'PERNAS', formas: par({ tipo: 'rect', x: 73, y: 211, w: 14, h: 48, r: 6 }) },
  { parte: 'TORNOZELOS', formas: par({ tipo: 'rect', x: 74, y: 259, w: 12, h: 7, r: 2 }) },
];

const ANTERIOR: Regiao[] = [
  { parte: 'CABECA', formas: [{ tipo: 'ellipse', cx: 90, cy: 24, rx: 16, ry: 19 }] },
  { parte: 'OLHOS', formas: par({ tipo: 'ellipse', cx: 84, cy: 21, rx: 3.6, ry: 2.6 }) },
  { parte: 'PESCOCO', formas: [{ tipo: 'rect', x: 83, y: 42, w: 14, h: 11, r: 3 }] },
  { parte: 'TORAX', formas: [{ tipo: 'rect', x: 70, y: 53, w: 40, h: 41, r: 8 }] },
  { parte: 'ABDOMEN', formas: [{ tipo: 'rect', x: 72, y: 94, w: 36, h: 30, r: 4 }] },
  { parte: 'REGIAO_PELVICA', formas: [{ tipo: 'path', d: 'M70 124 H110 L108 148 L90 156 L72 148 Z' }] },
  ...MEMBROS,
  { parte: 'PES', formas: par({ tipo: 'ellipse', cx: 77, cy: 274, rx: 9, ry: 7 }) },
];

const POSTERIOR: Regiao[] = [
  { parte: 'CABECA', formas: [{ tipo: 'ellipse', cx: 90, cy: 24, rx: 16, ry: 19 }] },
  { parte: 'PESCOCO', titulo: 'Nuca / pescoco', formas: [{ tipo: 'rect', x: 83, y: 42, w: 14, h: 11, r: 3 }] },
  { parte: 'COSTAS', formas: [{ tipo: 'rect', x: 70, y: 53, w: 40, h: 49, r: 8 }] },
  { parte: 'OMOPLATAS', formas: par({ tipo: 'ellipse', cx: 78, cy: 70, rx: 8, ry: 11 }) },
  { parte: 'COLUNA_VERTEBRAL', formas: [{ tipo: 'rect', x: 87, y: 54, w: 6, h: 48, r: 2 }] },
  { parte: 'REGIAO_LOMBAR', formas: [{ tipo: 'rect', x: 72, y: 102, w: 36, h: 22, r: 4 }] },
  { parte: 'GLUTEOS', formas: par({ tipo: 'ellipse', cx: 80, cy: 137, rx: 11, ry: 13 }) },
  ...MEMBROS,
  { parte: 'PES', titulo: 'Pes (calcanhar)', formas: par({ tipo: 'ellipse', cx: 80, cy: 272, rx: 8, ry: 7 }) },
];

const ESTILO = `
.diagrama-corpo-svg .regiao { fill: var(--superficie-3, #eef2f6); stroke: var(--gray, #6b7c92); stroke-width: 1; transition: fill 150ms ease; }
.diagrama-corpo-svg .regiao.ativa { fill: var(--red, #b91c1c); fill-opacity: 0.78; stroke: var(--red, #b91c1c); }
.diagrama-corpo-svg.editavel .regiao { cursor: pointer; }
.diagrama-corpo-svg.editavel .regiao:hover { fill: var(--primary, #047857); fill-opacity: 0.35; }
.diagrama-corpo-svg.editavel .regiao.ativa:hover { fill: var(--red, #b91c1c); fill-opacity: 0.6; }
.diagrama-corpo-svg text { fill: var(--gray, #6b7c92); font-size: 11px; font-weight: 600; }
.diagrama-corpo-svg .lado { font-size: 9px; font-weight: 500; }
.diagrama-corpo-legenda { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; margin-top: 10px; }
.diagrama-corpo-legenda .check-linha { padding: 6px 10px; }
.diagrama-corpo-chave { display: flex; gap: 14px; align-items: center; font-size: 12px; margin-top: 6px; color: var(--gray, #6b7c92); }
.diagrama-corpo-chave i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: -2px; margin-right: 5px; border: 1px solid var(--gray, #6b7c92); }
`;

function desenhar(forma: Forma, props: { className: string; onClick?: () => void }, chave: string, titulo: string) {
  const filho = <title>{titulo}</title>;
  if (forma.tipo === 'ellipse') {
    return (
      <ellipse key={chave} cx={forma.cx} cy={forma.cy} rx={forma.rx} ry={forma.ry} {...props}>
        {filho}
      </ellipse>
    );
  }
  if (forma.tipo === 'rect') {
    return (
      <rect key={chave} x={forma.x} y={forma.y} width={forma.w} height={forma.h} rx={forma.r ?? 0} {...props}>
        {filho}
      </rect>
    );
  }
  return (
    <path key={chave} d={forma.d} {...props}>
      {filho}
    </path>
  );
}

export function DiagramaCorpo({ selecionadas, aoAlternar, somenteLeitura = false }: DiagramaCorpoProps) {
  const marcadas = new Set(selecionadas);

  function vista(regioes: Regiao[], deslocamento: number, nome: string, ladoEsquerdoDaTela: 'D' | 'E') {
    return (
      <g transform={`translate(${deslocamento} 0)`}>
        {regioes.map((regiao, indice) => (
          <Fragment key={`${nome}-${regiao.parte}-${indice}`}>
            {regiao.formas.map((forma, i) =>
              desenhar(
                forma,
                {
                  className: `regiao${marcadas.has(regiao.parte) ? ' ativa' : ''}`,
                  onClick: somenteLeitura ? undefined : () => aoAlternar(regiao.parte),
                },
                `${nome}-${regiao.parte}-${indice}-${i}`,
                regiao.titulo ?? ROTULO_PARTE_CORPO[regiao.parte],
              ),
            )}
          </Fragment>
        ))}
        <text x={90} y={298} textAnchor="middle">
          {nome}
        </text>
        <text className="lado" x={34} y={60} textAnchor="middle">
          {ladoEsquerdoDaTela}
        </text>
        <text className="lado" x={146} y={60} textAnchor="middle">
          {ladoEsquerdoDaTela === 'D' ? 'E' : 'D'}
        </text>
      </g>
    );
  }

  const rotulosMarcados = PARTES_CORPO.filter((parte) => marcadas.has(parte)).map((parte) => ROTULO_PARTE_CORPO[parte]);

  return (
    <div className="diagrama-corpo">
      <style>{ESTILO}</style>
      <svg
        className={`diagrama-corpo-svg${somenteLeitura ? '' : ' editavel'}`}
        viewBox="0 0 360 306"
        role="img"
        aria-label={`Diagrama do corpo humano, vistas anterior e posterior. Selecionadas: ${rotulosMarcados.join(', ') || 'nenhuma'}.`}
        style={{ width: '100%', maxWidth: 420, height: 'auto', display: 'block' }}
      >
        {/* Na vista anterior o lado direito do trabalhador fica a esquerda de quem olha. */}
        {vista(ANTERIOR, 0, 'Anterior', 'D')}
        {vista(POSTERIOR, 180, 'Posterior', 'E')}
      </svg>

      <div className="diagrama-corpo-chave" aria-hidden="true">
        <span>
          <i style={{ background: 'var(--red, #b91c1c)', opacity: 0.78 }} />
          Atingida
        </span>
        <span>
          <i style={{ background: 'var(--superficie-3, #eef2f6)' }} />
          Não atingida
        </span>
        <span>D / E = lado direito / esquerdo do trabalhador</span>
      </div>

      <fieldset className="diagrama-corpo-legenda" style={{ border: 'none', padding: 0 }} disabled={somenteLeitura}>
        <legend className="hint" style={{ gridColumn: '1 / -1', padding: 0 }}>
          Ou marque na lista:
        </legend>
        {PARTES_CORPO.map((parte) => (
          <div className="check-linha" key={parte}>
            <label>
              <input type="checkbox" checked={marcadas.has(parte)} onChange={() => aoAlternar(parte)} />
              {ROTULO_PARTE_CORPO[parte]}
            </label>
          </div>
        ))}
      </fieldset>
    </div>
  );
}
