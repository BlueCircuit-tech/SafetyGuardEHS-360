# Etapa 16 — Meio Ambiente e ESG

Fecha o último pilar do Índice Global SSMA — **o índice passa a usar 100% dos
pesos do plano diretor**.

## Ocorrências ambientais

Derramamento, vazamento, emissão não controlada, descarte irregular, produto
químico. Meta do plano diretor: **zero**.

- **Grau I aciona a matriz de comunicação** na criação: notificação CRÍTICA
  para Meio Ambiente (0h), com escalada Gerente (+2h) → Diretoria (+4h) e
  fallback de voz — a mesma linha `OCORRENCIA_AMBIENTAL` da planilha SGI 360.
  Verificado end-to-end.
- Campos: tipo, grau, volume estimado, **contida/não contida**, ação imediata,
  responsável. Trilha de auditoria em tudo.

## Nota do pilar

Parte de 100 e desconta por ocorrência nos últimos 12 meses: **15 pontos por
não contida, 5 por contida** (piso zero). É **convenção editável** — as
constantes vivem em `meio-ambiente.ts` no pacote compartilhado, documentadas
como decisão de gestão, não lei.

Sem nenhum registro (nem ocorrência, nem leitura ESG), a nota é `null` e o
motor renormaliza: **ausência de dado não vira nota 100**. O módulo só pontua
depois de começar a ser usado.

## Indicadores ESG mensais

Leitura por competência e cliente: água (m³), energia (kWh), resíduos (kg),
reciclados (kg), emissões (tCO₂). Upsert por mês — reenviar corrige, não
duplica. A taxa de reciclagem é derivada na tela.

| Método | Rota |
| --- | --- |
| `GET/POST/PUT/DELETE` | `/meio-ambiente/ocorrencias[/:id]` |
| `GET` | `/meio-ambiente/resumo` |
| `GET/POST` | `/meio-ambiente/indicadores` (POST = upsert por competência) |

Permissões `observacoes:*` (registro de campo). Tela: **`/meio-ambiente`**.

Demonstração: 18 leituras ESG (6 meses × 3 clientes) e **zero ocorrência** —
o estado inicial honesto é o histórico limpo; a nota nasce em 100.
