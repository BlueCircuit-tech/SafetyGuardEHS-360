# Protótipo original

`index.html` é o protótipo de tela única que originou o projeto: HTML + CSS + JS
em um arquivo só, com todos os dados mockados em memória.

Ele **não faz parte da aplicação** — fica aqui como referência de escopo e de
identidade visual. Abra direto no navegador para consultar:

- linguagem visual (paleta, cards, pills, layout de shell com sidebar) — reaproveitada
  em `apps/web/src/estilos/global.css`;
- telas previstas para as próximas etapas: inspeção via QR Code, planos de ação com
  escalonamento, atestados, geração de documentos, carteirinhas e dashboards;
- a matriz de criticidade × comunicação, base da Etapa 3.

O que o protótipo simulava com dados fixos, a aplicação real implementa com
PostgreSQL, validação compartilhada e trilha de auditoria.
