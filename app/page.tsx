"use client";

import * as React from "react";
import Image from "next/image";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const CONTACT = {
  whatsapp: "554184891365",
  email: "contato.rvlandd@gmail.com",
};

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? ""; // opcional

const SEO = {
  title: "RVLand Devs | Software sob medida, do zero",
  description:
      "Apps, sites, plataformas e sistemas sob medida — do zero e no seu fluxo. Nada de software pronto adaptado.",
  siteName: "RVLand Devs",
  keywords: [
    "desenvolvimento de software",
    "software sob medida",
    "criar aplicativo",
    "criar site",
    "plataforma web",
    "sistemas personalizados",
    "next.js",
    "react",
    "rvland devs",
  ],
};

function digitsOnly(v: string) {
  return (v || "").replace(/\D/g, "");
}
function buildWhatsappLink(number: string, text: string) {
  const n = digitsOnly(number);
  if (!n) return "";
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
function buildMailto(email: string, subject: string, body: string) {
  if (!email) return "";
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function useClientSeo() {
  React.useEffect(() => {
    document.title = SEO.title;

    const upsertMeta = (selector: string, attrs: Record<string, string>) => {
      let el = document.head.querySelector(selector) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        document.head.appendChild(el);
      }
      Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
    };

    const upsertLink = (selector: string, attrs: Record<string, string>) => {
      let el = document.head.querySelector(selector) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement("link");
        document.head.appendChild(el);
      }
      Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
    };

    upsertMeta(`meta[name="description"]`, { name: "description", content: SEO.description });
    upsertMeta(`meta[name="keywords"]`, { name: "keywords", content: SEO.keywords.join(", ") });

    upsertMeta(`meta[property="og:title"]`, { property: "og:title", content: SEO.title });
    upsertMeta(`meta[property="og:description"]`, { property: "og:description", content: SEO.description });
    upsertMeta(`meta[property="og:type"]`, { property: "og:type", content: "website" });
    upsertMeta(`meta[property="og:site_name"]`, { property: "og:site_name", content: SEO.siteName });

    // canonical sem quebrar SSR: só depois do mount
    const canonical = window.location.origin + window.location.pathname;
    upsertLink(`link[rel="canonical"]`, { rel: "canonical", href: canonical });
    upsertMeta(`meta[property="og:url"]`, { property: "og:url", content: canonical });

    upsertMeta(`meta[name="twitter:card"]`, { name: "twitter:card", content: "summary" });
    upsertMeta(`meta[name="twitter:title"]`, { name: "twitter:title", content: SEO.title });
    upsertMeta(`meta[name="twitter:description"]`, { name: "twitter:description", content: SEO.description });

    upsertMeta(`meta[name="theme-color"]`, { name: "theme-color", content: "#05070B" });
    upsertMeta(`meta[name="robots"]`, { name: "robots", content: "index, follow" });
  }, []);
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
        (entries) => {
          const [e] = entries;
          if (e.isIntersecting) {
            setShow(true);
            io.disconnect();
          }
        },
        { threshold: 0.12 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
      <div
          ref={ref}
          className={[
            "transition-all duration-700 will-change-transform",
            show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
          ].join(" ")}
          style={{ transitionDelay: `${delay}ms` }}
      >
        {children}
      </div>
  );
}

function Magnetic({
                    children,
                    strength = 10,
                    className,
                  }: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [t, setT] = React.useState({ x: 0, y: 0 });

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setT({ x: px * strength, y: py * strength });
  };
  const onLeave = () => setT({ x: 0, y: 0 });

  return (
      <div
          ref={ref}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          className={["inline-block", className].join(" ")}
          style={{ transform: `translate3d(${t.x}px, ${t.y}px, 0)`, transition: "transform 140ms ease" }}
      >
        {children}
      </div>
  );
}

/**
 * HERO glow seguindo mouse, CLIPADO (sem overflow)
 */
function HeroGlow() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState({ x: 55, y: 30 });

  const raf = React.useRef<number | null>(null);
  const latest = React.useRef({ x: 55, y: 30 });

  React.useEffect(() => {
    const host = ref.current?.parentElement as HTMLDivElement | null; // o card do hero (pai)
    if (!host) return;

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();

      // só atualiza quando o ponteiro estiver dentro do hero
      const inside =
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom;

      if (!inside) return;

      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;

      latest.current = {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y)),
      };

      if (raf.current) return;
      raf.current = window.requestAnimationFrame(() => {
        raf.current = null;
        setPos(latest.current);
      });
    };

    window.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
      <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(950px circle at ${pos.x}% ${pos.y}%, rgba(0,229,255,0.22), rgba(0,255,138,0.12) 45%, rgba(0,0,0,0) 72%)`,
            }}
        />
        <div className="rv-aurora absolute inset-0 opacity-70" />
        <div className="rv-scan absolute inset-0 opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] via-transparent to-transparent" />
      </div>
  );
}

/**
 * Card tilt padronizado (layout estável)
 * - wrapper tem overflow-hidden
 * - altura base fixa pra grids
 * - sem -inset / sem blur pra fora
 */
function TiltCard({
                      title,
                      desc,
                      icon,
                      bullets,
                      tag,
                  }: {
    title: string;
    desc: string;
    icon: React.ReactNode;
    bullets?: string[];
    tag?: string;
}) {
    const shellRef = React.useRef<HTMLDivElement | null>(null);
    const [style, setStyle] = React.useState<React.CSSProperties>({});
    const [glow, setGlow] = React.useState({ x: 50, y: 45, a: 0 });

    const onMove = (e: React.MouseEvent) => {
        const el = shellRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;

        const rotY = (px - 0.5) * 8;
        const rotX = (0.5 - py) * 8;

        setStyle({ transform: `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg)` });
        setGlow({ x: px * 100, y: py * 100, a: 1 });
    };

    const onLeave = () => {
        setStyle({ transform: `perspective(900px) rotateX(0deg) rotateY(0deg)` });
        setGlow((g) => ({ ...g, a: 0 }));
    };

    return (
        <div
            ref={shellRef}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
            className="group isolate relative h-full min-h-[380px] overflow-hidden rounded-2xl"
        >
            <div
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200"
                style={{
                    opacity: glow.a,
                    background: `radial-gradient(520px circle at ${glow.x}% ${glow.y}%, rgba(0,229,255,0.20), rgba(0,255,138,0.10) 36%, transparent 70%)`,
                }}
            />

            <Card
                className={[
                    "relative h-full rounded-2xl border-white/10 bg-[rgba(10,14,20,0.72)]",
                    "shadow-[0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-md",
                    "will-change-transform",
                    "flex flex-col", // <- importante: estabiliza a coluna (header + content)
                ].join(" ")}
                style={style}
            >
                <CardHeader className="pb-5">
                    <div className="flex items-start gap-4">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5">
                            {icon}
                        </div>

                        {/* bloco do texto ocupa espaço de verdade */}
                        <div className="min-w-0 flex-1">
                            {/* flex-wrap: quando apertar, o “badge” cai pra baixo (não esmaga o título) */}
                            <div className="flex flex-wrap items-start gap-x-2 gap-y-2">
                                <CardTitle className="min-w-[12ch] flex-1 text-base leading-snug text-white">
                                    {title}
                                </CardTitle>

                                {tag ? (
                                    <Badge
                                        className={[
                                            "shrink-0",
                                            "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
                                            "px-2.5 py-1 text-[11px] leading-none",
                                            "whitespace-nowrap", // <- não quebra palavra por palavra
                                            "max-w-full truncate", // <- se ficar grande, corta com “...”
                                        ].join(" ")}
                                        title={tag}
                                    >
                                        {tag}
                                    </Badge>
                                ) : null}
                            </div>

                            <CardDescription className="mt-2 text-sm leading-relaxed text-white/70">
                                {desc}
                            </CardDescription>
                        </div>
                    </div>

                    <div className="mt-4 h-px w-full bg-white/10" />
                </CardHeader>

                {/* content com respiro e chips no “rodapé” */}
                <CardContent className="flex flex-1 flex-col pt-0 pb-6">
                    {bullets?.length ? (
                        <ul className="mt-1 space-y-3 text-sm text-white/80">
                            {bullets.slice(0, 3).map((b) => (
                                <li key={b} className="flex items-start gap-2">
                                    <span className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[rgba(0,229,255,0.9)]" />
                                    <span className="leading-relaxed">{b}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="text-sm text-white/75">—</div>
                    )}

                    <div className="mt-auto pt-6 flex flex-wrap items-center gap-2 text-xs text-white/55">
            <span className="inline-flex h-6 items-center rounded-full border border-white/10 bg-white/5 px-2.5">
              sob medida
            </span>
                        <span className="inline-flex h-6 items-center rounded-full border border-white/10 bg-white/5 px-2.5">
              do zero
            </span>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

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

/**
 * Form estilo editor (responsivo e sem overflow)
 * - `//` aparece via {"// "}
 * - inputs quebram bem em telas pequenas
 */
function CodeContactForm({ email, whatsapp }: { email: string; whatsapp: string }) {
  const [form, setForm] = React.useState({ nome: "", contato: "", mensagem: "" });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = `Projeto RVLand — ${form.nome || "Contato"}`;
    const body = `Nome: ${form.nome}\nContato: ${form.contato}\n\nMensagem:\n${form.mensagem}`;
    const toEmail = buildMailto(email, subject, body);

    if (toEmail) {
      window.location.href = toEmail;
      return;
    }
    const wa = buildWhatsappLink(whatsapp, `Olá! Segue minha mensagem:\n\n${body}`);
    if (wa) window.open(wa, "_blank", "noopener,noreferrer");
  };

  const line = (n: number, content: React.ReactNode) => (
      <div className="grid grid-cols-[34px_1fr] gap-3">
        <div className="select-none text-right text-xs text-white/35">{n}</div>
        <div className="min-w-0 text-sm text-white/85">{content}</div>
      </div>
  );

  return (
      <Card className="rounded-2xl border-white/10 bg-[rgba(10,14,20,0.72)] backdrop-blur-md">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-400/80" />
              <span className="h-3 w-3 rounded-full bg-yellow-300/80" />
              <span className="h-3 w-3 rounded-full bg-green-400/80" />
              <span className="ml-3 text-xs text-white/60">projeto.ts</span>
            </div>
            <Badge className="border-white/10 bg-white/5 text-white/70">Estamos de prontidão</Badge>
          </div>

          <CardTitle className="text-white">Descreva o projeto</CardTitle>
          <CardDescription className="text-white/70">
            Um resumo direto já é suficiente para começarmos.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 font-mono">
              <div className="space-y-3">
                {line(
                    1,
                    <span className="text-white/55">
                  {"// "}Vamos transformar sua ideia em produto.
                </span>
                )}
                {line(
                    2,
                    <span>
                  <span className="text-[rgba(0,229,255,0.95)]">const</span>{" "}
                      <span className="text-white/90">projeto</span>{" "}
                      <span className="text-white/60">=</span> <span className="text-white/60">{"{"}</span>
                </span>
                )}

                {line(
                    3,
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <span className="shrink-0 text-white/60">nome:</span>
                      <Input
                          value={form.nome}
                          onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                          placeholder="Seu nome"
                          className="h-9 w-full rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35 font-mono"
                      />
                      <span className="hidden shrink-0 text-white/60 sm:inline">,</span>
                    </div>
                )}

                {line(
                    4,
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <span className="shrink-0 text-white/60">contato:</span>
                      <Input
                          value={form.contato}
                          onChange={(e) => setForm((p) => ({ ...p, contato: e.target.value }))}
                          placeholder="WhatsApp ou email"
                          className="h-9 w-full rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35 font-mono"
                      />
                      <span className="hidden shrink-0 text-white/60 sm:inline">,</span>
                    </div>
                )}

                {line(
                    5,
                    <div className="min-w-0">
                      <div className="text-white/60">mensagem: `</div>
                      <Textarea
                          value={form.mensagem}
                          onChange={(e) => setForm((p) => ({ ...p, mensagem: e.target.value }))}
                          placeholder={"O que você quer construir?\nEx: área logada + pagamentos + painel admin..."}
                          className="mt-2 min-h-[120px] w-full rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35 font-mono"
                      />
                      <div className="mt-2 text-white/60">`</div>
                    </div>
                )}

                {line(6, <span className="text-white/60">{"}"};</span>)}
                {line(
                    7,
                    <span className="text-white/55">
                  {"// "}Clique em <span className="text-[rgba(0,255,138,0.9)]">Enviar</span> para continuar.
                </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Magnetic className="w-full sm:flex-1">
                <Button
                    type="submit"
                    className={[
                      "group relative h-11 w-full min-w-0 rounded-xl text-sm font-medium text-white",
                      "border border-white/10 bg-[rgba(0,255,138,0.16)]",
                      "shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_18px_40px_rgba(0,0,0,0.35)]",
                      "transition-all duration-200",
                      "hover:bg-[rgba(0,255,138,0.22)] hover:border-white/15 hover:-translate-y-[1px]",
                      "active:translate-y-0",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,255,138,0.35)] focus-visible:ring-offset-0",
                      "overflow-hidden",
                    ].join(" ")}
                >
                  {/* glow + shine */}
                  <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <span className="absolute -inset-24 bg-[radial-gradient(circle,rgba(0,255,138,0.28),transparent_55%)]" />
        <span className="absolute -left-16 top-0 h-full w-24 -skew-x-12 bg-white/10 blur-md opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:left-[120%]" />
      </span>

                  <span className="relative inline-flex w-full items-center justify-center gap-2">
        <span>Enviar</span>
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      </span>
                </Button>
              </Magnetic>

              <Magnetic className="w-full sm:flex-1">
                <Button
                    type="button"
                    variant="secondary"
                    className={[
                      "group relative h-11 w-full min-w-0 rounded-xl text-sm font-medium text-white",
                      "border border-white/10 bg-white/5",
                      "shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_18px_40px_rgba(0,0,0,0.30)]",
                      "transition-all duration-200",
                      "hover:bg-white/8 hover:border-white/15 hover:-translate-y-[1px]",
                      "active:translate-y-0",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,229,255,0.30)] focus-visible:ring-offset-0",
                      "overflow-hidden",
                    ].join(" ")}
                    onClick={() => {
                      const body = `Nome: ${form.nome || "(não informado)"}\nContato: ${
                          form.contato || "(não informado)"
                      }\n\nMensagem:\n${form.mensagem || "(não informada)"}`;
                      const wa = buildWhatsappLink(whatsapp, `Olá! Segue meu pedido:\n\n${body}`);
                      if (wa) window.open(wa, "_blank", "noopener,noreferrer");
                    }}
                >
                  {/* glow + scan */}
                  <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <span className="absolute -inset-24 bg-[radial-gradient(circle,rgba(0,229,255,0.22),transparent_55%)]" />
        <span className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      </span>

                  <span className="relative inline-flex w-full items-center justify-center gap-2">
        <Phone className="h-4 w-4 opacity-90 transition-transform duration-200 group-hover:rotate-[-6deg]" />
        <span>Abrir no WhatsApp</span>
      </span>
                </Button>
              </Magnetic>
            </div>
          </form>
        </CardContent>
      </Card>
  );
}

export default function Page() {
  useClientSeo();

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
    "@type": "Organization",
    name: "RVLand Devs",
    url: SITE_URL || undefined,
    description: SEO.description,
    email: CONTACT.email || undefined,
  };

  return (
      <>
        <style jsx global>{`
        html,
        body {
          overflow-x: hidden; /* evita “layout estourando” por blur/transform */
          background: #05070b;
        }

        .rv-aurora {
          background: radial-gradient(600px circle at 30% 20%, rgba(0, 229, 255, 0.18), transparent 55%),
            radial-gradient(520px circle at 70% 60%, rgba(0, 255, 138, 0.12), transparent 56%),
            radial-gradient(520px circle at 60% 10%, rgba(255, 255, 255, 0.08), transparent 50%);
          filter: blur(10px);
          animation: rvAurora 10s ease-in-out infinite;
        }

        .rv-scan {
          background: linear-gradient(
            to bottom,
            transparent 0%,
            rgba(255, 255, 255, 0.08) 45%,
            transparent 70%
          );
          transform: translateY(-60%);
          animation: rvScan 7s ease-in-out infinite;
          mix-blend-mode: screen;
        }

        @keyframes rvAurora {
          0% {
            transform: translate3d(-2%, -1%, 0) scale(1.02);
            opacity: 0.55;
          }
          50% {
            transform: translate3d(2%, 1%, 0) scale(1.05);
            opacity: 0.7;
          }
          100% {
            transform: translate3d(-2%, -1%, 0) scale(1.02);
            opacity: 0.55;
          }
        }

        @keyframes rvScan {
          0% {
            transform: translateY(-70%);
            opacity: 0.15;
          }
          50% {
            transform: translateY(0%);
            opacity: 0.25;
          }
          100% {
            transform: translateY(70%);
            opacity: 0.15;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rv-aurora,
          .rv-scan {
            animation: none !important;
          }
        }
      `}</style>

        {/* Meta Pixel */}
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

        {/* JSON-LD (estável, sem window) */}
        <Script
            id="json-ld"
            type="application/ld+json"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        <main className="min-h-screen text-white overflow-x-hidden">
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
                <div className="text-sm font-semibold tracking-wide">RVLand Devs</div>
                <div className="text-xs text-white/60">Realidade Visualizada</div>
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

          {/* HERO (sem -inset, sem overflow) */}
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
                                disabled={!whatsappLink}
                            >
                              <a href={whatsappLink || "#contato"} target={whatsappLink ? "_blank" : undefined} rel="noreferrer">
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

                      {/* stats (tamanhos consistentes) */}
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
                <TiltCard
                    title="Apps"
                    desc="Aplicativos com fluxo e identidade próprios."
                    icon={<Cpu className="h-5 w-5 text-[rgba(0,255,138,0.9)]" />}
                    tag="iOS & Android"
                    bullets={["Experiência limpa", "Integrações (pagamento, mapas)", "Evolução contínua"]}
                />
                <TiltCard
                    title="Sites"
                    desc="Institucionais e landing pages com SEO."
                    icon={<Wand2 className="h-5 w-5 text-[rgba(0,229,255,0.95)]" />}
                    tag="SEO & Performance"
                    bullets={["Rápido", "Copy objetivo", "Pronto para anúncio/pixel"]}
                />
                <TiltCard
                    title="Plataformas"
                    desc="Web apps com áreas logadas e painéis."
                    icon={<Layers3 className="h-5 w-5 text-white/90" />}
                    tag="Web App"
                    bullets={["Permissões e usuários", "Dashboards e relatórios", "Escalável"]}
                />
                <TiltCard
                    title="Sistemas"
                    desc="Ferramentas internas e automações."
                    icon={<Code2 className="h-5 w-5 text-[rgba(0,229,255,0.95)]" />}
                    tag="B2B / Interno"
                    bullets={["Integra com seu stack", "Reduz trabalho manual", "Processo mais rápido"]}
                />
              </div>
            </Reveal>
          </section>

          {/* ENTREGÁVEIS (extra útil, com UX melhor) */}
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
                {[
                  { n: "01", t: "Descoberta", d: "Objetivo, público e requisitos essenciais." },
                  { n: "02", t: "Design", d: "Fluxo, telas e validação rápida." },
                  { n: "03", t: "Build", d: "Desenvolvimento por etapas e entregas." },
                  { n: "04", t: "Lançar + Evoluir", d: "Publicação, ajustes e melhorias contínuas." },
                ].map((s, idx) => (
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
                {[
                  {
                    q: "Vocês usam software pronto e só adaptam?",
                    a: "Não. O produto é construído do zero para o seu fluxo. Podemos reutilizar apenas infra (ex: autenticação) quando faz sentido.",
                  },
                  {
                    q: "Dá para começar pequeno e evoluir depois?",
                    a: "Sim. Planejamos um MVP enxuto e evoluímos por etapas, sem precisar refazer tudo.",
                  },
                  {
                    q: "Como eu acompanho o andamento?",
                    a: "Com checkpoints e entregas claras. Você valida telas e fluxos enquanto o produto avança.",
                  },
                  {
                    q: "E depois do lançamento?",
                    a: "Seguimos com manutenção e melhorias conforme necessidade do negócio.",
                  },
                ].map((item) => (
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
                          disabled={!whatsappLink}
                      >
                        <a href={whatsappLink || "#"} target="_blank" rel="noreferrer">
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
                        disabled={!mailtoLink}
                    >
                      <a href={mailtoLink || "#"}>
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
                        {["Planejamento claro", "Design e desenvolvimento por etapas", "Deploy pronto (Vercel)"].map((x) => (
                            <li key={x} className="flex items-start gap-2">
                              <span className="mt-[6px] inline-block h-1.5 w-1.5 rounded-full bg-[rgba(0,255,138,0.85)]" />
                              <span>{x}</span>
                            </li>
                        ))}
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
                    <div className="mt-2 text-2xl font-semibold md:text-3xl">Vamos transformar sua ideia em produto.</div>
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
                  <div className="text-sm font-semibold">RVLand Devs</div>
                  <div className="text-xs text-white/60">Sua ilha de realidades — nós codificamos o resto.</div>
                </div>
              </div>

              <div className="text-xs text-white/50">© {new Date().getFullYear()} RVLand Devs. Next.js • Vercel</div>
            </div>
          </footer>
        </main>
      </>
  );
}