import { Download, ExternalLink, Palette, Sparkle, Type } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConceitoProspect } from "@/lib/db";
import { formatarDataBR } from "@/lib/dominio/tempo";

/**
 * Design system do conceito enviado ao prospect. Existe para que, se ele
 * fechar, a construção continue exatamente daqui: paleta, tipografia, a ideia
 * de assinatura e a estrutura de seções ficam no registro, não na cabeça
 * de quem desenhou.
 */
export function CardConceito({
  conceito,
  arquivos,
}: {
  conceito: ConceitoProspect;
  arquivos: { rotulo: string; url: string | null }[];
}) {
  return (
    <Card className="border-[rgba(179,157,219,0.22)] bg-[rgba(179,157,219,0.05)]">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base text-white">
          <Sparkle className="size-4 text-[#D1C4E9]" />
          Conceito enviado
          <span className="rv-num text-xs font-normal text-white/35">
            {formatarDataBR(conceito.criadoEm)}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {conceito.url ? (
          <a
            href={conceito.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2.5 rounded-xl border border-[rgba(0,229,255,0.3)] bg-[rgba(0,229,255,0.09)] px-4 py-3 text-sm font-medium text-[#8AF0FF] transition-colors hover:border-[rgba(0,229,255,0.55)]"
          >
            <ExternalLink className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block">Conceito no ar</span>
              <span className="rv-num block truncate text-xs font-normal text-white/40">
                {conceito.url}
              </span>
            </span>
          </a>
        ) : null}

        {conceito.abordagem ? (
          <div className="rounded-xl border border-white/8 bg-black/20 p-4">
            <div className="rv-eyebrow mb-2">abordagem</div>
            <div className="space-y-1.5 text-sm text-white/75">
              <p>
                <span className="text-white/40">assunto:</span> {conceito.abordagem.assunto}
              </p>
              {conceito.abordagem.contato ? (
                <p>
                  <span className="text-white/40">contato:</span> {conceito.abordagem.contato}
                </p>
              ) : null}
              <p>
                <span className="text-white/40">canal:</span> {conceito.abordagem.canal}
              </p>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-white/45">
              {conceito.abordagem.gancho}
            </p>
            <p className="mt-2 text-xs text-white/30">
              Texto completo em{" "}
              <code className="rv-num text-white/50">{conceito.abordagem.arquivo}</code>
            </p>
          </div>
        ) : null}

        <div>
          <div className="rv-eyebrow mb-1.5">direção</div>
          <p className="text-sm leading-relaxed text-white/75">{conceito.direcao}</p>
        </div>

        <div>
          <div className="rv-eyebrow mb-1.5">elemento de assinatura</div>
          <p className="text-sm leading-relaxed text-white/75">{conceito.assinatura}</p>
        </div>

        <div>
          <div className="rv-eyebrow mb-2.5 flex items-center gap-1.5">
            <Palette className="size-3 text-white/35" />
            paleta
          </div>
          <div className="grid gap-1.5">
            {conceito.paleta.map((c) => (
              <div key={c.nome} className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 size-5 shrink-0 rounded border border-white/15"
                  style={{ background: c.hex }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] font-medium text-white">{c.nome}</span>
                    <span className="rv-num text-[11px] uppercase text-white/40">{c.hex}</span>
                  </span>
                  <span className="block text-xs leading-snug text-white/45">{c.uso}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="rv-eyebrow mb-2.5 flex items-center gap-1.5">
            <Type className="size-3 text-white/35" />
            tipografia
          </div>
          <div className="space-y-2">
            {conceito.tipografia.map((t) => (
              <div key={t.papel} className="rounded-lg border border-white/8 bg-black/20 p-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="rv-eyebrow">{t.papel}</span>
                  <span className="text-[13px] font-medium text-white">{t.fonte}</span>
                </div>
                <p className="mt-1 text-xs leading-snug text-white/45">{t.nota}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="rv-eyebrow mb-2">estrutura da página</div>
          <ol className="space-y-1.5">
            {conceito.secoes.map((s, i) => (
              <li key={s} className="flex gap-2.5 text-[13px] text-white/65">
                <span className="rv-num shrink-0 text-white/25">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <div className="rv-eyebrow mb-2">copy do hero</div>
          <p className="rounded-lg border border-white/8 bg-black/20 p-3 text-sm font-medium leading-snug text-white">
            {conceito.copy.titulo}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/50">{conceito.copy.subtitulo}</p>
        </div>

        <div>
          <div className="rv-eyebrow mb-2">arquivos</div>
          <div className="grid gap-1.5">
            {arquivos.map((a) =>
              a.url ? (
                <a
                  key={a.rotulo}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-white/75 transition-colors hover:border-white/25 hover:text-white"
                >
                  <Download className="size-3.5 shrink-0 text-white/40" />
                  {a.rotulo}
                </a>
              ) : (
                <span
                  key={a.rotulo}
                  className="rounded-lg border border-white/6 px-3 py-2 text-[13px] text-white/25"
                >
                  {a.rotulo} (não publicado)
                </span>
              )
            )}
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-white/35">
            Fonte editável em{" "}
            <code className="rv-num text-white/55">{conceito.fonteHtml}</code>. Se o cliente
            fechar, a construção continua deste arquivo.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
