import { formatarReais } from "@/lib/formato";
import { formatarCompetenciaBR } from "@/lib/dominio/tempo";

/**
 * Evolução do valor do contrato ao longo das vigências, em SVG puro (mesma
 * linha dos outros gráficos do painel). Degrau: o valor vale até a próxima
 * vigência começar. Em cima, o resumo de quanto o contrato sobe por mês.
 */

export type VigenciaGrafico = { vigenteDesde: string; valorCentavos: number };

function mesesEntre(a: string, b: string): number {
  const [aa, am] = a.split("-").map(Number);
  const [ba, bm] = b.split("-").map(Number);
  return (ba - aa) * 12 + (bm - am);
}

export type ResumoEvolucao = {
  meses: number;
  primeiro: VigenciaGrafico;
  ultimo: VigenciaGrafico;
  deltaCentavos: number;
  deltaPct: number;
  mediaCentavosMes: number;
  /** Taxa composta: aplicada mês a mês, leva do primeiro ao último valor. */
  mediaPctMes: number;
};

export function resumoEvolucao(vigencias: VigenciaGrafico[]): ResumoEvolucao | null {
  if (vigencias.length < 2) return null;
  const primeiro = vigencias[0];
  const ultimo = vigencias[vigencias.length - 1];
  const meses = mesesEntre(primeiro.vigenteDesde, ultimo.vigenteDesde);
  if (meses <= 0 || primeiro.valorCentavos <= 0) return null;
  const deltaCentavos = ultimo.valorCentavos - primeiro.valorCentavos;
  const razao = ultimo.valorCentavos / primeiro.valorCentavos;
  return {
    meses,
    primeiro,
    ultimo,
    deltaCentavos,
    deltaPct: (razao - 1) * 100,
    mediaCentavosMes: deltaCentavos / meses,
    mediaPctMes: (Math.pow(razao, 1 / meses) - 1) * 100,
  };
}

function pct(n: number): string {
  const s = Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${n < 0 ? "−" : "+"}${s}%`;
}

function reaisComSinal(centavos: number): string {
  return `${centavos < 0 ? "−" : "+"}${formatarReais(Math.abs(Math.round(centavos)))}`;
}

export function GraficoVigencias({ vigencias }: { vigencias: VigenciaGrafico[] }) {
  const ordenadas = [...vigencias].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde));
  if (ordenadas.length === 0) return null;

  const resumo = resumoEvolucao(ordenadas);

  // ── Escalas ──────────────────────────────────────────────
  const W = 640;
  const H = 190;
  const PAD = { topo: 26, dir: 16, base: 30, esq: 16 };
  const inicio = ordenadas[0].vigenteDesde;
  // O último degrau ganha um mês de comprimento para o valor atual aparecer como patamar.
  const totalMeses = Math.max(1, mesesEntre(inicio, ordenadas[ordenadas.length - 1].vigenteDesde) + 1);
  const valores = ordenadas.map((v) => v.valorCentavos);
  const vMin = Math.min(...valores);
  const vMax = Math.max(...valores);
  const faixa = vMax - vMin || Math.max(1, vMax * 0.2);
  const yMin = vMin - faixa * 0.35;
  const yMax = vMax + faixa * 0.35;
  const x = (meses: number) => PAD.esq + (meses / totalMeses) * (W - PAD.esq - PAD.dir);
  const y = (c: number) => PAD.topo + (1 - (c - yMin) / (yMax - yMin)) * (H - PAD.topo - PAD.base);

  const pontos = ordenadas.map((v) => ({
    ...v,
    px: x(mesesEntre(inicio, v.vigenteDesde)),
    py: y(v.valorCentavos),
  }));
  const fimX = x(totalMeses);

  // Degraus: horizontal até a próxima vigência, depois sobe/desce.
  let linha = `M ${pontos[0].px} ${pontos[0].py}`;
  pontos.forEach((p, i) => {
    const proximoX = pontos[i + 1]?.px ?? fimX;
    linha += ` H ${proximoX}`;
    if (pontos[i + 1]) linha += ` V ${pontos[i + 1].py}`;
  });
  const base = y(yMin);
  const area = `${linha} V ${base} H ${pontos[0].px} Z`;

  const subiu = (resumo?.deltaCentavos ?? 0) >= 0;
  const corResumo = subiu ? "text-[#7DFFC4]" : "text-[#FFD58A]";

  return (
    <div className="space-y-3">
      {resumo ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/8 bg-black/25 p-3">
            <div className="rv-eyebrow">por mês, em média</div>
            <div className={`rv-num mt-1.5 text-lg font-semibold ${corResumo}`}>
              {reaisComSinal(resumo.mediaCentavosMes)}
            </div>
            <div className="mt-0.5 text-xs text-white/40">
              {reaisComSinal(resumo.deltaCentavos)} em {resumo.meses} {resumo.meses === 1 ? "mês" : "meses"}
            </div>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/25 p-3">
            <div className="rv-eyebrow">ao mês</div>
            <div className={`rv-num mt-1.5 text-lg font-semibold ${corResumo}`}>{pct(resumo.mediaPctMes)}</div>
            <div className="mt-0.5 text-xs text-white/40">
              {pct(resumo.deltaPct)} de {formatarCompetenciaBR(resumo.primeiro.vigenteDesde)} a{" "}
              {formatarCompetenciaBR(resumo.ultimo.vigenteDesde)}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-white/40">
          A evolução aparece a partir da segunda vigência.
        </p>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Evolução do valor do contrato por vigência"
      >
        <defs>
          <linearGradient id="rv-vig-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Linhas-guia: mínimo e máximo */}
        {[vMin, vMax].map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.esq}
              x2={W - PAD.dir}
              y1={y(v)}
              y2={y(v)}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="3 4"
            />
          </g>
        ))}

        <path d={area} fill="url(#rv-vig-area)" />
        <path
          d={linha}
          fill="none"
          stroke="#00E5FF"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {pontos.map((p, i) => {
          const anterior = pontos[i - 1];
          const variacao = anterior ? p.valorCentavos - anterior.valorCentavos : 0;
          // Rótulo do valor acima do ponto; o último encosta na borda, então vai para a esquerda.
          const ancora = i === pontos.length - 1 && pontos.length > 1 ? "end" : i === 0 ? "start" : "middle";
          return (
            <g key={p.vigenteDesde}>
              <circle cx={p.px} cy={p.py} r={4} fill="#0A0A0A" stroke="#00E5FF" strokeWidth={2} />
              <text
                x={p.px}
                y={p.py - 10}
                textAnchor={ancora}
                className="rv-num"
                fontSize={12}
                fill="rgba(255,255,255,0.85)"
              >
                {formatarReais(p.valorCentavos)}
                {anterior ? (
                  <tspan fill={variacao >= 0 ? "#7DFFC4" : "#FFD58A"} fontSize={11}>
                    {"  "}
                    {pct(anterior.valorCentavos > 0 ? (variacao / anterior.valorCentavos) * 100 : 0)}
                  </tspan>
                ) : null}
              </text>
              <text
                x={p.px}
                y={H - 10}
                textAnchor={ancora}
                className="rv-num"
                fontSize={11}
                fill="rgba(255,255,255,0.45)"
              >
                {formatarCompetenciaBR(p.vigenteDesde)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
