import { describe, it, expect } from "vitest";

import { montarLdflags } from "./agente-ldflags";

// Chave PÚBLICA de TESTE (a do vetor cruzado; nunca a de produção).
const PK_TESTE = "MYUyj+tMTtw8XTHK46wM4NoafLV7XKL7fH/uCgUZxqc=";
const SPKI_TESTE = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(PK_TESTE, "base64")]).toString("base64");
const base = { versao: "0.9.0", siteUrl: "https://rvland.com.br", licensePub: "LIC", releasePub: "REL" };

describe("montarLdflags (build do agente publicado)", () => {
  it("embute a chave h1 do Hermes em main.hermesPK, mantendo os flags de sempre na mesma ordem", () => {
    const r = montarLdflags({ ...base, hermesPk: PK_TESTE });
    expect(r.ld).toBe(
      `-s -w -X main.versao=0.9.0 -X main.defaultEndereco=https://rvland.com.br -X main.licensePK=LIC -X main.releasePK=REL -X main.hermesPK=${PK_TESTE}`
    );
    expect(r.avisoHermes).toBeNull();
  });

  it("sem RVLAND_HERMES_PK: builda SEM o -X (o agente nunca aplica documento) e avisa claramente", () => {
    for (const pk of [undefined, "", "   \n"]) {
      const r = montarLdflags({ ...base, hermesPk: pk });
      expect(r.ld).toBe("-s -w -X main.versao=0.9.0 -X main.defaultEndereco=https://rvland.com.br -X main.licensePK=LIC -X main.releasePK=REL");
      expect(r.ld).not.toContain("hermesPK");
      expect(r.avisoHermes).toMatch(/RVLAND_HERMES_PK/);
      expect(r.avisoHermes).toMatch(/nunca aplica/);
    }
  });

  it("aceita SPKI DER e tira espaços/quebra de linha das pontas (.env)", () => {
    expect(montarLdflags({ ...base, hermesPk: SPKI_TESTE }).ld).toContain(`-X main.hermesPK=${SPKI_TESTE}`);
    expect(montarLdflags({ ...base, hermesPk: ` ${PK_TESTE}\n` }).ld).toContain(`-X main.hermesPK=${PK_TESTE} `.trimEnd());
  });

  it("chave inválida aborta (nunca publica com lixo) e a mensagem NÃO repete o valor", () => {
    const ruins = ["abc def", "SUBSTITUIR-PELA-CHAVE", Buffer.alloc(31).toString("base64"), PK_TESTE + " -X main.releasePK=OUTRA"];
    for (const pk of ruins) {
      let msg = "";
      try {
        montarLdflags({ ...base, hermesPk: pk });
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/RVLAND_HERMES_PK/);
      expect(msg).not.toContain(pk.trim());
    }
  });
});
