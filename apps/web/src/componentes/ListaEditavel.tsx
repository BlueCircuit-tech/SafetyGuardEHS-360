import { useState } from 'react';
import { Icone } from './Icone';

interface ListaEditavelProps {
  itens: string[];
  onChange: (itens: string[]) => void;
  placeholder?: string;
  /** Prefixo numerado ("1º", "2º"...) — usado nos 5 Porquês. */
  numerada?: boolean;
  maximo?: number;
  desabilitado?: boolean;
}

/**
 * Lista de textos curtos com adicionar/remover. Enter adiciona; o campo
 * vazio nao entra na lista. Serve ao Ishikawa (causas por categoria) e aos
 * 5 Porques (cadeia ordenada).
 */
export function ListaEditavel({ itens, onChange, placeholder, numerada, maximo = 20, desabilitado }: ListaEditavelProps) {
  const [rascunho, setRascunho] = useState('');

  function adicionar() {
    const texto = rascunho.trim();
    if (!texto || itens.length >= maximo) return;
    onChange([...itens, texto]);
    setRascunho('');
  }

  function remover(indice: number) {
    onChange(itens.filter((_, i) => i !== indice));
  }

  return (
    <div className="lista-editavel">
      {itens.length > 0 ? (
        <ol className={numerada ? 'lista-editavel-itens numerada' : 'lista-editavel-itens'}>
          {itens.map((item, indice) => (
            <li key={`${indice}-${item}`}>
              {numerada ? <span className="ordem">{indice + 1}º por quê?</span> : null}
              <span className="texto">{item}</span>
              {!desabilitado ? (
                <button type="button" className="btn btn-ghost btn-sm" aria-label="Remover" onClick={() => remover(indice)}>
                  ✕
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {!desabilitado && itens.length < maximo ? (
        <div className="lista-editavel-nova">
          <input
            value={rascunho}
            placeholder={placeholder}
            onChange={(e) => setRascunho(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                adicionar();
              }
            }}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={adicionar} disabled={!rascunho.trim()}>
            <Icone nome="mais" /> Adicionar
          </button>
        </div>
      ) : null}
    </div>
  );
}
