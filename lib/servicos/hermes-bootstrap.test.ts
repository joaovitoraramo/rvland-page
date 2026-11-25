import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  entregarBootstrapHermes,
  scriptBootstrapHermes,
  LIMITE_BOOTSTRAP_POR_HORA,
} from "./hermes-bootstrap";
import { repoLimitesMemoria } from "./hermes-memoria";

const BASE = "https://rvland.exemplo";
const CHAVE = "hmk_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0u-_";

describe("scriptBootstrapHermes (conteúdo)", () => {
  const s = scriptBootstrapHermes(BASE);

  it("é genérico: nenhuma chave embutida, base fixa, set -eu e umask", () => {
    expect(s.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(s).toMatch(/^set -eu$/m);
    expect(s).toMatch(/^umask 077$/m);
    expect(s).not.toMatch(/hmk_[A-Za-z0-9_-]{43}/);
    expect(s).toContain(`BASE="${BASE}"`);
    expect(s).toContain("/api/hermes/instalador?arch=");
  });

  it("baixa só por https, confere sha256, temporário mktemp -d 0700 e trap de limpeza", () => {
    expect(s).toContain("--proto '=https'");
    expect(s).toContain("sha256sum");
    expect(s).toMatch(/mktemp -d/);
    expect(s).toMatch(/chmod 700 "\$DIR"/);
    expect(s).toMatch(/trap '[^']*rm -rf[^']*' EXIT/);
  });

  it("ambos os curl: --proto '=https', --tlsv1.2 e --globoff; sha256 sem nome de arquivo", () => {
    const codigo = s.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
    const n = (codigo.match(/(^|[\s(=])curl -/gm) ?? []).length;
    expect(n).toBe(2);
    for (const flag of ["--proto '=https'", "--tlsv1.2", "--globoff"]) expect(codigo.split(flag).length - 1).toBe(n);
    expect(codigo).toContain('sha256sum < "$BIN"');
    expect(codigo).not.toMatch(/sha256sum "\$BIN"/);
  });

  it("documenta a ordem das fontes da chave (HERMES_CHAVE, depois terminal, depois stdin)", () => {
    expect(s).toMatch(/HERMES_CHAVE[\s\S]*terminal[\s\S]*(entrada padr|stdin)/);
    expect(s).toMatch(/bash arquivo\.sh < chave|bash instalar\.sh < chave/);
  });

  it("sem eval, sem source e sem pipe para shell", () => {
    expect(s).not.toMatch(/\beval\b/);
    expect(s).not.toMatch(/^\s*(source|\.)\s/m);
    const codigo = s.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n"); // comentários documentam o uso
    expect(codigo).not.toMatch(/\|\s*(sudo\s+)?(ba|da|z)?sh\b/);
  });

  it("a chave só vai por stdin (--chave-stdin), nunca no argv do instalador", () => {
    expect(s).toContain("--chave-stdin");
    expect(s).toMatch(/printf '%s\\n' "\$CHAVE" \| "\$BIN"/);
    for (const linha of s.split("\n")) {
      if (/"\$BIN"/.test(linha)) expect(linha.replace(/^.*\| "\$BIN"/, "")).not.toContain("$CHAVE");
    }
    expect(s).not.toMatch(/--(chave|token)="?\$/);
  });

  it("parseia em bash e sh", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hb-n-"));
    try {
      const f = path.join(dir, "s.sh");
      writeFileSync(f, s);
      expect((await rodar("bash", ["-n", f], {})).codigo).toBe(0);
      expect((await rodar("sh", ["-n", f], {})).codigo).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("recusa base que não seja https://host[:porta] puro", () => {
    for (const b of ["http://rvland.exemplo", "https://rvland.exemplo/x", "https://a b", "https://x.y?q=1", "https://u@x.y", 'https://x.y";id;"']) {
      expect(() => scriptBootstrapHermes(b)).toThrow();
    }
    expect(() => scriptBootstrapHermes("https://localhost:3000")).not.toThrow();
  });
});

describe("entregarBootstrapHermes (rota)", () => {
  const deps = () => ({ agora: () => new Date("2026-11-25T12:00:00.000Z"), limites: repoLimitesMemoria() });

  it("200 com shell script, no-store, noindex e nosniff", async () => {
    const r = await entregarBootstrapHermes("1.1.1.1", BASE, deps());
    expect(r.status).toBe(200);
    expect(r.texto).toBe(scriptBootstrapHermes(BASE));
    expect(r.headers).toMatchObject({
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "x-content-type-options": "nosniff",
    });
  });

  it("rate limit por IP (429 também no-store e inofensivo se cair no bash)", async () => {
    const d = deps();
    for (let i = 0; i < LIMITE_BOOTSTRAP_POR_HORA; i++) expect((await entregarBootstrapHermes("2.2.2.2", BASE, d)).status).toBe(200);
    const r = await entregarBootstrapHermes("2.2.2.2", BASE, d);
    expect(r.status).toBe(429);
    expect(r.headers).toMatchObject({ "cache-control": "no-store", "retry-after": "3600" });
    expect(r.texto).toMatch(/^echo .*; exit 7\n$/);
    expect((await entregarBootstrapHermes("3.3.3.3", BASE, d)).status).toBe(200);
  });

  it("base inválida: 503 sem vazar detalhe", async () => {
    const r = await entregarBootstrapHermes("1.1.1.1", "http://x", deps());
    expect(r.status).toBe(503);
    expect(r.headers["cache-control"]).toBe("no-store");
  });
});

// ── execução real do script com curl/uname/id falsos ──

type Exec = { codigo: number | null; stdout: string; stderr: string };

function rodar(cmd: string, args: string[], env: Record<string, string>, entrada?: string): Promise<Exec> {
  return new Promise((resolve, reject) => {
    // detached = setsid: sem terminal de controle, /dev/tty não abre (como em automação)
    const p = spawn(cmd, args, { env: env as NodeJS.ProcessEnv, detached: true, stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (b: Buffer) => (stdout += b));
    p.stderr.on("data", (b: Buffer) => (stderr += b));
    p.on("error", reject);
    p.on("close", (codigo) => resolve({ codigo, stdout, stderr }));
    p.stdin.end(entrada ?? "");
  });
}

describe("scriptBootstrapHermes (execução)", () => {
  let raiz: string;
  let fake: string;
  let tmp: string;
  let reg: string;
  let script: string;
  let binFalso: string;

  const sh = (p: string, corpo: string) => {
    writeFileSync(p, "#!/bin/sh\n" + corpo);
    chmodSync(p, 0o755);
  };

  beforeEach(() => {
    raiz = mkdtempSync(path.join(tmpdir(), "hb-"));
    fake = path.join(raiz, "bin");
    tmp = path.join(raiz, "tmp");
    reg = path.join(raiz, "reg");
    for (const d of [fake, tmp, reg]) mkdirSync(d, { mode: 0o700 });
    script = path.join(raiz, "instalar.sh");
    writeFileSync(script, scriptBootstrapHermes(BASE));

    // "binário" do instalador: registra argv, stdin, env e o próprio diretório
    binFalso = path.join(raiz, "binario");
    writeFileSync(
      binFalso,
      `#!/bin/sh\nprintf '%s\\n' "$@" > "${reg}/argv"\ncat > "${reg}/stdin"\nenv > "${reg}/env"\ndirname "$0" > "${reg}/dir"\nexit "\${FAKE_RC:-0}"\n`
    );
    chmodSync(binFalso, 0o755);

    sh(path.join(fake, "id"), `[ "$1" = "-u" ] && echo "\${FAKE_UID:-0}"\n`);
    sh(path.join(fake, "uname"), `case "$1" in -s) echo "\${FAKE_OS:-Linux}" ;; -m) echo "\${FAKE_ARCH:-x86_64}" ;; esac\n`);
    // sha256sum que imita o GNU: com nome de arquivo e caminho "estranho" prefixa "\\" na linha
    sh(
      path.join(fake, "sha256sum"),
      [
        `if [ "$#" -gt 0 ]; then h=$(/usr/bin/shasum -a 256 "$1"); printf '\\\\%s  %s\\n' "\${h%% *}" "$1"`,
        `else h=$(/usr/bin/shasum -a 256); printf '%s  -\\n' "\${h%% *}"; fi`,
        ``,
      ].join("\n")
    );
    sh(
      path.join(fake, "curl"),
      [
        `printf '%s\\n' "$*" >> "${reg}/curl"`,
        `cab=0; out=""; prev=""`,
        `for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; [ "$a" = "-D" ] && cab=1; prev="$a"; done`,
        `if [ "$cab" = 1 ]; then`,
        `  [ -n "\${FAKE_CURL_FALHA:-}" ] && exit 22`,
        `  printf 'HTTP/2 302\\r\\nlocation: %s\\r\\nx-sha256: %s\\r\\nx-versao: 1.0.0\\r\\n\\r\\n' "\${FAKE_LOC}" "\${FAKE_SHA}"`,
        `else`,
        `  cp "${binFalso}" "$out"`,
        `fi`,
        ``,
      ].join("\n")
    );
  });

  afterEach(() => rmSync(raiz, { recursive: true, force: true }));

  const shaBin = () => createHash("sha256").update(readFileSync(binFalso)).digest("hex");

  function env(extra: Record<string, string> = {}): Record<string, string> {
    return {
      PATH: `${fake}:/usr/bin:/bin:/usr/sbin:/sbin`,
      TMPDIR: tmp,
      FAKE_LOC: "https://storage.exemplo/assinada?token=abc",
      FAKE_SHA: shaBin(),
      ...extra,
    };
  }

  const ler = (n: string) => (existsSync(path.join(reg, n)) ? readFileSync(path.join(reg, n), "utf8") : null);

  it("instalar: baixa, confere, passa a chave SÓ por stdin, sem HERMES_CHAVE no filho, e limpa o temporário", async () => {
    const r = await rodar("bash", [script, "--dry-run"], env({ HERMES_CHAVE: CHAVE }));
    expect(r.stderr).not.toContain(CHAVE);
    expect(r.stdout).not.toContain(CHAVE);
    expect(r.codigo).toBe(0);
    expect(ler("argv")).toBe("instalar\n--chave-stdin\n--dry-run\n");
    expect(ler("stdin")).toBe(CHAVE + "\n");
    expect(ler("env")).not.toContain("HERMES_CHAVE");
    expect(ler("env")).not.toContain(CHAVE);
    expect(ler("curl")).not.toContain(CHAVE);
    expect(ler("curl")).toContain(`${BASE}/api/hermes/instalador?arch=amd64`);
    const dir = ler("dir")!.trim();
    expect(dir.startsWith(tmp)).toBe(true);
    expect(existsSync(dir)).toBe(false);
    expect(readdirSync(tmp)).toEqual([]);
  });

  it("sem terminal e sem HERMES_CHAVE: lê a chave da entrada padrão", async () => {
    const r = await rodar("bash", [script, "adotar"], env(), CHAVE + "\n");
    expect(r.codigo).toBe(0);
    expect(ler("argv")).toBe("adotar\n--chave-stdin\n");
    expect(ler("stdin")).toBe(CHAVE + "\n");
  });

  it("arm64 e código de saída do instalador repassado", async () => {
    const r = await rodar("bash", [script], env({ HERMES_CHAVE: CHAVE, FAKE_ARCH: "aarch64", FAKE_RC: "5" }));
    expect(r.codigo).toBe(5);
    expect(ler("curl")).toContain("arch=arm64");
    expect(readdirSync(tmp)).toEqual([]);
  });

  it("sha256 divergente: aborta com 7, NÃO executa e limpa", async () => {
    const r = await rodar("bash", [script], env({ HERMES_CHAVE: CHAVE, FAKE_SHA: "0".repeat(64) }));
    expect(r.codigo).toBe(7);
    expect(r.stderr).toMatch(/sha256/);
    expect(ler("argv")).toBeNull();
    expect(readdirSync(tmp)).toEqual([]);
  });

  it("sha256 ausente/malformado ou location não-https: 7 sem baixar o binário", async () => {
    for (const extra of <Record<string, string>[]>[{ FAKE_SHA: "" }, { FAKE_SHA: "XYZ" }, { FAKE_SHA: "a".repeat(63) }, { FAKE_LOC: "http://storage.exemplo/x" }, { FAKE_LOC: "" }]) {
      rmSync(path.join(reg, "curl"), { force: true });
      const r = await rodar("bash", [script], env({ HERMES_CHAVE: CHAVE, ...extra }));
      expect(r.codigo).toBe(7);
      expect(ler("curl")!.trim().split("\n")).toHaveLength(1);
      expect(ler("argv")).toBeNull();
    }
  });

  it("falha de rede: 7", async () => {
    const r = await rodar("bash", [script], env({ HERMES_CHAVE: CHAVE, FAKE_CURL_FALHA: "1" }));
    expect(r.codigo).toBe(7);
    expect(ler("argv")).toBeNull();
  });

  it("pré-requisitos: não-root, não-Linux, arquitetura: 6 sem rede", async () => {
    for (const extra of <Record<string, string>[]>[{ FAKE_UID: "1000" }, { FAKE_OS: "Darwin" }, { FAKE_ARCH: "i686" }]) {
      const r = await rodar("bash", [script], env({ HERMES_CHAVE: CHAVE, ...extra }));
      expect(r.codigo).toBe(6);
      expect(ler("curl")).toBeNull();
    }
  });

  it("chave na linha de comando é recusada (2) sem rede, em todas as formas do pacote flag", async () => {
    const formas = [
      [`--chave=${CHAVE}`],
      [`-chave=${CHAVE}`],
      ["--chave"],
      ["-chave"],
      ["--chave", CHAVE],
      ["-chave", CHAVE],
      ["--chave-stdin"],
      ["-chave-stdin"],
      ["--chave-stdin=true"],
      ["-chave-stdin=false"],
    ];
    for (const a of formas) {
      for (const modo of [["instalar"], ["adotar"], []]) {
        const r = await rodar("bash", [script, ...modo, ...a], env());
        expect(r.codigo, `${modo} ${a}`).toBe(2);
        expect(r.stderr).not.toContain(CHAVE);
        expect(ler("curl")).toBeNull();
      }
    }
  });

  it("chave em formato inválido: 4, sem executar e sem ecoar a chave", async () => {
    const r = await rodar("bash", [script], env({ HERMES_CHAVE: "hmk_curta-segredo" }));
    expect(r.codigo).toBe(4);
    expect(r.stderr).not.toContain("segredo");
    expect(ler("argv")).toBeNull();
  });

  it("modo desconhecido: 2", async () => {
    expect((await rodar("bash", [script, "apagar"], env())).codigo).toBe(2);
  });

  it("solicitar: sem --chave-stdin e sem ler chave", async () => {
    const r = await rodar("bash", [script, "solicitar"], env({ HERMES_CHAVE: CHAVE }));
    expect(r.codigo).toBe(0);
    expect(ler("argv")).toBe("solicitar\n");
    expect(ler("stdin")).toBe("");
    expect(ler("env")).not.toContain(CHAVE);
  });

  it("flags informativas (todas as formas do flag): sem modo, sem chave, repassadas intactas", async () => {
    for (const f of ["-h", "-help", "--help", "-ajuda", "--ajuda", "-versao", "--versao", "-mostrar-identificacao", "--mostrar-identificacao"]) {
      rmSync(path.join(reg, "argv"), { force: true });
      const r = await rodar("bash", [script, f], env());
      expect(r.codigo, f).toBe(0);
      expect(ler("argv"), f).toBe(f + "\n");
      expect(ler("stdin"), f).toBe("");
    }
  });

  it("--chave-arquivo (todas as formas, inclusive valor separado): sem --chave-stdin e sem ler chave", async () => {
    const casos: { args: string[]; argv: string }[] = [
      { args: ["instalar", "--chave-arquivo=/root/chave"], argv: "instalar\n--chave-arquivo=/root/chave\n" },
      { args: ["instalar", "-chave-arquivo=/root/chave"], argv: "instalar\n-chave-arquivo=/root/chave\n" },
      { args: ["instalar", "--chave-arquivo", "/root/chave"], argv: "instalar\n--chave-arquivo\n/root/chave\n" },
      { args: ["adotar", "-chave-arquivo", "/root/chave"], argv: "adotar\n-chave-arquivo\n/root/chave\n" },
      // o argumento seguinte é o VALOR (como no pacote flag), mesmo com cara de flag proibida: repassado intacto
      { args: ["instalar", "--chave-arquivo", "--chave"], argv: "instalar\n--chave-arquivo\n--chave\n" },
    ];
    for (const c of casos) {
      rmSync(path.join(reg, "argv"), { force: true });
      const r = await rodar("bash", [script, ...c.args], env());
      expect(r.codigo, c.args.join(" ")).toBe(0);
      expect(ler("argv"), c.args.join(" ")).toBe(c.argv);
      expect(ler("stdin")).toBe("");
    }
  });

  it("fonte da chave: HERMES_CHAVE tem precedência sobre a entrada padrão", async () => {
    const outra = "hmk_" + "Z".repeat(43);
    const r = await rodar("bash", [script], env({ HERMES_CHAVE: CHAVE }), outra + "\n");
    expect(r.codigo).toBe(0);
    expect(ler("stdin")).toBe(CHAVE + "\n");
  });

  it("sha256 lido da entrada padrão: tolera o prefixo '\\' do GNU em nome de arquivo (não usa nome)", async () => {
    const r = await rodar("bash", [script], env({ HERMES_CHAVE: CHAVE }));
    expect(r.codigo).toBe(0);
    expect(ler("argv")).toBe("instalar\n--chave-stdin\n");
  });

  it("ambos os curl rodam com --proto '=https', --tlsv1.2 e --globoff", async () => {
    const r = await rodar("bash", [script], env({ HERMES_CHAVE: CHAVE }));
    expect(r.codigo).toBe(0);
    const linhas = ler("curl")!.trim().split("\n");
    expect(linhas).toHaveLength(2);
    for (const l of linhas) {
      expect(l).toContain("--proto =https");
      expect(l).toContain("--tlsv1.2");
      expect(l).toContain("--globoff");
    }
  });

  it("Location com espaço ou caractere de controle: 7, sem baixar nem executar", async () => {
    for (const loc of ["https://storage.exemplo/a b", "https://storage.exemplo/a\tb", "https://storage.exemplo/a\x01b", "https://storage.exemplo/a\x7fb"]) {
      rmSync(path.join(reg, "curl"), { force: true });
      const r = await rodar("bash", [script], env({ HERMES_CHAVE: CHAVE, FAKE_LOC: loc }));
      expect(r.codigo, JSON.stringify(loc)).toBe(7);
      expect(ler("curl")!.trim().split("\n")).toHaveLength(1);
      expect(ler("argv")).toBeNull();
    }
  });

  it("script truncado em qualquer byte (bash lendo da entrada padrão) não executa nada", async () => {
    const inteiro = scriptBootstrapHermes(BASE);
    const iniFn = inteiro.indexOf("hermes_bootstrap() {");
    const fimFn = inteiro.indexOf("\n}\n", iniFn) + 3; // depois do "}" que fecha a função
    const chamada = inteiro.lastIndexOf("hermes_bootstrap ");
    const cortes = new Set<number>([0, 1, iniFn - 1, iniFn, iniFn + 5, fimFn - 1, fimFn, fimFn + 5]);
    // a chamada final cortada em cada byte (a função já está completa; nunca pode rodar sem os argumentos)
    for (let i = chamada; i < inteiro.length - 1; i++) cortes.add(i);
    for (let i = 7; i < inteiro.length; i += 97) cortes.add(i);
    for (const n of cortes) {
      for (const f of ["curl", "argv"]) rmSync(path.join(reg, f), { force: true });
      const r = await rodar("bash", [], env({ HERMES_CHAVE: CHAVE }), inteiro.slice(0, n));
      expect(ler("curl"), `corte ${n}`).toBeNull();
      expect(ler("argv"), `corte ${n}`).toBeNull();
      // cortado dentro da função (ou da chamada final): erro de sintaxe/comando, nunca sucesso
      if (n > iniFn && n < fimFn - 1) expect(r.codigo, `corte ${n}`).not.toBe(0);
    }
  });

  it("chave vazia (retomada): repassa stdin vazio e deixa o instalador decidir", async () => {
    const r = await rodar("bash", [script], env());
    expect(r.codigo).toBe(0);
    expect(ler("argv")).toBe("instalar\n--chave-stdin\n");
    expect(ler("stdin")).toBe("\n");
  });
});
