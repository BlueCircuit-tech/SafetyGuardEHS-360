import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, type Path, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { empresaConsultoriaCreateSchema, type EmpresaFormValues } from '@safetyguard/shared';
import { Campo } from '../componentes/Campo';
import { PreviaInstitucional } from '../componentes/PreviaInstitucional';
import { useToast } from '../componentes/Toast';
import { ErroApi, api, urlAbsoluta } from '../lib/api';
import { MASCARAS, type NomeMascara } from '../lib/mascaras';
import { useBuscaCep } from '../lib/useBuscaCep';
import { formatarDataHora } from '../lib/datas';
import {
  VALORES_INICIAIS,
  empresaParaFormulario,
  formularioParaPayload,
  type EmpresaApi,
} from '../lib/empresa-form';

interface Referencias {
  ufs: Array<{ sigla: string; nome: string }>;
  tiposRegistroResponsavelTecnico: string[];
  regimesTributarios: Array<{ valor: string; rotulo: string }>;
  cnaesSugeridos: Array<{ codigo: string; descricao: string; formatado: string }>;
}

interface RegistroAuditoria {
  id: string;
  acao: string;
  autor: string | null;
  criadoEm: string;
  alteracoes: Record<string, { de: unknown; para: unknown }> | null;
}

const REFERENCIAS_VAZIAS: Referencias = {
  ufs: [],
  tiposRegistroResponsavelTecnico: [],
  regimesTributarios: [],
  cnaesSugeridos: [],
};

function textoValor(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'sim' : 'nao';
  return String(valor);
}

export function EmpresaPage() {
  const { mostrar } = useToast();
  const [carregando, setCarregando] = useState(true);
  const [empresa, setEmpresa] = useState<EmpresaApi | null>(null);
  const [referencias, setReferencias] = useState<Referencias>(REFERENCIAS_VAZIAS);
  const [aba, setAba] = useState<'cadastro' | 'historico'>('cadastro');
  const [auditoria, setAuditoria] = useState<RegistroAuditoria[]>([]);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const inputLogo = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EmpresaFormValues>({
    defaultValues: VALORES_INICIAIS,
    // O schema compartilhado normaliza mascaras e vazios; o formulario trabalha
    // sempre com strings, por isso o resolver e reapontado para EmpresaFormValues.
    resolver: zodResolver(empresaConsultoriaCreateSchema) as unknown as Resolver<EmpresaFormValues>,
    mode: 'onBlur',
  });

  const valores = watch();
  const modoEdicao = Boolean(empresa);

  /* ------------------------------------------------------------ carga --- */
  useEffect(() => {
    let ativo = true;

    async function carregar() {
      try {
        const refs = await api.get<Referencias>('/referencias');
        if (ativo) setReferencias(refs);
      } catch {
        // referencias sao opcionais para o formulario funcionar
      }

      try {
        const atual = await api.get<EmpresaApi>('/empresa');
        if (!ativo) return;
        setEmpresa(atual);
        reset(empresaParaFormulario(atual));
      } catch (erro) {
        if (erro instanceof ErroApi && erro.status === 404) {
          if (ativo) setEmpresa(null);
        } else if (ativo) {
          mostrar(erro instanceof Error ? erro.message : 'Falha ao carregar o cadastro.', 'erro');
        }
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    void carregar();
    return () => {
      ativo = false;
    };
  }, [reset, mostrar]);

  const carregarAuditoria = useCallback(async () => {
    try {
      setAuditoria(await api.get<RegistroAuditoria[]>('/empresa/auditoria?limite=50'));
    } catch {
      setAuditoria([]);
    }
  }, []);

  useEffect(() => {
    if (aba === 'historico' && modoEdicao) void carregarAuditoria();
  }, [aba, modoEdicao, carregarAuditoria]);

  /* ---------------------------------------------------------- mascaras --- */
  const comMascara = (campo: Path<EmpresaFormValues>, mascara: NomeMascara) => {
    const registro = register(campo);
    return {
      ...registro,
      onChange: (evento: React.ChangeEvent<HTMLInputElement>) => {
        setValue(campo, MASCARAS[mascara](evento.target.value), { shouldDirty: true, shouldValidate: false });
      },
    };
  };

  const campoCep = comMascara('cep', 'cep');

  /* --------------------------------------------------------------- cep --- */
  const { buscar: buscarCep, buscando: buscandoCep } = useBuscaCep(
    useCallback(
      (endereco) => {
        if (endereco.logradouro) setValue('logradouro', endereco.logradouro, { shouldDirty: true });
        if (endereco.bairro) setValue('bairro', endereco.bairro, { shouldDirty: true });
        if (endereco.cidade) setValue('cidade', endereco.cidade, { shouldDirty: true });
        if (endereco.uf) setValue('uf', endereco.uf, { shouldDirty: true });
      },
      [setValue],
    ),
  );

  /* ------------------------------------------------------------- envio --- */
  const aoSalvar = handleSubmit(async (dados) => {
    const payload = formularioParaPayload(dados);

    try {
      const salva = modoEdicao
        ? await api.put<EmpresaApi>('/empresa', payload)
        : await api.post<EmpresaApi>('/empresa', payload);

      setEmpresa(salva);
      reset(empresaParaFormulario(salva));
      mostrar(modoEdicao ? 'Cadastro atualizado.' : 'Empresa de consultoria cadastrada. Etapa 1.1 concluida.', 'sucesso');
      if (aba === 'historico') void carregarAuditoria();
    } catch (erro) {
      if (erro instanceof ErroApi) {
        for (const [campo, mensagens] of Object.entries(erro.campos)) {
          setError(campo as Path<EmpresaFormValues>, { type: 'server', message: mensagens[0] });
        }
        mostrar(erro.mensagemAmigavel(), 'erro');
        return;
      }
      mostrar('Falha inesperada ao salvar.', 'erro');
    }
  });

  /* -------------------------------------------------------------- logo --- */
  async function enviarLogo(arquivo: File) {
    setEnviandoLogo(true);
    try {
      const atualizada = await api.upload<EmpresaApi>('/empresa/logo', arquivo);
      setEmpresa(atualizada);
      setValue('logoUrl', atualizada.logoUrl ?? '', { shouldDirty: false });
      mostrar('Logo atualizada.', 'sucesso');
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao enviar a logo.', 'erro');
    } finally {
      setEnviandoLogo(false);
      if (inputLogo.current) inputLogo.current.value = '';
    }
  }

  async function removerLogo() {
    setEnviandoLogo(true);
    try {
      const atualizada = await api.delete<EmpresaApi>('/empresa/logo');
      setEmpresa(atualizada);
      setValue('logoUrl', '', { shouldDirty: false });
      mostrar('Logo removida.');
    } catch (erro) {
      mostrar(erro instanceof Error ? erro.message : 'Falha ao remover a logo.', 'erro');
    } finally {
      setEnviandoLogo(false);
    }
  }

  const logoAtual = useMemo(() => urlAbsoluta(valores.logoUrl), [valores.logoUrl]);

  if (carregando) {
    return (
      <div className="centro-tela">
        <div className="spinner" />
        Carregando cadastro...
      </div>
    );
  }

  const erro = (campo: keyof EmpresaFormValues) => errors[campo]?.message as string | undefined;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>1.1 Empresa de Consultoria</h2>
          <p>
            Primeiro cadastro do sistema. Estes dados aparecem no cabecalho dos relatorios, na assinatura dos e-mails,
            no cabecalho das mensagens de WhatsApp e no rodape dos laudos e auditorias.
          </p>
        </div>
        <span className={`pill ${modoEdicao ? 'ok' : 'warn'}`}>
          {modoEdicao ? '✓ Etapa 1.1 concluida' : '● Etapa 1.1 pendente'}
        </span>
      </div>

      <div className="abas" role="tablist">
        <button type="button" role="tab" className={aba === 'cadastro' ? 'on' : ''} onClick={() => setAba('cadastro')}>
          Cadastro
        </button>
        <button
          type="button"
          role="tab"
          className={aba === 'historico' ? 'on' : ''}
          onClick={() => setAba('historico')}
          disabled={!modoEdicao}
        >
          Historico de alteracoes
        </button>
      </div>

      {aba === 'historico' ? (
        <div className="painel">
          <h3>🧾 Trilha de auditoria</h3>
          <p className="desc">Toda alteracao da matriz fica registrada — exigencia basica de rastreabilidade em SSMA.</p>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Acao</th>
                  <th>Autor</th>
                  <th>Alteracoes</th>
                </tr>
              </thead>
              <tbody>
                {auditoria.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--gray)' }}>
                      Nenhum registro ainda.
                    </td>
                  </tr>
                ) : (
                  auditoria.map((registro) => (
                    <tr key={registro.id}>
                      <td>{formatarDataHora(registro.criadoEm)}</td>
                      <td>
                        <span className={`pill ${registro.acao === 'CRIACAO' ? 'ok' : 'info'}`}>{registro.acao}</span>
                      </td>
                      <td>{registro.autor ?? '—'}</td>
                      <td>
                        {registro.alteracoes && Object.keys(registro.alteracoes).length > 0 ? (
                          Object.entries(registro.alteracoes)
                            .slice(0, 8)
                            .map(([campo, mudanca]) => (
                              <div key={campo}>
                                <code>{campo}</code>: {textoValor(mudanca.de)} → <b>{textoValor(mudanca.para)}</b>
                              </div>
                            ))
                        ) : (
                          <span style={{ color: 'var(--gray)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <form onSubmit={aoSalvar} noValidate>
          <div className="layout-form">
            <div>
              {!modoEdicao ? (
                <div className="hint">
                  🏢 <b>Nenhuma empresa cadastrada ainda.</b> Preencha os dados abaixo para concluir a Etapa 1.1 — sem
                  ela, os demais cadastros (clientes, unidades, inspecoes) nao podem ser criados.
                </div>
              ) : null}

              {/* ---------------------------------------- identificacao --- */}
              <section className="painel">
                <h3>🏢 Identificacao</h3>
                <p className="desc">Dados cadastrais da consultoria, conforme o cartao CNPJ.</p>

                <Campo label="Razao social" obrigatorio erro={erro('razaoSocial')}>
                  <input
                    {...register('razaoSocial')}
                    aria-invalid={Boolean(erro('razaoSocial'))}
                    placeholder="SafetyGuard Consultoria em Seguranca do Trabalho Ltda"
                  />
                </Campo>

                <div className="row2">
                  <Campo
                    label="Nome fantasia"
                    obrigatorio
                    erro={erro('nomeFantasia')}
                    ajuda="Nome exibido no cabecalho dos relatorios e nas notificacoes."
                  >
                    <input
                      {...register('nomeFantasia')}
                      aria-invalid={Boolean(erro('nomeFantasia'))}
                      placeholder="SafetyGuard EHS"
                    />
                  </Campo>

                  <Campo
                    label="CNPJ"
                    obrigatorio
                    erro={erro('cnpj')}
                    ajuda="Aceita o formato numerico e o alfanumerico (2026+)."
                  >
                    <input
                      {...comMascara('cnpj', 'cnpj')}
                      value={valores.cnpj}
                      aria-invalid={Boolean(erro('cnpj'))}
                      placeholder="00.000.000/0000-00"
                      inputMode="text"
                    />
                  </Campo>
                </div>

                <div className="row2">
                  <Campo label="Inscricao estadual" erro={erro('inscricaoEstadual')} ajuda='Use "ISENTO" quando nao houver.'>
                    <input {...register('inscricaoEstadual')} placeholder="ISENTO" />
                  </Campo>
                  <Campo label="Inscricao municipal" erro={erro('inscricaoMunicipal')}>
                    <input {...register('inscricaoMunicipal')} placeholder="9988771" />
                  </Campo>
                </div>

                <div className="row2">
                  <Campo label="CNAE principal" erro={erro('cnaePrincipal')} ajuda="Subclasse com 7 digitos.">
                    <input
                      {...comMascara('cnaePrincipal', 'cnae')}
                      value={valores.cnaePrincipal}
                      list="cnaes-sugeridos"
                      placeholder="7120-1/00"
                    />
                    <datalist id="cnaes-sugeridos">
                      {referencias.cnaesSugeridos.map((cnae) => (
                        <option key={cnae.codigo} value={cnae.formatado}>
                          {cnae.descricao}
                        </option>
                      ))}
                    </datalist>
                  </Campo>
                  <Campo label="Natureza juridica" erro={erro('naturezaJuridica')}>
                    <input {...register('naturezaJuridica')} placeholder="Sociedade Empresaria Limitada" />
                  </Campo>
                </div>

                <div className="row2">
                  <Campo label="Regime tributario" erro={erro('regimeTributario')}>
                    <select {...register('regimeTributario')}>
                      <option value="">Nao informado</option>
                      {referencias.regimesTributarios.map((regime) => (
                        <option key={regime.valor} value={regime.valor}>
                          {regime.rotulo}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo label="Data de fundacao" erro={erro('dataFundacao')}>
                    <input type="date" {...register('dataFundacao')} />
                  </Campo>
                </div>
              </section>

              {/* --------------------------------------------- contato --- */}
              <section className="painel">
                <h3>📞 Contato institucional</h3>
                <p className="desc">Origem das mensagens automaticas e canal de retorno nos documentos emitidos.</p>

                <div className="row2">
                  <Campo label="E-mail principal" obrigatorio erro={erro('email')}>
                    <input
                      type="email"
                      {...register('email')}
                      aria-invalid={Boolean(erro('email'))}
                      placeholder="contato@safetyguard.com.br"
                    />
                  </Campo>
                  <Campo label="E-mail financeiro" erro={erro('emailFinanceiro')}>
                    <input type="email" {...register('emailFinanceiro')} placeholder="financeiro@safetyguard.com.br" />
                  </Campo>
                </div>

                <div className="row3">
                  <Campo label="Telefone" obrigatorio erro={erro('telefone')}>
                    <input
                      {...comMascara('telefone', 'telefone')}
                      value={valores.telefone}
                      aria-invalid={Boolean(erro('telefone'))}
                      placeholder="(62) 3333-4444"
                      inputMode="tel"
                    />
                  </Campo>
                  <Campo label="WhatsApp" erro={erro('whatsapp')} ajuda="Celular usado nas notificacoes.">
                    <input
                      {...comMascara('whatsapp', 'telefone')}
                      value={valores.whatsapp}
                      placeholder="(62) 99988-7766"
                      inputMode="tel"
                    />
                  </Campo>
                  <Campo label="Site" erro={erro('site')}>
                    <input {...register('site')} placeholder="https://safetyguard.com.br" />
                  </Campo>
                </div>
              </section>

              {/* -------------------------------------------- endereco --- */}
              <section className="painel">
                <h3>📍 Endereco</h3>
                <p className="desc">Sai no cabecalho dos relatorios e no rodape dos laudos.</p>

                <div className="row-cep">
                  <Campo label="CEP" obrigatorio erro={erro('cep')}>
                    <input
                      {...campoCep}
                      value={valores.cep}
                      onBlur={(evento) => {
                        void campoCep.onBlur(evento);
                        void buscarCep(evento.target.value);
                      }}
                      aria-invalid={Boolean(erro('cep'))}
                      placeholder="74230-020"
                      inputMode="numeric"
                    />
                  </Campo>
                  <Campo label="Logradouro" obrigatorio erro={erro('logradouro')}>
                    <input {...register('logradouro')} aria-invalid={Boolean(erro('logradouro'))} placeholder="Avenida T-63" />
                  </Campo>
                  <Campo label="Numero" obrigatorio erro={erro('numero')}>
                    <input {...register('numero')} aria-invalid={Boolean(erro('numero'))} placeholder="1200" />
                  </Campo>
                </div>

                {buscandoCep ? <p className="ajuda">Consultando CEP...</p> : null}

                <div className="row2">
                  <Campo label="Complemento" erro={erro('complemento')}>
                    <input {...register('complemento')} placeholder="Sala 1502" />
                  </Campo>
                  <Campo label="Bairro" obrigatorio erro={erro('bairro')}>
                    <input {...register('bairro')} aria-invalid={Boolean(erro('bairro'))} placeholder="Setor Bueno" />
                  </Campo>
                </div>

                <div className="row2">
                  <Campo label="Cidade" obrigatorio erro={erro('cidade')}>
                    <input {...register('cidade')} aria-invalid={Boolean(erro('cidade'))} placeholder="Goiania" />
                  </Campo>
                  <Campo label="UF" obrigatorio erro={erro('uf')}>
                    <select {...register('uf')} aria-invalid={Boolean(erro('uf'))}>
                      <option value="">Selecione</option>
                      {referencias.ufs.map((uf) => (
                        <option key={uf.sigla} value={uf.sigla}>
                          {uf.sigla} — {uf.nome}
                        </option>
                      ))}
                    </select>
                  </Campo>
                </div>
              </section>

              {/* --------------------------------- responsavel tecnico --- */}
              <section className="painel">
                <h3>👷 Responsavel tecnico</h3>
                <p className="desc">Profissional que assina os laudos, programas e relatorios de auditoria.</p>

                <div className="row2">
                  <Campo label="Nome" obrigatorio erro={erro('responsavelTecnicoNome')}>
                    <input
                      {...register('responsavelTecnicoNome')}
                      aria-invalid={Boolean(erro('responsavelTecnicoNome'))}
                      placeholder="Rafael Martini"
                    />
                  </Campo>
                  <Campo label="Cargo" erro={erro('responsavelTecnicoCargo')}>
                    <input {...register('responsavelTecnicoCargo')} placeholder="Engenheiro de Seguranca do Trabalho" />
                  </Campo>
                </div>

                <div className="row3">
                  <Campo label="Conselho" obrigatorio erro={erro('responsavelTecnicoTipoRegistro')}>
                    <select
                      {...register('responsavelTecnicoTipoRegistro')}
                      aria-invalid={Boolean(erro('responsavelTecnicoTipoRegistro'))}
                    >
                      <option value="">Selecione</option>
                      {referencias.tiposRegistroResponsavelTecnico.map((tipo) => (
                        <option key={tipo} value={tipo}>
                          {tipo}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo label="Numero do registro" obrigatorio erro={erro('responsavelTecnicoRegistro')}>
                    <input
                      {...register('responsavelTecnicoRegistro')}
                      aria-invalid={Boolean(erro('responsavelTecnicoRegistro'))}
                      placeholder="12345/D"
                    />
                  </Campo>
                  <Campo label="UF do registro" erro={erro('responsavelTecnicoUfRegistro')}>
                    <select {...register('responsavelTecnicoUfRegistro')}>
                      <option value="">—</option>
                      {referencias.ufs.map((uf) => (
                        <option key={uf.sigla} value={uf.sigla}>
                          {uf.sigla}
                        </option>
                      ))}
                    </select>
                  </Campo>
                </div>

                <div className="row2">
                  <Campo label="E-mail" erro={erro('responsavelTecnicoEmail')}>
                    <input type="email" {...register('responsavelTecnicoEmail')} placeholder="rt@safetyguard.com.br" />
                  </Campo>
                  <Campo label="Telefone" erro={erro('responsavelTecnicoTelefone')}>
                    <input
                      {...comMascara('responsavelTecnicoTelefone', 'telefone')}
                      value={valores.responsavelTecnicoTelefone}
                      placeholder="(62) 99988-7766"
                      inputMode="tel"
                    />
                  </Campo>
                </div>
              </section>

              {/* --------------------------------------- identidade ------ */}
              <section className="painel">
                <h3>🎨 Identidade visual e textos institucionais</h3>
                <p className="desc">Definem a aparencia dos documentos e o texto fixo de cada canal.</p>

                <Campo label="Logo" ajuda="PNG, JPG, WEBP ou SVG — ate 5 MB. Aparece no cabecalho dos documentos.">
                  <div className="logo-box">
                    <div className="logo-preview">
                      {logoAtual ? <img src={logoAtual} alt="Logo atual" /> : <span aria-hidden="true">🦺</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        ref={inputLogo}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        style={{ display: 'none' }}
                        onChange={(evento) => {
                          const arquivo = evento.target.files?.[0];
                          if (arquivo) void enviarLogo(arquivo);
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={!modoEdicao || enviandoLogo}
                        onClick={() => inputLogo.current?.click()}
                      >
                        {enviandoLogo ? 'Enviando...' : 'Enviar logo'}
                      </button>
                      {logoAtual ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={enviandoLogo}
                          onClick={() => void removerLogo()}
                        >
                          Remover
                        </button>
                      ) : null}
                      {!modoEdicao ? <span className="ajuda">Salve o cadastro para habilitar o envio.</span> : null}
                    </div>
                  </div>
                </Campo>

                <div className="row2">
                  <Campo label="Cor primaria" erro={erro('corPrimaria')}>
                    <input type="color" {...register('corPrimaria')} />
                  </Campo>
                  <Campo label="Cor secundaria" erro={erro('corSecundaria')}>
                    <input type="color" {...register('corSecundaria')} />
                  </Campo>
                </div>

                <Campo
                  label="Rodape de relatorios e auditorias"
                  erro={erro('rodapeRelatorio')}
                  ajuda="Se vazio, usamos razao social + CNPJ + endereco."
                >
                  <textarea
                    {...register('rodapeRelatorio')}
                    placeholder="Documento emitido eletronicamente pela plataforma SafetyGuard EHS 360."
                  />
                </Campo>

                <Campo label="Assinatura de e-mail" erro={erro('assinaturaEmail')} ajuda="Se vazio, usamos nome + contato.">
                  <textarea {...register('assinaturaEmail')} placeholder="Equipe SafetyGuard EHS 360" />
                </Campo>

                <Campo label="Cabecalho das mensagens de WhatsApp" erro={erro('cabecalhoWhatsapp')}>
                  <input {...register('cabecalhoWhatsapp')} placeholder="*SafetyGuard EHS 360* — notificacao automatica" />
                </Campo>
              </section>

              {/* ------------------------------------------ operacao ----- */}
              <section className="painel" style={{ paddingBottom: 0 }}>
                <h3>⚙️ Operacao</h3>
                <p className="desc">Fuso usado nos prazos de planos de acao e nos carimbos de data dos documentos.</p>

                <div className="row2">
                  <Campo label="Fuso horario" erro={erro('timezone')}>
                    <select {...register('timezone')}>
                      <option value="America/Sao_Paulo">America/Sao_Paulo (UTC-3)</option>
                      <option value="America/Manaus">America/Manaus (UTC-4)</option>
                      <option value="America/Cuiaba">America/Cuiaba (UTC-4)</option>
                      <option value="America/Belem">America/Belem (UTC-3)</option>
                      <option value="America/Rio_Branco">America/Rio_Branco (UTC-5)</option>
                      <option value="America/Noronha">America/Noronha (UTC-2)</option>
                    </select>
                  </Campo>
                  <Campo label="Situacao" ajuda="Empresa inativa bloqueia a emissao de novos documentos.">
                    <select
                      value={valores.ativa ? 'sim' : 'nao'}
                      onChange={(evento) =>
                        setValue('ativa', evento.target.value === 'sim', { shouldDirty: true })
                      }
                    >
                      <option value="sim">Ativa</option>
                      <option value="nao">Inativa</option>
                    </select>
                  </Campo>
                </div>

                <div className="barra-acoes" style={{ marginLeft: -18, marginRight: -18 }}>
                  <span className="aviso">
                    {modoEdicao
                      ? isDirty
                        ? 'Ha alteracoes nao salvas.'
                        : `Ultima atualizacao: ${formatarDataHora(empresa?.atualizadoEm)}`
                      : 'Campos marcados com * sao obrigatorios.'}
                  </span>
                  {modoEdicao ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={isSubmitting || !isDirty}
                      onClick={() => empresa && reset(empresaParaFormulario(empresa))}
                    >
                      Descartar alteracoes
                    </button>
                  ) : null}
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Salvando...' : modoEdicao ? 'Salvar alteracoes' : 'Concluir Etapa 1.1'}
                  </button>
                </div>
              </section>
            </div>

            <aside className="coluna-previa">
              <PreviaInstitucional valores={valores} />
            </aside>
          </div>
        </form>
      )}
    </>
  );
}
