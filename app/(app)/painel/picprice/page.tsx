import { Activity, KeyRound, Tag, TimerOff, Users } from "lucide-react";

import { exigirPermissao, pode } from "@/lib/auth";
import { getStatusServico, listarTokensPicPrice, soDigitos } from "@/lib/picprice/servidor";
import { diaSaoPaulo, LIMITE_DIARIO_PADRAO, usadoHoje } from "@/lib/picprice/cota";
import { PageHeader } from "@/components/painel/page-header";
import { EmptyState, Kpi } from "@/components/painel/ui";
import { StatusServicoPicPrice } from "@/components/painel/picprice/status-servico-picprice";
import { TokensPicPrice } from "@/components/painel/picprice/tokens-picprice";
import { situacaoDoItem, type ItemToken } from "@/lib/picprice/situacao";
import {
  gerarTokenPicPrice,
  reativarTokenPicPrice,
  revogarTokenPicPrice,
  salvarLimitePicPrice,
  salvarStatusPicPrice,
  salvarValidadePicPrice,
  salvarVerEstabelecimentoPicPrice,
} from "./actions";

export const metadata = { title: "Tokens RV Pic Price" };

const formatarCnpj = (d: string) =>
  d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d || "sem CNPJ";

export default async function PaginaPicPrice() {
  const perfil = await exigirPermissao("picprice.ver");
  const gerencia = pode(perfil, "picprice.gerenciar");
  const [lista, status] = await Promise.all([listarTokensPicPrice(), getStatusServico()]);
  const hoje = diaSaoPaulo();

  // Datas viram ISO: a lista é um componente de cliente (busca e filtros na hora).
  const itens: ItemToken[] = lista.map((l) => ({
    clienteId: l.clienteId,
    cliente: l.cliente,
    cnpj: formatarCnpj(l.cnpj ?? soDigitos(l.documento)),
    temToken: Boolean(l.tokenId),
    prefixo: l.prefixo ?? null,
    status: l.status ?? null,
    criadoEm: l.criadoEm?.toISOString() ?? null,
    revogadoEm: l.revogadoEm?.toISOString() ?? null,
    ultimoUsoEm: l.ultimoUsoEm?.toISOString() ?? null,
    limite: l.limiteDiario ?? LIMITE_DIARIO_PADRAO,
    usado: l.tokenId ? usadoHoje(l.usoDia, l.usoQtde, hoje) : 0,
    expiraEm: l.expiraEm?.toISOString() ?? null,
    verEstabelecimento: Boolean(l.verEstabelecimento),
  }));

  const ativos = itens.filter((i) => i.status === "ativo");
  const usoHoje = ativos.reduce((s, i) => s + i.usado, 0);
  const limiteHoje = ativos.reduce((s, i) => s + i.limite, 0);
  const vencendo = itens.filter((i) => {
    const s = situacaoDoItem(i);
    return s === "vencendo" || s === "expirado";
  }).length;
  const semToken = itens.filter((i) => !i.temToken).length;
  const revogados = itens.filter((i) => i.status === "revogado").length;

  return (
    <>
      <PageHeader
        trilha="rv pic price"
        titulo="Tokens RV Pic Price"
        descricao="Um token por cliente, preso ao CNPJ da matriz. Aqui o suporte acompanha o uso e cuida de cota, validade e troca."
      />

      <div className="rv-entrar-1 mb-4 grid gap-3 md:grid-cols-4">
        <Kpi icone={<KeyRound />} rotulo="tokens ativos" valor={String(ativos.length)} tom="verde" sub={`${itens.length} cliente${itens.length === 1 ? "" : "s"} ativo${itens.length === 1 ? "" : "s"}`} />
        <Kpi
          icone={<Activity />}
          rotulo="consultas hoje"
          valor={String(usoHoje)}
          tom="ciano"
          sub={limiteHoje > 0 ? `de ${limiteHoje} na soma das cotas · zera à meia-noite` : "zera à meia-noite (São Paulo)"}
        />
        <Kpi icone={<TimerOff />} rotulo="vencendo em 7 dias" valor={String(vencendo)} tom={vencendo > 0 ? "ambar" : "neutro"} sub={vencendo > 0 ? "inclui tokens já expirados" : "nenhum token perto de vencer"} />
        <Kpi icone={<Users />} rotulo="sem token / revogados" valor={`${semToken} / ${revogados}`} tom="neutro" sub="clientes ativos que não consultam" />
      </div>

      <div className="rv-entrar-2 mb-5">
        <StatusServicoPicPrice estado={status.estado} mensagem={status.mensagem ?? null} previsao={status.previsao ?? null} gerencia={gerencia} acao={salvarStatusPicPrice} />
      </div>

      <div className="rv-entrar-3">
        {itens.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
            <EmptyState icone={<Tag />} titulo="Nenhum cliente ativo" dica="Cadastre o cliente com o CNPJ da matriz para gerar o token." />
          </div>
        ) : (
          <TokensPicPrice
            itens={itens}
            gerencia={gerencia}
            acoes={{
              gerar: gerarTokenPicPrice,
              revogar: revogarTokenPicPrice,
              reativar: reativarTokenPicPrice,
              limite: salvarLimitePicPrice,
              validade: salvarValidadePicPrice,
              verEstabelecimento: salvarVerEstabelecimentoPicPrice,
            }}
          />
        )}
      </div>
    </>
  );
}
