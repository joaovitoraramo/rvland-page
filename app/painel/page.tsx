import Link from "next/link";

import { exigirPerfil, pode } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { dadosDashboard } from "@/lib/consultas/dashboard";
import { PageHeader } from "@/components/painel/page-header";
import { StatusBadge } from "@/components/painel/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarReais } from "@/lib/formato";
import { formatarDataBR } from "@/lib/dominio/tempo";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ negado?: string }>;
}) {
  const perfil = await exigirPerfil();
  const { negado } = await searchParams;
  const config = await getConfig();
  const dados = await dadosDashboard();

  const veValores = pode(perfil, "financeiro.ver");

  const kpis = [
    { rotulo: "Recebido no mês", valor: dados.recebidoNoMesCentavos, classe: "text-emerald-300" },
    { rotulo: "Em atraso", valor: dados.emAtrasoCentavos, classe: "text-amber-300" },
    { rotulo: "MRR (contratos ativos)", valor: dados.mrrCentavos, classe: "text-white" },
    { rotulo: "A vencer em 15 dias", valor: dados.aVencer15dCentavos, classe: "text-cyan-200" },
  ];

  const contagem = dados.clientes.reduce(
    (acc, c) => {
      acc[c.licenca.status] = (acc[c.licenca.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <>
      <PageHeader
        titulo="Dashboard"
        descricao={`${dados.clientes.length} cliente(s) ativos — ${contagem.em_dia ?? 0} em dia, ${
          contagem.atrasado ?? 0
        } atrasado(s), ${contagem.bloqueado ?? 0} bloqueado(s)`}
      />

      {negado ? (
        <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">
          Você não tem permissão para acessar aquela área.
        </div>
      ) : null}

      {veValores ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.rotulo} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs text-white/50">{k.rotulo}</div>
              <div className={`mt-1 text-2xl font-semibold ${k.classe}`}>
                {formatarReais(k.valor)}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-white/50">
        Todos os clientes
      </h2>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Licença</TableHead>
            <TableHead>Contratos</TableHead>
            {veValores ? <TableHead>Mensalidade</TableHead> : null}
            {veValores ? <TableHead>Em aberto</TableHead> : null}
            <TableHead>Próx. vencimento</TableHead>
            <TableHead>Último pgto (mês)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dados.clientes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={veValores ? 7 : 5} className="py-8 text-center text-white/45">
                Nenhum cliente cadastrado ainda.{" "}
                {pode(perfil, "clientes.criar") ? (
                  <Link href="/painel/clientes/novo" className="text-cyan-300 hover:underline">
                    Cadastrar o primeiro
                  </Link>
                ) : null}
              </TableCell>
            </TableRow>
          ) : (
            dados.clientes.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/painel/clientes/${c.id}`} className="font-medium text-white hover:underline">
                    {c.nome}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge status={c.licenca.status} simulacao={config.modoSimulacao} />
                  {c.licenca.status === "atrasado" && c.licenca.toleradoAte ? (
                    <div className="mt-1 text-xs text-white/45">
                      tolerado até {formatarDataBR(c.licenca.toleradoAte)}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-white/70">{c.contratosAtivos}</TableCell>
                {veValores ? (
                  <TableCell>{c.valorMensalCentavos ? formatarReais(c.valorMensalCentavos) : "—"}</TableCell>
                ) : null}
                {veValores ? (
                  <TableCell className={c.emAbertoCentavos > 0 ? "text-amber-300" : "text-white/50"}>
                    {c.emAbertoCentavos ? formatarReais(c.emAbertoCentavos) : "—"}
                  </TableCell>
                ) : null}
                <TableCell className="text-white/70">
                  {c.proximoVencimento ? formatarDataBR(c.proximoVencimento) : "—"}
                </TableCell>
                <TableCell className="text-white/70">
                  {c.ultimoPagamento ? formatarDataBR(c.ultimoPagamento) : "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </>
  );
}
