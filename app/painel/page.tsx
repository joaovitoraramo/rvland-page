import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { exigirPerfil, pode } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { dadosDashboard } from "@/lib/consultas/dashboard";
import { PageHeader } from "@/components/painel/page-header";
import { StatusBadge } from "@/components/painel/status-badge";
import { Btn, EmptyState, Kpi } from "@/components/painel/ui";
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
        trilha="dashboard"
        titulo="Visão geral"
        descricao={`${dados.clientes.length} cliente(s) ativos — ${contagem.em_dia ?? 0} em dia · ${
          contagem.atrasado ?? 0
        } atrasado(s) · ${contagem.bloqueado ?? 0} bloqueado(s)`}
      />

      {negado ? (
        <div className="rv-entrar mb-4 rounded-xl border border-[rgba(255,194,77,0.25)] bg-[rgba(255,194,77,0.08)] px-4 py-2.5 text-sm text-[#FFD58A]">
          Você não tem permissão para acessar aquela área.
        </div>
      ) : null}

      {veValores ? (
        <div className="rv-entrar-1 mb-7 grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-3 lg:grid-cols-4">
          <Kpi
            icone={<Wallet />}
            rotulo="recebido no mês"
            valor={formatarReais(dados.recebidoNoMesCentavos)}
            tom={dados.recebidoNoMesCentavos > 0 ? "verde" : "neutro"}
          />
          <Kpi
            icone={<AlertTriangle />}
            rotulo="em atraso"
            valor={formatarReais(dados.emAtrasoCentavos)}
            tom={dados.emAtrasoCentavos > 0 ? "ambar" : "neutro"}
          />
          <Kpi
            icone={<TrendingUp />}
            rotulo="mrr"
            valor={formatarReais(dados.mrrCentavos)}
            tom="ciano"
            sub="contratos ativos"
          />
          <Kpi
            icone={<CalendarClock />}
            rotulo="a vencer · 15 dias"
            valor={formatarReais(dados.aVencer15dCentavos)}
          />
        </div>
      ) : null}

      <div className="rv-entrar-2">
        <div className="rv-eyebrow mb-3">todos os clientes</div>

        {dados.clientes.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
            <EmptyState
              icone={<Users />}
              titulo="Nenhum cliente cadastrado ainda"
              dica="O dashboard ganha vida com o primeiro cadastro."
              acao={
                pode(perfil, "clientes.criar") ? (
                  <Btn asChild variante="primario" tamanho="sm">
                    <Link href="/painel/clientes/novo">Cadastrar o primeiro</Link>
                  </Btn>
                ) : undefined
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Licença</TableHead>
                <TableHead className="text-center">Contratos</TableHead>
                {veValores ? <TableHead className="text-right">Mensalidade</TableHead> : null}
                {veValores ? <TableHead className="text-right">Em aberto</TableHead> : null}
                <TableHead>Próx. venc.</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.clientes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/painel/clientes/${c.id}`}
                      className="font-medium text-white hover:text-[#8AF0FF]"
                    >
                      {c.nome}
                    </Link>
                  </TableCell>
                  <TableCell rotulo="licença">
                    <StatusBadge status={c.licenca.status} simulacao={config.modoSimulacao} />
                    {c.licenca.status === "atrasado" && c.licenca.toleradoAte ? (
                      <div className="rv-num mt-1 text-xs text-white/40">
                        tolerado até {formatarDataBR(c.licenca.toleradoAte)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell rotulo="contratos" className="rv-num text-center text-white/70">
                    {c.contratosAtivos}
                  </TableCell>
                  {veValores ? (
                    <TableCell rotulo="mensalidade" className="rv-num text-right">
                      {c.valorMensalCentavos ? formatarReais(c.valorMensalCentavos) : "—"}
                    </TableCell>
                  ) : null}
                  {veValores ? (
                    <TableCell
                      rotulo="em aberto"
                      className={`rv-num text-right ${
                        c.emAbertoCentavos > 0 ? "rv-fosforo-ambar" : "text-white/40"
                      }`}
                    >
                      {c.emAbertoCentavos ? formatarReais(c.emAbertoCentavos) : "—"}
                    </TableCell>
                  ) : null}
                  <TableCell rotulo="próx. venc." className="rv-num text-white/70">
                    {c.proximoVencimento ? formatarDataBR(c.proximoVencimento) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Btn asChild tamanho="sm" className="max-md:w-full">
                      <Link href={`/painel/clientes/${c.id}`}>
                        Abrir
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    </Btn>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
