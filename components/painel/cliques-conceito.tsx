import { MousePointerClick, ExternalLink, Phone } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  agruparPorSessao,
  dominioDoDestino,
  maisClicados,
  type CliqueConceito,
} from "@/lib/dominio/cliques-conceito";

function quando(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

function hora(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

/**
 * O que o prospect clicou dentro do conceito, sessão por sessão.
 *
 * A abertura diz que entrou; isto diz o que foi ver. "Book a free
 * consultation" e o chat pesam mais que dez cliques no menu, e é isso que
 * muda o tom do follow-up.
 */
export function CardCliquesConceito({ cliques }: { cliques: CliqueConceito[] }) {
  const sessoes = agruparPorSessao(cliques);
  const top = maisClicados(cliques, 5);
  const pessoas = new Set(cliques.map((c) => c.visitante)).size;

  return (
    <Card className="border-[rgba(0,229,255,0.18)] bg-[rgba(0,229,255,0.03)]">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base text-white">
          <MousePointerClick className="size-4 text-[#8AF0FF]" />
          Navegação no conceito
          {cliques.length > 0 ? (
            <span className="text-xs font-normal text-white/35">
              {cliques.length} {cliques.length === 1 ? "clique" : "cliques"} · {pessoas}{" "}
              {pessoas === 1 ? "pessoa" : "pessoas"}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {cliques.length === 0 ? (
          <p className="text-sm text-white/45">
            Ninguém clicou em nada ainda. Cada clique em link, botão ou aba do conceito aparece
            aqui e chega no Telegram na hora, em lote de alguns segundos.
          </p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-1.5">
              {top.map((t) => (
                <li
                  key={t.rotulo}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/70"
                  title={`${t.vezes}x · ${t.pessoas} ${t.pessoas === 1 ? "pessoa" : "pessoas"}`}
                >
                  {t.rotulo} <span className="rv-num text-white/35">{t.vezes}x</span>
                </li>
              ))}
            </ul>

            <ul className="space-y-3 border-t border-white/8 pt-4">
              {sessoes.slice(0, 8).map((s) => (
                <li key={s.sessao} className="text-sm">
                  <div className="rv-num text-white/75">
                    {quando(s.primeiro)}{" "}
                    <span className="text-xs text-white/35">
                      · {s.cliques.length} {s.cliques.length === 1 ? "clique" : "cliques"}
                    </span>
                  </div>
                  <ol className="mt-1.5 space-y-1 border-l border-white/10 pl-3">
                    {s.cliques.map((c) => {
                      const dominio = dominioDoDestino(c.destino);
                      const liga = c.destino?.startsWith("tel:");
                      return (
                        <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 text-white/60">
                          <span className="rv-num text-xs text-white/30">{hora(c.quando)}</span>
                          <span className="text-white/80">{c.rotulo}</span>
                          {c.secao ? <span className="text-xs text-white/35">[{c.secao}]</span> : null}
                          {liga ? (
                            <span className="inline-flex items-center gap-1 text-xs text-[#8CFFC4]">
                              <Phone className="size-3" /> ligar
                            </span>
                          ) : dominio ? (
                            <span className="inline-flex items-center gap-1 text-xs text-[#8AF0FF]">
                              <ExternalLink className="size-3" /> {dominio}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ul>

            {sessoes.length > 8 ? (
              <p className="text-xs text-white/30">mostrando as 8 sessões mais recentes de {sessoes.length}</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
