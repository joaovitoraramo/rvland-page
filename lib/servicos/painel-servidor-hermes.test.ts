/**
 * Painel de servidores x servidor criado pela ativação Hermes: módulos, serviços gerenciados e comandos do
 * Credit são recusados com mensagem clara; o servidor normal segue exatamente como antes (regressão).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  hermes: false,
  servidor: { id: "s1", status: "ativo", nome: "srv", moduloLicenca: true, moduloPicprice: true } as Record<string, unknown>,
  escritas: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));
vi.mock("@/lib/db", () => {
  const leitura = () => ({ from: () => ({ where: async () => [estado.servidor] }) });
  const escrita = (nome: string) => ({
    values: async () => void estado.escritas.push(`insert:${nome}`),
    set: () => ({ where: async () => void estado.escritas.push(`update:${nome}`) }),
  });
  return {
    db: { select: leitura, insert: (tb: string) => escrita(String(tb)), update: (tb: string) => escrita(String(tb)) },
    servidores: "servidores",
    servicoGerenciados: "servicoGerenciados",
    comandos: "comandos",
  };
});
vi.mock("@/lib/auth", () => ({ exigirPermissao: async () => ({ nome: "admin" }) }));
vi.mock("@/lib/audit", () => ({ registrarAuditoria: async (a: { acao: string }) => void estado.escritas.push(`audit:${a.acao}`) }));
vi.mock("@/lib/servicos/enrollment", () => ({ gerarTokenParaServidor: async () => "tok" }));
vi.mock("@/lib/servicos/hermes-repo", () => ({ servidorEhHermes: async () => estado.hermes }));

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => {
  estado.hermes = false;
  estado.escritas = [];
  estado.servidor = { id: "s1", status: "ativo", nome: "srv", moduloLicenca: true, moduloPicprice: true };
});

describe("painel: servidor Hermes", () => {
  it("definirModulos recusa com mensagem em pt-BR e não grava nem audita", async () => {
    estado.hermes = true;
    const { definirModulos } = await import("@/app/(app)/painel/servidores/actions");
    const r = await definirModulos("s1", {}, form({ moduloLicenca: "on", moduloPicprice: "on" }));
    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(/Hermes/);
    expect(estado.escritas).toEqual([]);
  });

  it("adicionarServico recusa com mensagem e não insere nem audita", async () => {
    estado.hermes = true;
    const { adicionarServico } = await import("@/app/(app)/painel/servidores/actions");
    const r = await adicionarServico("s1", {}, form({ nome: "App", unidade: "app.service", licenciado: "sim" }));
    expect(r.ok).toBeUndefined();
    expect(r.erro).toMatch(/Hermes/);
    expect(estado.escritas).toEqual([]);
  });

  it("enfileirarComando recusa (erro com a mensagem) e não enfileira nem audita", async () => {
    estado.hermes = true;
    const { enfileirarComando } = await import("@/app/(app)/painel/servidores/actions");
    await expect(enfileirarComando("s1", "start", null)).rejects.toThrow(/Hermes/);
    expect(estado.escritas).toEqual([]);
  });

  it("regressão: servidor normal segue gravando e auditando como antes", async () => {
    const a = await import("@/app/(app)/painel/servidores/actions");
    expect((await a.definirModulos("s1", {}, form({ moduloLicenca: "on" }))).ok).toMatch(/Módulos/);
    expect((await a.adicionarServico("s1", {}, form({ nome: "App", unidade: "app.service", licenciado: "sim" }))).ok).toBe("Serviço adicionado.");
    await a.enfileirarComando("s1", "start", null);
    expect(estado.escritas).toEqual([
      "update:servidores",
      "audit:servidor.modulos_alterados",
      "insert:servicoGerenciados",
      "audit:servidor.servico_adicionado",
      "insert:comandos",
      "audit:servidor.comando_start",
    ]);
  });
});
