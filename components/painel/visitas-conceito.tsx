import { Eye, Clock, MapPin, Smartphone, Monitor, Tablet, HelpCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  localDe,
  resumirVisitas,
  type TipoDispositivo,
  type VisitaConceito,
} from "@/lib/dominio/visitas-conceito";

const ICONE: Record<TipoDispositivo, typeof Smartphone> = {
  celular: Smartphone,
  tablet: Tablet,
  computador: Monitor,
  desconhecido: HelpCircle,
};

function tempo(segundos: number) {
  if (segundos < 60) return `${segundos}s`;
  const min = Math.floor(segundos / 60);
  if (min < 60) return `${min}min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

function quando(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

function haQuanto(data: Date, agora = new Date()) {
  const min = Math.round((agora.getTime() - data.getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

function Numero({ valor, rotulo }: { valor: string | number; rotulo: string }) {
  return (
    <div>
      <div className="rv-num text-2xl leading-none font-semibold text-white">{valor}</div>
      <div className="rv-eyebrow mt-1 text-white/40">{rotulo}</div>
    </div>
  );
}

/**
 * Quem abriu o conceito e quando.
 *
 * Existe para decidir o follow-up: quem nunca abriu precisa de outro assunto,
 * quem voltou três vezes precisa de insistência. Sem esta tela os dois casos
 * são o mesmo silêncio.
 */
export function CardVisitasConceito({ visitas }: { visitas: VisitaConceito[] }) {
  const r = resumirVisitas(visitas);

  return (
    <Card className="border-[rgba(0,229,255,0.18)] bg-[rgba(0,229,255,0.03)]">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base text-white">
          <Eye className="size-4 text-[#8AF0FF]" />
          Aberturas do conceito
          {r.ultima ? (
            <span className="text-xs font-normal text-white/35">
              última {haQuanto(r.ultima.quando)}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {r.aberturas === 0 ? (
          <p className="text-sm text-white/45">
            Ninguém abriu ainda. Varredor de link de provedor de e-mail não conta aqui, então
            este número é de gente de verdade.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Numero valor={r.aberturas} rotulo="aberturas" />
              <Numero valor={r.pessoas} rotulo={r.pessoas === 1 ? "pessoa" : "pessoas"} />
              <Numero valor={tempo(r.segundosTotais)} rotulo="lendo" />
            </div>

            {r.pessoas > 0 && r.aberturas > r.pessoas ? (
              <p className="rounded-xl border border-[rgba(0,255,138,0.25)] bg-[rgba(0,255,138,0.06)] px-3.5 py-2.5 text-sm text-[#8CFFC4]">
                Voltou ao conceito. Quem abre de novo está considerando: é a hora do
                follow-up.
              </p>
            ) : null}

            <ul className="space-y-1.5 border-t border-white/8 pt-4">
              {visitas.slice(0, 12).map((v) => {
                const Icone = ICONE[v.dispositivo];
                const onde = localDe(v);
                return (
                  <li key={v.id} className="flex items-center gap-2.5 text-sm text-white/60">
                    <Icone className="size-3.5 shrink-0 text-white/30" />
                    <span className="rv-num text-white/75">{quando(v.quando)}</span>
                    <span className="min-w-0 flex-1 truncate text-white/45">
                      {v.sistema ?? v.dispositivo}
                      {onde ? (
                        <>
                          {" · "}
                          <MapPin className="mb-0.5 inline size-3" /> {onde}
                        </>
                      ) : null}
                    </span>
                    {v.segundos > 0 ? (
                      <span className="rv-num flex shrink-0 items-center gap-1 text-xs text-white/35">
                        <Clock className="size-3" />
                        {tempo(v.segundos)}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {visitas.length > 12 ? (
              <p className="text-xs text-white/30">
                mostrando as 12 mais recentes de {visitas.length}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
