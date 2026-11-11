import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Teste de integracao da API contra um Postgres real, com migrations e seed
 * aplicados antes (o CI faz isso; localmente, `npm run db:migrate && npm run
 * db:seed`). Sem DATABASE_URL o arquivo inteiro e pulado — os testes de
 * unidade das regras continuam rodando sozinhos.
 *
 * Cobre o que o typecheck nao pega: campos Json, cadeias de versao,
 * transacoes com envio de e-mail, e a rota do agendador.
 */

const temBanco = Boolean(process.env.DATABASE_URL);
const CRON = 'segredo-de-teste-para-o-agendador';

describe.skipIf(!temBanco)('API (integracao)', () => {
  let app: FastifyInstance;
  let prisma: (typeof import('./db.js'))['prisma'];
  let h: Record<string, string>;
  let cliente: { id: string };
  let colaborador: { id: string; funcao: string; clienteId: string };
  let plano: { id: string };
  let documento: { id: string };
  const criados: Array<() => Promise<unknown>> = [];

  beforeAll(async () => {
    process.env.CRON_SECRET = CRON;
    // Sem SMTP: e-mail cai no Ethereal e nada sai de verdade.
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    ({ prisma } = await import('./db.js'));
    const { criarApp } = await import('./app.js');
    app = await criarApp();
    await app.ready();

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@safetyguard.com.br', senha: 'SafetyGuard2026' },
    });
    expect(login.statusCode).toBe(200);
    h = { authorization: `Bearer ${login.json().token}` };

    cliente = (await prisma.cliente.findFirstOrThrow({ select: { id: true } }))!;
    colaborador = await prisma.colaborador.findFirstOrThrow({ where: { situacao: 'ATIVO' }, select: { id: true, funcao: true, clienteId: true } });
    plano = await prisma.planoAcao.findFirstOrThrow({ where: { observacaoId: { not: null } }, select: { id: true } });
    documento = await prisma.documentoSsma.findFirstOrThrow({ where: { situacao: 'ATIVO', versaoAnteriorId: null }, select: { id: true } });
  }, 60_000);

  afterAll(async () => {
    for (const desfazer of criados.reverse()) await desfazer().catch(() => {});
    await app?.close();
    await prisma?.$disconnect();
  });

  it('acidente aceita Ishikawa e 5 Porques, e null limpa (DbNull)', async () => {
    const criado = await app.inject({
      method: 'POST',
      url: '/api/v1/acidentes',
      headers: h,
      payload: {
        clienteId: cliente.id,
        colaboradorId: colaborador.id,
        data: new Date().toISOString(),
        tipo: 'TIPICO',
        descricao: 'Escorregou em piso molhado (teste de integracao).',
        comAfastamento: false,
        ishikawa: { metodo: ['Procedimento desatualizado'], maquina: [], material: [], maoDeObra: ['Sem reciclagem'], medida: [], meioAmbiente: ['Piso molhado'] },
        cincoPorques: ['Escorregou', 'Piso molhado', 'Vazamento', 'Junta sem manutencao', 'Plano nao cobre a linha'],
      },
    });
    expect(criado.statusCode).toBe(201);
    const id = criado.json().id as string;
    criados.push(() => prisma.acidente.delete({ where: { id } }));
    expect(criado.json().ishikawa.maoDeObra).toHaveLength(1);
    expect(criado.json().cincoPorques).toHaveLength(5);

    const limpo = await app.inject({ method: 'PUT', url: `/api/v1/acidentes/${id}`, headers: h, payload: { cincoPorques: null } });
    expect(limpo.statusCode).toBe(200);
    expect(limpo.json().cincoPorques).toBeNull();

    const lista = await app.inject({ method: 'GET', url: '/api/v1/acidentes?busca=piso', headers: h });
    const item = lista.json().find((a: { id: string }) => a.id === id);
    expect(item?.causasIshikawa).toBe(3);

    const relatorio = await app.inject({ method: 'GET', url: `/api/v1/acidentes/relatorio-diario?clienteId=${cliente.id}`, headers: h });
    expect(relatorio.statusCode).toBe(200);
    expect(relatorio.json().resumo.acidentes).toBeGreaterThanOrEqual(1);
  });

  it('apresentacao do plano reune origem, notificacoes e linha do tempo', async () => {
    const r = await app.inject({ method: 'GET', url: `/api/v1/planos-acao/${plano.id}/apresentacao`, headers: h });
    expect(r.statusCode).toBe(200);
    expect(r.json().plano).toBeTruthy();
    expect(r.json().observacao).toBeTruthy();
    expect(Array.isArray(r.json().linhaDoTempo)).toBe(true);
  });

  it('revisao de documento cria versao encadeada e navegavel dos dois lados', async () => {
    const rev = await app.inject({ method: 'POST', url: `/api/v1/documentos/${documento.id}/revisao`, headers: h, payload: { revisao: 'R2' } });
    expect(rev.statusCode).toBe(201);
    const novoId = rev.json().id as string;
    criados.push(async () => {
      await prisma.documentoSsma.delete({ where: { id: novoId } });
      await prisma.documentoSsma.update({ where: { id: documento.id }, data: { situacao: 'ATIVO', vigente: true } });
    });
    expect(rev.json().versao).toBe(2);
    expect(rev.json().versaoAnteriorId).toBe(documento.id);

    for (const id of [documento.id, novoId]) {
      const versoes = await app.inject({ method: 'GET', url: `/api/v1/documentos/${id}/versoes`, headers: h });
      expect(versoes.json()).toHaveLength(2);
      expect(versoes.json()[0].vigente).toBe(false);
      expect(versoes.json()[1].vigente).toBe(true);
    }
  });

  it('OS e gerada dos cadastros; regerar cria versao nova e substitui a anterior', async () => {
    const risco = await prisma.inventarioRisco.create({
      data: {
        clienteId: colaborador.clienteId, funcao: colaborador.funcao, tipo: 'FISICO', perigo: 'Ruido continuo (teste)',
        danosPossiveis: 'Perda auditiva', severidade: 3, probabilidade: 3, exposicao: 3, frequencia: 3, iir: 81, grauRisco: 'I',
      },
    });
    criados.push(() => prisma.inventarioRisco.delete({ where: { id: risco.id } }));

    // O banco pode ja ter OS deste colaborador: o que se afirma e o encadeamento
    // (versao seguinte, anterior substituida), nao um numero absoluto.
    const v1 = await app.inject({ method: 'POST', url: '/api/v1/ordens-servico/gerar', headers: h, payload: { colaboradorId: colaborador.id } });
    expect(v1.statusCode).toBe(201);
    criados.push(() => prisma.ordemServico.delete({ where: { id: v1.json().id } }));
    expect(v1.json().codigo).toMatch(/^OS-\d{4}$/);
    expect(v1.json().riscos.length).toBeGreaterThanOrEqual(1);

    const v2 = await app.inject({ method: 'POST', url: '/api/v1/ordens-servico/gerar', headers: h, payload: { colaboradorId: colaborador.id } });
    criados.push(() => prisma.ordemServico.delete({ where: { id: v2.json().id } }));
    expect(v2.json().versao).toBe(v1.json().versao + 1);
    const anterior = await prisma.ordemServico.findUniqueOrThrow({ where: { id: v1.json().id }, select: { situacao: true } });
    expect(anterior.situacao).toBe('SUBSTITUIDA');

    const lista = await app.inject({ method: 'GET', url: `/api/v1/ordens-servico?colaboradorId=${colaborador.id}`, headers: h });
    expect(lista.json().itens).toHaveLength(1);
    expect(lista.json().itens[0].id).toBe(v2.json().id);
  });

  it('APR aprovada recebe carimbo, recusa edicao e gera nova versao com o mesmo codigo', async () => {
    const apr = await app.inject({
      method: 'POST', url: '/api/v1/aprs', headers: h,
      payload: {
        clienteId: cliente.id, atividade: 'Troca de valvula (teste)', dataInicio: new Date().toISOString(), responsavel: 'Tec. Seguranca',
        etapas: [{ etapa: 'Isolar linha', perigos: 'Pressao residual', riscos: 'Jato de fluido', medidasControle: 'Bloqueio e etiquetagem' }],
      },
    });
    expect(apr.statusCode).toBe(201);
    criados.push(() => prisma.apr.deleteMany({ where: { atividade: 'Troca de valvula (teste)' } }));

    const aprovada = await app.inject({ method: 'POST', url: `/api/v1/aprs/${apr.json().id}/aprovar`, headers: h, payload: { aprovadaPor: 'Eng. Resp.' } });
    expect(aprovada.json().situacao).toBe('APROVADA');
    expect(aprovada.json().aprovacaoHash).toHaveLength(64);

    // Payload valido de proposito: o que se testa e a regra "aprovada nao se
    // edita" (400), nao a validacao de formato (422).
    const editar = await app.inject({ method: 'PUT', url: `/api/v1/aprs/${apr.json().id}`, headers: h, payload: { atividade: 'Atividade alterada' } });
    expect(editar.statusCode).toBe(400);

    const v2 = await app.inject({ method: 'POST', url: `/api/v1/aprs/${apr.json().id}/nova-versao`, headers: h });
    expect(v2.statusCode).toBe(201);
    expect(v2.json().versao).toBe(2);
    expect(v2.json().codigo).toBe(apr.json().codigo);
    expect(v2.json().situacao).toBe('RASCUNHO');
  });

  it('checklist: impeditivo nao conforme reprova; nao impeditivo nao', async () => {
    const modelo = await app.inject({
      method: 'POST', url: '/api/v1/checklists/modelos', headers: h,
      payload: { clienteId: cliente.id, nome: 'Empilhadeira (teste)', tipoEquipamento: 'Empilhadeira', itens: [{ descricao: 'Freio', impeditivo: true }, { descricao: 'Buzina', impeditivo: false }] },
    });
    expect(modelo.statusCode).toBe(201);
    // A limpeza roda em ordem reversa: o modelo sai depois das execucoes (FK).
    criados.push(() => prisma.modeloChecklist.delete({ where: { id: modelo.json().id } }));
    criados.push(() => prisma.execucaoChecklist.deleteMany({ where: { modeloId: modelo.json().id } }));

    const reprovado = await app.inject({
      method: 'POST', url: '/api/v1/checklists/execucoes', headers: h,
      payload: { modeloId: modelo.json().id, equipamentoIdentificacao: 'EMP-T1', executadoPor: 'Operador', respostas: [{ descricao: 'Freio', impeditivo: true, conforme: false }, { descricao: 'Buzina', impeditivo: false, conforme: true }] },
    });
    expect(reprovado.json().resultado).toBe('NAO_APTO');
    expect(reprovado.json().hash).toHaveLength(64);

    const aprovado = await app.inject({
      method: 'POST', url: '/api/v1/checklists/execucoes', headers: h,
      payload: { modeloId: modelo.json().id, equipamentoIdentificacao: 'EMP-T2', executadoPor: 'Operador', respostas: [{ descricao: 'Freio', impeditivo: true, conforme: true }, { descricao: 'Buzina', impeditivo: false, conforme: false }] },
    });
    expect(aprovado.json().resultado).toBe('APTO');
  });

  it('e-mail lento nao estoura a transacao do escalonamento (envio fica fora dela)', async () => {
    // Simula um SMTP real: 1,5 s por mensagem. Se o envio estivesse dentro da
    // transacao (limite 5 s), tres planos escalonados ja bastariam para
    // "Transaction already closed" — o erro visto em producao.
    const email = await import('../src/lib/email.js');
    const original = email.enviarEmail;
    const lento = vi.spyOn(email, 'enviarEmail').mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 1500));
      return true;
    });

    // Tres planos vencidos e nunca escalonados, para forcar tres envios.
    const vencidos = await prisma.planoAcao.findMany({
      where: { status: 'ABERTO', prazo: { lt: new Date() }, observacaoId: { not: null } },
      take: 3,
      select: { id: true, nivelEscalonamento: true, responsavelEmail: true, cobrancaChefiaEm: true },
    });
    const antes = new Map(vencidos.map((p) => [p.id, p]));
    // Sem destinatario o despacho nao chama o SMTP: garante um e-mail de responsavel
    // para o teste nao depender de como o banco de demonstracao foi semeado.
    await prisma.planoAcao.updateMany({
      where: { id: { in: vencidos.map((p) => p.id) } },
      data: { nivelEscalonamento: 0, responsavelEmail: 'responsavel.teste@example.com' },
    });
    criados.push(async () => {
      for (const [id, plano] of antes) {
        await prisma.planoAcao.update({
          where: { id },
          data: { nivelEscalonamento: plano.nivelEscalonamento, responsavelEmail: plano.responsavelEmail, cobrancaChefiaEm: plano.cobrancaChefiaEm },
        });
      }
    });

    try {
      const r = await app.inject({ method: 'GET', url: '/api/v1/cron/escalonar', headers: { authorization: `Bearer ${CRON}` } });
      expect(r.statusCode).toBe(200);
      expect(r.json().escalonados.length).toBeGreaterThanOrEqual(Math.min(3, vencidos.length));
      expect(r.json().emails.falhas).toBe(0);
      if (vencidos.length > 0) expect(lento).toHaveBeenCalled();
    } finally {
      lento.mockRestore();
      expect(email.enviarEmail).toBe(original);
    }
  }, 30_000);

  it('cron de escalonamento exige o segredo e e idempotente', async () => {
    const sem = await app.inject({ method: 'GET', url: '/api/v1/cron/escalonar' });
    expect(sem.statusCode).toBe(401);

    const errado = await app.inject({ method: 'GET', url: '/api/v1/cron/escalonar', headers: { authorization: 'Bearer nao-e-este-segredo-aqui-nao' } });
    expect(errado.statusCode).toBe(401);

    const certo = await app.inject({ method: 'GET', url: '/api/v1/cron/escalonar', headers: { authorization: `Bearer ${CRON}` } });
    expect(certo.statusCode).toBe(200);
    expect(typeof certo.json().avaliados).toBe('number');

    // Rodar de novo no mesmo instante nao escala ninguem duas vezes.
    const repetido = await app.inject({ method: 'GET', url: '/api/v1/cron/escalonar', headers: { authorization: `Bearer ${CRON}` } });
    expect(repetido.json().escalonados).toHaveLength(0);
  });
});
