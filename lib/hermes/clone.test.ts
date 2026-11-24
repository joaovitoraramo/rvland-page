import { describe, it, expect } from "vitest";
import { avaliarClone, lerControle, registrarReplay, LIMIAR_REPLAYS, type ControleClone } from "./clone";

const T0 = Date.parse("2026-11-23T10:00:00.000Z");
const min = (n: number) => T0 + n * 60_000;

function rodar(passos: { boot?: string; em: number }[]) {
  let ctrl: ControleClone | undefined;
  const alertas: (string | null)[] = [];
  for (const p of passos) {
    const r = avaliarClone(ctrl, p.boot, p.em);
    ctrl = r.controle;
    alertas.push(r.suspeito);
  }
  return alertas;
}

describe("detecção de clone", () => {
  it("ciclo normal de 60 s com o mesmo boot_id: sem suspeita", () => {
    expect(rodar([0, 1, 2, 3, 4].map((i) => ({ boot: "A", em: min(i) })))).toEqual([null, null, null, null, null]);
  });

  it("reboot legítimo (A -> B, sem voltar): sem suspeita", () => {
    expect(
      rodar([
        { boot: "A", em: min(0) },
        { boot: "A", em: min(1) },
        { boot: "B", em: min(2) },
        { boot: "B", em: min(3) },
        { boot: "C", em: min(4) },
      ])
    ).toEqual([null, null, null, null, null]);
  });

  it("dois boot_id alternando em < 10 min: suspeito", () => {
    const r = rodar([
      { boot: "A", em: min(0) },
      { boot: "B", em: min(1) },
      { boot: "A", em: min(2) },
    ]);
    expect(r[2]).toBe("boot_alternando");
  });

  it("A reaparece só depois de > 10 min: não conta como alternância", () => {
    const r = rodar([
      { boot: "A", em: min(0) },
      { boot: "B", em: min(1) },
      { boot: "A", em: min(30) },
    ]);
    expect(r[2]).toBeNull();
  });

  it("mais de 2 syncs em 60 s: suspeito", () => {
    const base = T0;
    const r = rodar([
      { boot: "A", em: base },
      { boot: "A", em: base + 20_000 },
      { boot: "A", em: base + 40_000 },
    ]);
    expect(r).toEqual([null, null, "syncs_excessivos"]);
  });

  it("2 syncs em 60 s ainda é tolerado (retry do agente)", () => {
    const r = rodar([
      { boot: "A", em: T0 },
      { boot: "A", em: T0 + 30_000 },
      { boot: "A", em: T0 + 90_000 },
    ]);
    expect(r).toEqual([null, null, null]);
  });

  it("sem boot_id não gera alternância", () => {
    expect(rodar([{ em: min(0) }, { em: min(1) }])).toEqual([null, null]);
  });

  it("controle fica limitado em tamanho", () => {
    let ctrl: ControleClone | undefined;
    for (let i = 0; i < 100; i++) ctrl = avaliarClone(ctrl, `b${i}`, min(i * 20)).controle;
    expect(ctrl!.boots.length).toBeLessThanOrEqual(8);
    expect(ctrl!.syncs.length).toBeLessThanOrEqual(8);
  });
});

describe("detecção de clone: machine_id_hash", () => {
  const M1 = "a".repeat(64);
  const M2 = "b".repeat(64);

  it("primeiro sync só registra; o mesmo machine_id_hash entre syncs não suspeita", () => {
    const a = avaliarClone(undefined, "A", min(0), M1);
    expect(a.suspeito).toBeNull();
    expect(a.controle.machine).toBe(M1);
    expect(avaliarClone(a.controle, "A", min(1), M1).suspeito).toBeNull();
  });

  it("troca de machine_id_hash entre syncs é suspeita (machine_id_trocado) e o controle passa a guardar o novo", () => {
    const a = avaliarClone(undefined, "A", min(0), M1);
    const b = avaliarClone(a.controle, "A", min(1), M2);
    expect(b.suspeito).toBe("machine_id_trocado");
    expect(b.controle.machine).toBe(M2);
    // depois da troca já registrada, o mesmo valor não repete o sinal
    expect(avaliarClone(b.controle, "A", min(2), M2).suspeito).toBeNull();
  });

  it("sem machine_id (ou controle antigo sem o campo) não suspeita nem apaga o gravado", () => {
    const a = avaliarClone(undefined, "A", min(0), M1);
    const b = avaliarClone(a.controle, "A", min(1), undefined);
    expect(b.suspeito).toBeNull();
    expect(b.controle.machine).toBe(M1);
    expect(avaliarClone({ boots: [], syncs: [] }, "A", min(0), M1).suspeito).toBeNull();
  });

  it("lerControle preserva machine e replays e tolera lixo", () => {
    const c = lerControle({ _controle: { boots: [], syncs: [], machine: M1, replays: [1, 2, "x", NaN] } });
    expect(c).toEqual({ boots: [], syncs: [], machine: M1, replays: [1, 2] });
    expect(lerControle({ _controle: { boots: [], syncs: [], machine: 42 } })?.machine).toBeUndefined();
  });
});

describe("detecção de clone: REPLAY assinado", () => {
  it("poucos replays: sem suspeita; ao atingir o limiar dentro de 10 min: replay_assinado", () => {
    expect(LIMIAR_REPLAYS).toBe(3);
    let ctrl: ControleClone | undefined;
    const rs: (string | null)[] = [];
    for (let i = 0; i < LIMIAR_REPLAYS; i++) {
      const r = registrarReplay(ctrl, min(i));
      ctrl = r.controle;
      rs.push(r.suspeito);
    }
    expect(rs).toEqual([null, null, "replay_assinado"]);
    expect(ctrl!.replays).toHaveLength(3);
  });

  it("replays espalhados (fora da janela de 10 min) não somam", () => {
    let ctrl: ControleClone | undefined;
    let ultimo: string | null = null;
    for (let i = 0; i < 6; i++) {
      const r = registrarReplay(ctrl, min(i * 20));
      ctrl = r.controle;
      ultimo = r.suspeito;
    }
    expect(ultimo).toBeNull();
    expect(ctrl!.replays!.length).toBe(1);
  });

  it("preserva boots/syncs/machine do controle anterior e limita o tamanho", () => {
    const base = avaliarClone(undefined, "A", min(0), "m".repeat(16)).controle;
    let ctrl = base;
    for (let i = 0; i < 50; i++) ctrl = registrarReplay(ctrl, min(0) + i * 1000).controle;
    expect(ctrl.boots).toEqual(base.boots);
    expect(ctrl.machine).toBe(base.machine);
    expect(ctrl.replays!.length).toBeLessThanOrEqual(8);
  });

  it("e o avaliarClone de um sync bom preserva os replays", () => {
    const r = registrarReplay(undefined, min(0)).controle;
    expect(avaliarClone(r, "A", min(1)).controle.replays).toEqual([min(0)]);
  });
});
