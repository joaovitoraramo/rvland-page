import Link from "next/link";
import { ArrowUpRight, Plus, Server } from "lucide-react";

import { exigirPermissao, pode } from "@/lib/auth";
import { listarServidores } from "@/lib/consultas/servidores";
import { formatarDataHoraBR } from "@/lib/formato";
import { PageHeader } from "@/components/painel/page-header";
import { BadgeServidor } from "@/components/painel/badge-servidor";
import { MonitorVivo } from "@/components/painel/monitor-vivo";
import { Btn, EmptyState } from "@/components/painel/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Servidores" };

export default async function PaginaServidores() {
  const perfil = await exigirPermissao("servidores.ver");
  const lista = await listarServidores();

  const online = lista.filter((s) => s.status === "online").length;
  const offline = lista.filter((s) => s.status === "offline").length;

  return (
    <>
      <PageHeader
        trilha="servidores"
        titulo="Parque"
        descricao={`${lista.length} servidor(es) — ${online} online · ${offline} offline`}
        acoes={
          <>
            {lista.length > 0 ? <MonitorVivo segundosIniciais={null} /> : null}
            {pode(perfil, "servidores.cadastrar") ? (
              <Btn asChild variante="primario">
                <Link href="/painel/servidores/novo">
                  <Plus className="size-4" /> Novo servidor
                </Link>
              </Btn>
            ) : null}
          </>
        }
      />

      <div className="rv-entrar-1">
        {lista.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
            <EmptyState
              icone={<Server />}
              titulo="Nenhum servidor cadastrado"
              dica="Cadastre um servidor para gerar o token de instalação do agente."
              acao={
                pode(perfil, "servidores.cadastrar") ? (
                  <Btn asChild variante="primario" tamanho="sm">
                    <Link href="/painel/servidores/novo">Cadastrar servidor</Link>
                  </Btn>
                ) : undefined
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Servidor</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Agente</TableHead>
                <TableHead className="text-right">CPU / Disco</TableHead>
                <TableHead>Último contato</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link
                      href={`/painel/servidores/${s.id}`}
                      className="font-medium text-white hover:text-[#8AF0FF]"
                    >
                      {s.nome}
                    </Link>
                    {s.host ? <div className="rv-num mt-0.5 text-xs text-white/40">{s.host}</div> : null}
                  </TableCell>
                  <TableCell rotulo="cliente" className="text-white/70">{s.clienteNome}</TableCell>
                  <TableCell rotulo="status">
                    <BadgeServidor status={s.status} />
                  </TableCell>
                  <TableCell rotulo="agente" className="rv-num text-white/55">{s.agenteVersao ?? "—"}</TableCell>
                  <TableCell rotulo="cpu / disco" className="rv-num text-right text-white/60">
                    {s.cpuPct != null ? `${s.cpuPct}%` : "—"} / {s.discoPct != null ? `${s.discoPct}%` : "—"}
                  </TableCell>
                  <TableCell rotulo="último contato" className="rv-num text-white/55">
                    {s.ultimoContatoEm ? formatarDataHoraBR(s.ultimoContatoEm) : "nunca"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Btn asChild tamanho="sm" className="max-md:w-full">
                      <Link href={`/painel/servidores/${s.id}`}>
                        Abrir <ArrowUpRight className="size-3.5" />
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
