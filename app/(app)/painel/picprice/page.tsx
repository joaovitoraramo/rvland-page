import { Ban, RotateCcw, Tag } from "lucide-react";

import { exigirPermissao, pode } from "@/lib/auth";
import { formatarDataHoraBR } from "@/lib/formato";
import { getStatusServico, listarTokensPicPrice, soDigitos } from "@/lib/picprice/servidor";
import { diaSaoPaulo, LIMITE_DIARIO_PADRAO, usadoHoje } from "@/lib/picprice/cota";
import { PageHeader } from "@/components/painel/page-header";
import { Btn, EmptyState } from "@/components/painel/ui";
import { GerarTokenPicPrice } from "@/components/painel/gerar-token-picprice";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  gerarTokenPicPrice,
  reativarTokenPicPrice,
  revogarTokenPicPrice,
  salvarLimitePicPrice,
  salvarStatusPicPrice,
} from "./actions";

export const metadata = { title: "Tokens RV Pic Price" };

const formatarCnpj = (d: string) =>
  d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d || "sem CNPJ";

export default async function PaginaPicPrice() {
  const perfil = await exigirPermissao("picprice.ver");
  const gerencia = pode(perfil, "picprice.gerenciar");
  const [lista, status] = await Promise.all([listarTokensPicPrice(), getStatusServico()]);
  const ativos = lista.filter((l) => l.status === "ativo").length;
  const hoje = diaSaoPaulo();

  return (
    <>
      <PageHeader
        trilha="rv pic price"
        titulo="Tokens RV Pic Price"
        descricao={`${ativos} token(s) ativo(s). Um token por cliente, vinculado ao CNPJ completo da matriz.`}
      />

      <section className="rv-entrar-1 mb-6 rounded-2xl border border-white/8 bg-white/[0.02] p-4 md:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className={`inline-block size-2.5 rounded-full ${status.estado === "operante" ? "bg-emerald-400" : "bg-amber-400"}`} />
          <h2 className="text-sm font-semibold">
            Status do serviço: {status.estado === "operante" ? "operante" : "manutenção programada"}
          </h2>
        </div>
        <p className="mb-4 text-xs text-white/45">
          Em manutenção, todo cliente recebe o aviso abaixo no lugar dos preços. Revogar um token afeta só aquele cliente.
        </p>
        {gerencia ? (
          <form action={salvarStatusPicPrice} className="grid gap-3 md:grid-cols-[180px_1fr_200px_auto] md:items-end">
            <label className="grid gap-1 text-xs text-white/55">
              Estado
              <select name="estado" defaultValue={status.estado} className="h-10 rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white">
                <option value="operante">Operante</option>
                <option value="manutencao">Manutenção programada</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs text-white/55">
              Mensagem (opcional)
              <input name="mensagem" defaultValue={status.mensagem ?? ""} placeholder="Ex.: atualização do serviço" className="h-10 rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white" />
            </label>
            <label className="grid gap-1 text-xs text-white/55">
              Previsão de volta (opcional)
              <input name="previsao" defaultValue={status.previsao ?? ""} placeholder="Ex.: hoje às 18h" className="h-10 rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white" />
            </label>
            <Btn type="submit">Salvar status</Btn>
          </form>
        ) : null}
      </section>

      <div className="rv-entrar-2">
        {lista.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
            <EmptyState icone={<Tag />} titulo="Nenhum cliente ativo" dica="Cadastre o cliente com o CNPJ da matriz para gerar o token." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>CNPJ da matriz</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uso hoje / limite diário</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((l) => (
                <TableRow key={l.clienteId}>
                  <TableCell className="font-medium">{l.cliente}</TableCell>
                  <TableCell className="font-mono text-xs">{formatarCnpj(l.cnpj ?? soDigitos(l.documento))}</TableCell>
                  <TableCell className="font-mono text-xs text-white/60">{l.prefixo ? `${l.prefixo}…` : "—"}</TableCell>
                  <TableCell>
                    {!l.status ? (
                      <span className="text-xs text-white/40">sem token</span>
                    ) : l.status === "ativo" ? (
                      <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-300">ativo</span>
                    ) : (
                      <span className="rounded-full bg-red-400/10 px-2 py-0.5 text-xs text-red-300">
                        revogado{l.revogadoEm ? ` em ${formatarDataHoraBR(l.revogadoEm)}` : ""}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[210px]">
                    {l.tokenId ? (
                      <UsoDiario
                        usado={usadoHoje(l.usoDia, l.usoQtde, hoje)}
                        limite={l.limiteDiario ?? LIMITE_DIARIO_PADRAO}
                        clienteId={l.clienteId}
                        editar={gerencia}
                      />
                    ) : (
                      <span className="text-xs text-white/40">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-white/55">{l.ultimoUsoEm ? formatarDataHoraBR(l.ultimoUsoEm) : "nunca"}</TableCell>
                  <TableCell className="text-right">
                    {gerencia ? (
                      <div className="flex flex-wrap items-start justify-end gap-2">
                        <GerarTokenPicPrice acao={gerarTokenPicPrice} clienteId={l.clienteId} troca={Boolean(l.status)} />
                        {l.status === "ativo" ? (
                          <form action={revogarTokenPicPrice}>
                            <input type="hidden" name="clienteId" value={l.clienteId} />
                            <Btn type="submit" tamanho="sm" variante="perigo"><Ban /> Revogar</Btn>
                          </form>
                        ) : null}
                        {l.status === "revogado" ? (
                          <form action={reativarTokenPicPrice}>
                            <input type="hidden" name="clienteId" value={l.clienteId} />
                            <Btn type="submit" tamanho="sm"><RotateCcw /> Reativar</Btn>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
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

/** "usadas hoje / limite" com barra; quem gerencia edita o limite ali mesmo. Zera à meia-noite (São Paulo). */
function UsoDiario({ usado, limite, clienteId, editar }: { usado: number; limite: number; clienteId: string; editar: boolean }) {
  const pct = Math.min(100, Math.round((usado / Math.max(1, limite)) * 100));
  const cor = pct >= 100 ? "bg-red-400" : pct >= 80 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-mono text-white/80">
          {usado} / {limite}
        </span>
        <span className={pct >= 100 ? "text-red-300" : "text-white/40"}>{pct >= 100 ? "limite atingido" : `${pct}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      {editar ? (
        <form action={salvarLimitePicPrice} className="flex items-center gap-1.5">
          <input type="hidden" name="clienteId" value={clienteId} />
          <input
            name="limite"
            type="number"
            min={1}
            step={1}
            required
            defaultValue={limite}
            aria-label="Limite diário de requisições"
            className="h-8 w-24 rounded-md border border-white/10 bg-black/40 px-2 text-xs text-white"
          />
          <Btn type="submit" tamanho="sm">Salvar</Btn>
        </form>
      ) : null}
    </div>
  );
}
