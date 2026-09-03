import Link from "next/link";
import { desc } from "drizzle-orm";
import {
  ArrowUpRight,
  Flame,
  Globe,
  Instagram,
  Mail,
  MessageSquare,
  Radar,
  Trophy,
  Upload,
  Users,
} from "lucide-react";

import { db, prospeccao } from "@/lib/db";
import { exigirPermissao, pode } from "@/lib/auth";
import { PageHeader } from "@/components/painel/page-header";
import { Btn, EmptyState, Kpi } from "@/components/painel/ui";
import { BadgeProspect } from "@/components/painel/badge-prospect";
import {
  BarrasHorizontais,
  CardGrafico,
  Funil,
  MedidorPotencial,
  Rosca,
} from "@/components/painel/graficos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  agrupar,
  ETAPAS_ATIVAS,
  ETAPAS_FUNIL,
  linkContatoProspect,
  ROTULO_STATUS_PROSPECT,
  temperaturaDe,
  type StatusProspect,
} from "@/lib/dominio/prospeccao";

export const metadata = { title: "Prospecção" };

const ETAPAS_VISIVEIS: StatusProspect[] = [
  "novo",
  "seguindo",
  "comentou",
  "contatado",
  "respondeu",
  "previa",
  "negociando",
  "ganho",
];

function formatarMilhar(n: number) {
  return n.toLocaleString("pt-BR");
}

export default async function PaginaProspeccao({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    temp?: string;
    nicho?: string;
    cidade?: string;
    perfil?: string;
    q?: string;
  }>;
}) {
  const perfilUsuario = await exigirPermissao("prospeccao.ver");
  const filtros = await searchParams;

  const todos = await db
    .select()
    .from(prospeccao)
    .orderBy(desc(prospeccao.potencial), desc(prospeccao.seguidores));

  // ── métricas sobre a carteira inteira (o filtro é só da tabela) ───────────
  const quentes = todos.filter((p) => p.potencial >= 8);
  const emConversa = todos.filter((p) => ETAPAS_ATIVAS.includes(p.status));
  const ganhos = todos.filter((p) => p.status === "ganho");
  const alcance = todos.reduce((s, p) => s + (p.seguidores ?? 0), 0);
  const naFila = todos.filter((p) => p.status === "novo" && p.potencial >= 6);

  const funil = ETAPAS_VISIVEIS.map((etapa) => ({
    rotulo: ROTULO_STATUS_PROSPECT[etapa],
    qtd: todos.filter((p) => p.status === etapa).length,
    cor:
      etapa === "ganho"
        ? "from-[rgba(0,255,138,0.5)] to-[rgba(0,255,138,0.3)]"
        : undefined,
  }));

  const porTemperatura = [
    { rotulo: "Quente (8-10)", qtd: quentes.length, cor: "#00FF8A" },
    { rotulo: "Morno (6-7)", qtd: todos.filter((p) => temperaturaDe(p.potencial) === "morno").length, cor: "#FFC24D" },
    { rotulo: "Frio (1-5)", qtd: todos.filter((p) => temperaturaDe(p.potencial) === "frio").length, cor: "rgba(255,255,255,0.25)" },
  ];

  const porNicho = agrupar(todos, (p) => p.nicho);
  const porCidade = agrupar(todos, (p) => p.cidade);
  const porPerfil = [
    { rotulo: "Cidade afluente", qtd: todos.filter((p) => p.perfilCidade === "Afluente").length, cor: "#00E5FF" },
    { rotulo: "Cidade média", qtd: todos.filter((p) => p.perfilCidade !== "Afluente").length, cor: "rgba(255,255,255,0.28)" },
  ];

  // ── filtro da tabela ──────────────────────────────────────────────────────
  const busca = (filtros.q ?? "").trim().toLowerCase();
  const lista = todos.filter((p) => {
    if (filtros.status && p.status !== filtros.status) return false;
    if (filtros.temp && temperaturaDe(p.potencial) !== filtros.temp) return false;
    if (filtros.nicho && p.nicho !== filtros.nicho) return false;
    if (filtros.cidade && p.cidade !== filtros.cidade) return false;
    if (filtros.perfil && p.perfilCidade !== filtros.perfil) return false;
    if (busca) {
      const alvo = `${p.negocio} ${p.dominio} ${p.instagram ?? ""} ${p.emails ?? ""}`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });

  const podeImportar = pode(perfilUsuario, "prospeccao.importar");

  if (todos.length === 0) {
    return (
      <>
        <PageHeader trilha="prospecção" titulo="Prospecção" />
        <div className="rv-entrar rounded-2xl border border-white/8 bg-white/[0.02]">
          <EmptyState
            icone={<Radar />}
            titulo="Nenhum prospect importado ainda"
            dica="Suba o CSV da varredura para ver o funil, os gráficos e começar a trabalhar a lista."
            acao={
              podeImportar ? (
                <Btn asChild variante="primario">
                  <Link href="/painel/prospeccao/importar">
                    <Upload className="size-4" /> Importar planilha
                  </Link>
                </Btn>
              ) : undefined
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        trilha="prospecção"
        titulo="Prospecção"
        descricao={`${todos.length} negócios varridos · ${naFila.length} bons ainda intocados na fila`}
        acoes={
          podeImportar ? (
            <Btn asChild variante="secundario">
              <Link href="/painel/prospeccao/importar">
                <Upload className="size-4" /> Importar planilha
              </Link>
            </Btn>
          ) : undefined
        }
      />

      {/* KPIs */}
      <div className="rv-entrar-1 mb-5 grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-3 lg:grid-cols-5">
        <Kpi icone={<Radar />} rotulo="na carteira" valor={formatarMilhar(todos.length)} />
        <Kpi
          icone={<Flame />}
          rotulo="quentes"
          valor={formatarMilhar(quentes.length)}
          tom={quentes.length > 0 ? "verde" : "neutro"}
          sub="potencial 8 a 10"
        />
        <Kpi
          icone={<MessageSquare />}
          rotulo="em conversa"
          valor={formatarMilhar(emConversa.length)}
          tom={emConversa.length > 0 ? "ciano" : "neutro"}
        />
        <Kpi
          icone={<Trophy />}
          rotulo="ganhos"
          valor={formatarMilhar(ganhos.length)}
          tom={ganhos.length > 0 ? "verde" : "neutro"}
        />
        <Kpi
          icone={<Users />}
          rotulo="alcance no instagram"
          valor={formatarMilhar(alcance)}
          sub={`${todos.filter((p) => p.instagram).length} contas verificadas`}
        />
      </div>

      {/* gráficos */}
      <div className="rv-entrar-2 mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <CardGrafico
          titulo="Funil comercial"
          dica="A porcentagem à direita é quanto passou da etapa anterior."
          className="lg:col-span-2"
        >
          <Funil etapas={funil} />
        </CardGrafico>

        <CardGrafico titulo="Temperatura da carteira" dica="Potencial atribuído na avaliação visual do site.">
          <Rosca dados={porTemperatura} centroValor={quentes.length} centroRotulo="alvos quentes" />
        </CardGrafico>

        <CardGrafico titulo="Perfil das cidades" dica="Cidade afluente aguenta ticket maior.">
          <Rosca
            dados={porPerfil}
            centroValor={`${Math.round((porPerfil[0].qtd / todos.length) * 100)}%`}
            centroRotulo="em cidade afluente"
          />
        </CardGrafico>

        <CardGrafico titulo="Nichos" dica="Onde a varredura encontrou mais oportunidade.">
          <BarrasHorizontais dados={porNicho} limite={8} />
        </CardGrafico>

        <CardGrafico titulo="Cidades" dica="Concentre a rotina de follow por cidade.">
          <BarrasHorizontais dados={porCidade} limite={8} />
        </CardGrafico>
      </div>

      {/* filtros */}
      <form className="rv-entrar-3 mb-4 flex flex-wrap items-center gap-2" action="/painel/prospeccao">
        <input
          name="q"
          defaultValue={filtros.q ?? ""}
          placeholder="Buscar negócio, site, @ ou e-mail"
          className="!w-full sm:!w-64"
        />
        <select name="status" defaultValue={filtros.status ?? ""} className="!w-full sm:!w-44">
          <option value="">Todos os status</option>
          {ETAPAS_FUNIL.map((e) => (
            <option key={e} value={e}>
              {ROTULO_STATUS_PROSPECT[e]}
            </option>
          ))}
        </select>
        <select name="temp" defaultValue={filtros.temp ?? ""} className="!w-full sm:!w-40">
          <option value="">Qualquer potencial</option>
          <option value="quente">Quente (8-10)</option>
          <option value="morno">Morno (6-7)</option>
          <option value="frio">Frio (1-5)</option>
        </select>
        <select name="nicho" defaultValue={filtros.nicho ?? ""} className="!w-full sm:!w-40">
          <option value="">Todos os nichos</option>
          {porNicho.map((n) => (
            <option key={n.rotulo} value={n.rotulo}>
              {n.rotulo}
            </option>
          ))}
        </select>
        <select name="cidade" defaultValue={filtros.cidade ?? ""} className="!w-full sm:!w-44">
          <option value="">Todas as cidades</option>
          {porCidade.map((c) => (
            <option key={c.rotulo} value={c.rotulo}>
              {c.rotulo}
            </option>
          ))}
        </select>
        <select name="perfil" defaultValue={filtros.perfil ?? ""} className="!w-full sm:!w-40">
          <option value="">Qualquer cidade</option>
          <option value="Afluente">Afluente</option>
          <option value="Média">Média</option>
        </select>
        <Btn type="submit" className="max-sm:w-full">Filtrar</Btn>
        {Object.values(filtros).some(Boolean) ? (
          <Btn asChild variante="fantasma" className="max-sm:w-full">
            <Link href="/painel/prospeccao">Limpar</Link>
          </Btn>
        ) : null}
      </form>

      <div className="rv-entrar-3">
        <div className="rv-eyebrow mb-3">
          {lista.length === todos.length
            ? `${todos.length} prospects`
            : `${lista.length} de ${todos.length} prospects`}
        </div>

        {lista.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
            <EmptyState icone={<Radar />} titulo="Nada nesse filtro" dica="Afrouxe os filtros acima." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Potencial</TableHead>
                <TableHead>Negócio</TableHead>
                <TableHead>Nicho</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead className="text-center">Canais</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((p) => {
                const ig = linkContatoProspect.instagram(p.instagram);
                const mail = linkContatoProspect.email(p.emails);
                return (
                  <TableRow key={p.id}>
                    <TableCell rotulo="potencial">
                      <MedidorPotencial valor={p.potencial} tamanho="sm" />
                    </TableCell>
                    <TableCell rotulo="negócio">
                      <span className="block max-w-[22rem] truncate font-medium text-white">
                        {p.negocio}
                      </span>
                      <span className="rv-num block truncate text-xs text-white/35">{p.dominio}</span>
                    </TableCell>
                    <TableCell rotulo="nicho" className="text-white/60">{p.nicho}</TableCell>
                    <TableCell rotulo="cidade">
                      <span className="block text-sm text-white/70">{p.cidade}</span>
                      {p.perfilCidade === "Afluente" ? (
                        <span className="rv-eyebrow text-[#8AF0FF]">afluente</span>
                      ) : null}
                    </TableCell>
                    <TableCell rotulo="canais">
                      <span className="flex items-center gap-1.5 md:justify-center">
                        <a
                          href={linkContatoProspect.site(p.dominio)}
                          target="_blank"
                          rel="noreferrer"
                          title={`Abrir ${p.dominio}`}
                          className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-white/55 transition-colors hover:border-white/20 hover:text-white"
                        >
                          <Globe className="size-3.5" />
                        </a>
                        {ig ? (
                          <a
                            href={ig}
                            target="_blank"
                            rel="noreferrer"
                            title={`Abrir ${p.instagram}${p.seguidores ? ` · ${formatarMilhar(p.seguidores)} seguidores` : ""}`}
                            className="grid size-8 place-items-center rounded-lg border border-[rgba(0,229,255,0.2)] bg-[rgba(0,229,255,0.07)] text-[#8AF0FF] transition-colors hover:border-[rgba(0,229,255,0.45)]"
                          >
                            <Instagram className="size-3.5" />
                          </a>
                        ) : null}
                        {mail ? (
                          <a
                            href={mail}
                            title={p.emails ?? undefined}
                            className="grid size-8 place-items-center rounded-lg border border-[rgba(0,255,138,0.2)] bg-[rgba(0,255,138,0.07)] text-[#7DFFC4] transition-colors hover:border-[rgba(0,255,138,0.45)]"
                          >
                            <Mail className="size-3.5" />
                          </a>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell rotulo="status">
                      <BadgeProspect status={p.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Btn asChild tamanho="sm" className="max-md:w-full">
                        <Link href={`/painel/prospeccao/${p.id}`}>
                          Abrir
                          <ArrowUpRight className="size-3.5" />
                        </Link>
                      </Btn>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
