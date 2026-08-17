import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, or } from "drizzle-orm";
import { Pencil, Plus } from "lucide-react";

import { db, anexos, auditoria, clientes, contratos, faturas, licencas } from "@/lib/db";
import { exigirPermissao, pode } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { statusDeCliente } from "@/lib/consultas/licencas";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  arquivarCliente,
  bloquearManual,
  concederConfianca,
  desbloquearManual,
} from "@/app/painel/clientes/actions";
import { enviarAnexo, removerAnexo } from "./anexos-actions";
import { PageHeader } from "@/components/painel/page-header";
import { StatusBadge } from "@/components/painel/status-badge";
import { AcoesLicenca } from "@/components/painel/card-licenca";
import { FormAnexo } from "@/components/painel/form-anexo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarReais, formatarDataHoraBR } from "@/lib/formato";
import { formatarCompetenciaBR, formatarDataBR } from "@/lib/dominio/tempo";

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
            and(eq(auditoria.entidade, "anexo"), eq(auditoria.entidadeId, id))
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

  return (
    <>
      <PageHeader
        titulo={cliente.nome}
        descricao={[cliente.razaoSocial, cliente.documento].filter(Boolean).join(" · ") || undefined}
        acoes={
          <>
            {cliente.status === "arquivado" ? (
              <Badge className="border-white/15 bg-white/5 text-white/55">Arquivado</Badge>
            ) : null}
            {pode(perfil, "clientes.editar") ? (
              <Button
                asChild
                variant="secondary"
                className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                <Link href={`/painel/clientes/${id}/editar`}>
                  <Pencil className="h-4 w-4" /> Editar
                </Link>
              </Button>
            ) : null}
            {pode(perfil, "clientes.arquivar") ? (
              <form action={acaoArquivar}>
                <Button
                  type="submit"
                  variant="secondary"
                  className="rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                >
                  {cliente.status === "ativo" ? "Arquivar" : "Reativar"}
                </Button>
              </form>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Coluna 1: licença + cadastro */}
        <div className="space-y-4">
          {pode(perfil, "licencas.ver") ? (
            <Card className="rounded-2xl border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base text-white">
                  Licença
                  <StatusBadge status={licenca.status} simulacao={config.modoSimulacao} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs text-white/45">Válida até</div>
                    <div className="text-white/85">
                      {licenca.venceEm ? formatarDataBR(licenca.venceEm) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/45">Tolerada até</div>
                    <div className="text-white/85">
                      {licenca.toleradoAte ? formatarDataBR(licenca.toleradoAte) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/45">Dias de confiança</div>
                    <div className="text-white/85">{linhaLicenca?.diasConfianca ?? 0}</div>
                  </div>
                  {linhaLicenca?.bloqueioManual ? (
                    <div className="col-span-2">
                      <div className="text-xs text-red-300/70">Bloqueio manual</div>
                      <div className="text-red-200">{linhaLicenca.bloqueioMotivo}</div>
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

          <Card className="rounded-2xl border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-base text-white">Contato</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm text-white/75">
              <div>{cliente.email ?? "— sem email —"}</div>
              <div>{cliente.telefone ?? "— sem telefone —"}</div>
              {cliente.notas ? (
                <p className="mt-2 border-t border-white/10 pt-2 text-white/55">{cliente.notas}</p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Coluna 2: contratos + faturas */}
        <div className="space-y-4">
          {veContratos ? (
            <Card className="rounded-2xl border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base text-white">
                  Contratos
                  {pode(perfil, "contratos.criar") ? (
                    <Button
                      asChild
                      size="sm"
                      variant="secondary"
                      className="rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10"
                    >
                      <Link href={`/painel/contratos/novo?cliente=${id}`}>
                        <Plus className="h-3.5 w-3.5" /> Novo
                      </Link>
                    </Button>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {contratosDoCliente.length === 0 ? (
                  <p className="text-sm text-white/45">Nenhum contrato.</p>
                ) : (
                  contratosDoCliente.map((c) => (
                    <Link
                      key={c.id}
                      href={`/painel/contratos/${c.id}`}
                      className="block rounded-xl border border-white/10 bg-black/20 p-3 transition-colors hover:bg-black/30"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-white">{c.titulo}</span>
                        <span
                          className={`text-xs ${c.status === "ativo" ? "text-emerald-300" : "text-white/40"}`}
                        >
                          {c.status === "ativo" ? "Ativo" : "Encerrado"}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-white/50">
                        {c.tipo === "recorrente"
                          ? `Recorrente · vence dia ${c.diaVencimento}`
                          : "Fechado"}
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}

          {veFinanceiro ? (
            <Card className="rounded-2xl border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="text-base text-white">Últimas faturas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {faturasDoCliente.length === 0 ? (
                  <p className="text-sm text-white/45">Nenhuma fatura.</p>
                ) : (
                  faturasDoCliente.map((f) => (
                    <Link
                      key={f.id}
                      href={`/painel/financeiro/faturas/${f.id}`}
                      className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-white/5"
                    >
                      <span className="text-white/75">
                        {formatarCompetenciaBR(f.competencia)}
                        {f.historica ? <span className="ml-1 text-xs text-white/35">(hist.)</span> : null}
                      </span>
                      <span className="text-white/60">{formatarReais(f.valorCentavos)}</span>
                      <span
                        className={
                          f.status === "quitada"
                            ? "text-xs text-emerald-300"
                            : f.status === "cancelada"
                              ? "text-xs text-white/35"
                              : "text-xs text-amber-300"
                        }
                      >
                        {f.status === "quitada" ? "Quitada" : f.status === "cancelada" ? "Cancelada" : "Aberta"}
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Coluna 3: anexos + timeline */}
        <div className="space-y-4">
          {veContratos ? (
            <Card className="rounded-2xl border-white/10 bg-white/5">
              <CardHeader>
                <CardTitle className="text-base text-white">Anexos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {anexosComUrl.length === 0 ? (
                  <p className="text-sm text-white/45">Nenhum anexo.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {anexosComUrl.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2">
                        {a.url ? (
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-cyan-200 hover:underline"
                          >
                            {a.nomeArquivo}
                          </a>
                        ) : (
                          <span className="truncate text-white/60">{a.nomeArquivo}</span>
                        )}
                        {pode(perfil, "contratos.editar") ? (
                          <form action={removerAnexo.bind(null, a.id)}>
                            <button
                              type="submit"
                              className="text-xs text-white/35 hover:text-red-300"
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

          <Card className="rounded-2xl border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-base text-white">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-white/45">Nada registrado ainda.</p>
              ) : (
                <ul className="space-y-2.5">
                  {timeline.map((t) => (
                    <li key={t.id} className="border-l-2 border-white/10 pl-3 text-sm">
                      <div className="text-white/80">{t.acao.replace(/[._]/g, " ")}</div>
                      <div className="text-xs text-white/40">
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
