"use client";

import * as React from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { criarLead } from "@/lib/acoes/criar-lead";

type CanalEN = "email" | "sms" | "instagram" | "messenger";
type Field = "nome" | "negocio" | "siteAtual" | "contato" | "mensagem";

const CHANNELS: { value: CanalEN; label: string; placeholder: string }[] = [
  { value: "sms", label: "Text (SMS)", placeholder: "(555) 123-4567" },
  { value: "email", label: "Email", placeholder: "you@business.com" },
  { value: "instagram", label: "Instagram DM", placeholder: "@yourbusiness" },
  { value: "messenger", label: "Messenger", placeholder: "your page name" },
];

const EMPTY: Record<Field, string> = {
  nome: "",
  negocio: "",
  siteAtual: "",
  contato: "",
  mensagem: "",
};

function validate(form: Record<Field, string>, canal: CanalEN) {
  const errors: Partial<Record<Field, string>> = {};
  if (!form.nome.trim()) errors.nome = "Please enter your name.";
  if (canal === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contato.trim()))
      errors.contato = "Please enter a valid email.";
  } else if (canal === "sms") {
    if (form.contato.replace(/\D/g, "").length < 10)
      errors.contato = "Please enter a valid phone number.";
  } else if (form.contato.trim().length < 2) {
    errors.contato = "Please enter your handle or page name.";
  }
  if (form.mensagem.trim().length < 10)
    errors.mensagem = "Tell us a bit about your business (one sentence is fine).";
  return errors;
}

export function LeadFormEn() {
  const [form, setForm] = React.useState(EMPTY);
  const [canal, setCanal] = React.useState<CanalEN>("sms");
  const [errors, setErrors] = React.useState<Partial<Record<Field, string>>>({});
  const [submitted, setSubmitted] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [generalError, setGeneralError] = React.useState<string | null>(null);
  const honeypotRef = React.useRef<HTMLInputElement | null>(null);

  const set = (field: Field) => (value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (submitted) setErrors(validate({ ...form, [field]: value }, canal));
  };

  const channel = CHANNELS.find((c) => c.value === canal)!;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    const found = validate(form, canal);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSending(true);
    setGeneralError(null);

    let planoInteresse: string | undefined;
    try {
      planoInteresse = sessionStorage.getItem("rv-plano-interesse") ?? undefined;
    } catch {
      /* storage indisponível: lead segue sem interesse */
    }

    try {
      const result = await criarLead({
        origem: "en",
        planoInteresse,
        website: honeypotRef.current?.value ?? "",
        nome: form.nome,
        negocio: form.negocio.trim() || undefined,
        siteAtual: form.siteAtual.trim() || undefined,
        canal,
        contato: form.contato,
        mensagem: form.mensagem,
      });
      if (!result.ok) {
        setGeneralError("Something went wrong — please try again.");
        return;
      }
      setDone(true);
    } catch {
      setGeneralError("Something went wrong — please try again.");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <Card className="rounded-2xl border-white/10 bg-[rgba(10,14,20,0.72)] backdrop-blur-md">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-[rgba(0,255,138,0.9)]" />
          <div className="text-lg font-semibold text-white">Got it!</div>
          <p className="max-w-sm text-sm text-white/70">
            We&apos;ll get back to you soon — by message, of course. Keep an eye
            on your {channel.label}.
          </p>
        </CardContent>
      </Card>
    );
  }

  const field = (id: Field, label: string, input: React.ReactNode) => (
    <div>
      <label
        htmlFor={`lead-${id === "siteAtual" ? "site" : id}`}
        className="mb-1.5 block text-sm text-white/60"
      >
        {label}
      </label>
      {input}
      {errors[id] ? (
        <p role="alert" className="mt-1 text-xs text-red-300">
          {errors[id]}
        </p>
      ) : null}
    </div>
  );

  const inputClasses =
    "h-10 w-full rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35";

  return (
    <Card className="rounded-2xl border-white/10 bg-[rgba(10,14,20,0.72)] backdrop-blur-md">
      <CardHeader>
        <CardTitle className="text-white">Get your free concept</CardTitle>
        <CardDescription className="text-white/70">
          Tell us about your business — we&apos;ll send a free homepage concept.
          No strings attached.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="hidden" aria-hidden="true">
            <input
              ref={honeypotRef}
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          {field(
            "nome",
            "Your name",
            <Input
              id="lead-nome"
              value={form.nome}
              onChange={(e) => set("nome")(e.target.value)}
              placeholder="Alex Johnson"
              className={inputClasses}
            />
          )}

          {field(
            "negocio",
            "Business name",
            <Input
              id="lead-negocio"
              value={form.negocio}
              onChange={(e) => set("negocio")(e.target.value)}
              placeholder="Sparkle Car Wash"
              className={inputClasses}
            />
          )}

          {field(
            "siteAtual",
            "Current website (if you have one)",
            <Input
              id="lead-site"
              value={form.siteAtual}
              onChange={(e) => set("siteAtual")(e.target.value)}
              placeholder="yourbusiness.com"
              className={inputClasses}
            />
          )}

          <div>
            <div className="mb-1.5 block text-sm text-white/60">
              How should we reach you?
            </div>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCanal(c.value)}
                  aria-pressed={canal === c.value}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                    canal === c.value
                      ? "border-[rgba(0,229,255,0.5)] bg-[rgba(0,229,255,0.12)] text-white"
                      : "border-white/10 bg-white/5 text-white/55 hover:text-white"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {field(
            "contato",
            "Where to reach you",
            <Input
              id="lead-contato"
              value={form.contato}
              onChange={(e) => set("contato")(e.target.value)}
              placeholder={channel.placeholder}
              className={inputClasses}
            />
          )}

          {field(
            "mensagem",
            "About your business",
            <Textarea
              id="lead-mensagem"
              value={form.mensagem}
              onChange={(e) => set("mensagem")(e.target.value)}
              placeholder="What do you do, and what do you want your website to do for you?"
              className="min-h-[110px] w-full rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
            />
          )}

          <Button
            id="lead-enviar"
            type="submit"
            disabled={sending}
            className="group h-11 w-full rounded-xl border border-white/10 bg-[rgba(0,255,138,0.16)] text-sm font-medium text-white transition-all hover:-translate-y-[1px] hover:bg-[rgba(0,255,138,0.22)]"
          >
            <span className="inline-flex items-center gap-2">
              {sending ? "Sending..." : "Send it — get my free concept"}
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          </Button>

          {generalError ? (
            <p role="alert" className="text-sm text-red-300">
              {generalError}
            </p>
          ) : null}

          <p className="text-xs text-white/45">
            No calls, ever. We reply by message on the channel you pick.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
