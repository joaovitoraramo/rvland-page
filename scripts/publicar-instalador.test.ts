import { describe, expect, it } from "vitest";

import { parseReleaseInstalador } from "@/lib/servicos/hermes-instalador";
import {
  chavePublicaValida,
  executarPublicacao,
  resolverGarble,
  caminhoStorage,
  comandoBuild,
  lerArgsPublicar,
  montarLdflags,
  planoPublicacao,
  valorConfiguracao,
} from "./publicar-instalador-montador";

const PUB = "A6EHv/POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg="; // pública de TESTE (vetor do instalador)
const SHA = "a".repeat(64);

describe("publicar-instalador (montador)", () => {
  it("ldflags com versão, base https e chave pública de release", () => {
    expect(montarLdflags({ versao: "1.2.3", baseURL: "https://rvland.com.br/", releasePub: PUB })).toBe(
      `-s -w -X main.versao=1.2.3 -X main.baseURL=https://rvland.com.br -X main.releasePK=${PUB}`
    );
    expect(() => montarLdflags({ versao: "1.2", baseURL: "https://rvland.com.br", releasePub: PUB })).toThrow();
    expect(() => montarLdflags({ versao: "1.2.3", baseURL: "http://rvland.com.br", releasePub: PUB })).toThrow();
    expect(() => montarLdflags({ versao: "1.2.3", baseURL: "https://rvland.com.br/x", releasePub: PUB })).toThrow();
    expect(() => montarLdflags({ versao: "1.2.3", baseURL: "https://rvland.com.br", releasePub: "curta" })).toThrow();
  });

  it("build estático linux por arquitetura, com e sem garble", () => {
    const c = comandoBuild({ arch: "arm64", ldflags: "-s -w", saida: "/tmp/x", go: "go", garble: null });
    expect(c).toEqual({
      bin: "go",
      args: ["build", "-trimpath", "-ldflags", "-s -w", "-o", "/tmp/x", "./hermesinstalador"],
      cwd: "agent",
      env: { GOOS: "linux", GOARCH: "arm64", CGO_ENABLED: "0" },
    });
    const g = comandoBuild({ arch: "amd64", ldflags: "-s -w", saida: "/tmp/y", go: "go", garble: "/g/garble" });
    expect(g.bin).toBe("/g/garble");
    expect(g.args.slice(0, 3)).toEqual(["-literals", "-tiny", "build"]);
  });

  it("valor da configuração é lido pela rota do instalador (parseReleaseInstalador)", () => {
    const v = valorConfiguracao("1.2.3", {
      amd64: { caminho: caminhoStorage("1.2.3", "amd64"), sha256: SHA, assinatura: "sig" },
      arm64: { caminho: caminhoStorage("1.2.3", "arm64"), sha256: "b".repeat(64), assinatura: "sig2" },
    });
    expect(parseReleaseInstalador(v)).toEqual({
      versao: "1.2.3",
      binarios: {
        amd64: { caminho: "1.2.3/amd64/hermesinstalador", sha256: SHA },
        arm64: { caminho: "1.2.3/arm64/hermesinstalador", sha256: "b".repeat(64) },
      },
    });
    expect(() => valorConfiguracao("1.2.3", { amd64: { caminho: "x", sha256: SHA, assinatura: "s" } })).toThrow();
    expect(() => valorConfiguracao("1.2.3", { amd64: { caminho: caminhoStorage("1.2.3", "amd64"), sha256: "zz", assinatura: "s" } })).toThrow();
    expect(() => valorConfiguracao("1.2.3", {})).toThrow();
  });

  it("dry-run é o padrão; --publicar é explícito e exige garble", () => {
    expect(lerArgsPublicar(["1.0.0"])).toEqual({ versao: "1.0.0", publicar: false });
    expect(lerArgsPublicar(["1.0.0", "--publicar"]).publicar).toBe(true);
    expect(() => lerArgsPublicar(["1.0.0", "--sem-garble"])).toThrow(/não existe/);
    expect(() => lerArgsPublicar(["1.0.0", "--publicar", "--sem-garble"])).toThrow(/não existe/);
    expect(() => lerArgsPublicar(["1.0.0", "--producao"])).toThrow(/desconhecida/);
    expect(() => lerArgsPublicar([])).toThrow(/uso/);
  });

  it("plano do dry-run lista os passos sem executar", () => {
    const p = planoPublicacao({ versao: "1.0.0", baseURL: "https://rvland.com.br", publicar: false });
    expect(p.every((s) => s.startsWith("[dry-run] "))).toBe(true);
    expect(p.join("\n")).toContain("hermes-instalador/1.0.0/arm64/hermesinstalador");
    expect(p.join("\n")).toContain("configuracoes.hermes_instalador");
  });
});

describe("publicar-instalador (correções da revisão)", () => {
  it("chave pública de release: recusa zeros, identidade e pontos de ordem pequena", () => {
    const b64 = (hex: string) => Buffer.from(hex, "hex").toString("base64");
    expect(chavePublicaValida(PUB)).toBe(true);
    expect(chavePublicaValida(Buffer.alloc(32).toString("base64"))).toBe(false);
    expect(chavePublicaValida(b64("01" + "00".repeat(31)))).toBe(false);
    expect(chavePublicaValida(b64("c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a"))).toBe(false);
    expect(chavePublicaValida(b64("26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05"))).toBe(false);
    expect(chavePublicaValida(b64("ec" + "ff".repeat(30) + "7f"))).toBe(false);
    expect(() => montarLdflags({ versao: "1.2.3", baseURL: "https://rvland.com.br", releasePub: Buffer.alloc(32).toString("base64") })).toThrow();
  });

  it("garble: GARBLE_BIN=off ou ausente falha claro; caminho explícito ou GOPATH vale", () => {
    expect(() => resolverGarble({ GARBLE_BIN: "off" }, () => "/go", () => true)).toThrow(/GARBLE_BIN=off/);
    expect(() => resolverGarble({}, () => "/go", () => false)).toThrow(/garble não encontrado/);
    expect(resolverGarble({ GARBLE_BIN: "/x/garble" }, () => "/go", () => false)).toBe("/x/garble");
    expect(resolverGarble({}, () => "/go", (p) => p === "/go/bin/garble")).toBe("/go/bin/garble");
  });

  function deps(falharEm?: string) {
    const enviados: string[] = [];
    const removidos: string[][] = [];
    const gravados: unknown[] = [];
    return {
      enviados,
      removidos,
      gravados,
      d: {
        compilar: async (arch: string) => Buffer.from("bin-" + arch),
        assinar: (b: Buffer) => "sig-" + b.toString(),
        enviar: async (caminho: string) => {
          if (falharEm === caminho) throw new Error("upload falhou");
          enviados.push(caminho);
        },
        remover: async (caminhos: string[]) => {
          removidos.push(caminhos);
        },
        gravarConfig: async (v: unknown) => {
          if (falharEm === "config") throw new Error("db falhou");
          gravados.push(v);
        },
      },
    };
  }

  it("upload parcial: remove SÓ o que subiu nesta execução e não grava a configuração", async () => {
    const f = deps("1.0.0/arm64/hermesinstalador");
    await expect(executarPublicacao("1.0.0", f.d)).rejects.toThrow(/upload falhou/);
    expect(f.removidos).toEqual([["1.0.0/amd64/hermesinstalador"]]);
    expect(f.gravados).toEqual([]);
  });

  it("falha ao gravar a configuração remove os binários desta execução", async () => {
    const f = deps("config");
    await expect(executarPublicacao("1.0.0", f.d)).rejects.toThrow(/db falhou/);
    expect(f.removidos).toEqual([["1.0.0/amd64/hermesinstalador", "1.0.0/arm64/hermesinstalador"]]);
  });

  it("sucesso grava a configuração com sha256 e assinatura e não remove nada", async () => {
    const f = deps();
    const v = await executarPublicacao("1.0.0", f.d);
    expect(f.removidos).toEqual([]);
    expect(f.gravados).toEqual([v]);
    expect(v.binarios.amd64?.assinatura).toBe("sig-bin-amd64");
    expect(v.binarios.arm64?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
