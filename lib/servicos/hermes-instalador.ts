import { chaveDeIp, type RespostaHttp } from "./hermes-http";
import { consumirLimite, UMA_HORA_MS, type RepoLimites } from "./hermes-limite";
import type { DepsEfeitos } from "./hermes-tipos";

export type ArchInstalador = "amd64" | "arm64";

/** Release publicada do instalador (configuracoes.hermes_instalador; escrita pelo script de publicação). */
export type ReleaseInstalador = {
  versao: string;
  binarios: Partial<Record<ArchInstalador, { caminho: string; sha256: string }>>;
};

export const CHAVE_CONFIG_INSTALADOR = "hermes_instalador";

/** Lê o valor de `configuracoes.hermes_instalador`; null se ausente ou incompleto. */
export function parseReleaseInstalador(valor: unknown): ReleaseInstalador | null {
  const v = valor as { versao?: unknown; binarios?: Record<string, { caminho?: unknown; sha256?: unknown } | undefined> } | undefined;
  if (!v || typeof v.versao !== "string" || !v.versao || !v.binarios || typeof v.binarios !== "object") return null;
  const binarios: ReleaseInstalador["binarios"] = {};
  for (const arch of ["amd64", "arm64"] as const) {
    const b = v.binarios[arch];
    if (b && typeof b.caminho === "string" && b.caminho && typeof b.sha256 === "string" && /^[0-9a-f]{64}$/.test(b.sha256)) {
      binarios[arch] = { caminho: b.caminho, sha256: b.sha256 };
    }
  }
  return Object.keys(binarios).length ? { versao: v.versao, binarios } : null;
}

export const BUCKET_INSTALADOR = "hermes-instalador";
export const VALIDADE_URL_INSTALADOR_SEG = 60;
export const LIMITE_INSTALADOR_POR_HORA = 60;
export const LIMITE_META_POR_HORA = 120;

export interface DepsInstalador extends Pick<DepsEfeitos, "agora"> {
  limites: RepoLimites;
  releaseInstalador(): Promise<ReleaseInstalador | null>;
  /** URL assinada do Storage (bucket `hermes-instalador`); null se indisponível. */
  urlAssinada(caminho: string, segundos: number): Promise<string | null>;
}

const SEM_RELEASE: RespostaHttp = { status: 404, corpo: { erro: "SEM_RELEASE" } };
const LIMITE: RespostaHttp = { status: 429, corpo: { erro: "LIMITE" }, headers: { "retry-after": "3600" } };

function parseArch(v: string | null): ArchInstalador | null {
  return v === "amd64" || v === "arm64" ? v : null;
}

/** GET /api/hermes/instalador?arch= — 302 para URL assinada de 60 s. O binário não é segredo (release assinada). */
export async function entregarInstalador(archParam: string | null, ip: string, deps: DepsInstalador): Promise<RespostaHttp> {
  const arch = parseArch(archParam);
  if (!arch) return { status: 400, corpo: { erro: "ARCH_INVALIDA" } };

  const agora = deps.agora();
  const lim = await consumirLimite(deps.limites, chaveDeIp("inst", ip), LIMITE_INSTALADOR_POR_HORA, UMA_HORA_MS, agora);
  if (!lim.permitido) return LIMITE;

  const rel = await deps.releaseInstalador();
  const bin = rel?.binarios[arch];
  if (!rel || !bin) return SEM_RELEASE;

  const url = await deps.urlAssinada(bin.caminho, VALIDADE_URL_INSTALADOR_SEG);
  if (!url) return SEM_RELEASE;

  return {
    status: 302,
    redirecionar: url,
    headers: { "x-sha256": bin.sha256, "x-versao": rel.versao, "cache-control": "no-store" },
  };
}

/** GET /api/hermes/instalador/meta — versão e sha256 por arquitetura (sem caminhos do Storage). */
export async function metaInstalador(ip: string, deps: DepsInstalador): Promise<RespostaHttp> {
  const lim = await consumirLimite(deps.limites, chaveDeIp("instmeta", ip), LIMITE_META_POR_HORA, UMA_HORA_MS, deps.agora());
  if (!lim.permitido) return LIMITE;

  const rel = await deps.releaseInstalador();
  if (!rel) return SEM_RELEASE;
  const binarios: Record<string, { sha256: string }> = {};
  for (const [arch, b] of Object.entries(rel.binarios)) if (b) binarios[arch] = { sha256: b.sha256 };
  if (Object.keys(binarios).length === 0) return SEM_RELEASE;
  return { status: 200, corpo: { versao: rel.versao, binarios }, headers: { "cache-control": "no-store" } };
}
