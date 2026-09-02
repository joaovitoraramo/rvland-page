# Prospecção RVLand

Gerado por scripts/prospectar-carwash.mjs, prospectar-leads.mjs e enriquecer-leads.mjs;
planilha montada por gerar-planilha.mjs com avaliação visual de cada screenshot.

- planilha-leads.csv: 66 leads com potencial 1-10, email, Instagram e ângulo de abordagem
- lista-follow-instagram.md: 41 contas verificadas para aquecer o perfil
- fotos/: screenshot de cada site avaliado

## Avisos de verificação

- championshipmartialarts.com: os emails coletados são de OUTRAS franquias (d-a-m.ca,
  pakskarate.com, randori-pro.com). Achar o contato da unidade de Orlando antes de abordar.
- kansascitytreeservices.net: telefone aparente 816-555-7890 (padrão de placeholder).
  Pode ser site de lead-broker, não negócio real. Confirmar no Google Maps.
- purrfectgrooming.pet: sede aparente em Doral/Miami, não Orlando.

## Lotes

- dados.json: car wash (Orlando, Tampa, Phoenix, Charlotte)
- dados-geral.json: 19 nichos em 8 cidades de porte medio
- dados-afluentes.json: 7 nichos de ticket alto em 10 cidades/suburbios ricos
  (Scottsdale, Naples, Frisco, Boca Raton, Bellevue, Alpharetta, The Woodlands,
  Naperville, Cary, Franklin)

A avaliacao visual de cada site vive em avaliacoes.json (potencial, nota do
site, diagnostico e abordagem). merge-avaliacoes.mjs junta lotes novos sem
sobrescrever o que ja foi avaliado.

## Reexecutar

    node scripts/prospectar-leads.mjs          # nova varredura (editar CIDADES no topo)
    node scripts/enriquecer-leads.mjs prospeccao/dados-geral.json
    node scripts/gerar-planilha.mjs

## Workbook

    ~/.asdf/installs/python/3.11.9/bin/python3 scripts/gerar-xlsx.py

Gera prospeccao-rvland.xlsx a partir do CSV: dashboard com graficos, aba de
leads filtravel, aba de prioridade com status e datas, lista de Instagram e
os avisos de verificacao. Precos dos cenarios vem do painel (chave pricing_en).
