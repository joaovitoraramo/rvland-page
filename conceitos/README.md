# Conceitos de landing

Cada pasta e um conceito visual feito para um prospect, para anexar em email.
Nao e site em producao: e peca de venda + design system guardado.

## Fluxo

1. Desenhar em <pasta>/index.html (HTML puro, sem framework)
2. Exportar PNG/PDF com Playwright (ver poolguys como referencia)
3. Descrever a direcao em <pasta>/conceito.json (paleta, tipografia,
   assinatura, secoes, copy do hero, lista de arquivos)
4. Amarrar ao prospect:

       npx tsx scripts/registrar-conceito.ts conceitos/<pasta> <dominio>

   Isso sobe os arquivos para o bucket privado 'conceitos' e grava o
   design system na coluna conceito do registro. O painel entao mostra
   tudo no detalhe do prospect, com links assinados para download.

## Por que guardar o design system, e nao so o PNG

Se o cliente fechar, a construcao continua exatamente da direcao aprovada:
as cores tem nome e motivo, as fontes tem papel, e a ideia de assinatura
esta escrita. Ninguem precisa reinventar nem adivinhar o que foi vendido.
