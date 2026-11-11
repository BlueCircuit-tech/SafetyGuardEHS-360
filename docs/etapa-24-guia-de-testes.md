# Etapa 24 — Melhorias da plataforma: o que mudou e como testar

Aplicação do documento **"Melhoria Plataforma"**. Para cada item: o que foi feito e onde clicar para testar.

**Como ler os caminhos:** tudo parte da barra lateral. **Módulos** abre o painel com os 9 temas; `Módulos → tema → tela` indica o clique.

**Situação do deploy:** CI do GitHub aprovado (typecheck, build e 303 testes), os quatro projetos da Vercel publicados e a migration aplicada no banco de produção.

---

## 1. Correções dos erros relatados

| Erro relatado | O que foi feito | Onde testar |
| --- | --- | --- |
| Erro ao abrir "Observação de origem" | A tela travava ao abrir; corrigido. | `Módulos → Rotina de Segurança → Planos de Ação` → abrir um plano → **Abrir observação** |
| ASO: não deixa informar empresa cadastrada | A lista de empresas contratadas vinha vazia; corrigido. | `Módulos → Saúde Ocupacional → Colaboradores → + Novo colaborador` → Vínculo = Empresa contratada |
| Absenteísmo: não busca o trabalhador | A lista de colaboradores vinha vazia; corrigido. | `Saúde Ocupacional → Absenteísmo → Registrar afastamento` |
| Acidente: "corrija 2 itens" sem dizer quais | O campo com problema fica destacado e a mensagem diz o que corrigir. | `Ocorrências e Investigação → Acidentes e CAT` |
| DDS: não permite "Registrar" | O botão nunca fica travado sem explicar; os campos faltantes aparecem destacados. | `Rotina de Segurança → DDS Digital` |
| Foto com símbolo de bloqueio / erro ao salvar | A foto pode ser escolhida antes de salvar e sobe junto. O plano tem foto **antes** e **depois**. | `Planos de Ação` → abrir um plano |
| Plano de ação com a mesma data do relato | O plano corretivo recebe no mínimo 24 horas de prazo. | Abrir um plano a partir de uma observação |
| Botão "voltar" bem destacado | Botões **Voltar** e **Página inicial** no topo de todas as telas. | Qualquer tela |

---

## 2. Melhorias por seção do documento

### Administração SST

- **Cartão de ponto (horas × valor hora × cliente):** `Módulos → Administração do Sistema → Cartão de ponto`. Tem "Registrar entrada agora", "Encerrar", "Meu valor/hora" e "Baixar Excel".
- **Registro de fornecedor × telefone/e-mail:** `Administração do Sistema → Fornecedores`.
- **Lista de funcionários × telefone/e-mail:** `Saúde Ocupacional → Colaboradores → Baixar lista (Excel)`.
- **Relatório mensal e acompanhamento de pendências:** barra lateral `Relatórios → Relatório mensal (Excel)`. Mostra o realizado no mês e as pendências.
- **Modelo de relatório fotográfico:** `Relatórios → Relatório fotográfico`. Escolha o cliente e o período, clique em **Gerar** e depois em **Imprimir**.

### Controle financeiro

- **Planilha financeira:** `Administração do Sistema → Planilha financeira`. Receitas, despesas, nota fiscal, gráfico mensal e Excel.

### Dashboard — incluir planilhas

- Exportam Excel: relatório mensal, relatório de ASO, lista de funcionários, planilha financeira e cartão de ponto.

### Plano de ação

- **Inserir fotos:** foto da situação encontrada (antes) e evidência da correção (depois), dentro do plano.
- **E-mail para a chefia quando a pendência não é tratada:** sai automaticamente 10 dias (Alta), 20 (Média) ou 30 (Baixa) depois do prazo. Os destinatários são os contatos do cliente em `Gestão de Empresas e Terceiros → Clientes → abrir cliente → aba Responsáveis e contatos`.
- **Relatório das ações realizadas no mês (Excel):** `Relatórios → Relatório mensal (Excel)`.
- **"Como funciona a notificação por voz?":** explicação na barra lateral `Notificações` → "Como funciona a notificação por voz?".

### DDS — `Rotina de Segurança → DDS Digital`

- **IA para gerar DDS conforme o tema:** aba **Registrar** → escolha o tema → **Gerar roteiro com IA**.
- **Formulário para DDS:** botão **Imprimir formulário**, com lista de presença de 25 linhas.
- **Filtros:** aba **Histórico**.
- **Dashboard:** aba **Painel**.

### Acidente / CAT — `Ocorrências e Investigação → Acidentes e CAT`

- **Imagem do corpo humano:** diagrama clicável com vista anterior e posterior.
- **Dias debitados:** campo "Lesão permanente" — morte 6000 dias, perda de membro 3000, perda de visão de um olho 1800.

### APR — `Rotina de Segurança → APR`

- **AST (COMAU) na lista suspensa:** campo **Modelo** (APR ou AST).
- **Local da atividade:** campo em destaque no formulário.
- **Tipo de serviço:** ambiente confinado, trabalho a quente, trabalho em altura, içamento de carga, escavação, requer bloqueio.
- **Espaço para logo e impressão em paisagem:** abrir a APR → **Imprimir**.
- **Onde conferir a autenticidade da assinatura:** botão **Verificar autenticidade** na APR aprovada.
- **Botão de exclusão:** botão **Excluir**. A APR aprovada precisa ser encerrada antes.

### Check-list — `Rotina de Segurança → Checklists de Pré-Uso → aba Modelos`

- **Modelos de ferramentas e equipamentos:** **Importar modelos padrão** traz 14 modelos.
- **Campo para alterações:** botão **Editar**.
- **Criar novos checklists:** botões **Criar modelo** e **Duplicar**.
- **Folha para levar a campo:** **Imprimir em branco**.

### Consequências — `Ocorrências e Investigação → Gestão de Consequências`

- **Mensagem aos níveis hierárquicos:** e-mail automático ao registrar uma medida. O resultado do envio aparece na tela.
- **Relatório mensal e anual por empresa:** aba **Relatório mensal / anual**.

### ASO — `Saúde Ocupacional`

- **Alerta de vencimento (35 dias):** aparece na lista de Colaboradores e no cadastro do colaborador.
- **Lista/relatório (admissão, periódico, demissional, afastamento):** **Relatório de ASO**, com Excel.
- **Filtro ASO vencido e válido:** no Relatório de ASO e na lista de Colaboradores.

### Absenteísmo — `Saúde Ocupacional → Absenteísmo`

- **Função, setor e liderança:** preenchidos ao escolher o colaborador, e editáveis.
- **Requer reabilitação, treinamento, mudança de função, atividade compatível:** caixas de marcar no registro.
- **Botão para voltar:** botão **Voltar** no formulário.
- **Dashboard colaborador × função × tempo × ano:** painel com seções Por função, Por ano e Por mês.
- **Dias computados com dias debitados:** aparecem no painel e nos acidentes.

### EPI — `Saúde Ocupacional → EPI e Estoque`

- **Aba Estoque e CA:**
  - busca com lupa;
  - campo de valor unitário e valor em estoque;
  - alerta **Comprar** quando o estoque chega a 10%;
  - link **Consultar CA**;
  - listagem de EPI com CA.
- **Abrir um EPI:**
  - **Anexos:** laudo, CA, ficha técnica e nota fiscal;
  - **Entradas:** compras com nota fiscal, custo e fornecedor.
- **Aba Entregas (NR-06):**
  - botão **Assinar**, com assinatura desenhada na tela;
  - link **Ficha de EPI** do colaborador.
- **Aba Trocas e vencimentos:** alerta de troca vencida e de CA vencido ou a vencer.
- **Aba Consumo:** 3, 6, 9 e 12 meses, com os maiores consumos destacados.

### Ordem de Serviço — `Rotina de Segurança → Ordens de Serviço` → abrir uma OS

- **Assinatura:** **Assinar na tela** ou foto da assinatura.
- **Edição, caso o cliente queira:** **Editar texto complementar**, enquanto a OS ainda não foi assinada.
- **Anexar cópia em PDF assinada:** **Anexar cópia assinada (PDF)**.
- **Conferir a assinatura:** **Verificar autenticidade**.
- **Texto padrão da OS:** cadastrado em `Administração do Sistema → Empresa`.

### Treinamentos — `Saúde Ocupacional → Treinamentos`

- **Vários treinamentos para uma função:** aba **Catálogo e requisitos**, marcando várias caixas.
- **Link com a plataforma de treinamentos:** botão no topo. O link é cadastrado em `Administração do Sistema → Empresa`.
- **Carteirinha com QR Code:** abrir o colaborador → **Carteirinha**. Ler o QR com o celular mostra se a pessoa está liberada.
- **Foto do colaborador:** dentro do cadastro do colaborador.

### Documentos legais SSMA / colaboradores

- **Pasta do colaborador:** abrir o colaborador → aba **Documentos**.
  - Itens: ficha de registro, contrato, acordo de compensação de horas, OS, ficha de EPI, ASO e certificados.
  - Cada item tem anexo e alerta de pendência.
- **E-mail à hierarquia sobre pendências:** resumo diário automático aos contatos do cliente.
- **Funcionários que irão trabalhar:** `Saúde Ocupacional → Liberação de equipe`.
- **Bloquear funcionário com motivo:** bloco **Liberação**, dentro do cadastro do colaborador.

### QR Code e Centro de Negócios ("não conseguimos entender")

- **QR Code único com opção por área:** `Clientes` → abrir cliente → aba **QR Code único**. Quem lê a placa escolhe a área onde está. Os QR Codes por área continuam valendo.
- **Explicações na tela:** quadros "Como funciona…" em `Gestão de Empresas e Terceiros → Áreas e QR Code` e em `Centros de Negócio`.

### Clientes — `Gestão de Empresas e Terceiros → Clientes` → abrir cliente

- **Mais campos para responsáveis e contatos:** aba **Responsáveis e contatos**, por nível (supervisor, coordenador, gerente, diretoria, SSMA, RH...).
- **Grau de risco:** explicação em "O que é o grau de risco (NR-4)?", na seção Perfil SSMA.

### CIPA — `Conformidade Legal e Auditorias → CIPA`

- Mandato, membros, cronograma do processo eleitoral, anexos e observações.
- **Modelos imprimíveis:** edital, ficha de inscrição, lista de presença de votação, cédula de votação, ata de eleição, ata de posse e certificado de treinamento.

### Ergonomia — `Gestão de Riscos → Ergonomia`

- Avaliação ergonômica com checklist da NR-17, pontuação, nível de risco e relatório imprimível.

### Modelos de relatório — `Relatórios → Modelos de relatório`

- Comece por **Importar modelos padrão**.
- **Gerar com assistente:** cria um modelo novo com IA.
- **Usar:** preenche o modelo com os dados do cliente.

### Meio Ambiente — `Meio Ambiente e ESG → Meio Ambiente`

- **Aspectos e impactos:** levantamento com significância calculada.
- **Documentos ambientais:** PGRSS, PGRS, CTR/manifesto, inventário de resíduos e licença, com anexo.
- **Dashboard:** ocorrências, resíduos e reciclagem, e situação dos documentos.

### Químicos — `Gestão de Riscos → Produtos Químicos`

- Controle e classificação dos produtos, pictogramas GHS, FDS anexada com validade e ficha resumo imprimível.

### Brigada de incêndio — `Conformidade Legal e Auditorias → Brigada de Incêndio`

- **Brigadistas:** foto, treinamento e reciclagem.
- **Extintores:** validade e inspeção.
- **Organograma da brigada:** imprimível.
- **Mapa de extintores:** por área.

---

## 3. O que ficou pendente

- **Modelos do Valmir:** ficha de EPI, texto da OS, carteirinha, PPP e pictogramas. Hoje essas telas usam um layout provisório, que será trocado quando ele enviar.
- **Site SGI/ESG:** marcado no documento para conversar; não foi feito.
- **Biometria (facial, íris, digital), aplicativo de celular e auto gestão:** não foram feitos. No lugar da biometria entrou a assinatura desenhada na tela, com verificação de autenticidade.
- **Dashboard BBS "Sem dados para calcular":** não foi alterado. Ele precisa de observações registradas para o cliente escolhido.

---

## 4. Configuração necessária na Vercel (projeto da API)

| Variável | Para quê | Sem ela |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | IA no DDS e nos modelos de relatório | Os botões "Gerar com IA" usam um roteiro-modelo |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envio real de e-mails | Os e-mails não chegam a ninguém |
| `CRON_SECRET` | Rotina diária: escalonamento, cobrança da chefia e resumo de pendências | A rotina automática não roda |

Além das variáveis, cada cliente precisa ter os contatos cadastrados na aba **Responsáveis e contatos** para receber os e-mails.
