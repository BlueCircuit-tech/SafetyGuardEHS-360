# Etapa 1 — Cadastro da Empresa

## 1.1 Empresa de Consultoria (matriz do sistema)

É o **primeiro cadastro do sistema**. Sem ele nenhum outro cadastro (clientes, unidades,
inspeções) pode existir, porque todo documento emitido carrega a identificação da consultoria.

Os dados aparecem em quatro lugares:

| Onde aparece | Campos usados |
| --- | --- |
| **Cabeçalho de relatórios e laudos** | logo, nome fantasia, razão social, CNPJ, endereço, cores |
| **Assinatura de e-mail** | nome fantasia, telefone, WhatsApp, e-mail, site |
| **Cabeçalho de WhatsApp** | `cabecalhoWhatsapp` (ou nome fantasia como padrão) |
| **Rodapé de auditorias** | `rodapeRelatorio` (ou razão social + CNPJ + endereço) |

> A composição desses blocos vive em uma única função — `montarCabecalhoInstitucional()`
> em `packages/shared/src/institucional.ts` — usada tanto pela API quanto pela prévia
> do formulário. Não existe segunda implementação para sair de sincronia.

---

## Campos do cadastro

Legenda: **O** = obrigatório · *(pd)* = tem valor padrão

### Bloco 1 — Identificação

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `razaoSocial` | texto (3–150) | ✔ | Nome jurídico, como no cartão CNPJ. Vai no rodapé dos laudos. |
| `nomeFantasia` | texto (2–120) | ✔ | Nome exibido no cabeçalho dos documentos e nas notificações. |
| `cnpj` | documento | ✔ | Único no sistema. Valida dígitos verificadores. Aceita o formato numérico e o **alfanumérico** (12 caracteres `[0-9A-Z]` + 2 dígitos), vigente a partir de 2026. Gravado sem máscara. |
| `inscricaoEstadual` | texto (≤20) | | Aceita `ISENTO`. Normalizado para maiúsculas. |
| `inscricaoMunicipal` | texto (≤20) | | Usado na emissão de nota de serviço. |
| `cnaePrincipal` | CNAE | | Subclasse de 7 dígitos (`7120-1/00`). O formulário sugere os CNAEs típicos de consultoria em SST/Meio Ambiente. |
| `naturezaJuridica` | texto (≤120) | | Ex.: Sociedade Empresária Limitada. |
| `regimeTributario` | enum | | `SIMPLES_NACIONAL`, `LUCRO_PRESUMIDO`, `LUCRO_REAL`, `MEI`. |
| `dataFundacao` | data | | Não pode ser futura. |

### Bloco 2 — Contato institucional

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `email` | e-mail (≤150) | ✔ | Remetente institucional; entra na assinatura de e-mail. Normalizado para minúsculas. |
| `emailFinanceiro` | e-mail (≤150) | | Cobrança e faturamento. |
| `telefone` | telefone | ✔ | Fixo (10 díg.) ou celular (11 díg.), com DDD válido. Gravado sem máscara. |
| `whatsapp` | celular | | Precisa ser **celular** (11 díg. começando com 9). É o número das notificações. |
| `site` | URL (≤150) | | Precisa começar com `http://` ou `https://`. |

### Bloco 3 — Endereço

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `cep` | CEP | ✔ | 8 dígitos. O formulário consulta o ViaCEP e preenche o resto do bloco. |
| `logradouro` | texto (3–150) | ✔ | |
| `numero` | texto (1–20) | ✔ | Aceita `S/N`. |
| `complemento` | texto (≤80) | | |
| `bairro` | texto (2–80) | ✔ | |
| `cidade` | texto (2–80) | ✔ | |
| `uf` | sigla | ✔ | Uma das 27 UFs. Normalizada para maiúsculas. |

### Bloco 4 — Responsável técnico

Profissional que assina laudos, programas e relatórios de auditoria. A linha
`Nome — CONSELHO Registro/UF` sai em todo documento técnico.

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `responsavelTecnicoNome` | texto (3–120) | ✔ | |
| `responsavelTecnicoCargo` | texto (≤80) | | Ex.: Engenheiro de Segurança do Trabalho. |
| `responsavelTecnicoTipoRegistro` | enum | ✔ | `CREA`, `CRM`, `CREFITO`, `COREN`, `CRQ`, `MTE`, `OUTRO`. |
| `responsavelTecnicoRegistro` | texto (3–40) | ✔ | Ex.: `12345/D`. |
| `responsavelTecnicoUfRegistro` | sigla | | UF do conselho. |
| `responsavelTecnicoEmail` | e-mail | | |
| `responsavelTecnicoTelefone` | telefone | | |

### Bloco 5 — Identidade visual e textos institucionais

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `logoUrl` | arquivo | | Enviado por `POST /empresa/logo` (PNG, JPG, WEBP ou SVG, até 5 MB). Aparece no cabeçalho dos documentos. |
| `corPrimaria` | cor hex *(pd `#059669`)* | | Títulos e destaques dos documentos. |
| `corSecundaria` | cor hex *(pd `#0e1a2b`)* | | Fundo do cabeçalho. |
| `rodapeRelatorio` | texto (≤500) | | Rodapé fixo de laudos e auditorias. Vazio ⇒ razão social + CNPJ + endereço. |
| `assinaturaEmail` | texto (≤500) | | Vazio ⇒ nome fantasia + linha de contato. |
| `cabecalhoWhatsapp` | texto (≤160) | | Vazio ⇒ `*Nome fantasia* · SafetyGuard EHS 360`. |

### Bloco 6 — Operação

| Campo | Tipo | O | Regra / observação |
| --- | --- | :-: | --- |
| `timezone` | texto *(pd `America/Sao_Paulo`)* | | Base dos prazos de planos de ação e dos carimbos de data. |
| `ativa` | booleano *(pd `true`)* | | Empresa inativa bloqueia a emissão de novos documentos. |

---

## Regras de negócio

1. **Registro único.** Existe no máximo uma empresa de consultoria por instalação.
   A trava é do banco (coluna `chaveMatriz` com `UNIQUE`), não só da aplicação.
   `POST` numa base que já tem matriz devolve `409 MATRIZ_JA_CADASTRADA`.
2. **Dados gravados sem máscara.** CNPJ, CEP, telefones e CNAE são normalizados na
   entrada. A máscara é reaplicada na leitura (campo `formatado` da resposta) e no
   formulário — assim nenhuma busca depende de formatação.
3. **Validação única.** O mesmo schema Zod (`packages/shared`) valida no navegador e
   no servidor. O servidor nunca confia no cliente: revalida tudo.
4. **Trilha de auditoria.** Toda criação/alteração grava um registro em
   `registro_auditoria` com o diff campo a campo (`{ campo: { de, para } }`), autor e IP.
   Alterações que não mudam nada não geram registro.
5. **Atualização parcial.** `PUT /empresa` aceita qualquer subconjunto de campos; só
   o que veio no payload é comparado e alterado.

---

## Como a Etapa 1.1 se liga ao resto

```
1.1 Empresa de Consultoria  (matriz — este documento)
      │
      ├── 4. Centros de Negócio          ← regional, unidade ou tipo de contrato
      │        └── 2. Clientes / Contratantes
      │                 ├── 3. Terceiros  ← quem atua dentro da operação
      │                 └── 5. Áreas      ← QR Code de inspeção por área
      │
      ├── 6. Pessoas e acessos            ← usuários, perfis, funcionários
      ├── 7. Inspeções e planos de ação   ← matriz de criticidade e escalonamento
      ├── 8. Saúde e documentos           ← ASO, PGR, PCA, LTCAT, PPP
      └── 9. Dashboards                   ← executivo, gerencial, operacional
```

Todo documento gerado nas etapas 7 e 8 usa o cabeçalho e o rodapé definidos aqui.
Campos e regras dos clientes: [`etapa-02-clientes.md`](etapa-02-clientes.md).
