import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  MessageSquareText,
  Moon,
  PenLine,
  ShieldCheck,
} from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { HeroGlow } from "@/components/landing/hero-glow";
import { Card, CardContent } from "@/components/ui/card";

import { getPricingEn } from "@/lib/config";
import { faqEn, INCLUDED_EN, SITE_EN, STEPS_EN } from "@/lib/site-en";
import { formatarDolares } from "@/lib/formato";
import { PricingSection } from "@/components/en/pricing-section";
import { LeadFormEn } from "@/components/en/lead-form";
import { RolagemSecao } from "@/components/en/rolagem-secao";

export const metadata: Metadata = {
  title: SITE_EN.title,
  description: SITE_EN.description,
  keywords: [...SITE_EN.keywords],
  alternates: {
    canonical: "/en",
    languages: { "pt-BR": "/", en: "/en", "x-default": "/" },
  },
  openGraph: {
    type: "website",
    url: "/en",
    siteName: SITE_EN.name,
    title: SITE_EN.title,
    description: SITE_EN.description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_EN.title,
    description: SITE_EN.description,
  },
};

const NO_CALLS = [
  {
    icon: <Moon className="h-5 w-5 text-[rgba(0,229,255,0.95)]" />,
    title: "Reply on your schedule",
    desc: "7 AM or 11 PM — message us whenever suits you. We answer fast.",
  },
  {
    icon: <PenLine className="h-5 w-5 text-[rgba(0,255,138,0.9)]" />,
    title: "Everything in writing",
    desc: "Every decision documented. Nothing gets lost in a call.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5 text-white/90" />,
    title: "No sales pressure",
    desc: "No pitch meetings. See the concept, decide when you're ready.",
  },
] as const;

export default async function PaginaEn() {
  const pricing = await getPricingEn();
  const faq = faqEn(pricing.care);

  return (
    <main className="relative min-h-screen bg-[#05070b] text-white">
      {/* topo */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 md:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#00E5FF] to-[#00FF8A] font-mono text-[13px] font-bold text-[#05070B]">
            RV
          </span>
          <span className="text-sm font-semibold tracking-wide">RVLand Devs</span>
        </div>
        <nav className="flex items-center gap-2">
          <a
            href="#pricing"
            className="rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:text-white"
          >
            Pricing
          </a>
          <a
            href="#contact"
            className="rounded-xl border border-white/10 bg-[rgba(0,255,138,0.14)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[rgba(0,255,138,0.2)]"
          >
            Get started
          </a>
        </nav>
      </header>

      {/* hero */}
      <section id="top" className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 md:px-6 md:pb-16">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-8 md:p-14">
          <HeroGlow />
          <div className="relative max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/60">
              <MessageSquareText className="h-3.5 w-3.5" />
              Websites for businesses
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
              A website that wins you customers.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/70">
              We design it, write it, and put it live — you approve everything
              from your phone. No calls. No meetings. No tech headaches.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#contact"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-[rgba(0,255,138,0.16)] px-6 text-sm font-medium transition-all hover:-translate-y-[1px] hover:bg-[rgba(0,255,138,0.22)]"
              >
                Get your free concept
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#pricing"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-6 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                See pricing
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* no calls */}
      <section id="no-calls" className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <Reveal>
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              No calls. No meetings.{" "}
              <span className="bg-gradient-to-r from-[#00E5FF] to-[#00FF8A] bg-clip-text text-transparent">
                Just text.
              </span>
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-white/65">
              You&apos;re busy running a business — not sitting on Zoom. Message
              us, approve the design, and your site goes live. That&apos;s it.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {NO_CALLS.map((item) => (
              <Card
                key={item.title}
                className="rounded-2xl border-white/10 bg-white/5 backdrop-blur-md"
              >
                <CardContent className="p-6">
                  <div className="mb-3">{item.icon}</div>
                  <div className="font-medium text-white">{item.title}</div>
                  <p className="mt-1.5 text-sm text-white/60">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </Reveal>
      </section>

      {/* what's included */}
      <section id="included" className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <Reveal>
          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Everything your site needs. Included.
            </h2>
            <p className="mt-2 max-w-2xl text-white/65">
              One package, no add-ons, no surprise invoices.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {INCLUDED_EN.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
              >
                <div className="text-sm font-medium text-white">{item.title}</div>
                <p className="mt-1 text-sm text-white/55">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm text-white/55">
            Every plan includes {pricing.care.mesesInclusos} months of support
            &amp; hosting. After that, it&apos;s just{" "}
            {formatarDolares(pricing.care.valorCentavos)}/month.
          </p>
        </Reveal>
      </section>

      {/* how it works */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <Reveal>
          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              How it works
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS_EN.map((step, i) => (
              <div
                key={step.title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"
              >
                <div className="rv-num mb-3 text-sm text-[rgba(0,229,255,0.9)]">
                  0{i + 1}
                </div>
                <div className="font-medium text-white">{step.title}</div>
                <p className="mt-1.5 text-sm text-white/60">{step.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* pricing */}
      <section
        id="pricing"
        className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 py-10 md:px-6 md:py-14"
      >
        <Reveal>
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Simple pricing. Everything included.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-white/65">
              One website, three ways to pay.
            </p>
          </div>
          <PricingSection pricing={pricing} />
        </Reveal>
      </section>

      {/* faq */}
      <section id="faq" className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6 md:py-14">
        <Reveal>
          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Questions, answered
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {faq.map((item) => (
              <div
                key={item.q}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
              >
                <div className="font-medium text-white">{item.q}</div>
                <p className="mt-1.5 text-sm text-white/60">{item.a}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* contact */}
      <section
        id="contact"
        className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 py-10 pb-16 md:px-6 md:py-14"
      >
        <Reveal>
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Get your free concept
              </h2>
              <p className="mt-3 max-w-md text-white/65">
                Send us your info and we&apos;ll reply with a free homepage
                concept for your business — before you pay anything.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-white/70">
                <li className="flex items-start gap-2">
                  <span className="mt-[7px] inline-block h-1.5 w-1.5 rounded-full bg-[rgba(0,255,138,0.85)]" />
                  We reply by message on the channel you pick.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-[7px] inline-block h-1.5 w-1.5 rounded-full bg-[rgba(0,255,138,0.85)]" />
                  Free concept — you only pay if you love it.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-[7px] inline-block h-1.5 w-1.5 rounded-full bg-[rgba(0,255,138,0.85)]" />
                  No calls, no meetings — that&apos;s a promise.
                </li>
              </ul>
            </div>
            <LeadFormEn />
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-white/45 md:flex-row md:px-6">
          <span>© {new Date().getFullYear()} RVLand Devs</span>
          <Link href="/" className="transition-colors hover:text-white">
            Português (Brasil) →
          </Link>
        </div>
      </footer>

      <RolagemSecao />
    </main>
  );
}
