# Etapa 9 — Saúde ocupacional e documentos

ASO, PGR, PCMSO, LTCAT e licença ambiental têm uma coisa em comum: **valem até
uma data**. A plataforma passa a responder as três perguntas que uma
fiscalização faz — *quem está apto*, *quais documentos estão vigentes* e *o que
vence a seguir*.

```
Colaborador → ASO (histórico) ─┐
                               ├→ Índice de Conformidade Legal → fila de renovação
Documento legal ───────────────┘
```

---

## Colaborador

É o sujeito do ASO e do PPP. Sem ele, “ASO vencido” não tem a quem se referir.

### Campos

Legenda: **O** = obrigatório · *(pd)* = tem valor padrão

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `clienteId` | referência | ✔ | Contrato em que a pessoa atua. |
| `vinculo` | enum | ✔ | `CLIENTE`, `TERCEIRO`, `CONSULTORIA`. |
| `terceiroId` | referência | ✔ se vínculo = TERCEIRO | É quem responde pelo ASO. |
| `areaId` | referência | | Área de lotação. |
| `nome` | texto (3–120) | ✔ | |
| `cpf` | CPF | ✔ | Validado (dígitos verificadores); sequência repetida é rejeitada. |
| `matricula` | texto (≤30) | | |
| `dataNascimento` | data | | Não pode ser futura. |
| `funcao` | texto (2–80) | ✔ | |
| `setor` | texto (≤80) | | |
| `grauRisco` | enum *(pd `MEDIO`)* | | `BAIXO`, `MEDIO`, `ALTO` — **define a periodicidade do exame**. |
| `riscosOcupacionais` | texto (≤300) | | Separados por ponto e vírgula. |
| `dataAdmissao` / `dataDesligamento` | data | | Desligamento não pode preceder a admissão. |
| `email` / `telefone` | e-mail / telefone | | |
| `situacao` | enum *(pd `ATIVO`)* | | `ATIVO`, `AFASTADO`, `DESLIGADO`. |

**O CPF é único por cliente, não global.** A mesma pessoa pode prestar serviço em
contratos diferentes, com função e grau de risco próprios.

### Quem está impedido

O cadastro deriva três coisas de leitura: `situacaoAso`, `diasParaVencerAso` e
`impedido`. **Impedido** é quem não pode estar em campo:

- não tem nenhum ASO;
- o ASO atual está vencido;
- o último resultado foi **inapto**.

`SEM_ASO` é uma situação própria, e não sinônimo de vencido — tratar as duas
como a mesma coisa esconderia o caso mais grave, alguém trabalhando sem
qualquer atestado.

Excluir apagaria o histórico em cascata, então **quem já tem ASO ou documento
não é excluído**: o caminho é marcar como desligado, o que preserva a prova
exigida em fiscalização.

---

## ASO (NR-7)

| Campo | Tipo | O | Regra |
| --- | --- | :-: | --- |
| `colaboradorId` | referência | ✔ | |
| `tipo` | enum | ✔ | `ADMISSIONAL`, `PERIODICO`, `RETORNO_AO_TRABALHO`, `MUDANCA_DE_RISCO`, `DEMISSIONAL`. |
| `dataExame` | data | ✔ | Não pode ser futura. |
| `validade` | data | | Vazio = calculada pelo grau de risco. |
| `resultado` | enum | ✔ | `APTO`, `APTO_COM_RESTRICAO`, `INAPTO`. |
| `restricoes` | texto (≤500) | ✔ se houver restrição/inaptidão | O supervisor precisa saber o que a pessoa não pode fazer. |
| `medicoNome` / `medicoCrm` | texto | ✔ | CRM normalizado em maiúsculas. |
| `medicoCoordenador` | texto | | Coordenador do PCMSO, quando diferente. |
| `riscosAvaliados` / `examesComplementares` | texto | | Separados por ponto e vírgula. |
| `arquivoUrl` | arquivo | | PDF ou imagem — `POST /asos/:id/arquivo`. |

### Periodicidade

| Grau de risco da função (NR-4) | Exame periódico |
| --- | :-: |
| Alto | 12 meses |
| Médio | 24 meses |
| Baixo | 24 meses |

O formulário **sugere** a validade a partir dessa tabela e permite ajustar — a
NR-7 tem exceções por agente e por idade, e inventar uma regra rígida aqui
produziria data errada com cara de certeza.

**Demissional não tem validade**: encerra o vínculo, não gera próximo periódico.
Registrar um demissional marca o colaborador como desligado, com a data do
exame — e isso vai para a trilha de auditoria.

### O histórico é preservado

Um novo periódico **não apaga** o anterior. A fiscalização pede a sequência
completa de exames, então a lista guarda tudo e a leitura usa o mais recente.

---

## Documentos legais

### Catálogo

Cada tipo carrega nome por extenso, validade típica e se a legislação exige
responsável técnico:

| Documento | Validade típica | Exige RT |
| --- | :-: | :-: |
| PGR (NR-1) | 24 meses | sim |
| PCMSO (NR-7) | 12 meses | sim |
| LTCAT | 12 meses | sim |
| PPP | sem prazo | sim |
| PCA · PPR | 12 meses | sim |
| Laudo de insalubridade (NR-15) | 12 meses | sim |
| Laudo de periculosidade (NR-16) | 12 meses | sim |
| AEP / laudo ergonômico (NR-17) | 24 meses | sim |
| AVCB | 12 meses | não |
| Licença ambiental | 48 meses | não |
| ART / TRT | 12 meses | sim |
| Certificado de treinamento | 24 meses | não |
| Procedimento / POP · Outro | sem prazo | não |

A validade típica **sugere** a data ao escolher o tipo; contrato ou órgão podem
definir outro prazo. Tipos sem prazo padrão continuam sem validade — não
inventamos uma data para eles.

### Abrangência

| Abrangência | Alvo obrigatório |
| --- | --- |
| Todo o cliente | — |
| Área específica | `areaId` |
| Empresa contratada | `terceiroId` |
| Colaborador | `colaboradorId` |

O alvo precisa pertencer ao mesmo cliente — um PGR não pode apontar para a área
de outro contrato.

### Revisão preserva a versão anterior

`POST /documentos/:id/revisao` cria a nova versão e marca a anterior como
`SUBSTITUIDO`, em vez de sobrescrever. A fiscalização pode pedir qual documento
estava vigente numa data passada — a mesma lógica do histórico de ASO.

---

## Índice de Conformidade Legal (ICL)

```
ICL = (% ASO em dia × 60) + (% documentos em dia × 40)
```

Saúde pesa mais porque **ASO vencido impede a pessoa de trabalhar**, enquanto um
laudo vencido é uma não conformidade documental.

Dois cuidados no cálculo:

- **“Em dia” inclui o que está a vencer** — o documento ainda vale. O que está a
  vencer aparece separado porque é a fila de trabalho da renovação.
- **Sem validade cadastrada conta no denominador e não é conforme.** Caso
  contrário, deixar a data em branco viraria a forma mais fácil de melhorar o
  indicador.
- Um lado **sem nenhum registro** fica de fora e o outro responde por 100% — um
  contrato que ainda não cadastrou documentos não tirou zero neles.

> **O ICL não entra no Índice Global SSMA.** Os pesos daquele índice vêm do plano
> diretor e já fecham 100% sem um pilar de conformidade legal. Incluí-lo exigiria
> redistribuir os pesos — decisão de negócio, não de implementação.

O denominador da saúde é o **colaborador**, e não o ASO: dez atestados vencidos
da mesma pessoa são uma pendência, não dez.

---

## Fila de renovação

ASO e documento na mesma lista, ordenados pelo que aperta primeiro:

| Urgência | Quando |
| --- | --- |
| Vencido | validade no passado |
| Vence em até 7 dias | crítico |
| Vence em até 30 dias | atenção |
| Vence em até 90 dias | programado |

**Só o ASO atual de cada colaborador entra na fila.** Buscar todo ASO vencido
traria os admissionais antigos, já substituídos por um periódico válido — a fila
encheria de pendência que não existe. (Foi exatamente o que aconteceu na
primeira versão: 31 itens, 26 “vencidos”; com a correção, 15 e 7.)

---

## Endpoints

| Método | Rota | Para quê |
| --- | --- | --- |
| `GET` | `/colaboradores` | Lista com filtros (inclusive `asoIrregular=true`) |
| `GET` | `/colaboradores/opcoes` | Seletor para ASO e documento |
| `GET` `POST` `PUT` `DELETE` | `/colaboradores[/:id]` | CRUD |
| `GET` | `/colaboradores/:id/auditoria` | Histórico |
| `GET` `POST` `PUT` `DELETE` | `/asos[/:id]` | CRUD de exames |
| `POST` | `/asos/:id/arquivo` | Anexa o atestado (PDF ou imagem) |
| `GET` | `/documentos` · `/documentos/catalogo` | Lista e catálogo com prazos |
| `GET` `POST` `PUT` `DELETE` | `/documentos[/:id]` | CRUD |
| `POST` | `/documentos/:id/revisao` | Nova revisão (anterior vira substituída) |
| `POST` | `/documentos/:id/arquivo` | Anexa o arquivo |
| `GET` | `/conformidade` | Painel: ICL, saúde, documentos, fila, ranking |
| `GET` | `/conformidade/renovacoes` | Só a fila de renovação |

Permissões: `saude:ler` / `saude:escrever` nos cadastros; `indicadores:ler` no
painel. Diretoria, Supervisor, Técnico e Cliente leem; Gerente e Coordenador
escrevem.

---

## Telas

- **`/colaboradores`** — listagem com situação do ASO por pessoa e o filtro
  “somente quem está impedido”.
- **`/colaboradores/:id`** — cadastro, aba de ASO com o histórico completo e o
  registro de novo exame (com validade sugerida pelo grau de risco).
- **`/documentos`** — listagem por tipo, abrangência e vigência.
- **`/documentos/:id`** — cadastro, anexo, botão de revisão e trilha de auditoria.
- **`/conformidade`** — ICL, conformidade de saúde e documentos, fila de
  renovação, quem está impedido, conformidade por tipo e ranking por cliente.

---

## Dados de demonstração

**22 colaboradores**, **40 ASOs** e **24 documentos**, com mistura proposital:
12 em dia, 4 a vencer, 4 vencidos e 2 sem nenhum exame. A distribuição é
**por posição**, e não sorteada — assim o painel de demonstração sempre nasce com
os três casos, em qualquer base. Resultado atual: **ICL 78,6 (Atenção)**, 6
impedidos e 15 itens na fila de renovação.

---

## O que vem depois

- **Notificar a renovação** pelos mesmos canais da Etapa 7 (e-mail/WhatsApp), em
  vez de depender de alguém abrir o painel.
- **Abrir plano de ação** direto de uma pendência de conformidade.
- **PPP gerado** a partir do histórico de ASO e dos riscos da função.
- **Integração com o eSocial** (S-2220, S-2240), que é o destino natural destes
  dados.
- **Treinamentos (NR-10, NR-33, NR-35)** como módulo próprio — hoje entram como
  certificado no cadastro de documentos, o que resolve o vencimento mas não a
  matriz de capacitação por função.
