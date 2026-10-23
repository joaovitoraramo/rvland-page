import { Ban, RotateCcw, Tag } from "lucide-react";

import { exigirPermissao, pode } from "@/lib/auth";
import { formatarDataHoraBR } from "@/lib/formato";
import { getStatusServico, listarTokensPicPrice, soDigitos } from "@/lib/picprice/servidor";
import { PageHeader } from "@/components/painel/page-header";
import { Btn, EmptyState } from "@/components/painel/ui";
import { GerarTokenPicPrice } from "@/components/painel/gerar-token-picprice";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  gerarTokenPicPrice,
  reativarTokenPicPrice,
  revogarTokenPicPrice,
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
