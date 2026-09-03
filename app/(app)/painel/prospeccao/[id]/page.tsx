import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  ArrowLeft,
  CalendarCheck,
  Globe,
  ImageOff,
  Instagram,
  Mail,
  Phone,
  Sparkles,
  Target,
} from "lucide-react";

import { db, prospeccao } from "@/lib/db";
import { exigirPermissao, pode } from "@/lib/auth";
import { atualizarProspect, salvarContato } from "../actions";
import { PageHeader } from "@/components/painel/page-header";
import { BadgeProspect } from "@/components/painel/badge-prospect";
import { MedidorPotencial } from "@/components/painel/graficos";
import { FormProspect } from "@/components/painel/form-prospect";
import { FormContatoProspect } from "@/components/painel/form-contato-prospect";
import { Btn } from "@/components/painel/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { linkContatoProspect } from "@/lib/dominio/prospeccao";
import { formatarDataBR } from "@/lib/dominio/tempo";
import { urlAssinadaPrint, urlsDoConceito } from "@/lib/servicos/prints-prospeccao";
import { CardConceito } from "@/components/painel/card-conceito";

export const metadata = { title: "Prospect" };

export default async function PaginaProspect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const perfil = await exigirPermissao("prospeccao.ver");
  const { id } = await params;

  const [p] = await db.select().from(prospeccao).where(eq(prospeccao.id, id));
  if (!p) notFound();

  const podeEditar = pode(perfil, "prospeccao.editar");
  const acao = atualizarProspect.bind(null, p.id);

  const ig = linkContatoProspect.instagram(p.instagram);
  const mail = linkContatoProspect.email(p.emails);
  const tel = linkContatoProspect.telefone(p.telefone);
  const print = await urlAssinadaPrint(p.screenshot);
  const arquivosConceito = p.conceito ? await urlsDoConceito(p.conceito.arquivos) : [];

  const info = (rotulo: string, valor: React.ReactNode) => (
    <div>
      <div className="rv-eyebrow mb-1">{rotulo}</div>
      <div className="text-sm text-white/85">{valor}</div>
    </div>
  );

  const marcos = [
    { rotulo: "seguido", data: p.seguidoEm },
    { rotulo: "comentou", data: p.comentadoEm },
    { rotulo: "contato", data: p.contatadoEm },
  ].filter((m) => m.data);

  return (
    <>
      {p.teste ? (
        <div className="rv-entrar mb-4 rounded-xl border border-[rgba(255,194,77,0.3)] bg-[rgba(255,194,77,0.09)] px-4 py-2.5 text-sm text-[#FFD58A]">
          <strong className="font-semibold">Registro de teste.</strong> Criado pelo harness
          automatizado, não conta nas métricas e não é um negócio real.
        </div>
      ) : null}

      <PageHeader
        trilha="prospecção / detalhe"
        titulo={p.negocio}
        descricao={`${p.nicho} · ${p.cidade}${p.perfilCidade === "Afluente" ? " · cidade afluente" : ""}`}
        acoes={
          <>
            <Btn asChild variante="primario">
              <a href={linkContatoProspect.site(p.dominio)} target="_blank" rel="noreferrer">
                <Globe className="size-4" /> Abrir site
              </a>
            </Btn>
            {ig ? (
              <Btn asChild>
                <a href={ig} target="_blank" rel="noreferrer">
                  <Instagram className="size-4" /> {p.instagram}
                </a>
              </Btn>
            ) : null}
            {mail ? (
              <Btn asChild>
                <a href={mail}>
                  <Mail className="size-4" /> E-mail
                </a>
              </Btn>
            ) : null}
            {tel ? (
              <Btn asChild>
                <a href={tel}>
                  <Phone className="size-4" /> {p.telefone}
                </a>
              </Btn>
            ) : null}
            <Btn asChild variante="fantasma">
              <Link href="/painel/prospeccao">
                <ArrowLeft className="size-4" /> Voltar
              </Link>
            </Btn>
          </>
        }
      />

      {/* faixa de leitura rápida */}
      <div className="rv-entrar-1 mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
        <div>
          <div className="rv-eyebrow mb-1.5">potencial de venda</div>
          <MedidorPotencial valor={p.potencial} />
        </div>
        <div>
          <div className="rv-eyebrow mb-1.5">qualidade do site hoje</div>
          <MedidorPotencial valor={p.notaSite} />
        </div>
        <div>
          <div className="rv-eyebrow mb-1.5">etapa</div>
          <BadgeProspect status={p.status} />
        </div>
        {p.seguidores ? (
          <div>
            <div className="rv-eyebrow mb-1.5">seguidores</div>
            <div className="rv-num text-sm text-white/85">
              {p.seguidores.toLocaleString("pt-BR")}
            </div>
          </div>
        ) : null}
        {marcos.length > 0 ? (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {marcos.map((m) => (
              <span key={m.rotulo} className="flex items-center gap-1.5 text-xs text-white/45">
                <CalendarCheck className="size-3.5" />
                {m.rotulo} {formatarDataBR(m.data!)}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rv-entrar-2 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-4">
          {/* a ação, em destaque: é o que ele lê antes de mandar a DM */}
          <Card className="border-[rgba(0,229,255,0.2)] bg-[rgba(0,229,255,0.045)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-white">
                <Target className="size-4 text-[#8AF0FF]" />
                Como abordar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">
                {p.comoAbordar ?? "Sem roteiro de abordagem para este prospect."}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-white">
                <Sparkles className="size-4 text-white/50" />
                O que vi no site
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/70">
                {p.diagnostico ?? "Sem diagnóstico registrado."}
              </p>
              <div className="grid grid-cols-2 gap-4 border-t border-white/8 pt-4 sm:grid-cols-3">
                {info("site", <span className="rv-num break-all">{p.dominio}</span>)}
                {info("feito em", p.builder ?? "—")}
                {info("agendamento online", p.temBooking ? "sim" : "não")}
                {info("copyright", p.anoCopyright ?? "—")}
                {info("perfil da cidade", p.perfilCidade)}
                {info("qualidade do site", `${p.notaSite} de 10`)}
              </div>
            </CardContent>
          </Card>

          {p.conceito ? (
            <CardConceito conceito={p.conceito} arquivos={arquivosConceito} />
          ) : null}

          {/* print da varredura: a prova visual do diagnóstico */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-white">Print do site na varredura</CardTitle>
            </CardHeader>
            <CardContent>
              {print ? (
                <a
                  href={print}
                  target="_blank"
                  rel="noreferrer"
                  className="group block overflow-hidden rounded-xl border border-white/10"
                >
                  <Image
                    src={print}
                    alt={`Site de ${p.negocio}`}
                    width={1366}
                    height={900}
                    unoptimized
                    className="w-full transition-transform duration-300 group-hover:scale-[1.015]"
                  />
                </a>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/20 px-4 py-6 text-sm text-white/40">
                  <ImageOff className="size-4 shrink-0" />
                  <span>
                    Print ainda não enviado ao storage. Rode{" "}
                    <code className="rv-num text-white/60">npx tsx scripts/subir-prints.ts</code>{" "}
                    para publicar os screenshots da varredura.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-white">Contato</CardTitle>
          </CardHeader>
          <CardContent>
            <FormContatoProspect
              acao={salvarContato.bind(null, p.id)}
              emails={p.emails}
              instagram={p.instagram}
              telefone={p.telefone}
              seguidores={p.seguidores}
              manual={p.contatoManual}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-white">Acompanhamento</CardTitle>
          </CardHeader>
          <CardContent>
            {podeEditar ? (
              <FormProspect acao={acao} statusAtual={p.status} notasAtuais={p.notas ?? ""} />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-white/60">
                {p.notas ?? "Sem notas."}
              </p>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </>
  );
}
