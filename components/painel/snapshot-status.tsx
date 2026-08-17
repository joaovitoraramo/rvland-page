import { formatarDataHoraBR } from "@/lib/formato";

/**
 * Formata a saída de `systemctl status` num bloco de terminal com um badge de
 * estado (active/inactive/failed) extraído da linha "Active:".
 */
export function SnapshotStatus({ texto, quando }: { texto: string; quando: Date }) {
  const linhas = texto.replace(/\r/g, "").split("\n");
  const titulo = (linhas[0] ?? "").replace(/^[●○*]\s*/, "").trim();
  const linhaActive = linhas.find((l) => l.trim().startsWith("Active:")) ?? "";
  const estado = /Active:\s*(\S+)/.exec(linhaActive)?.[1] ?? "";

  const cor =
    estado === "active"
      ? { dot: "#00FF8A", texto: "#7DFFC4", rotulo: linhaActive.replace(/^\s*Active:\s*/, "") }
      : estado === "failed"
        ? { dot: "#FF5D5D", texto: "#FF9D9D", rotulo: linhaActive.replace(/^\s*Active:\s*/, "") }
        : { dot: "#FFC24D", texto: "#FFD58A", rotulo: linhaActive.replace(/^\s*Active:\s*/, "") || "—" };

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/50">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/8 px-3 py-2">
        <span className="size-2 shrink-0 rounded-full" style={{ background: cor.dot, boxShadow: `0 0 8px ${cor.dot}` }} />
        <span className="rv-num min-w-0 flex-1 truncate text-xs text-white/80">{titulo || "systemctl status"}</span>
        <span className="rv-num shrink-0 text-[11px]" style={{ color: cor.texto }}>
          {cor.rotulo}
        </span>
        <span className="rv-num shrink-0 text-[11px] text-white/30">{formatarDataHoraBR(quando)}</span>
      </div>
      <pre className="max-h-64 overflow-auto px-3 py-2.5 font-mono text-[11px] leading-relaxed text-white/70">
        {texto.trim()}
      </pre>
    </div>
  );
}
