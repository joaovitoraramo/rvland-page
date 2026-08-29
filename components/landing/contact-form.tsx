"use client";

import * as React from "react";
import { ArrowRight } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Magnetic } from "@/components/landing/magnetic";
import { buildMailto, buildWhatsappLink } from "@/lib/site";
import { criarLead } from "@/lib/acoes/criar-lead";
import { cn } from "@/lib/utils";

type CanalBR = "whatsapp" | "email" | "instagram" | "telefone";
type Field = "nome" | "contato" | "mensagem";

const CANAIS: { valor: CanalBR; rotulo: string; placeholder: string }[] = [
  { valor: "whatsapp", rotulo: "WhatsApp", placeholder: "(41) 99999-9999" },
  { valor: "email", rotulo: "Email", placeholder: "seu@email.com" },
  { valor: "instagram", rotulo: "Instagram", placeholder: "@seuperfil" },
  { valor: "telefone", rotulo: "Telefone", placeholder: "(41) 99999-9999" },
];

const EMPTY: Record<Field, string> = { nome: "", contato: "", mensagem: "" };

function validate(form: Record<Field, string>, canal: CanalBR) {
  const errors: Partial<Record<Field, string>> = {};
  if (!form.nome.trim()) errors.nome = "Informe seu nome.";
  if (canal === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contato.trim()))
      errors.contato = "Informe um email válido.";
  } else if (canal === "instagram") {
    if (form.contato.trim().length < 2) errors.contato = "Informe seu @ do Instagram.";
  } else if (form.contato.replace(/\D/g, "").length < 10) {
    errors.contato = "Informe o número com DDD.";
  }
  if (form.mensagem.trim().length < 10)
    errors.mensagem = "Descreva o projeto em pelo menos uma frase.";
  return errors;
}

function buildBody(form: Record<Field, string>, canal: CanalBR) {
  return `Nome: ${form.nome}\nContato (${canal}): ${form.contato}\n\nMensagem:\n${form.mensagem}`;
}

export function CodeContactForm({
  email,
  whatsapp,
}: {
  email: string;
  whatsapp: string;
}) {
  const [form, setForm] = React.useState(EMPTY);
  const [canal, setCanal] = React.useState<CanalBR>("whatsapp");
  const [errors, setErrors] = React.useState<Partial<Record<Field, string>>>({});
  const [submitted, setSubmitted] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [sucesso, setSucesso] = React.useState(false);
  const [erroGeral, setErroGeral] = React.useState<string | null>(null);
  const honeypotRef = React.useRef<HTMLInputElement | null>(null);

  const set = (field: Field) => (value: string) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (submitted) setErrors(validate({ ...form, [field]: value }, canal));
  };

  const canalAtual = CANAIS.find((c) => c.valor === canal)!;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    const found = validate(form, canal);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setEnviando(true);
    setErroGeral(null);
    try {
      const resultado = await criarLead({
        origem: "br",
        website: honeypotRef.current?.value ?? "",
        nome: form.nome,
        canal,
        contato: form.contato,
        mensagem: form.mensagem,
      });

      if (!resultado.ok) {
        setErroGeral("Algo deu errado — tente de novo ou chame direto no WhatsApp.");
        return;
      }

      setSucesso(true);

      const corpo = buildBody(form, canal);
      if (canal === "whatsapp") {
        const wa = buildWhatsappLink(whatsapp, `Olá! Segue meu pedido:\n\n${corpo}`);
        if (wa) window.open(wa, "_blank", "noopener,noreferrer");
      } else if (canal === "email") {
        const to = buildMailto(email, `Projeto RVLand — ${form.nome}`, corpo);
        if (to) window.location.href = to;
      }
    } catch {
      setErroGeral("Algo deu errado — tente de novo ou chame direto no WhatsApp.");
    } finally {
      setEnviando(false);
    }
  };

  const line = (n: number, content: React.ReactNode) => (
    <div className="grid grid-cols-[34px_1fr] gap-3">
      <div className="select-none text-right text-xs text-white/35">{n}</div>
      <div className="min-w-0 text-sm text-white/85">{content}</div>
    </div>
  );

  const fieldError = (field: Field) =>
    errors[field] ? (
      <p id={`erro-${field}`} role="alert" className="mt-1 text-xs text-red-300">
        {errors[field]}
      </p>
    ) : null;

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
          <Badge className="border-white/10 bg-white/5 text-white/70">
            Estamos de prontidão
          </Badge>
        </div>

        <CardTitle className="text-white">Descreva o projeto</CardTitle>
        <CardDescription className="text-white/70">
          Um resumo direto já é suficiente para começarmos.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {/* honeypot anti-spam: humano não vê */}
          <div className="hidden" aria-hidden="true">
            <input
              ref={honeypotRef}
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

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
                  <span className="text-white/60">=</span>{" "}
                  <span className="text-white/60">{"{"}</span>
                </span>
              )}

              {line(
                3,
                <div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label htmlFor="nome" className="shrink-0 text-white/60">
                      nome:
                    </label>
                    <Input
                      id="nome"
                      name="nome"
                      required
                      value={form.nome}
                      onChange={(e) => set("nome")(e.target.value)}
                      aria-invalid={!!errors.nome}
                      aria-describedby={errors.nome ? "erro-nome" : undefined}
                      placeholder="Seu nome"
                      className="h-9 w-full rounded-xl border-white/10 bg-white/5 font-mono text-white placeholder:text-white/35"
                    />
                  </div>
                  {fieldError("nome")}
                </div>
              )}

              {line(
                4,
                <div className="flex flex-wrap items-center gap-2">
                  <span className="shrink-0 text-white/60">canal:</span>
                  {CANAIS.map((c) => (
                    <button
                      key={c.valor}
                      type="button"
                      onClick={() => setCanal(c.valor)}
                      aria-pressed={canal === c.valor}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-xs transition-colors",
                        canal === c.valor
                          ? "border-[rgba(0,229,255,0.5)] bg-[rgba(0,229,255,0.12)] text-white"
                          : "border-white/10 bg-white/5 text-white/55 hover:text-white"
                      )}
                    >
                      {c.rotulo}
                    </button>
                  ))}
                </div>
              )}

              {line(
                5,
                <div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label htmlFor="contato" className="shrink-0 text-white/60">
                      contato:
                    </label>
                    <Input
                      id="contato"
                      name="contato"
                      required
                      value={form.contato}
                      onChange={(e) => set("contato")(e.target.value)}
                      aria-invalid={!!errors.contato}
                      aria-describedby={errors.contato ? "erro-contato" : undefined}
                      placeholder={canalAtual.placeholder}
                      className="h-9 w-full rounded-xl border-white/10 bg-white/5 font-mono text-white placeholder:text-white/35"
                    />
                  </div>
                  {fieldError("contato")}
                </div>
              )}

              {line(
                6,
                <div className="min-w-0">
                  <label htmlFor="mensagem" className="block text-white/60">
                    mensagem: `
                  </label>
                  <Textarea
                    id="mensagem"
                    name="mensagem"
                    required
                    value={form.mensagem}
                    onChange={(e) => set("mensagem")(e.target.value)}
                    aria-invalid={!!errors.mensagem}
                    aria-describedby={errors.mensagem ? "erro-mensagem" : undefined}
                    placeholder={
                      "O que você quer construir?\nEx: área logada + pagamentos + painel admin..."
                    }
                    className="mt-2 min-h-[120px] w-full rounded-xl border-white/10 bg-white/5 font-mono text-white placeholder:text-white/35"
                  />
                  {fieldError("mensagem")}
                  <div className="mt-2 text-white/60">`</div>
                </div>
              )}

              {line(7, <span className="text-white/60">{"}"};</span>)}
              {line(
                8,
                <span className="text-white/55">
                  {"// "}Clique em{" "}
                  <span className="text-[rgba(0,255,138,0.9)]">Enviar</span> para
                  continuar.
                </span>
              )}
            </div>
          </div>

          <Magnetic className="w-full">
            <Button
              id="enviar-lead"
              type="submit"
              disabled={enviando}
              className={[
                "group relative h-11 w-full min-w-0 rounded-xl text-sm font-medium text-white",
                "border border-white/10 bg-[rgba(0,255,138,0.16)]",
                "shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_18px_40px_rgba(0,0,0,0.35)]",
                "transition-all duration-200",
                "hover:-translate-y-[1px] hover:border-white/15 hover:bg-[rgba(0,255,138,0.22)]",
                "active:translate-y-0",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,255,138,0.35)] focus-visible:ring-offset-0",
                "overflow-hidden",
              ].join(" ")}
            >
              <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <span className="absolute -inset-24 bg-[radial-gradient(circle,rgba(0,255,138,0.28),transparent_55%)]" />
                <span className="absolute -left-16 top-0 h-full w-24 -skew-x-12 bg-white/10 opacity-0 blur-md transition-all duration-300 group-hover:left-[120%] group-hover:opacity-100" />
              </span>

              <span className="relative inline-flex w-full items-center justify-center gap-2">
                <span>
                  {enviando
                    ? "Enviando..."
                    : canal === "whatsapp"
                      ? "Enviar e abrir WhatsApp"
                      : canal === "email"
                        ? "Enviar por email"
                        : "Enviar"}
                </span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </Button>
          </Magnetic>

          {sucesso ? (
            <p role="status" className="text-sm text-emerald-300">
              Recebido! Vamos te responder por {canalAtual.rotulo}.
            </p>
          ) : null}
          {erroGeral ? (
            <p role="alert" className="text-sm text-red-300">
              {erroGeral}
            </p>
          ) : null}

          <p className="text-xs text-white/45">
            Seu pedido fica registrado com a gente e respondemos pelo canal que
            você escolher. Se preferir, escreva direto para{" "}
            <span className="text-white/70">{email}</span>.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
