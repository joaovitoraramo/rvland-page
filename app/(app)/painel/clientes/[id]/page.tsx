import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, or, sql } from "drizzle-orm";
import {
  ArchiveRestore,
  Archive,
  ArrowUpRight,
  FileText,
  Mail,
  Pencil,
  Phone,
  Plus,
} from "lucide-react";

import { db, anexos, auditoria, clientes, contratos, faturas, licencas, servidores } from "@/lib/db";
import { exigirPermissao, pode } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { statusDeCliente } from "@/lib/consultas/licencas";
import { statusAgora } from "@/lib/consultas/servidores";
import { BadgeServidor } from "@/components/painel/badge-servidor";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  arquivarCliente,
  bloquearManual,
  concederConfianca,
  desbloquearManual,
} from "@/app/(app)/painel/clientes/actions";
import { enviarAnexo, removerAnexo } from "./anexos-actions";
import { PageHeader } from "@/components/painel/page-header";
import { StatusBadge } from "@/components/painel/status-badge";
import { AcoesLicenca } from "@/components/painel/card-licenca";
import { FormAnexo } from "@/components/painel/form-anexo";
import { Btn } from "@/components/painel/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarReais, formatarDataHoraBR } from "@/lib/formato";
import { formatarCompetenciaBR, formatarDataBR } from "@/lib/dominio/tempo";
import { mascararDocumento, mascararTelefone } from "@/lib/dominio/mascaras";

export const metadata = { title: "Cliente" };

export default async function PaginaCliente({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const perfil = await exigirPermissao("clientes.ver");
  const { id } = await params;

  const [cliente] = await db.select().from(clientes).where(eq(clientes.id, id));
  if (!cliente) notFound();

  const config = await getConfig();

  const [licenca, [linhaLicenca], contratosDoCliente, faturasDoCliente, anexosDoCliente, timeline] =
    await Promise.all([
      statusDeCliente(id),
      db.select().from(licencas).where(eq(licencas.clienteId, id)),
      db.select().from(contratos).where(eq(contratos.clienteId, id)).orderBy(desc(contratos.criadoEm)),
      db
        .select()
        .from(faturas)
        .where(eq(faturas.clienteId, id))
        .orderBy(desc(faturas.competencia))
        .limit(12),
      db.select().from(anexos).where(eq(anexos.clienteId, id)).orderBy(desc(anexos.criadoEm)),
      db
        .select()
        .from(auditoria)
        .where(
          or(
            and(eq(auditoria.entidade, "cliente"), eq(auditoria.entidadeId, id)),
            and(eq(auditoria.entidade, "licenca"), eq(auditoria.entidadeId, id)),
            and(eq(auditoria.entidade, "anexo"), eq(auditoria.entidadeId, id)),
            // eventos financeiros carregam o cliente nos detalhes
            sql`${auditoria.detalhes} ->> 'clienteId' = ${id}`
          )
        )
        .orderBy(desc(auditoria.criadoEm))
        .limit(30),
    ]);

  // URLs assinadas geradas aqui (server component), nunca via action exposta
  const anexosComUrl = pode(perfil, "contratos.ver")
    ? await Promise.all(
        anexosDoCliente.map(async (a) => {
          const { data } = await supabaseAdmin()
            .storage.from("contratos")
            .createSignedUrl(a.caminhoStorage, 60 * 10);
          return { ...a, url: data?.signedUrl ?? null };
        })
      )
    : [];

  const acaoConfianca = concederConfianca.bind(null, id);
  const acaoBloquear = bloquearManual.bind(null, id);
  const acaoDesbloquear = desbloquearManual.bind(null, id);
  const acaoArquivar = arquivarCliente.bind(null, id);
  const acaoAnexo = enviarAnexo.bind(null, id);

  const veContratos = pode(perfil, "contratos.ver");
  const veFinanceiro = pode(perfil, "financeiro.ver");
  const veServidores = pode(perfil, "servidores.ver");

  const servidoresDoCliente = veServidores
    ? await db.select().from(servidores).where(eq(servidores.clienteId, id))
    : [];

  return (
    <>
      <PageHeader
        trilha="clientes / 360"
        titulo={cliente.nome}
        descricao={
          [cliente.razaoSocial, cliente.documento && mascararDocumento(cliente.documento)]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        acoes={
          <>
            {cliente.status === "arquivado" ? (
              <span className="rv-eyebrow rounded-full border border-white/12 px-3 py-1.5">
                arquivado
              </span>
            ) : null}
            {pode(perfil, "clientes.editar") ? (
              <Btn asChild>
                <Link href={`/painel/clientes/${id}/editar`}>
                  <Pencil className="size-4" /> Editar
                </Link>
              </Btn>
            ) : null}
            {pode(perfil, "clientes.arquivar") ? (
              <form action={acaoArquivar}>
                <Btn type="submit" variante="fantasma">
                  {cliente.status === "ativo" ? (
                    <>
                      <Archive className="size-4" /> Arquivar
                    </>
                  ) : (
                    <>
                      <ArchiveRestore className="size-4" /> Reativar
                    </>
                  )}
                </Btn>
              </form>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Coluna 1: licença + contato */}
        <div className="rv-entrar-1 space-y-4">
          {pode(perfil, "licencas.ver") ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base text-white">
                  Licença
                  <StatusBadge status={licenca.status} simulacao={config.modoSimulacao} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                    <div className="rv-eyebrow">válida até</div>
                    <div className="rv-num mt-1.5 text-white/90">
                      {licenca.venceEm ? formatarDataBR(licenca.venceEm) : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                    <div className="rv-eyebrow">tolerada até</div>
                    <div className="rv-num mt-1.5 text-white/90">
                      {licenca.toleradoAte ? formatarDataBR(licenca.toleradoAte) : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                    <div className="rv-eyebrow">confiança</div>
                    <div className="rv-num mt-1.5 text-white/90">
                      {linhaLicenca?.diasConfianca ?? 0} dia(s)
                    </div>
                  </div>
                  {linhaLicenca?.bloqueioManual ? (
                    <div className="col-span-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3">
                      <div className="rv-eyebrow text-red-300/70">bloqueio manual</div>
                      <div className="mt-1.5 text-red-200">{linhaLicenca.bloqueioMotivo}</div>
                    </div>
                  ) : null}
                </div>

                <AcoesLicenca
                  podeConfianca={pode(perfil, "licencas.conceder_confianca")}
                  podeBloquear={pode(perfil, "licencas.bloquear")}
                  podeDesbloquear={pode(perfil, "licencas.desbloquear")}
                  bloqueadoManual={linhaLicenca?.bloqueioManual ?? false}
                  diasConfianca={linhaLicenca?.diasConfianca ?? 0}
                  maxDias={config.maxDiasConfianca}
                  ehDono={perfil.todasPermissoes}
                  acaoConfianca={acaoConfianca}
                  acaoBloquear={acaoBloquear}
                  acaoDesbloquear={acaoDesbloquear}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base text-white">Contato</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2.5 text-white/75">
                <Mail className="size-3.5 shrink-0 text-white/30" />
                {cliente.email ?? <span className="text-white/30">sem email</span>}
              </div>
              <div className="flex items-center gap-2.5 text-white/75">
                <Phone className="size-3.5 shrink-0 text-white/30" />
                <span className="rv-num">
                  {cliente.telefone ? (
                    mascararTelefone(cliente.telefone)
                  ) : (
                    <span className="font-sans text-white/30">sem telefone</span>
                  )}
                </span>
              </div>
              {cliente.notas ? (
                <p className="border-t border-white/8 pt-2.5 text-white/50">{cliente.notas}</p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Coluna 2: contratos + faturas */}
        <div className="rv-entrar-2 space-y-4">
          {veContratos ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base text-white">
                  Contratos
                  {pode(perfil, "contratos.criar") ? (
                    <Btn asChild tamanho="sm">
                      <Link href={`/painel/contratos/novo?cliente=${id}`}>
                        <Plus className="size-3.5" /> Novo
                      </Link>
                    </Btn>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {contratosDoCliente.length === 0 ? (
                  <p className="text-sm text-white/40">Nenhum contrato.</p>
                ) : (
                  contratosDoCliente.map((c) => (
                    <Link
                      key={c.id}
                      href={`/painel/contratos/${c.id}`}
                      className="group block rounded-xl border border-white/8 bg-black/25 p-3.5 transition-all hover:border-[rgba(0,229,255,0.25)] hover:bg-black/35"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-white">{c.titulo}</span>
                        <span
                          className={`rv-eyebrow ${
                            c.status === "ativo" ? "!text-[#7DFFC4]" : "!text-white/30"
                          }`}
                        >
                          {c.status === "ativo" ? "ativo" : "encerrado"}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-xs text-white/45">
                          {c.tipo === "recorrente"
                            ? `Recorrente · vence dia ${c.diaVencimento}`
                            : "Fechado"}
                        </span>
                        <ArrowUpRight className="size-3.5 text-white/20 transition-colors group-hover:text-[#8AF0FF]" />
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}

          {veFinanceiro ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-white">Últimas faturas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {faturasDoCliente.length === 0 ? (
                  <p className="text-sm text-white/40">Nenhuma fatura.</p>
                ) : (
                  faturasDoCliente.map((f) => (
                    <Link
                      key={f.id}
                      href={`/painel/financeiro/faturas/${f.id}`}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-white/[0.04]"
                    >
                      <span className="rv-num text-white/75">
                        {formatarCompetenciaBR(f.competencia)}
                        {f.historica ? (
                          <span className="ml-1.5 font-sans text-xs text-white/30">hist.</span>
                        ) : null}
                      </span>
                      <span className="rv-num text-white/55">{formatarReais(f.valorCentavos)}</span>
                      <span
                        className={`rv-eyebrow ${
                          f.status === "quitada"
                            ? "!text-[#7DFFC4]"
                            : f.status === "cancelada"
                              ? "!text-white/25"
                              : "!text-[#FFD58A]"
                        }`}
                      >
                        {f.status === "quitada"
                          ? "quitada"
                          : f.status === "cancelada"
                            ? "cancelada"
                            : "aberta"}
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Coluna 3: servidores + anexos + timeline */}
        <div className="rv-entrar-3 space-y-4">
          {veServidores ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base text-white">
                  Servidores
                  {pode(perfil, "servidores.cadastrar") ? (
                    <Btn asChild tamanho="sm">
                      <Link href={`/painel/servidores/novo?cliente=${id}`}>
                        <Plus className="size-3.5" /> Novo
                      </Link>
                    </Btn>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {servidoresDoCliente.length === 0 ? (
                  <p className="text-sm text-white/40">Nenhum servidor.</p>
                ) : (
                  servidoresDoCliente.map((s) => (
                    <Link
                      key={s.id}
                      href={`/painel/servidores/${s.id}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/25 p-3 transition-colors hover:bg-black/35"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-white">{s.nome}</span>
                        {s.host ? <span className="rv-num block text-xs text-white/40">{s.host}</span> : null}
                      </span>
                      <BadgeServidor
                        status={statusAgora({ status: s.status, ultimoContatoEm: s.ultimoContatoEm })}
                      />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}

          {veContratos ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-white">Anexos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {anexosComUrl.length === 0 ? (
                  <p className="text-sm text-white/40">Nenhum anexo.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {anexosComUrl.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <FileText className="size-3.5 shrink-0 text-white/30" />
                          {a.url ? (
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate text-[#8AF0FF] hover:underline"
                            >
                              {a.nomeArquivo}
                            </a>
                          ) : (
                            <span className="truncate text-white/60">{a.nomeArquivo}</span>
                          )}
                        </span>
                        {pode(perfil, "contratos.editar") ? (
                          <form action={removerAnexo.bind(null, a.id)}>
                            <button
                              type="submit"
                              className="text-xs text-white/30 transition-colors hover:text-red-300"
                              aria-label={`Remover ${a.nomeArquivo}`}
                            >
                              remover
                            </button>
                          </form>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {pode(perfil, "contratos.editar") ? <FormAnexo acao={acaoAnexo} /> : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base text-white">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-white/40">Nada registrado ainda.</p>
              ) : (
                <ul className="space-y-3">
                  {timeline.map((t) => (
                    <li
                      key={t.id}
                      className="relative border-l border-white/10 pl-4 before:absolute before:-left-[3px] before:top-1.5 before:size-[5px] before:rounded-full before:bg-[rgba(0,229,255,0.6)]"
                    >
                      <div className="text-sm text-white/80">{t.acao.replace(/[._]/g, " ")}</div>
                      <div className="rv-num mt-0.5 text-[11px] text-white/35">
                        {t.atorNome} · {formatarDataHoraBR(t.criadoEm)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
