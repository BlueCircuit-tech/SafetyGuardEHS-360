import type { ReactNode } from 'react';

interface CampoProps {
  label: string;
  htmlFor?: string;
  obrigatorio?: boolean;
  erro?: string;
  ajuda?: ReactNode;
  children: ReactNode;
}

/** Envolve um input com label, marcador de obrigatoriedade, ajuda e erro. */
export function Campo({ label, htmlFor, obrigatorio, erro, ajuda, children }: CampoProps) {
  return (
    <div className="campo">
      <label htmlFor={htmlFor}>
        {label}
        {obrigatorio ? (
          <span className="obrig" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {ajuda && !erro ? <div className="ajuda">{ajuda}</div> : null}
      {erro ? (
        <div className="erro" role="alert">
          {erro}
        </div>
      ) : null}
    </div>
  );
}
