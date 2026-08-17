import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type TipoToast = 'info' | 'sucesso' | 'erro';

interface ItemToast {
  id: number;
  mensagem: string;
  tipo: TipoToast;
}

interface ContextoToast {
  mostrar: (mensagem: string, tipo?: TipoToast) => void;
}

const Contexto = createContext<ContextoToast | null>(null);

const DURACAO_MS = 4200;

export function ProvedorToast({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemToast[]>([]);
  const proximoId = useRef(1);

  const mostrar = useCallback((mensagem: string, tipo: TipoToast = 'info') => {
    const id = proximoId.current++;
    setItens((atuais) => [...atuais, { id, mensagem, tipo }]);
    setTimeout(() => setItens((atuais) => atuais.filter((item) => item.id !== id)), DURACAO_MS);
  }, []);

  const valor = useMemo(() => ({ mostrar }), [mostrar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div className="toast-area" aria-live="polite">
        {itens.map((item) => (
          <div key={item.id} className={`toast ${item.tipo}`}>
            {item.mensagem}
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useToast(): ContextoToast {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useToast precisa estar dentro de <ProvedorToast>.');
  return contexto;
}
