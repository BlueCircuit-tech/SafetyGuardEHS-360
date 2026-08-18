# Etapa 11 — Treinamentos e Matriz de Capacitação

Fecha o pilar **TREINAMENTOS** do ICSG (peso 10%), do Índice Global SSMA
(peso 5%) e do Score de Maturidade (peso 10%). Com ele, o ICSG passa a usar
**90% dos pesos** e o Índice Global, **85%**.

```
Catálogo (NR, carga, reciclagem)
        │
Matriz de capacitação (função → treinamento exigido)
        │
Realizações (quem fez, quando, até quando vale)
        │
Status por colaborador × requisito → nota do pilar
```

## As três peças

1. **Catálogo** — o treinamento com norma, carga horária e prazo de
   reciclagem em meses (vazio = sem reciclagem, ex.: integração única).
   Vem semeado com 11 itens da prática (NR-10 24m, NR-35 24m, NR-33 12m,
   NR-11 36m, Brigada 12m, LOTO 12m...) — **valores editáveis**, não imposição.
2. **Matriz de capacitação** — a função (mesmo texto do cadastro do
   colaborador) exige o treinamento. Global da consultoria: eletricista
   precisa de NR-10 em qualquer contrato.
3. **Realizações** — histórico preservado (a reciclagem não apaga o registro
   anterior), validade sugerida pela reciclagem do catálogo, certificado
   anexável em PDF/imagem.

## O status

| Situação | Quando |
| --- | --- |
| Em dia | validade futura (>30 dias) ou sem reciclagem obrigatória |
| A vencer | vence em até 30 dias |
| Vencido | validade no passado |
| **Sem treinamento** | a função exige e o colaborador **nunca fez** |

`SEM_TREINAMENTO` conta **contra** a nota — é a lacuna mais grave, não uma
ausência de dado. Função sem requisito cadastrado fica fora da conta: não há o
que cobrar.

**Nota do pilar** = % de requisitos em dia (Em dia + A vencer) sobre o total de
requisitos dos colaboradores ativos. `null` sem nenhum requisito — o motor de
índices renormaliza em vez de tratar como zero.

## Endpoints

| Método | Rota | Para quê |
| --- | --- | --- |
| `GET/POST/PUT/DELETE` | `/treinamentos[/:id]` | Catálogo (exclusão bloqueada com histórico — inative) |
| `GET/POST/DELETE` | `/capacitacao/requisitos[/:id]` | Matriz função→treinamento |
| `GET` | `/capacitacao/funcoes` | Funções em uso no cadastro |
| `GET` | `/capacitacao/matriz` | O cruzamento com resumo e nota do pilar |
| `GET` | `/colaboradores/:id/treinamentos` | Histórico do colaborador |
| `POST/DELETE` | `/treinamentos-realizados[/:id]` | Registro de realização |
| `POST` | `/treinamentos-realizados/:id/certificado` | Anexo (PDF/imagem) |

Permissões: `saude:ler` / `saude:escrever` — capacitação e aptidão andam
juntas na cobrança legal.

## Tela

**`/treinamentos`** — três abas: a matriz cruzada com filtros por cliente e
situação, o catálogo com os requisitos por função, e o registro de realização.

## Dados de demonstração

19 requisitos sobre 22 colaboradores = 44 cruzamentos: 24 em dia, 5 a vencer,
10 vencidos, 5 sem treinamento → **nota 65,9%**. Distribuição por posição,
determinística — o painel nunca nasce todo verde.

## O que vem depois

- Certificados do acervo (`Cópia de Lista de presença_Reciclagem_NR10...`)
  entram pela tela ou pela API de anexo.
- Alertas de vencimento pela matriz de comunicação (mesmo canal da Etapa 7).
- Bloqueio operacional: colaborador com NR vencida impedido como no ASO —
  regra de negócio a confirmar antes de ligar.
