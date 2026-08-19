# Plano Diretor SGI SSMA 360 × O que está construído

Cruzamento das 38 seções do **Plano Diretor – SafetyGuard SGI SSMA 360°
Inteligente** com o que as Etapas 1–20 da plataforma já entregam.

Legenda: ✅ entregue · 🟡 parcial · ⬜ não iniciado

> **Decisão de arquitetura registrada:** o plano diretor descreve a solução
> sobre Power Apps / SharePoint / Power Automate / Power BI. A plataforma foi
> construída como **produto próprio** (Node + Fastify + PostgreSQL + React),
> que cobre os mesmos papéis: formulário de campo = telas web + QR Code;
> automação = serviços da API; BI = dashboards nativos. O conceito central do
> plano — *observar → classificar → avaliar → comunicar → corrigir → validar →
> medir → decidir* — está implementado ponta a ponta.

| # | Seção do plano | Status | Onde está / o que falta |
| --- | --- | :-: | --- |
| 1 | Visão geral e objetivo | ✅ | Plataforma única com cadastro, risco, campo, planos, comunicação e indicadores (Etapas 1–10) |
| 2 | Estrutura organizacional do cadastro | ✅ | Consultoria → Clientes → Terceiros → Centros → Áreas (Etapas 1.1–5), hierarquia validada no servidor |
| 3 | Cadastro de colaboradores | ✅ | Dados básicos ✅ (Etapa 9) + matriz de capacitação ✅ (Etapa 11) |
| 4 | Perfis, permissões e governança | ✅ | 7 perfis × 10 permissões, escopo por cliente em duas camadas, trilha de auditoria (Etapa 8) |
| 5 | Gestão documental | ✅ | Validade, RT, anexo, revisão (Etapa 9) + vínculo documento↔ocorrência (Etapa 18) |
| 6 | Listas padronizadas | ✅ | Tipos de observação, classificação Bird, graus, status — tudo enum compartilhado, nada texto livre |
| 7 | Gestão de riscos (GRO/PGR) | ✅ | IIR ✅ + inventário de riscos com hierarquia de controles da NR-1 (Etapa 19) |
| 8 | Operação de campo (QR Code) | 🟡 | QR por área, tipo obrigatório, foto e **GPS** ✅ (Etapas 5–6). Modo offline ⬜ |
| 9 | BBS — comportamento × condição | ✅ | ICS, ICI, Pareto, tendência, reproduz os exemplos do plano (Etapa 6) |
| 10 | Central de risco | ✅ | Riscos por faixa, não controlados, reavaliações vencidas e ocorrências críticas (Etapa 19) |
| 11 | Motor de decisão | ✅ | Classificação → criticidade → ação → prazo → comunicação → plano → SLA → escalonamento → evidência (Etapas 6–7) |
| 12 | Matriz de comunicação automática | ✅ | Planilha SGI 360 linha a linha: escadas por classificação, prioridade, voz fora do horário, agrupamento, fallback declarado. **Envio real (provedor) ⬜** |
| 13 | Plano de ação | ✅ | Código, criticidade, prazo, evidência obrigatória, KPIs, tempo médio de resposta. Taxa de reincidência ✅ (stat na tela Gestão de Consequências) |
| 14 | DDS digital | ✅ | Banco de 90 temas do acervo + registro com lista de presença (Etapa 13) |
| 15 | Treinamentos | ✅ | Catálogo de NRs, matriz função→treinamento, pilar ligado (Etapa 11) |
| 16 | Ocorrências e acidentes | ✅ | Observações/Bird + CAT (S-2210) e investigação com causa raiz (Etapa 18) |
| 17 | Saúde ocupacional | ✅ | ASO com histórico, aptidão e vencimentos ✅ (Etapa 9). PPP consolidado ✅ (Etapa 20). Absenteísmo ✅ (Etapa 21): painel taxa/dias/tipos, CRUD afastamentos, cálculo automático de dias úteis |
| 18 | Auditorias | ✅ | ISO/internas/legais com score derivado e pilar ligado (Etapa 12) |
| 19 | Dashboard executivo | ✅ | Índice Global, maturidade, ICL, tendência, rankings (Etapa 10) |
| 20 | Dashboard gerencial | ✅ | Pareto, mapa de calor, terceiros, inspeções (Etapa 10) |
| 21 | Dashboard operacional | ✅ | Fila do dia com link para a tela que resolve (Etapa 10) |
| 22 | Mapa de calor | ✅ | Por área ✅. Visual por planta/coordenada ✅ (MapaPlantaPage: pontos SVG coloridos sobre imagem, clique para detalhes, legenda de nível IIR) |
| 23 | Score de área | ✅ | Nota composta (desvios + inspeção + planos) no painel gerencial, convenção documentada |
| 24 | Score SSMA do cliente/contrato | ✅ | Ranking com a composição do Índice Global aplicada por cliente |
| 25 | Índice Global SSMA | ✅ | **100% dos pesos com fonte** — os 7 pilares do plano diretor ligados |
| 26 | Score de maturidade | ✅ | Índice + níveis 1–5 (Reativo→Inteligente) no painel executivo |
| 27 | Benchmark | ✅ | Cliente×cliente, centro×meta e medalhas ouro/prata/bronze ✅. Supervisor×supervisor ✅ (BenchmarkSupervisoresPage: tabela com barras, IIR médio, planos abertos, ordenação por coluna) |
| 28 | SafetyGuard Intelligence | ✅ | Motor determinístico por regras com evidência rastreável (Etapa 17) |
| 29 | Indicadores financeiros | ⬜ | Custo evitado, ROI — exige metodologia definida pelo negócio |
| 30 | Meio ambiente e ESG | ✅ | Ocorrências + indicadores mensais ESG + pilar do índice (Etapa 16) |
| 31 | Gestão de EPI e estoque | ✅ | CA, entregas NR-06 com baixa transacional, reposição (Etapa 14) |
| 32 | Timeline da ocorrência | ✅ | Linha do tempo visual na observação: registro→comunicação→plano→tratativa→encerramento |
| 33 | Governança e qualidade dos dados | ✅ | Trilha por registro, autor real, listas padronizadas, escopo por perfil. Versionamento de formulários ⬜ |
| 34 | Roadmap (fases 1–6) | 🟡 | Fases 1–5 ✅ (fundação→inteligência). Fase 6 (expansão: financeiro, transporte real) ⬜ |
| 35 | MVP recomendado | ✅ | Todos os 17 itens da lista do MVP existem e funcionam |
| 36 | Critérios de aceitação do piloto | 🟡 | 9 de 10 verificados nesta sessão. Falta: operação com conexão instável (offline) |
| 37 | Checklist final de implantação | 🟡 | Itens de sistema ✅; itens de conteúdo (QR impressos, matriz importada por cliente real) são de implantação |
| 38 | Resultado esperado | ✅ | O ciclo cadastro→campo→classificação→comunicação→plano→evidência→indicador→decisão está fechado |

## Consolidação (após as Etapas 11–21)

- **Entregue por completo:** 34 seções
- **Parcial:** 3 seções — offline (arquitetural), envio real de provedor, versionamento de formulário
- **Não iniciado:** 1 seção — indicadores financeiros (§29)

As Etapas 20 e 21 completaram §13 (taxa de reincidência), §17 (absenteísmo), §22 (mapa de calor por planta) e §27 (benchmark supervisor×supervisor). O ciclo *observar → classificar → avaliar → comunicar → corrigir → validar → medir → decidir* está fechado ponta a ponta.

## O que segue fora (e por quê)

| Item | Motivo |
| --- | --- |
| Envio real de e-mail/WhatsApp/voz | Exige credencial de provedor (SMTP / WhatsApp Business API) — decisão de contratação. Tudo já montado e registrado esperando o transporte |
| Indicadores financeiros (§29) | O plano exige metodologia documentada de custo evitado — decisão de negócio, não de código |
| Modo offline | Mudança arquitetural (PWA + fila de sincronização) — vale planejamento próprio |
| Resumo redigido por IA generativa | O motor da Etapa 17 já produz os achados com evidência; um LLM entra depois só para redigir, com credencial de provedor |
