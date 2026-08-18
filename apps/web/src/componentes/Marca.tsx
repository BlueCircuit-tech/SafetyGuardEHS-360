import { useEffect, useState } from 'react';

/**
 * Marca da plataforma.
 *
 * Por padrao usa o **monograma** — as iniciais em um quadrado sólido. É o que
 * mais se aproxima de identidade real sem inventar um símbolo: pictograma
 * genérico (escudo, capacete) parece ícone de banco de imagens, não logotipo.
 *
 * Se existir `public/logo.svg`, ele assume o lugar automaticamente. A troca é
 * feita por carregamento, e não por `onError` em `<img>`, para que o quadrado
 * nunca pisque uma imagem quebrada antes do fallback.
 */

const CAMINHO_LOGO = '/logo.svg';

let estadoDoLogo: 'desconhecido' | 'existe' | 'ausente' = 'desconhecido';

export function Marca({ tamanho = 44, iniciais = 'SG' }: { tamanho?: number; iniciais?: string }) {
  const [temLogo, setTemLogo] = useState(estadoDoLogo === 'existe');

  useEffect(() => {
    if (estadoDoLogo !== 'desconhecido') return;

    const imagem = new Image();
    imagem.onload = () => {
      estadoDoLogo = 'existe';
      setTemLogo(true);
    };
    imagem.onerror = () => {
      estadoDoLogo = 'ausente';
    };
    imagem.src = CAMINHO_LOGO;
  }, []);

  return (
    <span className="marca" style={{ width: tamanho, height: tamanho }} aria-hidden="true">
      {temLogo ? (
        <img src={CAMINHO_LOGO} alt="" />
      ) : (
        <span className="marca-iniciais" style={{ fontSize: tamanho * 0.4 }}>
          {iniciais}
        </span>
      )}
    </span>
  );
}
