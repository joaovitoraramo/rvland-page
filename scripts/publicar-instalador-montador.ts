import { createHash } from "node:crypto";

/**
 * Montador PURO da publicação do instalador do Hermes (scripts/publicar-instalador.ts).
 * Sem efeito colateral: só monta ldflags, comandos, caminhos e o valor de
 * `configuracoes.hermes_instalador` (testado em scripts/publicar-instalador.test.ts).
 */

export const ARCHS_INSTALADOR = ["amd64", "arm64"] as const;
export type ArchInstalador = (typeof ARCHS_INSTALADOR)[number];

export const BUCKET_INSTALADOR = "hermes-instalador";
export const CHAVE_CONFIG_INSTALADOR = "hermes_instalador";

const RE_SEMVER = /^\d+\.\d+\.\d+$/;

export function versaoValida(v: string | undefined): v is string {
  return typeof v === "string" && RE_SEMVER.test(v);
}

/** https puro (sem caminho/query/credenciais): o instalador recusa qualquer outra coisa. */
export function baseValida(u: string): boolean {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && !!x.host && !x.username && !x.password && !x.search && !x.hash && (x.pathname === "/" || x.pathname === "");
  } catch {
    return false;
  }
}

// ── Ed25519: ponto válido e de ordem grande (mesma regra de agent/internal/hermesinst/prova.go) ──
const P = (BigInt(1) << BigInt(255)) - BigInt(19);
const mod = (a: bigint) => ((a % P) + P) % P;
function pot(b: bigint, e: bigint): bigint {
  let r = BigInt(1);
  b = mod(b);
  while (e > BigInt(0)) {
    if (e & BigInt(1)) r = mod(r * b);
    b = mod(b * b);
    e >>= BigInt(1);
  }
  return r;
}
const inv = (a: bigint) => pot(a, P - BigInt(2));
const D = mod(-BigInt(121665) * inv(BigInt(121666)));
const RAIZ_MENOS_1 = pot(BigInt(2), (P - BigInt(1)) / BigInt(4));

function decodificar(b: Buffer): [bigint, bigint] | null {
  const bytes = Buffer.from(b);
  const sinal = bytes[31] >> 7;
  bytes[31] &= 0x7f;
  let y = BigInt(0);
  for (let i = 31; i >= 0; i--) y = (y << BigInt(8)) | BigInt(bytes[i]);
  if (y >= P) return null;
  const y2 = mod(y * y);
  const x2 = mod((y2 - BigInt(1)) * inv(mod(D * y2 + BigInt(1))));
  let x = pot(x2, (P + BigInt(3)) / BigInt(8));
  if (mod(x * x) !== x2) {
    x = mod(x * RAIZ_MENOS_1);
    if (mod(x * x) !== x2) return null;
  }
  if (x === BigInt(0) && sinal === 1) return null;
  if (Number(x & BigInt(1)) !== sinal) x = P - x;
  return [x, y];
}

function somar([x1, y1]: [bigint, bigint], [x2, y2]: [bigint, bigint]): [bigint, bigint] {
  const t = mod(D * x1 * x2 * y1 * y2);
  return [mod((x1 * y2 + y1 * x2) * inv(mod(BigInt(1) + t))), mod((y1 * y2 + x1 * x2) * inv(mod(BigInt(1) - t)))];
}

/**
 * Chave pública Ed25519 crua (32 bytes) em base64, como chaves/release.pub: precisa ser ponto da
 * curva e NÃO ter ordem pequena ([8]P != identidade). Zeros/identidade/ordem 2-4-8 aceitariam
 * "assinatura" para qualquer binário.
 */
export function chavePublicaValida(b64: string): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(b64)) return false;
  const raw = Buffer.from(b64, "base64");
  if (raw.length !== 32) return false;
  let p = decodificar(raw);
  if (!p) return false;
  for (let i = 0; i < 3; i++) p = somar(p, p);
  return !(p[0] === BigInt(0) && p[1] === BigInt(1));
}

/**
 * Garble é obrigatório (o instalador é binário fechado): GARBLE_BIN=off falha claro (não existe
 * publicação sem ofuscação); GARBLE_BIN=<caminho> ou $GOPATH/bin/garble.
 */
export function resolverGarble(env: Record<string, string | undefined>, gopath: () => string, existe: (p: string) => boolean): string {
  if (env.GARBLE_BIN === "off") throw new Error("GARBLE_BIN=off: o instalador só é publicado ofuscado (garble obrigatório)");
  if (env.GARBLE_BIN) return env.GARBLE_BIN;
  const caminho = `${gopath()}/bin/garble`;
  if (existe(caminho)) return caminho;
  throw new Error("garble não encontrado (go install mvdan.cc/garble@v0.16.0 ou GARBLE_BIN=<caminho>)");
}

export function montarLdflags(p: { versao: string; baseURL: string; releasePub: string }): string {
  if (!versaoValida(p.versao)) throw new Error("versão deve ser X.Y.Z");
  if (!baseValida(p.baseURL)) throw new Error("URL base deve ser https://host");
  if (!chavePublicaValida(p.releasePub)) throw new Error("chave pública de release inválida (base64 de 32 bytes, ponto válido e de ordem grande)");
  const base = new URL(p.baseURL).origin;
  return ["-s", "-w", `-X main.versao=${p.versao}`, `-X main.baseURL=${base}`, `-X main.releasePK=${p.releasePub}`].join(" ");
}

export type ComandoBuild = { bin: string; args: string[]; cwd: string; env: Record<string, string> };

/** Build estático para Linux (CGO_ENABLED=0). Com garble, ofuscado como o agente. */
export function comandoBuild(p: { arch: ArchInstalador; ldflags: string; saida: string; go: string; garble: string | null }): ComandoBuild {
  const args = ["build", "-trimpath", "-ldflags", p.ldflags, "-o", p.saida, "./hermesinstalador"];
  return {
    bin: p.garble ?? p.go,
    args: p.garble ? ["-literals", "-tiny", ...args] : args,
    cwd: "agent",
    env: { GOOS: "linux", GOARCH: p.arch, CGO_ENABLED: "0" },
  };
}

export function caminhoStorage(versao: string, arch: ArchInstalador): string {
  return `${versao}/${arch}/hermesinstalador`;
}

export type BinarioPublicado = { caminho: string; sha256: string; assinatura: string };

/**
 * Valor de configuracoes.hermes_instalador. `caminho` e `sha256` são o que a rota
 * /api/hermes/instalador lê (parseReleaseInstalador); `assinatura` (Ed25519 de release
 * sobre os bytes do binário, a mesma chave do agente) fica registrada para conferência
 * offline e para um bootstrap futuro que a verifique.
 */
export function valorConfiguracao(versao: string, binarios: Partial<Record<ArchInstalador, BinarioPublicado>>) {
  if (!versaoValida(versao)) throw new Error("versão deve ser X.Y.Z");
  const saida: Record<string, BinarioPublicado> = {};
  for (const arch of ARCHS_INSTALADOR) {
    const b = binarios[arch];
    if (!b) continue;
    if (!/^[0-9a-f]{64}$/.test(b.sha256)) throw new Error(`sha256 inválido (${arch})`);
    if (b.caminho !== caminhoStorage(versao, arch)) throw new Error(`caminho inesperado (${arch})`);
    saida[arch] = { caminho: b.caminho, sha256: b.sha256, assinatura: b.assinatura };
  }
  if (Object.keys(saida).length === 0) throw new Error("nenhum binário");
  return { versao, binarios: saida };
}

export type ArgsPublicar = { versao: string; publicar: boolean };

/** `<versao> [--publicar]`. Sem --publicar é SEMPRE dry-run. */
export function lerArgsPublicar(argv: string[]): ArgsPublicar {
  if (argv.includes("--sem-garble")) {
    throw new Error("--sem-garble não existe aqui: o instalador só é publicado ofuscado (o dry-run não compila nada)");
  }
  const desconhecidas = argv.filter((a) => a.startsWith("--") && a !== "--publicar");
  if (desconhecidas.length) throw new Error(`opção desconhecida: ${desconhecidas.join(", ")}`);
  const pos = argv.filter((a) => !a.startsWith("--"));
  if (pos.length !== 1 || !versaoValida(pos[0])) {
    throw new Error("uso: npx tsx scripts/publicar-instalador.ts <versao X.Y.Z> [--publicar]");
  }
  return { versao: pos[0], publicar: argv.includes("--publicar") };
}

export type DepsPublicacao = {
  compilar(arch: ArchInstalador): Promise<Buffer>;
  assinar(bin: Buffer): string;
  /** upload SEM sobrescrever (erro se o caminho já existe). */
  enviar(caminho: string, bin: Buffer): Promise<void>;
  remover(caminhos: string[]): Promise<void>;
  gravarConfig(valor: ReturnType<typeof valorConfiguracao>): Promise<void>;
};

/**
 * Compila, assina, sobe e grava. Falhou no meio: remove SÓ o que esta execução subiu (versões
 * antigas e caminhos que já existiam nunca são tocados) e não grava a configuração.
 */
export async function executarPublicacao(versao: string, d: DepsPublicacao) {
  const enviados: string[] = [];
  const binarios: Partial<Record<ArchInstalador, BinarioPublicado>> = {};
  try {
    for (const arch of ARCHS_INSTALADOR) {
      const bin = await d.compilar(arch);
      const sha256 = createHash("sha256").update(bin).digest("hex");
      const assinatura = d.assinar(bin);
      const caminho = caminhoStorage(versao, arch);
      await d.enviar(caminho, bin);
      enviados.push(caminho);
      binarios[arch] = { caminho, sha256, assinatura };
    }
    const valor = valorConfiguracao(versao, binarios);
    await d.gravarConfig(valor);
    return valor;
  } catch (e) {
    if (enviados.length) await d.remover(enviados);
    throw e;
  }
}

/** Plano legível (o dry-run só imprime isto: não compila, não lê a chave privada, não sobe nada). */
export function planoPublicacao(p: { versao: string; baseURL: string; publicar: boolean }): string[] {
  const passos: string[] = [];
  for (const arch of ARCHS_INSTALADOR) {
    passos.push(`compilar linux/${arch} (CGO_ENABLED=0, -X main.versao=${p.versao} -X main.baseURL=${new URL(p.baseURL).origin} -X main.releasePK=<chaves/release.pub>)`);
    passos.push(`sha256 + assinatura Ed25519 de release (chaves/release.key) de ${arch}`);
    passos.push(`upload para ${BUCKET_INSTALADOR}/${caminhoStorage(p.versao, arch)} (sem sobrescrever)`);
  }
  passos.push(`gravar configuracoes.${CHAVE_CONFIG_INSTALADOR} = { versao: "${p.versao}", binarios: { amd64, arm64 } }`);
  return passos.map((s) => (p.publicar ? s : `[dry-run] ${s}`));
}
