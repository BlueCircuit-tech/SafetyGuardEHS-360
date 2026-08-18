# Etapa 20 — PPP (Perfil Profissiográfico Previdenciário)

Fecha o item que faltava no §17 (Saúde Ocupacional) do plano diretor.

## O que é, aqui

O PPP **não é um cadastro novo**. É a consolidação do que a plataforma já tem
sobre o colaborador, montada na hora da leitura:

| Bloco | De onde vem |
| --- | --- |
| Empregador | Cadastro do cliente (Etapa 2) |
| Trabalhador e perfil profissiográfico | Cadastro de colaboradores (Etapa 9) |
| Fatores de risco | Inventário de riscos da **área** e da **função** (Etapa 19) |
| Exames médicos ocupacionais | Histórico de ASO (Etapa 9) |
| EPI fornecidos | Fichas de entrega NR-06 (Etapa 14) |
| Responsável pelos registros ambientais | Cadastro da consultoria (Etapa 1.1) |

Cada bloco imprime a própria origem ("Fonte: …"). Auditoria pergunta de onde
saiu o dado; o documento responde sozinho.

## O que ele não é

A emissão oficial do PPP é feita pelo **eSocial, evento S-2240**, no layout
vigente — que muda por portaria. O que a plataforma entrega é a **fonte
rastreável** para preencher e conferir, não o formulário legal. Isso está
escrito no próprio documento, não só nesta documentação: quem imprimir e levar
ao INSS achando que é a via oficial precisa ler isso na primeira linha.

Pelo mesmo motivo, a coluna "intensidade / concentração" declara
`Avaliação qualitativa — IIR N (grau X)`. O PPP previdenciário pede medição
(dosimetria, laudo quantitativo); o que o inventário tem é avaliação
qualitativa. Disfarçar uma de outra seria o erro mais caro do documento.

## Fatores de risco: área **OU** função

O cruzamento é `areaId = área do colaborador` **OU**
`funcao = função do colaborador` (sem diferenciar maiúsculas), ordenado por IIR
decrescente. Cada linha diz se veio da área ou da função. Um perigo cadastrado
para a função "Operador de ponte rolante" alcança todo operador de ponte
rolante daquele cliente, sem recadastro por pessoa.

## Pendências fazem parte do resultado

Documento incompleto **não é erro** — é a resposta com a lista do que falta:
sem inventário de risco, sem ASO, sem admissão, sem matrícula, sem entrega de
EPI. A tela mostra isso em destaque, fora da folha (não sai na impressão), com
a frase que importa: emitir assim entrega ao INSS um PPP que não sustenta
análise. A pendência mais grave é a de fatores de risco, porque é exatamente o
bloco que o INSS analisa para reconhecer exposição.

## Rota e tela

| Método | Rota |
| --- | --- |
| `GET` | `/colaboradores/:id/ppp` |

Permissão `saude:ler` — a mesma do cadastro de colaboradores, herdada do
módulo. Tela: **`/colaboradores/:id/ppp`**, acessível pelo botão **PPP** na
lista de colaboradores.

A tela **é** a folha: largura A4 (210 mm), mesmas quebras na impressão,
`@page { size: A4; margin: 14mm }`. Barra de ações, aviso de pendências e menu
somem no papel; o que sobra é o documento com as duas linhas de assinatura
(responsável técnico e representante legal do empregador) e o rodapé
institucional da consultoria.
