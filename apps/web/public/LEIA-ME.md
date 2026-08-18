# Arquivos públicos do console

Tudo neste diretório é servido pela raiz do site: `public/login.jpg` vira
`/login.jpg`. O Vite copia a pasta inteira no build, sem passar pelo bundler.

## `login.jpg` — foto da tela de entrada

A metade esquerda do login exibe esta imagem. **Enquanto ela não existir, o
espaço cai para um fundo grafite neutro** — a tela continua funcionando, só sem
a fotografia.

Para colocar a sua:

1. Salve o arquivo como `apps/web/public/login.jpg`.
2. Recarregue a página. Não precisa reiniciar o servidor.

O que funciona bem aqui:

| Critério | Recomendação |
| --- | --- |
| Proporção | Vertical ou quadrada — a coluna é alta e estreita |
| Resolução | 1200×1600 px ou mais |
| Peso | Até ~400 KB (comprima antes; é a primeira tela que carrega) |
| Assunto | Ambiente industrial real com EPI visível: planta, canteiro, inspeção |
| Enquadramento | Deixe o lado esquerdo mais limpo — o texto fica sobre ele |
| Formato | `.jpg` para fotografia; `.webp` também serve (ajuste o nome no CSS) |

Um véu escuro é aplicado por cima para garantir contraste do texto, então
imagens claras ou muito contrastadas também funcionam.

> **Direito de uso:** use foto própria da operação ou de banco de imagens com
> licença comercial. Não coloque aqui imagem encontrada em busca da web.

## `logo.svg` — logotipo (opcional)

Se existir, substitui o monograma no login e na barra lateral. Prefira SVG com
fundo transparente; PNG de 512 px também serve.
