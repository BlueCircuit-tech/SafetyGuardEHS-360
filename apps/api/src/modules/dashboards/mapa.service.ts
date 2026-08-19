import { prisma } from '../../db.js';

/**
 * Mapa de calor por planta (§22).
 *
 * Retorna todas as áreas do cliente que têm `coordPlantaX` e `coordPlantaY`
 * definidas, com o volume de desvios e a média do IIR das observações do
 * período. O front usa essas coordenadas para renderizar pontos coloridos
 * sobre a imagem `imagemPlantaUrl` do cliente.
 *
 * Áreas sem coordenada ainda ficam na lista (com coordPlantaX/Y nulos) para
 * que o técnico saiba quais faltam cadastrar.
 */
export async function mapaDeCalorPorPlanta(clienteId: string, meses: number) {
  const inicio = new Date();
  inicio.setMonth(inicio.getMonth() - meses);

  const [cliente, areas, observacoesPorArea] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { nomeFantasia: true, imagemPlantaUrl: true },
    }),

    prisma.area.findMany({
      where: { clienteId, situacao: 'ATIVA' },
      select: {
        id: true,
        nome: true,
        codigo: true,
        criticidade: true,
        coordPlantaX: true,
        coordPlantaY: true,
        responsavelNome: true,
      },
      orderBy: { nome: 'asc' },
    }),

    prisma.observacao.groupBy({
      by: ['areaId'],
      where: { clienteId, dataHora: { gte: inicio }, areaId: { not: undefined } },
      _count: true,
      _avg: { iir: true },
    }),
  ]);

  const porArea = new Map(observacoesPorArea.map((o) => [o.areaId!, o]));

  const pontos = areas.map((area) => {
    const obs = porArea.get(area.id);
    const totalObs = (obs?._count as { _all?: number } | undefined)?._all ?? 0;
    const iirMedio = obs?._avg?.iir ? Math.round(Number(obs._avg.iir)) : 0;

    // Nível de calor: 0 = frio (sem desvios) a 3 = crítico
    const nivel = totalObs === 0 ? 0 : iirMedio >= 750 ? 3 : iirMedio >= 300 ? 2 : 1;
    const corHeatmap = ['#6b7280', '#f59e0b', '#f97316', '#dc2626'][nivel]!;

    return {
      areaId: area.id,
      nome: area.nome,
      codigo: area.codigo,
      criticidade: area.criticidade,
      responsavel: area.responsavelNome,
      coordPlantaX: area.coordPlantaX,
      coordPlantaY: area.coordPlantaY,
      totalObs,
      iirMedio,
      nivel,
      corHeatmap,
      temCoordenada: area.coordPlantaX !== null && area.coordPlantaY !== null,
    };
  });

  return {
    clienteId,
    cliente: cliente?.nomeFantasia ?? '',
    imagemPlantaUrl: cliente?.imagemPlantaUrl ?? null,
    periodo: { inicio, meses },
    totalAreas: areas.length,
    areasSemCoordenada: pontos.filter((p) => !p.temCoordenada).length,
    pontos,
  };
}

/**
 * Benchmark supervisor×supervisor (§27).
 *
 * Agrupa as observações de campo pelo `responsavelNome` das áreas.
 * Permite que a gestão compare o desempenho de supervisores/responsáveis
 * de área num mesmo período.
 *
 * "Supervisor" aqui = responsável cadastrado na área. Se a área não tem
 * responsável, as observações ficam em "Sem responsável definido".
 */
export async function benchmarkSupervisores(clienteId: string | undefined, meses: number) {
  const inicio = new Date();
  inicio.setMonth(inicio.getMonth() - meses);

  const base = clienteId ? { clienteId } : {};

  // Busca as áreas com seus responsáveis
  const areas = await prisma.area.findMany({
    where: { ...base, situacao: 'ATIVA' },
    select: {
      id: true,
      clienteId: true,
      responsavelNome: true,
      responsavelEmail: true,
    },
  });

  if (areas.length === 0) return { supervisores: [], periodo: { inicio, meses } };

  const areaIds = areas.map((a) => a.id);
  const porAreaMap = new Map(areas.map((a) => [a.id, a.responsavelNome ?? 'Sem responsável definido']));

  // Observações por área
  const [obsGrupo, planosGrupo] = await Promise.all([
    prisma.observacao.groupBy({
      by: ['areaId'],
      where: { areaId: { in: areaIds }, dataHora: { gte: inicio } },
      _count: true,
      _avg: { iir: true },
    }),

    prisma.planoAcao.groupBy({
      by: ['areaId'],
      where: { areaId: { in: areaIds }, status: { in: ['ABERTO', 'EM_ANDAMENTO'] } },
      _count: { id: true },
    }),
  ]);

  const obsPorArea = new Map(obsGrupo.map((o) => [o.areaId!, o]));
  const planosPorArea = new Map(planosGrupo.map((p) => [p.areaId!, p._count.id]));

  // Agrega por supervisor
  const supervisorMap = new Map<
    string,
    { supervisor: string; desvios: number; totalObs: number; iirSomado: number; planosAbertos: number; areas: number }
  >();

  for (const area of areas) {
    const supervisor = porAreaMap.get(area.id)!;
    const obs = obsPorArea.get(area.id);
    const desvios = (obs?._count as { _all?: number } | undefined)?._all ?? 0;
    const iirSomado = desvios > 0 ? Math.round(Number(obs?._avg?.iir ?? 0) * desvios) : 0;
    const planos = planosPorArea.get(area.id) ?? 0;

    const atual = supervisorMap.get(supervisor) ?? {
      supervisor,
      desvios: 0,
      totalObs: 0,
      iirSomado: 0,
      planosAbertos: 0,
      areas: 0,
    };
    supervisorMap.set(supervisor, {
      supervisor,
      desvios: atual.desvios + desvios,
      totalObs: atual.totalObs + desvios,
      iirSomado: atual.iirSomado + iirSomado,
      planosAbertos: atual.planosAbertos + planos,
      areas: atual.areas + 1,
    });
  }

  const supervisores = [...supervisorMap.values()]
    .map((s) => ({
      supervisor: s.supervisor,
      areas: s.areas,
      desvios: s.desvios,
      iirMedio: s.totalObs > 0 ? Math.round(s.iirSomado / s.totalObs) : 0,
      planosAbertos: s.planosAbertos,
    }))
    .sort((a, b) => b.desvios - a.desvios);

  return { supervisores, periodo: { inicio, meses } };
}
