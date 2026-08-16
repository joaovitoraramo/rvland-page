import Script from "next/script";
import {
  ArrowRight,
  Code2,
  Cpu,
  Layers3,
  Sparkles,
  Wand2,
  Mail,
  Phone,
  ShieldCheck,
  Rocket,
  Gauge,
  CheckCircle2,
  ClipboardCheck,
  Settings2,
  Handshake,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { Reveal } from "@/components/landing/reveal";
import { Magnetic } from "@/components/landing/magnetic";
import { HeroGlow } from "@/components/landing/hero-glow";
import { TiltCard } from "@/components/landing/tilt-card";
import { CodeContactForm } from "@/components/landing/contact-form";

import {
  CONTACT,
  FAQ,
  META_PIXEL_ID,
  SITE,
  SITE_URL,
  buildMailto,
  buildWhatsappLink,
} from "@/lib/site";

const SERVICES = [
  {
    title: "Apps",
    desc: "Aplicativos com fluxo e identidade próprios.",
    icon: <Cpu className="h-5 w-5 text-[rgba(0,255,138,0.9)]" />,
    tag: "iOS & Android",
    bullets: ["Experiência limpa", "Integrações (pagamento, mapas)", "Evolução contínua"],
  },
  {
    title: "Sites",
    desc: "Institucionais e landing pages com SEO.",
    icon: <Wand2 className="h-5 w-5 text-[rgba(0,229,255,0.95)]" />,
    tag: "SEO & Performance",
    bullets: ["Rápido", "Copy objetivo", "Pronto para anúncio/pixel"],
  },
  {
    title: "Plataformas",
    desc: "Web apps com áreas logadas e painéis.",
    icon: <Layers3 className="h-5 w-5 text-white/90" />,
    tag: "Web App",
    bullets: ["Permissões e usuários", "Dashboards e relatórios", "Escalável"],
  },
  {
    title: "Sistemas",
    desc: "Ferramentas internas e automações.",
    icon: <Code2 className="h-5 w-5 text-[rgba(0,229,255,0.95)]" />,
    tag: "B2B / Interno",
    bullets: ["Integra com seu stack", "Reduz trabalho manual", "Processo mais rápido"],
  },
];

const PROCESS = [
  { n: "01", t: "Descoberta", d: "Objetivo, público e requisitos essenciais." },
  { n: "02", t: "Design", d: "Fluxo, telas e validação rápida." },
  { n: "03", t: "Build", d: "Desenvolvimento por etapas e entregas." },
  { n: "04", t: "Lançar + Evoluir", d: "Publicação, ajustes e melhorias contínuas." },
];

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="relative z-30 mb-8 flex items-end justify-between gap-6">
      <div className="max-w-2xl">
        <h2 className="text-2xl font-semibold md:text-3xl">{title}</h2>
        <p className="mt-2 text-white/70">{subtitle}</p>
      </div>
      {right ? <div className="hidden shrink-0 md:block">{right}</div> : null}
    </div>
  );
}

export default function Page() {
  const whatsappLink = buildWhatsappLink(
    CONTACT.whatsapp,
    "Olá! Quero conversar sobre um software sob medida com a RVLand Devs."
  );

  const mailtoLink = buildMailto(
    CONTACT.email,
    "Projeto de software sob medida",
    "Olá! Quero conversar sobre um projeto.\n\nResumo:\n- \n\nObjetivo:\n- \n\nPrazo desejado:\n- \n"
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE.name,
        url: SITE_URL,
        description: SITE.description,
        email: CONTACT.email,
        telephone: `+${CONTACT.whatsapp}`,
        areaServed: "BR",
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE.name,
        inLanguage: "pt-BR",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: FAQ.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };

  return (
    <>
      {/* JSON-LD no HTML inicial: crawlers leem sem depender de hidratação. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      {META_PIXEL_ID ? (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${META_PIXEL_ID}');
              fbq('track', 'PageView');
            `}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      ) : null}

      <main className="min-h-screen overflow-x-hidden text-white">
        {/* background */}
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_20%_10%,rgba(0,229,255,0.12),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(900px_circle_at_80%_70%,rgba(0,255,138,0.08),transparent_55%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_35%,rgba(0,0,0,0.35))]" />
          <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(rgba(255,255,255,0.4)_1px,transparent_1px)] [background-size:22px_22px]" />
        </div>

        {/* NAV */}
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 md:px-6">
          <a href="#top" className="flex items-center gap-3">
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide">{SITE.name}</div>
              <div className="text-xs text-white/60">{SITE.tagline}</div>
            </div>
          </a>

          <nav className="hidden items-center gap-6 text-sm text-white/70 md:flex">
            <a className="hover:text-white" href="#servicos">
              Serviços
            </a>
            <a className="hover:text-white" href="#processo">
              Processo
            </a>
            <a className="hover:text-white" href="#faq">
              FAQ
            </a>
            <a className="hover:text-white" href="#contato">
              Contato
            </a>
          </nav>

          <Button asChild className="rounded-xl bg-white/10 text-white hover:bg-white/15" variant="secondary">
            <a href="#contato">Solicitar proposta</a>
          </Button>
        </header>

        {/* HERO */}
        <section id="top" className="mx-auto w-full max-w-6xl px-4 pb-10 pt-2 md:px-6 md:pb-16">
          <Reveal>
            <div className="relative">
              <div className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,rgba(0,229,255,0.22),rgba(255,255,255,0.06),rgba(0,255,138,0.16))] p-[1px]">
                <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[rgba(8,10,14,0.55)] p-6 backdrop-blur-md md:p-10">
                  <HeroGlow />

                  <div className="relative flex flex-col gap-10 md:flex-row md:items-center md:justify-between">
                    <div className="max-w-2xl">
                      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                        <Sparkles className="h-4 w-4" />
                        Software sob medida, do início ao fim.
                      </div>

                      <h1 className="text-balance text-3xl font-semibold leading-tight md:text-5xl">
                        <span className="text-white">RVLand</span>{" "}
                        <span className="text-white/80">— sua ilha de realidades.</span>
                        <span className="block bg-gradient-to-r from-[rgba(0,229,255,0.95)] via-white to-[rgba(0,255,138,0.95)] bg-clip-text text-transparent">
                          Nós codificamos o resto.
                        </span>
                      </h1>

                      <p className="mt-4 text-pretty text-base text-white/70 md:text-lg">
                        Construímos <strong className="text-white/90">apps, sites, plataformas e sistemas</strong>{" "}
                        personalizados. Você traz a visão — nós entregamos o produto pronto para uso.
                      </p>

                      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                        <Magnetic className="w-full sm:w-auto">
                          <Button
                            className="w-full rounded-xl bg-[rgba(0,229,255,0.18)] text-white hover:bg-[rgba(0,229,255,0.26)]"
                            asChild
                          >
                            <a href={whatsappLink} target="_blank" rel="noreferrer">
                              Falar no WhatsApp <ArrowRight className="ml-2 h-4 w-4" />
                            </a>
                          </Button>
                        </Magnetic>

                        <Button
                          variant="secondary"
                          className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
                          asChild
                        >
                          <a href="#processo">Ver o processo</a>
                        </Button>
                      </div>

                      <div className="mt-7 flex flex-wrap gap-2">
                        {["Sob medida", "Escalável", "Rápido", "Seguro", "UI/UX forte"].map((t) => (
                          <Badge key={t} className="border-white/10 bg-white/5 text-white/70 hover:bg-white/10">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="grid w-full max-w-md grid-cols-2 gap-3">
                      {[
                        { k: "Construção", v: "Do zero", sub: "Seu fluxo define" },
                        { k: "Customização", v: "Alta", sub: "Sem limitações" },
                        { k: "Entrega", v: "Por etapas", sub: "Você acompanha" },
                        { k: "Qualidade", v: "Sólida", sub: "Base pra escalar" },
                      ].map((s, i) => (
                        <Card
                          key={s.k}
                          className="min-h-[118px] rounded-2xl border-white/10 bg-white/5 backdrop-blur-md transition-colors hover:bg-white/[0.07]"
                        >
                          <CardContent className="p-4">
                            <div className="text-xs text-white/60">{s.k}</div>
                            <div className="mt-1 text-xl font-semibold text-white">{s.v}</div>
                            <div className="mt-1 text-xs text-white/60">{s.sub}</div>
                            <div className="mt-3 h-[1px] w-full bg-white/10" />
                            <div className="mt-3 text-xs text-white/55" style={{ opacity: 0.85 - i * 0.08 }}>
                              {["Descoberta", "Design", "Build", "Evolução"][i]}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* TRUST STRIP */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-4 md:px-6">
          <Reveal delay={80}>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                {
                  icon: <ShieldCheck className="h-5 w-5 text-[rgba(0,255,138,0.9)]" />,
                  t: "Base segura e organizada",
                  d: "Código limpo, pronto para evoluir.",
                },
                {
                  icon: <Gauge className="h-5 w-5 text-[rgba(0,229,255,0.95)]" />,
                  t: "Rápido e agradável de usar",
                  d: "Performance e UX como prioridade.",
                },
                {
                  icon: <Rocket className="h-5 w-5 text-white/90" />,
                  t: "Entrega por etapas",
                  d: "Você valida e ajusta no caminho.",
                },
              ].map((x) => (
                <Card key={x.t} className="h-full rounded-2xl border-white/10 bg-white/5 backdrop-blur-md">
                  <CardContent className="flex items-start gap-3 p-5">
                    <div className="mt-0.5 grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5">
                      {x.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{x.t}</div>
                      <div className="mt-1 text-sm text-white/70">{x.d}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </Reveal>
        </section>

        <Separator className="mx-auto my-6 w-full max-w-6xl bg-white/10" />

        {/* SERVIÇOS */}
        <section id="servicos" className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
          <Reveal>
            <SectionHeader
              title="O que entregamos"
              subtitle="Soluções sob medida. O produto se adapta ao seu negócio — não o contrário."
              right={<Badge className="border-white/10 bg-white/5 text-white/70">Next.js • React • APIs • Vercel</Badge>}
            />

            <div className="relative z-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {SERVICES.map((s) => (
                <TiltCard
                  key={s.title}
                  title={s.title}
                  desc={s.desc}
                  icon={s.icon}
                  tag={s.tag}
                  bullets={s.bullets}
                />
              ))}
            </div>
          </Reveal>
        </section>

        {/* ENTREGÁVEIS */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-2 md:px-6">
          <Reveal delay={60}>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: <ClipboardCheck className="h-5 w-5 text-[rgba(0,229,255,0.95)]" />,
                  t: "Entregáveis claros",
                  d: "Escopo, telas e entregas por etapa.",
                },
                {
                  icon: <Settings2 className="h-5 w-5 text-[rgba(0,255,138,0.9)]" />,
                  t: "Integrações e automações",
                  d: "Pagamentos, CRM, WhatsApp, e mais.",
                },
                {
                  icon: <Handshake className="h-5 w-5 text-white/90" />,
                  t: "Parceria no longo prazo",
                  d: "Manutenção e evolução quando fizer sentido.",
                },
              ].map((x) => (
                <Card key={x.t} className="min-h-[120px] rounded-2xl border-white/10 bg-white/5 backdrop-blur-md">
                  <CardContent className="flex items-start gap-3 p-5">
                    <div className="mt-0.5 grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5">
                      {x.icon}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{x.t}</div>
                      <div className="mt-1 text-sm text-white/70">{x.d}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </Reveal>
        </section>

        <Separator className="mx-auto my-6 w-full max-w-6xl bg-white/10" />

        {/* PROCESSO */}
        <section id="processo" className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
          <Reveal>
            <SectionHeader
              title="Processo"
              subtitle="Você entende o que está sendo feito e por quê. Sem complicação."
            />

            <div className="grid gap-4 md:grid-cols-4">
              {PROCESS.map((s, idx) => (
                <Card
                  key={s.n}
                  className="min-h-[160px] rounded-2xl border-white/10 bg-white/5 backdrop-blur-md transition-colors hover:bg-white/[0.07]"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white/60">{s.n}</div>
                      <CheckCircle2
                        className="h-4 w-4"
                        style={{
                          color: idx % 2 === 0 ? "rgba(0,229,255,0.95)" : "rgba(0,255,138,0.9)",
                          opacity: 0.9,
                        }}
                      />
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">{s.t}</div>
                    <p className="mt-2 text-sm text-white/70">{s.d}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-2 text-sm text-white/70">
              <span className="text-white/90">Tecnologias comuns:</span>
              {["Next.js", "React", "Node", "Postgres", "APIs", "Vercel"].map((t) => (
                <Badge key={t} className="border-white/10 bg-white/5 text-white/70 hover:bg-white/10">
                  {t}
                </Badge>
              ))}
            </div>
          </Reveal>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
          <Reveal>
            <SectionHeader title="FAQ" subtitle="Respostas objetivas para dúvidas comuns." />

            <div className="grid gap-4 md:grid-cols-2">
              {FAQ.map((item) => (
                <Card key={item.q} className="rounded-2xl border-white/10 bg-white/5 backdrop-blur-md">
                  <CardContent className="p-5">
                    <details className="group">
                      <summary className="cursor-pointer list-none text-sm font-semibold text-white">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[rgba(0,229,255,0.85)] group-open:bg-[rgba(0,255,138,0.85)]" />
                          {item.q}
                        </span>
                      </summary>
                      <p className="mt-3 text-sm text-white/70">{item.a}</p>
                    </details>
                  </CardContent>
                </Card>
              ))}
            </div>
          </Reveal>
        </section>

        {/* CONTATO */}
        <section id="contato" className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
          <Reveal>
            <SectionHeader
              title="Contato"
              subtitle="Envie um resumo do que você precisa. Nós respondemos com o próximo passo."
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="rounded-2xl border-white/10 bg-white/5 backdrop-blur-md">
                <CardHeader>
                  <CardTitle className="text-white">Canais diretos</CardTitle>
                  <CardDescription className="text-white/70">
                    WhatsApp para agilidade, email para detalhar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Magnetic className="w-full">
                    <Button
                      className="w-full justify-between rounded-xl bg-[rgba(0,229,255,0.18)] text-white hover:bg-[rgba(0,229,255,0.26)]"
                      asChild
                    >
                      <a href={whatsappLink} target="_blank" rel="noreferrer">
                        <span className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          WhatsApp
                        </span>
                        <ArrowRight className="h-4 w-4" />
                      </a>
                    </Button>
                  </Magnetic>

                  <Button
                    variant="secondary"
                    className="w-full justify-between rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
                    asChild
                  >
                    <a href={mailtoLink}>
                      <span className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Email
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </Button>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                    <div className="font-medium text-white/90">Para acelerar</div>
                    <div className="mt-1">Se tiver referência, print ou lista de funções, envie junto.</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                    <div className="font-medium text-white/90">O que você recebe</div>
                    <ul className="mt-2 space-y-2">
                      {["Planejamento claro", "Design e desenvolvimento por etapas", "Deploy pronto (Vercel)"].map(
                        (x) => (
                          <li key={x} className="flex items-start gap-2">
                            <span className="mt-[6px] inline-block h-1.5 w-1.5 rounded-full bg-[rgba(0,255,138,0.85)]" />
                            <span>{x}</span>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <CodeContactForm email={CONTACT.email} whatsapp={CONTACT.whatsapp} />
            </div>
          </Reveal>
        </section>

        {/* CTA FINAL */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-14 md:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md md:p-10">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(650px_circle_at_30%_30%,rgba(0,229,255,0.16),transparent_60%)]" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(650px_circle_at_70%_70%,rgba(0,255,138,0.12),transparent_60%)]" />

              <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="max-w-2xl">
                  <div className="text-sm text-white/70">Pronto para começar?</div>
                  <div className="mt-2 text-2xl font-semibold md:text-3xl">
                    Vamos transformar sua ideia em produto.
                  </div>
                  <div className="mt-2 text-sm text-white/70">
                    Um primeiro contato já define o melhor caminho: MVP, plataforma ou app.
                  </div>
                </div>

                <Magnetic className="w-full md:w-auto">
                  <Button
                    className="w-full rounded-xl bg-[rgba(0,229,255,0.18)] text-white hover:bg-[rgba(0,229,255,0.26)] md:w-auto"
                    asChild
                  >
                    <a href="#contato">
                      Iniciar conversa <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </Magnetic>
              </div>
            </div>
          </Reveal>
        </section>

        {/* FOOTER */}
        <footer className="mx-auto w-full max-w-6xl px-4 pb-10 md:px-6">
          <Separator className="mb-6 bg-white/10" />
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-sm font-semibold">{SITE.name}</div>
                <div className="text-xs text-white/60">Sua ilha de realidades — nós codificamos o resto.</div>
              </div>
            </div>

            <div className="text-xs text-white/50">
              © {new Date().getFullYear()} {SITE.name}. Next.js • Vercel
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
