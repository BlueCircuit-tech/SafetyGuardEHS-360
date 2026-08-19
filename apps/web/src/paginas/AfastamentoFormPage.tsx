import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Campo } from '../componentes/Campo';
import { useToast } from '../componentes/Toast';
import { api } from '../lib/api';
import { ROTULO_TIPO_AFASTAMENTO, TIPOS_AFASTAMENTO } from '@safetyguard/shared';

interface OpcaoCliente { id: string; nomeFantasia: string }
interface OpcaoColaborador { id: string; nome: string; funcao: string }

const schema = z.object({
  clienteId: z.string().min(1, 'Informe o cliente.'),
  colaboradorId: z.string().min(1, 'Informe o colaborador.'),
  tipo: z.enum(TIPOS_AFASTAMENTO, { required_error: 'Informe o tipo.' }),
  dataInicio: z.string().min(1, 'Informe a data de início.'),
  dataFim: z.string().optional(),
  diasAfastamento: z.coerce.number().int().min(0),
  cid: z.string().optional(),
  descricao: z.string().optional(),
});

type Campos = z.infer<typeof schema>;

export function AfastamentoFormPage() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();
  const { mostrar } = useToast();

  const [clientes, setClientes] = useState<OpcaoCliente[]>([]);
  const [colaboradores, setColaboradores] = useState<OpcaoColaborador[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Campos>({ resolver: zodResolver(schema), defaultValues: { diasAfastamento: 0 } });

  const clienteId = watch('clienteId');
  const dataInicio = watch('dataInicio');
  const dataFim = watch('dataFim');

  useEffect(() => {
    api.get<OpcaoCliente[]>('/clientes/opcoes').then(setClientes).catch(() => {});
  }, []);

  useEffect(() => {
    if (!clienteId) { setColaboradores([]); return; }
    api
      .get<{ itens: OpcaoColaborador[] }>(`/colaboradores?clienteId=${clienteId}&porPagina=300`)
      .then((r) => setColaboradores(r.itens))
      .catch(() => setColaboradores([]));
  }, [clienteId]);

  // Calcula automaticamente os dias ao editar datas
  useEffect(() => {
    if (!dataInicio || !dataFim) return;
    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);
    if (fim >= inicio) {
      setValue('diasAfastamento', Math.round((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)));
    }
  }, [dataInicio, dataFim, setValue]);

  const carregar = useCallback(async () => {
    if (!id) return;
    const a = await api.get<Campos & { dataInicio: string; dataFim: string | null }>(`/absenteismo/${id}`);
    reset({
      clienteId: (a as unknown as { clienteId: string }).clienteId,
      colaboradorId: (a as unknown as { colaboradorId: string }).colaboradorId,
      tipo: a.tipo,
      dataInicio: a.dataInicio?.slice(0, 10) ?? '',
      dataFim: a.dataFim?.slice(0, 10) ?? '',
      diasAfastamento: (a as unknown as { diasAfastamento: number }).diasAfastamento,
      cid: (a as unknown as { cid: string | null }).cid ?? '',
      descricao: (a as unknown as { descricao: string | null }).descricao ?? '',
    });
  }, [id, reset]);

  useEffect(() => { void carregar(); }, [carregar]);

  const onSubmit = async (dados: Campos) => {
    try {
      const payload = { ...dados, dataFim: dados.dataFim || null, cid: dados.cid || null, descricao: dados.descricao || null };
      if (editando) {
        await api.put(`/absenteismo/${id}`, payload);
        mostrar('Afastamento atualizado.', 'sucesso');
      } else {
        await api.post('/absenteismo', payload);
        mostrar('Afastamento registrado.', 'sucesso');
      }
      navigate('/absenteismo');
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao salvar.', 'erro');
    }
  };

  return (
    <form className="painel" onSubmit={handleSubmit(onSubmit)} noValidate>
      <h2>{editando ? 'Editar afastamento' : 'Registrar afastamento'}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Campo label="Cliente" erro={errors.clienteId?.message}>
          <select {...register('clienteId')}>
            <option value="">Selecione…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
          </select>
        </Campo>

        <Campo label="Colaborador" erro={errors.colaboradorId?.message}>
          <select {...register('colaboradorId')} disabled={!clienteId}>
            <option value="">Selecione…</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>{c.nome} — {c.funcao}</option>
            ))}
          </select>
        </Campo>

        <Campo label="Tipo de afastamento" erro={errors.tipo?.message}>
          <select {...register('tipo')}>
            <option value="">Selecione…</option>
            {TIPOS_AFASTAMENTO.map((t) => (
              <option key={t} value={t}>{ROTULO_TIPO_AFASTAMENTO[t]}</option>
            ))}
          </select>
        </Campo>

        <Campo label="Dias de afastamento" erro={errors.diasAfastamento?.message}>
          <input type="number" min={0} {...register('diasAfastamento')} />
        </Campo>

        <Campo label="Data de início" erro={errors.dataInicio?.message}>
          <input type="date" {...register('dataInicio')} />
        </Campo>

        <Campo label="Data de retorno (opcional)" erro={errors.dataFim?.message}>
          <input type="date" {...register('dataFim')} />
        </Campo>

        <Campo label="CID-10 (opcional)" erro={errors.cid?.message}>
          <input type="text" placeholder="Ex: J45" {...register('cid')} />
        </Campo>

        <div style={{ gridColumn: 'span 2' }}>
          <Campo label="Observações (opcional)" erro={errors.descricao?.message}>
            <textarea rows={3} {...register('descricao')} />
          </Campo>
        </div>
      </div>

      <div className="barra-acoes" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/absenteismo')}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primario" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando…' : editando ? 'Salvar' : 'Registrar'}
        </button>
      </div>
    </form>
  );
}
