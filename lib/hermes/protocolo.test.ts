import { describe, it, expect } from "vitest";
import {
  esquemaSync,
  esquemaSolicitacao,
  esquemaAtivacao,
  esquemaValidar,
  sanitizarIdentificacao,
  TIPOS_EVENTO_AGENTE,
} from "./protocolo";

const MID = "a".repeat(64);

describe("protocolo: corpo do sync (estrito)", () => {
  const ok = {
    agente_versao: "0.7.0",
    container: { estado: "rodando", saude: "saudavel", versao: "0.14.26", digest: "sha256:" + "b".repeat(64), canal_em_uso: "preview" },
    fingerprint: { machine_id_hash: MID, boot_id: "boot-1" },
    relogio: { confiavel: true },
    eventos: [{ tipo: "hermes_update_ok", mensagem: "ok" }],
    ultimo_emitido_em: "2026-11-23T10:00:00.000Z",
  };

  it("aceita o corpo completo e o mínimo", () => {
    expect(esquemaSync.safeParse(ok).success).toBe(true);
    expect(
      esquemaSync.safeParse({ container: { estado: "rodando" }, fingerprint: { machine_id_hash: MID } }).success
    ).toBe(true);
  });

  it("recusa campo desconhecido, enum inválido e digest malformado", () => {
    expect(esquemaSync.safeParse({ ...ok, extra: 1 }).success).toBe(false);
    expect(esquemaSync.safeParse({ ...ok, container: { estado: "voando" } }).success).toBe(false);
    expect(esquemaSync.safeParse({ ...ok, container: { estado: "rodando", digest: "x" } }).success).toBe(false);
    expect(esquemaSync.safeParse({ ...ok, fingerprint: { boot_id: "x" } }).success).toBe(false);
    expect(esquemaSync.safeParse({ ...ok, eventos: Array(21).fill(ok.eventos[0]) }).success).toBe(false);
  });

  it("whitelist de eventos do agente não inclui clone suspeito (só o servidor gera)", () => {
    expect(TIPOS_EVENTO_AGENTE).toContain("hermes_bloqueio_simulado");
    expect(TIPOS_EVENTO_AGENTE).not.toContain("hermes_clone_suspeito");
  });
});

describe("protocolo: público", () => {
  it("solicitação: cnpj obrigatório, máquina opcional, estrito", () => {
    expect(esquemaSolicitacao.safeParse({ cnpj: "11222333000181" }).success).toBe(true);
    expect(esquemaSolicitacao.safeParse({ cnpj: "11222333000181", fingerprint: { machine_id_hash: MID } }).success).toBe(true);
    expect(esquemaSolicitacao.safeParse({}).success).toBe(false);
    expect(esquemaSolicitacao.safeParse({ cnpj: "1", senha_banco: "x" }).success).toBe(false);
  });

  it("validar e ativação exigem a chave; ativação exige machine_id_hash", () => {
    expect(esquemaValidar.safeParse({ chave: "x".repeat(10), cnpj: "11222333000181" }).success).toBe(true);
    expect(esquemaValidar.safeParse({ cnpj: "11222333000181" }).success).toBe(false);
    expect(esquemaAtivacao.safeParse({ chave: "x", cnpj: "1" }).success).toBe(false);
    expect(
      esquemaAtivacao.safeParse({ chave: "x", cnpj: "1", fingerprint: { machine_id_hash: MID } }).success
    ).toBe(true);
    expect(
      esquemaAtivacao.safeParse({
        chave: "x",
        cnpj: "1",
        fingerprint: { machine_id_hash: MID },
        agente_existente: { servidor_id: "11111111-1111-4111-8111-111111111111", timestamp: "2026-11-23T10:00:00.000Z", assinatura: "abcdefghijklmnop" },
      }).success
    ).toBe(true);
  });
});

describe("sanitizarIdentificacao", () => {
  it("remove campos que lembram credencial, em qualquer nível, e limita tamanho", () => {
    const r = sanitizarIdentificacao({
      razao_social: "Mercado X",
      lojas: [{ nome: "Loja 1", senha: "123", usuario_banco: "sa" }],
      db_password: "x",
      token_api: "x",
      jdbc_url: "jdbc:...",
      municipio: "Curitiba",
    });
    const txt = JSON.stringify(r);
    expect(txt).toContain("Mercado X");
    expect(txt).toContain("Curitiba");
    expect(txt).not.toMatch(/senha|password|token|jdbc|usuario|123/i);
  });

  it("corta strings longas e descarta o que estoura o teto", () => {
    const r = sanitizarIdentificacao({ razao_social: "x".repeat(1000) }) as Record<string, string>;
    expect(r.razao_social.length).toBe(200);
    expect(sanitizarIdentificacao(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, "y".repeat(200)])))).not.toBeNull();
    expect(sanitizarIdentificacao("texto" as never)).toBeNull();
    expect(sanitizarIdentificacao(undefined)).toBeNull();
  });
});
