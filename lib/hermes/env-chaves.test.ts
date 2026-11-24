import { describe, it, expect } from "vitest";
import { removerChavesVazias, temValorNoEnv } from "./env-chaves";

describe("temValorNoEnv (RVLAND_HERMES_SK=.+)", () => {
  const N = "RVLAND_HERMES_SK";

  it("valor preenchido = existe", () => {
    expect(temValorNoEnv(`${N}=abc123==`, N)).toBe(true);
    expect(temValorNoEnv(`A=1\n${N}=abc\nB=2`, N)).toBe(true);
    expect(temValorNoEnv(`${N}="abc"`, N)).toBe(true);
  });

  it("valor vazio (como no .env.example copiado) = NÃO existe (gerar)", () => {
    expect(temValorNoEnv(`${N}=`, N)).toBe(false);
    expect(temValorNoEnv(`${N}=\n`, N)).toBe(false);
    expect(temValorNoEnv(`${N}=\r\nOUTRA=valor`, N)).toBe(false); // CRLF e valor da linha seguinte não contam
    expect(temValorNoEnv(`${N}=\nOUTRA=valor`, N)).toBe(false);
    expect(temValorNoEnv(`${N}=   `, N)).toBe(false);
    expect(temValorNoEnv(`${N}=""`, N)).toBe(false);
    expect(temValorNoEnv(`${N}=''`, N)).toBe(false);
  });

  it("comentada, ausente ou nome parecido = não existe", () => {
    expect(temValorNoEnv(`# ${N}=abc`, N)).toBe(false);
    expect(temValorNoEnv(`X${N}=abc`, N)).toBe(false);
    expect(temValorNoEnv(`${N}_ANTIGA=abc`, N)).toBe(false);
    expect(temValorNoEnv("", N)).toBe(false);
  });
});

describe("removerChavesVazias", () => {
  it("tira só as linhas VAZIAS das chaves pedidas (para não duplicar ao anexar o bloco gerado)", () => {
    const env = ["A=1", "RVLAND_HERMES_SK=", "RVLAND_HERMES_PK=", "RVLAND_LICENSE_SK=xyz", "B=2"].join("\n");
    expect(removerChavesVazias(env, ["RVLAND_HERMES_SK", "RVLAND_HERMES_PK"])).toBe(["A=1", "RVLAND_LICENSE_SK=xyz", "B=2"].join("\n"));
  });

  it("não mexe em chave com valor nem em comentário", () => {
    const env = "RVLAND_HERMES_SK=abc\n# RVLAND_HERMES_PK=\n";
    expect(removerChavesVazias(env, ["RVLAND_HERMES_SK", "RVLAND_HERMES_PK"])).toBe(env);
  });
});
