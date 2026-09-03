# Conceitos de landing

Cada pasta é um conceito visual feito para um prospect, para mandar como link
(e anexar em PNG/PDF se ele pedir). Não é site em produção: é peça de venda
mais o design system guardado.

## Componentes da RVLand (NÃO reescrever em conceito novo)

`scripts/lib-faixa-conceito.ts` tem os dois pedaços que a RVLand põe por cima
de qualquer conceito:

- **faixaTopo()** — a barra do topo: "This is a concept — not your live site",
  o convite para abrir na outra tela (QR no desktop, link no celular) e o
  botão "What does this cost?", que abre o modal explicando que o desenho é
  de graça antes de levar ao pricing.
- **rodapeCredito()** — a assinatura no rodapé, com o nome do cliente, a
  RVLand, o site e o Instagram.

O `publicar-conceito.ts` aplica os dois sozinho. **Conceito novo escreve só o
conteúdo da página**, sem barra e sem crédito.

### O que é modular

Só as cores, para a camada da RVLand conversar com a paleta daquela peça.
Em `conceito.json`:

    "cliente": "Poolguys",
    "faixaCores": {
      "fundo": "#06232B",
      "texto": "rgba(255,255,255,0.85)",
      "acento": "#2BB6C4",
      "acentoTexto": "#04212A",
      "modalFundo": "#0E2831"
    }

Sem `faixaCores`, valem as cores da RVLand (ciano sobre azul-noite).

## Fluxo

1. Desenhar em `<pasta>/index.html` (HTML puro, sem framework).
   Precisa de `<meta name="viewport">`: sem isso o publicador recusa, porque a
   peça abriria em largura de desktop no celular — o mesmo defeito que a gente
   aponta no site do prospect.
2. Descrever a direção em `<pasta>/conceito.json`: cliente, cores da faixa,
   paleta, tipografia, assinatura, seções, copy do hero, lista de arquivos.
3. Publicar:

       npx tsx scripts/publicar-conceito.ts conceitos/<pasta> <slug>

4. Exportar PNG/PDF (com o dev server no ar):

       npx tsx scripts/exportar-conceito.ts <slug> conceitos/<pasta>

   Renderiza a versão publicada e esconde só a barra do topo, então as imagens
   saem com o crédito do rodapé e sem a interface de navegação.
5. Amarrar ao prospect:

       npx tsx scripts/registrar-conceito.ts conceitos/<pasta> <dominio>

   Sobe os arquivos para o bucket privado 'conceitos' e grava o design system
   na coluna `conceito` do registro. O painel mostra tudo no detalhe.

## Por que guardar o design system, e não só o PNG

Se o cliente fechar, a construção continua exatamente da direção aprovada: as
cores têm nome e motivo, as fontes têm papel, e a ideia de assinatura está
escrita. Ninguém precisa reinventar nem adivinhar o que foi vendido.
