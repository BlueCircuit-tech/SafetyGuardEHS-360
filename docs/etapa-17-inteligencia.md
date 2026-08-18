# Etapa 17 — SafetyGuard Intelligence

As análises automáticas do §28 do plano diretor: o sistema deixa de só exibir
gráficos e passa a **ler os próprios indicadores**.

## Decisão de arquitetura

O plano exige "sempre permitir rastrear quais dados originaram a análise".
Por isso o motor é **determinístico, por regras** — não há IA generativa:

- cada achado carrega a **evidência numérica** que o produziu (visível na tela,
  em "Ver evidência");
- cada achado aponta a **tela que detalha**;
- o que os dados não sustentam, **não vira frase** — variação com base zero não
  inventa percentual, amostra pequena não aponta "causa dominante".

## As 11 análises

| Análise | Regra | Severidade |
| --- | --- | --- |
| Tendência por cliente | 30 dias vs 30 anteriores, variação ≥ 15% | Atenção / Positivo |
| Áreas em piora | mesma janela, só as 3 piores | Atenção |
| Causa dominante | ≥ 30% dos desvios, amostra ≥ 10 | Informativo |
| Planos atrasados | prazo vencido; > 30 dias vira crítico | Atenção / Crítico |
| Reincidência | > 1 registro de consequência | Atenção |
| Capacitação | vencidos + sem treinamento | Atenção / Crítico |
| Saúde | colaboradores impedidos | Crítico |
| EPI | CA vencido · abaixo do mínimo | Crítico / Atenção |
| Auditorias | NC maiores em 12 meses | Atenção |
| DDS | > 3 dias sem registro | Informativo / Atenção |
| Ranking | ≥ 5 pontos entre melhor e pior contrato | Informativo |

Os limiares (15% de variação, 30% de dominância...) são constantes documentadas
no serviço — convenção editável, não lei.

## Resumo gerencial

Uma frase composta apenas do que os achados sustentam:
*"4 pontos críticos exigem ação imediata; 5 merecem atenção esta semana;
1 indicador evoluiu bem."*

`GET /api/v1/inteligencia?clienteId=` · permissão `indicadores:ler` ·
tela **`/inteligencia`** (primeiro item da seção Indicadores).

## Evolução natural

Quando houver credencial de um provedor de IA, este motor vira a **base
factual** de um resumo redigido por LLM — os achados com evidência são
exatamente o contexto que impede a IA de inventar números.
