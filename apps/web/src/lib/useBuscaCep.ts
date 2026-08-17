import { useCallback, useState } from 'react';
import { limparCep } from '@safetyguard/shared';
import { useToast } from '../componentes/Toast';
import { api } from './api';

export interface EnderecoCep {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
}

/**
 * Consulta de CEP compartilhada pelos formularios de cadastro.
 * Só dispara com 8 dígitos e nunca bloqueia o preenchimento manual.
 */
export function useBuscaCep(aplicar: (endereco: EnderecoCep) => void) {
  const { mostrar } = useToast();
  const [buscando, setBuscando] = useState(false);

  const buscar = useCallback(
    async (valorCep: string) => {
      const cep = limparCep(valorCep);
      if (cep.length !== 8) return;

      setBuscando(true);
      try {
        const endereco = await api.get<EnderecoCep>(`/referencias/cep/${cep}`);
        aplicar(endereco);
        mostrar('Endereco preenchido pelo CEP.', 'sucesso');
      } catch (erro) {
        mostrar(erro instanceof Error ? erro.message : 'Nao foi possivel consultar o CEP.', 'erro');
      } finally {
        setBuscando(false);
      }
    },
    [aplicar, mostrar],
  );

  return { buscar, buscando };
}
