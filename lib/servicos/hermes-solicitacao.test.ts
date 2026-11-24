import { describe, it, expect } from "vitest";
import { tratarSolicitacao } from "./hermes-solicitacao";
import { criarMundoPublico, MACHINE_ID } from "./hermes-memoria";

const CNPJ = "11222333000181";
const corpo = (o: Record<string, unknown> = {}) => JSON.stringify({ cnpj: CNPJ, fingerprint: { machine_id_hash: MACHINE_ID }, ...o });

/** CNPJ válido (matriz /0001) para a raiz dada: o teste precisa de vários CNPJs distintos. */
function cnpjDeRaiz(raiz: number): string {
  const base = String(raiz).padStart(8, "0") + "0001";
  const dv = (b: string) => {
    const pesos = b.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = [...b].reduce((s, d, i) => s + Number(d) * pesos[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(base);
  return base + d1 + dv(base + d1);
}

describe("POST /api/hermes/solicitacoes", () => {
  it("202 com protocolo HP-XXXXXX, auditoria sistema e Telegram", async () => {
    const { mundo, deps } = criarMundoPublico();
    const r = await tratarSolicitacao({ corpo: corpo({ identificacao: { razao_social: "Mercado X LTDA" } }), ip: "1.1.1.1" }, deps);
    expect(r.status).toBe(202);
    expect((r.corpo as { protocolo: string }).protocolo).toMatch(/^HP-\d{6}$/);
    expect(mundo.solicitacoes).toHaveLength(1);
    expect(mundo.solicitacoes[0]).toMatchObject({ cnpj: CNPJ, cnpjRaiz: "11222333", status: "pendente", ipOrigem: "1.1.1.1" });
    expect(mundo.auditoria).toEqual([
      expect.objectContaining({ acao: "hermes.solicitacao_recebida", entidadeId: (r.corpo as { protocolo: string }).protocolo }),
    ]);
    expect(mundo.telegrams).toHaveLength(1);
    expect(mundo.telegrams[0]).toContain("Mercado X LTDA");
  });

  it("CNPJ com dígito verificador inválido: 422 CNPJ_INVALIDO e nada é gravado", async () => {
    const { mundo, deps } = criarMundoPublico();
    const r = await tratarSolicitacao({ corpo: corpo({ cnpj: "11222333000182" }), ip: "1.1.1.1" }, deps);
    expect(r).toMatchObject({ status: 422, corpo: { erro: "CNPJ_INVALIDO" } });
    expect(mundo.solicitacoes).toHaveLength(0);
    expect(mundo.auditoria).toHaveLength(0);
  });

  it("CNPJ com máscara é normalizado para 14 dígitos", async () => {
    const { mundo, deps } = criarMundoPublico();
    await tratarSolicitacao({ corpo: corpo({ cnpj: "11.222.333/0001-81" }), ip: "1.1.1.1" }, deps);
    expect(mundo.solicitacoes[0].cnpj).toBe(CNPJ);
  });

  it("dedupe: mesma máquina + mesmo CNPJ reaproveita o protocolo e soma tentativas", async () => {
    const { mundo, deps } = criarMundoPublico();
    const a = await tratarSolicitacao({ corpo: corpo(), ip: "1.1.1.1" }, deps);
    const b = await tratarSolicitacao({ corpo: corpo(), ip: "1.1.1.1" }, deps);
    expect((b.corpo as { protocolo: string }).protocolo).toBe((a.corpo as { protocolo: string }).protocolo);
    expect(mundo.solicitacoes).toHaveLength(1);
    expect(mundo.solicitacoes[0].tentativas).toBe(2);
    // máquina diferente = nova solicitação
    const c = await tratarSolicitacao({ corpo: corpo({ fingerprint: { machine_id_hash: "b".repeat(64) } }), ip: "1.1.1.1" }, deps);
    expect((c.corpo as { protocolo: string }).protocolo).not.toBe((a.corpo as { protocolo: string }).protocolo);
    // sem machine_id_hash: dedupe pelo coalesce ('')
    await tratarSolicitacao({ corpo: JSON.stringify({ cnpj: CNPJ }), ip: "1.1.1.1" }, deps);
    await tratarSolicitacao({ corpo: JSON.stringify({ cnpj: CNPJ }), ip: "1.1.1.1" }, deps);
    expect(mundo.solicitacoes).toHaveLength(3);
  });

  it("Telegram: no máximo 1 aviso por hora por CNPJ; depois da hora avisa de novo", async () => {
    const { mundo, deps } = criarMundoPublico();
    for (let i = 0; i < 5; i++) await tratarSolicitacao({ corpo: corpo(), ip: `9.9.9.${i}` }, deps);
    expect(mundo.telegrams).toHaveLength(1);
    await tratarSolicitacao({ corpo: corpo({ cnpj: "11444777000161" }), ip: "9.9.9.9" }, deps);
    expect(mundo.telegrams).toHaveLength(2);
    mundo.agora = new Date(mundo.agoraAtual.getTime() + 3600_000);
    await tratarSolicitacao({ corpo: corpo(), ip: "9.9.9.9" }, deps);
    expect(mundo.telegrams).toHaveLength(3);
  });

  it("Telegram: o nome vem do instalador e é identificado como NÃO verificado", async () => {
    const { mundo, deps } = criarMundoPublico();
    await tratarSolicitacao({ corpo: corpo({ identificacao: { razao_social: "Banco Central LTDA" } }), ip: "1.1.1.1" }, deps);
    expect(mundo.telegrams[0]).toContain("informado pelo instalador (não verificado)");
    expect(mundo.telegrams[0]).toContain("Banco Central LTDA");
  });

  it("teto GLOBAL de avisos: 10/h; o 11º vira um único resumo e o resto fica só no painel/banco", async () => {
    const { mundo, deps } = criarMundoPublico();
    for (let i = 1; i <= 15; i++) {
      // CNPJs e IPs distintos: nem o aviso por CNPJ nem o limite por IP seguram a inundação
      await tratarSolicitacao({ corpo: corpo({ cnpj: cnpjDeRaiz(10000000 + i) }), ip: `20.0.0.${i}` }, deps);
    }
    expect(mundo.solicitacoes).toHaveLength(15); // tudo registrado (auditoria/banco intactos)
    expect(mundo.auditoria).toHaveLength(15);
    expect(mundo.telegrams).toHaveLength(11);
    expect(mundo.telegrams[10]).toMatch(/resumo|muitas/i);
    expect(mundo.telegrams[10]).toContain("Pendentes");
    // outra hora: o teto zera
    mundo.agora = new Date(mundo.agoraAtual.getTime() + 3600_000);
    await tratarSolicitacao({ corpo: corpo({ cnpj: cnpjDeRaiz(20000001) }), ip: "20.0.1.1" }, deps);
    expect(mundo.telegrams).toHaveLength(12);
    expect(mundo.telegrams[11]).not.toMatch(/resumo/i);
  });

  it("o teto global é compartilhado com os avisos de CNPJ divergente (sol + div)", async () => {
    const { mundo, deps } = criarMundoPublico();
    for (let i = 1; i <= 10; i++) await tratarSolicitacao({ corpo: corpo({ cnpj: cnpjDeRaiz(30000000 + i) }), ip: `21.0.0.${i}` }, deps);
    expect(mundo.telegrams).toHaveLength(10);
    const { registrarSolicitacao } = await import("./hermes-solicitacao");
    await registrarSolicitacao(
      { cnpj: cnpjDeRaiz(40000001), cnpjRaiz: "40000001", identificacao: null, fingerprint: {}, origemIdentificacao: null, ipOrigem: null, versaoInstalador: null, status: "suspeita", motivo: "x" },
      deps,
      { auditoria: "hermes.cnpj_divergente", avisoTipo: "div", texto: () => "aviso div" }
    );
    expect(mundo.telegrams).toHaveLength(11);
    expect(mundo.telegrams[10]).not.toBe("aviso div"); // virou o resumo
  });

  it("rate limit por IP: excedido vira 429 sem gravar", async () => {
    const { mundo, deps } = criarMundoPublico();
    for (let i = 0; i < 20; i++) await tratarSolicitacao({ corpo: corpo(), ip: "7.7.7.7" }, deps);
    const r = await tratarSolicitacao({ corpo: corpo(), ip: "7.7.7.7" }, deps);
    expect(r.status).toBe(429);
    expect(mundo.solicitacoes[0].tentativas).toBe(20);
  });

  it("400 JSON inválido, 422 campo desconhecido (estrito)", async () => {
    const { deps } = criarMundoPublico();
    expect((await tratarSolicitacao({ corpo: "{x", ip: "1.1.1.1" }, deps)).status).toBe(400);
    expect((await tratarSolicitacao({ corpo: corpo({ senha_banco: "x" }), ip: "1.1.1.1" }, deps)).status).toBe(422);
  });

  it("identificação nunca guarda credenciais, mesmo que o instalador mande", async () => {
    const { mundo, deps } = criarMundoPublico();
    await tratarSolicitacao(
      { corpo: corpo({ identificacao: { razao_social: "X", db_password: "segredo", lojas: [{ nome: "L1", usuario: "sa" }] } }), ip: "1.1.1.1" },
      deps
    );
    expect(JSON.stringify(mundo.solicitacoes[0].identificacao)).not.toMatch(/segredo|password|usuario|"sa"/);
  });

  it("associa o cliente provável pela raiz do CNPJ quando há correspondência única", async () => {
    const { mundo, deps } = criarMundoPublico();
    mundo.clientePorRaiz.set("11222333", "c1");
    await tratarSolicitacao({ corpo: corpo(), ip: "1.1.1.1" }, deps);
    expect(mundo.solicitacoes[0].clienteProvavelId).toBe("c1");
  });
});
