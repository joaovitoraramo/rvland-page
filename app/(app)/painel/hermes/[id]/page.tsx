import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Server, ShieldAlert, User } from "lucide-react";

import { exigirPermissao, pode } from "@/lib/auth";
import { depsLeituraPainel } from "@/lib/servicos/hermes-painel-runtime";
import { detalheInstalacaoPainel } from "@/lib/servicos/hermes-painel";
import { formatarDataHoraBR } from "@/lib/formato";
import { formatarCnpj, formatarDataCivil } from "@/lib/hermes/painel";
import { PageHeader } from "@/components/painel/page-header";
import { BadgeServidor } from "@/components/painel/badge-servidor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BadgeCanalHermes,
  BadgeChaveHermes,
  BadgeCloneHermes,
  BadgeInstalacaoHermes,
  BadgeLicencaHermes,
  BadgeModoHermes,
  BadgeSaudeHermes,
} from "@/components/painel/hermes/badges-hermes";
import { AtualizacaoHermes, SeletorCanalHermes } from "@/components/painel/hermes/controles-instalacao-hermes";
import { fixarVersaoAgenteHermes, forcarAtualizacaoContainerHermes, trocarCanalHermes } from "../actions";

export const metadata = { title: "Instalação Hermes" };

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/5 py-2 last:border-0">
      <dt className="rv-eyebrow shrink-0">{rotulo}</dt>
      <dd className="min-w-0 truncate text-right text-sm text-white/80">{children}</dd>
    </div>
  );
}

const MOTIVO_CLONE: Record<string, string> = {
  boot_alternando: "boot_id voltou a um valor anterior (X, Y, X)",
  syncs_excessivos: "mais de 2 contatos em 60 segundos",
  machine_id_trocado: "o machine-id mudou entre contatos",
  replay_assinado: "pedidos assinados repetidos (replay)",
};

export default async function PaginaInstalacaoHermes({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await exigirPermissao("servidores.ver");
  const { id } = await params;
  const d = await detalheInstalacaoPainel(id, depsLeituraPainel);
  if (!d) notFound();
  const { linha: l } = d;
  const lic = l.licenca;
  const digestCurto = l.digest ? `${l.digest.slice(0, 14)}…` : "—";

  return (
    <>
      <PageHeader
        trilha={`hermes / ${l.nome.toLowerCase()}`}
        titulo={l.nome}
        descricao={[l.clienteNome, l.cnpj ? formatarCnpj(l.cnpj) : null].filter(Boolean).join(" · ")}
        acoes={
          <>
            <BadgeInstalacaoHermes status={l.status} />
            <BadgeLicencaHermes status={lic.status} />
            <BadgeModoHermes modo={lic.modo} />
          </>
        }
      />

      <div className="rv-entrar mb-4 flex flex-wrap items-center gap-2">
        <Link
          href="/painel/hermes"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white/70 transition-colors hover:text-white"
        >
          Todas as instalações
        </Link>
        <Link
          href={`/painel/clientes/${l.clienteId}`}
          className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-2.5 pr-3 text-sm text-white/80 transition-colors hover:border-[rgba(0,229,255,0.3)] hover:text-white"
        >
          <User className="size-3.5 text-white/40 group-hover:text-[#8AF0FF]" />
          {l.clienteNome}
          <ArrowUpRight className="size-3 text-white/30 group-hover:text-[#8AF0FF]" />
        </Link>
        {l.servidorId ? (
          <Link
            href={`/painel/servidores/${l.servidorId}`}
            className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-2.5 pr-3 text-sm text-white/80 transition-colors hover:border-[rgba(0,229,255,0.3)] hover:text-white"
          >
            <Server className="size-3.5 text-white/40 group-hover:text-[#8AF0FF]" />
            {l.servidorNome}
            <ArrowUpRight className="size-3 text-white/30 group-hover:text-[#8AF0FF]" />
          </Link>
        ) : null}
      </div>

      {l.cloneSuspeitoEm ? (
        <section className="rv-entrar-1 mb-4 rounded-2xl border border-red-500/30 bg-red-500/[0.07] px-4 py-4 md:px-5" aria-labelledby="alerta-clone">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-200">
              <ShieldAlert className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 id="alerta-clone" className="flex flex-wrap items-center gap-2 text-sm font-semibold text-red-100">
                Possível clone desta instalação <BadgeCloneHermes />
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-red-100/70">
                Primeiro sinal em {formatarDataHoraBR(new Date(l.cloneSuspeitoEm))}. O sistema só alerta, nada foi bloqueado: confira com o cliente e, se for o caso, aplique o bloqueio manual no cadastro de licença.
              </p>
              {d.alertasClone.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {d.alertasClone.map((a) => (
                    <li key={a.id} className="rv-num text-xs text-red-100/80">
                      {formatarDataHoraBR(new Date(a.em))} — {a.motivo ? (MOTIVO_CLONE[a.motivo] ?? a.motivo) : "motivo não registrado"}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <div className="rv-entrar-1 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-white">Licença</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <Dado rotulo="situação">
                <BadgeLicencaHermes status={lic.status} />
              </Dado>
              <Dado rotulo="modo">
                <BadgeModoHermes modo={lic.modo} />
              </Dado>
              <Dado rotulo="bloqueio">
                {lic.bloqueante ? (lic.modo === "valendo" ? "bloqueando agora" : "bloquearia (simulação)") : lic.panico ? "suspenso (pânico)" : "não bloqueia"}
              </Dado>
              <Dado rotulo="vence em">{formatarDataCivil(lic.expiraEm)}</Dado>
              <Dado rotulo="carência até">{formatarDataCivil(lic.carenciaAte)}</Dado>
              <Dado rotulo="origem">{lic.origem.replace(/_/g, " ")}</Dado>
              <Dado rotulo="exceção da instalação">{l.enforcement === "simular" ? "sempre simula" : "herda o modo global"}</Dado>
            </dl>
            {lic.aviso ? <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-xs leading-relaxed text-[#FFD58A]">{lic.aviso}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-white">Container e saúde</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <Dado rotulo="servidor">{l.statusServidor ? <BadgeServidor status={l.statusServidor} /> : "sem servidor"}</Dado>
              <Dado rotulo="último contato">{l.ultimoContatoEm ? formatarDataHoraBR(new Date(l.ultimoContatoEm)) : "nunca"}</Dado>
              <Dado rotulo="container">
                <BadgeSaudeHermes container={l.saude.container} saude={l.saude.saude} />
              </Dado>
              <Dado rotulo="versão">
                <span className="rv-num">{l.versao ?? "—"}</span>
              </Dado>
              <Dado rotulo="digest">
                <span className="rv-num">{digestCurto}</span>
              </Dado>
              <Dado rotulo="agente RV">
                <span className="rv-num">{l.agenteVersao ?? "—"}</span>
              </Dado>
              <Dado rotulo="relógio do servidor">{l.saude.relogioConfiavel === null ? "sem leitura" : l.saude.relogioConfiavel ? "confiável" : "não confiável"}</Dado>
              <Dado rotulo="chave real no Hermes">{l.chaveConfigurada === null ? "agente não informa" : l.chaveConfigurada ? "sim" : "não"}</Dado>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="rv-entrar-2 mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base text-white">
              Canal
              <BadgeCanalHermes canal={l.canal} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SeletorCanalHermes instalacaoId={l.id} canal={l.canal} podeEditar={pode(perfil, "servidores.cadastrar") && l.status !== "revogada" && l.status !== "desinstalada"} acao={trocarCanalHermes} />
            <p className="rv-num mt-3 text-[11px] text-white/35">em uso no container: {l.canalEmUso ?? "sem leitura"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-white">Atualização</CardTitle>
          </CardHeader>
          <CardContent>
            <AtualizacaoHermes
              instalacaoId={l.id}
              versaoAlvo={d.versaoAlvoAgente}
              versoes={d.versoesAgente}
              agenteVersao={l.agenteVersao}
              semServidor={!l.servidorId}
              podeForcar={pode(perfil, "agente.forcar_update") && l.status !== "revogada" && l.status !== "desinstalada"}
              acaoAgente={fixarVersaoAgenteHermes}
              acaoContainer={forcarAtualizacaoContainerHermes}
            />
          </CardContent>
        </Card>
      </div>

      <div className="rv-entrar-3 mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-white">Eventos recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {d.eventos.length === 0 ? (
              <p className="text-sm text-white/40">Nada registrado.</p>
            ) : (
              <ul className="space-y-3">
                {d.eventos.slice(0, 15).map((e) => (
                  <li
                    key={e.id}
                    className="border-l pl-4"
                    style={{ borderColor: e.severidade === "critico" ? "rgba(255,93,93,0.5)" : e.severidade === "aviso" ? "rgba(255,194,77,0.5)" : "rgba(255,255,255,0.12)" }}
                  >
                    <div className="text-sm text-white/80">{e.mensagem}</div>
                    <div className="rv-num mt-0.5 text-[11px] text-white/35">
                      {e.tipo.replace(/_/g, " ")} · {formatarDataHoraBR(new Date(e.criadoEm))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-white">Chaves desta instalação</CardTitle>
          </CardHeader>
          <CardContent>
            {d.chaves.length === 0 ? (
              <p className="text-sm text-white/40">Nenhuma chave ligada a esta instalação.</p>
            ) : (
              <ul className="space-y-2.5">
                {d.chaves.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2.5">
                    <span className="rv-num text-sm text-white/80">{c.prefixo}…</span>
                    <span className="flex items-center gap-2">
                      <span className="rv-eyebrow">{c.tipo === "adocao" ? "adoção" : "instalação"}</span>
                      <BadgeChaveHermes situacao={c.situacao} />
                    </span>
                    <span className="rv-num w-full text-[11px] text-white/35">emitida por {c.criadoPor} em {formatarDataHoraBR(new Date(c.criadoEm))}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
