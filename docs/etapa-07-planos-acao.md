# Etapa 7 — Planos de Ação, notificações e escalonamento

Fecha o ciclo que estava aberto desde a Etapa 6: a observação já calculava
prazo e destinatários, mas **a tratativa não tinha entidade e nada era
registrado**. Agora o fluxo completo do plano diretor existe:

```
Observação (6) → Plano de Ação (7) → Notificações → Escalonamento por prazo
                        └→ evidência de conclusão → KPIs de fechamento
```

---

## Plano de ação

### Campos

Legenda: **O** = obrigatório · *(pd)* = tem valor padrão

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `codigo` | texto | — | Gerado pelo servidor (`PA-0001`), sequencial e único. |
| `origem` | enum *(pd `MANUAL`)* | | `OBSERVACAO`, `AUDITORIA`, `INSPECAO`, `MANUAL`. |
| `observacaoId` | referência | ✔ se origem = OBSERVACAO | |
| `areaId` | referência | ✔ sem observação | Sem observação de origem, é a área que define o cliente. |
| `terceiroId` | referência | | Contratada responsável pela correção. |
| `acao` | texto (5–300) | ✔ | O que precisa ser feito. |
| `descricao` | texto (≤1000) | | Detalhamento. |
| `responsavelNome` | texto (3–120) | ✔ | |
| `responsavelCargo` / `responsavelEmail` | texto / e-mail | | E-mail é o destino da cobrança. |
| `criticidade` | enum | ✔ | `BAIXA`, `MEDIA`, `ALTA`, `CRITICA`. |
| `prazo` | data/hora | ✔ | Sugerido pela criticidade em plano novo. |
| `status` | enum *(pd `ABERTO`)* | | `ABERTO`, `EM_ANDAMENTO`, `CONCLUIDO`, `CANCELADO`. |
| `dataConclusao` | data/hora | | Vazio ao concluir = carimba o momento atual. |
| `evidenciaUrl` | arquivo | | `POST /planos-acao/:id/evidencia`. |
| `comentarioConclusao` | texto (≤1000) | | |

`clienteId` **não vem do payload** — é derivado da observação ou da área.

### Matriz de criticidade

| Criticidade | Prazo padrão |
| --- | :-: |
| Crítica | Imediato |
| Alta | 24 h |
| Média | 72 h |
| Baixa | 168 h (7 dias) |

Ao escolher a criticidade num plano novo, o formulário já sugere o prazo. Em
plano aberto a partir de observação, o prazo vem do **prazo-limite já calculado
pela matriz de comunicação** — que é mais específico.

### Concluir exige prova

`status = CONCLUIDO` sem `evidenciaUrl` **e** sem `comentarioConclusao` é
rejeitado. "Ação concluída" sem prova não sustenta auditoria.

---

## Abertura automática a partir da observação

`POST /observacoes/:id/plano-acao` cria o plano com tudo derivado:

- **ação** = a ação requerida pela matriz ("Isolar área", "Orientação imediata"…);
- **criticidade** = derivada do grau de risco (I → Crítica, II → Média, III → Baixa);
- **prazo** = `prazoLimite` da observação;
- **notificações** registradas na mesma transação.

Só tipos que abrem plano são aceitos (`409 TIPO_NAO_ABRE_PLANO` para
comportamento seguro e melhoria). Observação que já tem plano em aberto devolve
`409 PLANO_JA_ABERTO` com o código do plano existente — não duplica.

---

## Notificações

Cada abertura e cada escalonamento gera registros em `notificacao`, com a
**mensagem exatamente como seria enviada**.

O conteúdo vem de `montarMensagensAlerta()` (pacote compartilhado) e usa o
**cabeçalho institucional da Etapa 1.1** — a mesma assinatura e o mesmo rodapé
que saem nos relatórios.

E-mail gerado (real, do sistema):

```
Assunto: 🚨 ALERTA SSMA – Condicao Insegura | Extintor vencido

Foi registrada uma ocorrência durante inspeção de campo.

Detalhes:
• Cliente: Vale Verde Mineracao
• Área: Britagem — Planta 2
• Local: Ao lado do transportador TC-04
• Classificação: Condicao Insegura
• Grau de Risco: I
• Responsável: Rafael Martini
• Data/Hora: 17/08/2026 – 17:36
• Plano de ação: PA-0074

Ação requerida: Isolar area.
Prazo: Imediato (até 17/08/2026 – 17:36).

Destinatários: Supervisor, Coordenador, SSMA, Manutencao.
```

WhatsApp:

```
*SafetyGuard EHS 360* — notificacao automatica

🚨 *ALERTA SSMA*
Cliente: Vale Verde Mineracao
Área: Britagem — Planta 2
Classificação: Condicao Insegura
Grau de Risco: I

Guarda-corpo da passarela solto no acesso ao transportador TC-04.

Responsável: Rafael Martini
Ação: Isolar area
Prazo: Imediato (até 17/08/2026 – 17:36)
```

O emoji acompanha a urgência: 🚨 imediato · ⚠️ até 24 h · 📋 acima disso.

> ⚠️ **Nenhum provedor está conectado.** As notificações nascem com status
> `SIMULADA`: montadas, registradas e auditáveis, mas não enviadas. Plugar
> e-mail ou WhatsApp muda o status para `ENVIADA`/`FALHOU` — o modelo não muda.
>
> O canal segue a matriz: WhatsApp `OBRIGATORIO` e `OPCIONAL` geram registro
> (no segundo caso para o gestor decidir enviar); `NAO` não gera.

---

## Escalonamento automático

`POST /planos-acao/escalonar` varre os planos em aberto com prazo vencido e sobe
de nível conforme o atraso:

| Atraso sobre o prazo | Nível acionado |
| --- | --- |
| Registro | Supervisor |
| +24 h | Coordenador |
| +48 h | Gerente |
| +72 h | Gerência Corporativa |

**É idempotente**: só escalona quando o degrau calculado é maior que o já
registrado em `nivelEscalonamento`. Rodar duas vezes não duplica notificação —
verificado: a segunda execução escalona 0.

Cada escalonamento grava auditoria (`nivelEscalonamento: de → para`) e uma nova
notificação, com texto de escalonamento e o nível acionado somado aos
destinatários da matriz.

Pensado para um agendador. Hoje é acionado sob demanda pelo botão **"Rodar
escalonamento"** na listagem. A tela também mostra `escalonamentoPendente`
quando o degrau devido é maior que o registrado.

---

## KPIs

`GET /planos-acao/resumo`:

```json
{
  "abertos": 4, "emAndamento": 5, "concluidos": 65,
  "atrasados": 6, "escalonados": 5,
  "tempoMedioFechamentoDias": 4.8,
  "aderenciaAoPrazo": 80,
  "percentualConcluido": 87.8
}
```

`GET /planos-acao/por-criticidade` devolve a carteira em cada faixa da matriz,
com o prazo padrão — a "matriz de criticidade" do painel gerencial.

`GET /notificacoes/resumo` é o **Dashboard de Comunicação**: alertas gerados,
por canal, quantos vieram de escalonamento e a situação de envio.

---

## Endpoints

| Método | Rota | Para quê |
| --- | --- | --- |
| `GET` | `/planos-acao` | Lista com busca e filtros (inclusive `atrasados=true`) |
| `GET` | `/planos-acao/resumo` | KPIs |
| `GET` | `/planos-acao/por-criticidade` | Matriz de criticidade |
| `GET` | `/planos-acao/:id` | Plano completo |
| `POST` | `/planos-acao` | Abrir manualmente |
| `POST` | `/observacoes/:id/plano-acao` | Abrir a partir da observação |
| `PUT` | `/planos-acao/:id` | Atualizar / concluir |
| `DELETE` | `/planos-acao/:id` | Excluir |
| `POST` | `/planos-acao/:id/evidencia` | Anexar evidência |
| `POST` | `/planos-acao/escalonar` | Rodar o escalonamento |
| `GET` | `/planos-acao/escalonamento/niveis` | Degraus configurados |
| `GET` | `/planos-acao/:id/auditoria` | Histórico |
| `GET` | `/notificacoes` · `/notificacoes/resumo` | Log e painel de comunicação |

---

## Telas

- **`/planos-acao`** — KPIs, matriz de criticidade, listagem com filtros e o
  botão de escalonamento.
- **`/planos-acao/:id`** — tratativa: responsável, prazo, conclusão com
  evidência, observação de origem e as notificações geradas.
- **`/comunicacao`** — log de alertas com o conteúdo expandível de cada mensagem.
- **`/observacoes/:id`** — ganhou o botão **"Abrir plano de ação"**.

## Dados de demonstração

O seed abre planos para ~70% dos desvios, com estágios variados: **73 planos**
(65 concluídos, 5 em andamento, 3 abertos), tempo médio de fechamento 4,8 dias e
aderência ao prazo de 80% — números plausíveis para os KPIs fazerem sentido.

---

## O que vem depois

- **Envio real** de e-mail e WhatsApp (o "quem, como e quando" já está pronto).
- **Agendador** para o escalonamento rodar sozinho.
- **Pilar "Plano de Ação"** do ICSG — já ligado: o `percentualConcluido` entra
  no cálculo e o índice subiu de 60% para 80% dos pesos
  ([`indicadores-ssma.md`](indicadores-ssma.md)).
- **Nota SSMA dos terceiros** calculada a partir de observações e planos.
