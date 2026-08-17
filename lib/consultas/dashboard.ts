import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";

import { db, clientes, contratos, contratosPrecos, faturas, pagamentos } from "@/lib/db";
import { statusDeClientes, type ResultadoLicenca } from "@/lib/consultas/licencas";
import { precoVigente } from "@/lib/dominio/preco";
import { addDias, competenciaAtual, hojeSP } from "@/lib/dominio/tempo";

export type LinhaResumoCliente = {
  id: string;
  nome: string;
  licenca: ResultadoLicenca;
  contratosAtivos: number;
  valorMensalCentavos: number;
  emAbertoCentavos: number;
  proximoVencimento: string | null;
  ultimoPagamento: string | null;
};

export type DadosDashboard = {
  recebidoNoMesCentavos: number;
  emAtrasoCentavos: number;
  mrrCentavos: number;
  aVencer15dCentavos: number;
  clientes: LinhaResumoCliente[];
};

/** Consultas do dashboard: KPIs + tabela-resumo de todos os clientes ativos. */
export async function dadosDashboard(): Promise<DadosDashboard> {
  const hoje = hojeSP();
  const competencia = competenciaAtual();
  const limite15d = addDias(hoje, 15);

  const listaClientes = await db
    .select()
    .from(clientes)
    .where(eq(clientes.status, "ativo"));
  const clienteIds = listaClientes.map((c) => c.id);

  if (clienteIds.length === 0) {
    return {
      recebidoNoMesCentavos: 0,
      emAtrasoCentavos: 0,
      mrrCentavos: 0,
      aVencer15dCentavos: 0,
      clientes: [],
    };
  }

  const [mapaLicencas, contratosAtivos, faturasAbertas, pagamentosMes] = await Promise.all([
    statusDeClientes(clienteIds),
    db
      .select()
      .from(contratos)
      .where(
        and(
          inArray(contratos.clienteId, clienteIds),
          eq(contratos.status, "ativo"),
          eq(contratos.tipo, "recorrente")
        )
      ),
    db
      .select()
      .from(faturas)
      .where(and(inArray(faturas.clienteId, clienteIds), eq(faturas.status, "aberta"))),
    db
      .select({
        valorCentavos: pagamentos.valorCentavos,
        pagoEm: pagamentos.pagoEm,
        faturaId: pagamentos.faturaId,
      })
      .from(pagamentos)
      .where(gte(pagamentos.pagoEm, competencia)),
  ]);

  const vigencias =
    contratosAtivos.length > 0
      ? await db
          .select()
          .from(contratosPrecos)
          .where(
            inArray(
              contratosPrecos.contratoId,
              contratosAtivos.map((c) => c.id)
            )
          )
      : [];

  // mapeia fatura → cliente para "último pagamento" por cliente
  const todasFaturasIds = [...new Set(pagamentosMes.map((p) => p.faturaId))];
  const faturasDosPagamentos =
    todasFaturasIds.length > 0
      ? await db
          .select({ id: faturas.id, clienteId: faturas.clienteId })
          .from(faturas)
          .where(inArray(faturas.id, todasFaturasIds))
      : [];
  const clienteDaFatura = new Map(faturasDosPagamentos.map((f) => [f.id, f.clienteId]));

  const ultimoPagamentoPorCliente = new Map<string, string>();
  for (const p of pagamentosMes) {
    const clienteId = clienteDaFatura.get(p.faturaId);
    if (!clienteId) continue;
    const atual = ultimoPagamentoPorCliente.get(clienteId);
    if (!atual || p.pagoEm > atual) ultimoPagamentoPorCliente.set(clienteId, p.pagoEm);
  }

  // KPIs
  const recebidoNoMesCentavos = pagamentosMes.reduce((s, p) => s + p.valorCentavos, 0);

  const abertasReais = faturasAbertas.filter((f) => !f.historica);
  const emAtrasoCentavos = abertasReais
    .filter((f) => f.vencimento < hoje)
    .reduce((s, f) => s + (f.valorCentavos - f.pagoCentavos), 0);
  const aVencer15dCentavos = abertasReais
    .filter((f) => f.vencimento >= hoje && f.vencimento <= limite15d)
    .reduce((s, f) => s + (f.valorCentavos - f.pagoCentavos), 0);

  const valorMensalPorCliente = new Map<string, number>();
  let mrrCentavos = 0;
  for (const contrato of contratosAtivos) {
    const valor = precoVigente(
      vigencias
        .filter((v) => v.contratoId === contrato.id)
        .map((v) => ({ valorCentavos: v.valorCentavos, vigenteDesde: v.vigenteDesde })),
      competencia
    );
    if (valor == null) continue;
    mrrCentavos += valor;
    valorMensalPorCliente.set(
      contrato.clienteId,
      (valorMensalPorCliente.get(contrato.clienteId) ?? 0) + valor
    );
  }

  // Tabela-resumo
  const ordem: Record<string, number> = {
    bloqueado: 0,
    atrasado: 1,
    em_dia: 2,
    sem_licenca: 3,
    cancelado: 4,
  };

  const linhas: LinhaResumoCliente[] = listaClientes
    .map((c) => {
      const abertasDoCliente = abertasReais.filter((f) => f.clienteId === c.id);
      const proxima = abertasDoCliente
        .filter((f) => f.vencimento >= hoje)
        .sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1))[0];

      return {
        id: c.id,
        nome: c.nome,
        licenca:
          mapaLicencas.get(c.id) ??
          ({ status: "sem_licenca", venceEm: null, toleradoAte: null } as ResultadoLicenca),
        contratosAtivos: contratosAtivos.filter((k) => k.clienteId === c.id).length,
        valorMensalCentavos: valorMensalPorCliente.get(c.id) ?? 0,
        emAbertoCentavos: abertasDoCliente.reduce(
          (s, f) => s + (f.valorCentavos - f.pagoCentavos),
          0
        ),
        proximoVencimento: proxima?.vencimento ?? null,
        ultimoPagamento: ultimoPagamentoPorCliente.get(c.id) ?? null,
      };
    })
    .sort(
      (a, b) =>
        (ordem[a.licenca.status] ?? 9) - (ordem[b.licenca.status] ?? 9) ||
        a.nome.localeCompare(b.nome)
    );

  return { recebidoNoMesCentavos, emAtrasoCentavos, mrrCentavos, aVencer15dCentavos, clientes: linhas };
}
