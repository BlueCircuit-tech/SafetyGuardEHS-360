import { useEffect, useRef, useState } from 'react';

interface AssinaturaCanvasProps {
  /** Recebe a assinatura como arquivo PNG quando o usuario confirma. */
  aoConfirmar: (arquivo: File) => void | Promise<void>;
  aoCancelar?: () => void;
  rotulo?: string;
  enviando?: boolean;
}

/**
 * Assinatura desenhada na tela (dedo ou mouse).
 *
 * Gera um PNG que sobe pelos mesmos endpoints de "imagem da assinatura" — o
 * servidor carimba (hash + signatario + momento), entao a assinatura fica
 * ligada ao conteudo assinado. Reconhecimento facial, iris e digital exigem
 * hardware/servico biometrico dedicado e nao sao tratados aqui.
 */
export function AssinaturaCanvas({ aoConfirmar, aoCancelar, rotulo = 'Assine no quadro abaixo', enviando }: AssinaturaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [vazio, setVazio] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const razao = window.devicePixelRatio || 1;
    const largura = canvas.clientWidth;
    const altura = canvas.clientHeight;
    canvas.width = largura * razao;
    canvas.height = altura * razao;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(razao, razao);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, largura, altura);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0e1a2b';
  }, []);

  function posicao(evento: React.PointerEvent<HTMLCanvasElement>) {
    const caixa = evento.currentTarget.getBoundingClientRect();
    return { x: evento.clientX - caixa.left, y: evento.clientY - caixa.top };
  }

  function iniciar(evento: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    evento.currentTarget.setPointerCapture(evento.pointerId);
    desenhando.current = true;
    const { x, y } = posicao(evento);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function mover(evento: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = posicao(evento);
    ctx.lineTo(x, y);
    ctx.stroke();
    setVazio(false);
  }

  function terminar() {
    desenhando.current = false;
  }

  function limpar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setVazio(true);
  }

  function confirmar() {
    const canvas = canvasRef.current;
    if (!canvas || vazio) return;
    canvas.toBlob((blob) => {
      if (blob) void aoConfirmar(new File([blob], `assinatura-${Date.now()}.png`, { type: 'image/png' }));
    }, 'image/png');
  }

  return (
    <div className="assinatura-canvas">
      <div className="hint">{rotulo}</div>
      <canvas
        ref={canvasRef}
        onPointerDown={iniciar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerLeave={terminar}
        style={{ width: '100%', height: 160, touchAction: 'none', border: '1px dashed var(--border-forte)', borderRadius: 8, background: '#fff', cursor: 'crosshair' }}
      />
      <div className="barra-acoes" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={limpar} disabled={enviando}>
          Limpar
        </button>
        {aoCancelar ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={aoCancelar} disabled={enviando}>
            Cancelar
          </button>
        ) : null}
        <button type="button" className="btn btn-primary btn-sm" onClick={confirmar} disabled={vazio || enviando}>
          {enviando ? 'Enviando...' : vazio ? 'Assine para confirmar' : 'Confirmar assinatura'}
        </button>
      </div>
    </div>
  );
}
