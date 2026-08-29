# Site internacional (/en), pricing configurável e leads — Design

Data: 2026-08-17
Status: desenho aprovado em conversa (opção A escolhida); aguarda revisão do spec

## 1. Objetivo

Criar a versão internacional do site da RVLand em `/en`, com conteúdo próprio
(não tradução), uma seção de pricing com valores configuráveis pelo painel, e
captura de leads dos dois formulários (PT e EN) numa aba nova do painel.

Contexto comercial: o João vai prospectar pequenas empresas nos EUA por DM de
Instagram, começando por car wash, mandando uma prévia do site já pronta. O
`/en` é a página que sustenta essa conversa e recebe o link da DM.

## 2. Decisões (com o porquê)

| Decisão | Motivo |
|---|---|
| PT e EN são **sites diferentes**, não traduções | Públicos e ofertas diferentes: o PT vende "software sob medida" para empresa brasileira; o EN vende "website + booking" para small business americano. Traduzir daria um site correto e comercialmente morto. |
| **Sem biblioteca de i18n** (next-intl, dicionários) | Como o conteúdo nunca é tradução um do outro, chaves de tradução seriam cerimônia sem benefício. Duas rotas com conteúdo próprio é mais simples de manter. |
| **Route groups com root layouts separados** (opção A) | Permite `<html lang="pt-BR">` e `<html lang="en">` corretos. Importa para leitor de tela (pronúncia) e para o Google. URLs não mudam: route group não aparece no endereço. |
| Site PT **fica como está** | Única alteração: o formulário passa a gravar lead. |
| `/en` é **uma página só** | Landing com pricing como seção ancorada. `/en?section=pricing` rola até lá — é o link que vai na DM. |
| **Sem geolocalização / sem ocultar** nada | Decisão do João: `/en` é a versão para o exterior e pronto. Evita travar os próprios testes e cloaking para bots. |
| Conteúdo EN **genérico** (small business) | Car wash é o primeiro alvo, mas o site não se limita a ele. Páginas de nicho ficam para depois. |
| **12 meses fixos** de suporte + hosting em qualquer plano; depois $79/mês | Regra única, fácil de comunicar em qualquer card. |
| Preços **configuráveis no painel**, página continua estática | `revalidatePath` na action de salvar: dinamismo sem perder performance/SEO. |
| **Sem calls** como diferencial de venda, não como limitação | Small business americano detesta discovery call. Vira promessa: "No calls. No meetings. Just text." |
| Painel continua **só em português** | É interno, usado pelo João e futuros funcionários brasileiros. |

## 3. Estrutura de rotas

Hoje há um único `app/layout.tsx` com `lang="pt-BR"` valendo para tudo.

**Depois:**

```
app/
  api/                        rotas de API (não precisam de layout)
  globals.css
  favicon.ico  robots.ts  sitemap.ts     (nível raiz — validar no build)
  (site-pt)/
    layout.tsx                <html lang="pt-BR">  → landing PT
    page.tsx                  /
    opengraph-image.tsx       OG da home PT
  (site-en)/
    layout.tsx                <html lang="en">     → landing EN
    en/
      page.tsx                /en
      opengraph-image.tsx     OG próprio da /en
  (app)/
    layout.tsx                <html lang="pt-BR">  → área logada
    login/  painel/
```

URLs preservadas: `/`, `/en`, `/login`, `/painel/*`, `/api/*`.

Para não triplicar o boilerplate de `<html>`/`<body>`/fontes/`ENABLE_JS_CLASS`,
os três layouts usam um componente comum `components/raiz-html.tsx` que recebe
`lang` e `children`.

**Risco a validar no build:** com múltiplos root layouts (sem `app/layout.tsx`),
confirmar que `favicon.ico`, `robots.ts` e `sitemap.ts` na raiz continuam
resolvendo. Se o Next reclamar, movê-los para dentro de `(site-pt)`.

## 4. A página /en

Seções, na ordem:

1. **Hero** — promessa direta ao dono do negócio, com CTA para o formulário.
2. **No calls** — o diferencial, em destaque: *"No calls. No meetings. No
   scheduling. Message us, approve the design, and your site goes live."*
3. **What's included** — o que vem no pacote (design, mobile, SEO básico, Google
   Maps, formulários, SSL, hosting, suporte).
4. **How it works** — três passos: send us your info → approve the concept →
   go live.
5. **Pricing** — seletor de três posições + care plan (§5).
6. **FAQ** — objeções reais: ownership, prazo, o que acontece se eu parar de
   pagar, quem escreve o conteúdo, posso migrar depois.
7. **Get your free concept** — formulário de lead (§6).

Copy escrita em inglês de mercado americano, voz ativa, sem jargão e sem
tradução literal do PT. Preço sempre em USD.

**Aprovação da copy:** o texto em inglês é o que vende — não é detalhe de
implementação. Os títulos e blocos principais (hero, "no calls", how it works,
FAQ) são apresentados ao João para aprovação antes de virarem definitivos, para
evitar refazer a página inteira por causa de tom ou promessa errada.

## 5. Pricing configurável

Guardado na tabela `configuracoes` existente (chave → JSON), sem migração nova.
Chave `pricing_en`:

```json
{
  "moeda": "USD",
  "planos": {
    "full": { "ativo": true, "valorCentavos": 149700 },
    "m6":   { "ativo": true, "valorCentavos": 29900, "parcelas": 6 },
    "m12":  { "ativo": true, "valorCentavos": 17900, "parcelas": 12 }
  },
  "care": { "valorCentavos": 7900, "mesesInclusos": 12 }
}
```

**Componente visual:** um seletor de três posições — *Pay in full · 6 months ·
12 months* — com pílula deslizante e transição suave; o valor grande troca
conforme a escolha, e o total do plano parcelado aparece abaixo
("6 × $299 · $1,794 total"). Sempre visível: *"Includes 12 months of support &
hosting. After that, $79/month."*

**Tela do painel:** Configurações → Preços do site. Formulário com os valores
em dólar (máscara de dinheiro já existente), ativar/desativar cada plano, valor
do care plan e meses inclusos. Ao salvar: auditoria + `revalidatePath("/en")`.

Permissão: reutiliza `plataforma.panico`? **Não** — cria `site.precos` no
catálogo, para não misturar preço público com controles de licença.

## 6. Leads

**Tabela nova `leads`:**

```
id uuid PK
origem ('br' | 'en')
nome text
negocio text?                -- business name
site_atual text?             -- URL do site atual (insumo da prévia)
canal ('email'|'sms'|'instagram'|'messenger'|'whatsapp'|'telefone')
contato text                 -- valor conforme o canal escolhido
mensagem text
status ('novo'|'em_conversa'|'proposta'|'ganho'|'perdido') default 'novo'
notas text?
criado_em, atualizado_em
```

RLS habilitado, sem policies (mesmo padrão das demais).

**Canais por idioma** (o mercado é diferente):
- **EN:** Email · Text (SMS) · Instagram DM · Facebook Messenger. Sem telefone —
  é coerente com a promessa "no calls".
- **PT:** WhatsApp (com número) · Email · Instagram · Telefone.

**Formulário EN** (`/en`): nome, business name, site atual (URL), canal
preferido, contato, mensagem. Envio grava o lead e mostra confirmação na
própria página — sem `mailto`, sem sair do site.

**Formulário PT** (landing atual): mantém o comportamento de abrir WhatsApp/
email, mas **grava o lead antes**, com canal preferido e número. Resolve o
buraco atual de não persistir nada.

Ambos com honeypot anti-spam e validação Zod no servidor.

## 7. Painel: aba Leads

`/painel/leads` — lista com filtro por origem (BR/EN) e status, mostrando nome,
negócio, canal, contato e quando chegou. Detalhe do lead permite mudar status,
escrever notas e abrir o contato no canal escolhido (link `mailto:`, `sms:`,
`https://wa.me/…`, perfil do Instagram).

Permissões novas no catálogo: `leads.ver` e `leads.editar`. Entram na navegação
do painel (sidebar e drawer) como "Leads".

## 8. SEO

- `hreflang` recíproco entre `/` (pt-BR) e `/en` (en), mais `x-default` para `/`.
- `canonical` próprio em cada página.
- `sitemap.ts` passa a listar as duas URLs com suas alternates.
- `/en` ganha `opengraph-image` próprio, em inglês.
- Metadata da `/en`: título e descrição escritos para o público americano.

## 9. Validação

- Build limpo e as rotas mantendo `/`, `/en`, `/login`, `/painel`.
- `/` e `/en` continuam **estáticas** no output do build.
- Testes de domínio (vitest) para o cálculo de preços exibidos (total do
  parcelado, care plan) e para a normalização do lead.
- Playwright: as duas páginas em desktop e mobile, `/en?section=pricing`
  rolando até a seção, envio dos dois formulários gerando lead, e zero erro de
  console.
- Conferir que o painel segue idêntico após a migração para route groups.

## 10. Fora de escopo

Páginas de nicho (`/en/car-wash`), integração de pagamento (Payment Link da
Airwallex é gerado à mão por enquanto), envio de e-mail automático, e o restante
da Fase 3 já mapeada (chamados, medição por uso da Credit).
