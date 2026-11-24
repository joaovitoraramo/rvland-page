import { describe, it, expect } from "vitest";
import { entregarInstalador, metaInstalador, type DepsInstalador, type ReleaseInstalador } from "./hermes-instalador";
import { repoLimitesMemoria } from "./hermes-memoria";

const REL: ReleaseInstalador = {
  versao: "1.0.0",
  binarios: { amd64: { caminho: "1.0.0/amd64/hermes-instalador", sha256: "a".repeat(64) } },
};

function deps(rel: ReleaseInstalador | null = REL, url: string | null = "https://storage.exemplo/assinada?token=abc") {
  const chamadas: { caminho: string; seg: number }[] = [];
  const d: DepsInstalador = {
    agora: () => new Date("2026-11-23T12:00:00.000Z"),
    limites: repoLimitesMemoria(),
    async releaseInstalador() {
      return rel;
    },
    async urlAssinada(caminho, seg) {
      chamadas.push({ caminho, seg });
      return url;
    },
  };
  return { d, chamadas };
}

describe("GET /api/hermes/instalador", () => {
  it("302 para URL assinada de 60 s com x-sha256 e x-versao", async () => {
    const { d, chamadas } = deps();
    const r = await entregarInstalador("amd64", "1.1.1.1", d);
    expect(r.status).toBe(302);
    expect(r.redirecionar).toContain("https://storage.exemplo/assinada");
    expect(r.headers).toMatchObject({ "x-sha256": "a".repeat(64), "x-versao": "1.0.0" });
    expect(chamadas).toEqual([{ caminho: "1.0.0/amd64/hermes-instalador", seg: 60 }]);
  });

  it("arch inválida: 400; sem release ou sem a arch: 404 JSON", async () => {
    expect((await entregarInstalador("mips", "1.1.1.1", deps().d)).status).toBe(400);
    expect((await entregarInstalador(null, "1.1.1.1", deps().d)).status).toBe(400);
    const sem = await entregarInstalador("amd64", "1.1.1.1", deps(null).d);
    expect(sem).toMatchObject({ status: 404, corpo: { erro: "SEM_RELEASE" } });
    expect((await entregarInstalador("arm64", "1.1.1.1", deps().d)).status).toBe(404);
    expect((await entregarInstalador("amd64", "1.1.1.1", deps(REL, null).d)).status).toBe(404);
  });

  it("rate limit por IP", async () => {
    const { d } = deps();
    for (let i = 0; i < 60; i++) expect((await entregarInstalador("amd64", "2.2.2.2", d)).status).toBe(302);
    expect((await entregarInstalador("amd64", "2.2.2.2", d)).status).toBe(429);
    expect((await entregarInstalador("amd64", "3.3.3.3", d)).status).toBe(302);
  });
});

describe("GET /api/hermes/instalador/meta", () => {
  it("devolve versão e sha256 sem expor caminho do Storage", async () => {
    const r = await metaInstalador("1.1.1.1", deps().d);
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ versao: "1.0.0", binarios: { amd64: { sha256: "a".repeat(64) } } });
    expect(JSON.stringify(r.corpo)).not.toContain("hermes-instalador");
  });

  it("404 sem release e 429 no excesso", async () => {
    expect((await metaInstalador("1.1.1.1", deps(null).d)).status).toBe(404);
    const { d } = deps();
    for (let i = 0; i < 120; i++) await metaInstalador("4.4.4.4", d);
    expect((await metaInstalador("4.4.4.4", d)).status).toBe(429);
  });
});

import { parseReleaseInstalador } from "./hermes-instalador";

describe("parseReleaseInstalador (configuracoes.hermes_instalador)", () => {
  it("lê release válida e ignora arquiteturas incompletas", () => {
    expect(
      parseReleaseInstalador({
        versao: "1.2.3",
        binarios: { amd64: { caminho: "a/b", sha256: "f".repeat(64) }, arm64: { caminho: "" }, mips: { caminho: "x", sha256: "y" } },
      })
    ).toEqual({ versao: "1.2.3", binarios: { amd64: { caminho: "a/b", sha256: "f".repeat(64) } } });
  });

  it("null para ausente, sem versão ou sem nenhum binário", () => {
    expect(parseReleaseInstalador(undefined)).toBeNull();
    expect(parseReleaseInstalador({})).toBeNull();
    expect(parseReleaseInstalador({ versao: "1", binarios: {} })).toBeNull();
    expect(parseReleaseInstalador({ versao: "1", binarios: { amd64: { caminho: "a", sha256: "curto" } } })).toBeNull();
  });
});
