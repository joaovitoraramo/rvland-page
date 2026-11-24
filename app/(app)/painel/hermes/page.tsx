import { Boxes, CircleAlert, Radio, ShieldAlert, Timer } from "lucide-react";
import Link from "next/link";

import { exigirPermissao, pode } from "@/lib/auth";
import { depsLeituraPainel } from "@/lib/servicos/hermes-painel-runtime";
import { visaoGeralPainel } from "@/lib/servicos/hermes-painel";
import { PageHeader } from "@/components/painel/page-header";
import { Btn, EmptyState, Kpi } from "@/components/painel/ui";
import { AbasHermes } from "@/components/painel/hermes/abas-hermes";
import { CardEnforcementHermes } from "@/components/painel/hermes/card-enforcement-hermes";
import { ListaInstalacoesHermes } from "@/components/painel/hermes/lista-instalacoes-hermes";
import { definirEnforcementHermes } from "./actions";

export const metadata = { title: "Instalações Hermes" };

export default async function PaginaHermes() {
  const perfil = await exigirPermissao("servidores.ver");
  const v = await visaoGeralPainel(depsLeituraPainel);
  const { linhas } = v;

  const ativas = linhas.filter((l) => l.status === "ativa");
  const online = linhas.filter((l) => l.statusServidor === "online").length;
  const carencia = linhas.filter((l) => l.licenca.status === "carencia").length;
  const bloqueadas = ativas.filter((l) => l.licenca.bloqueante).length;
  const clones = linhas.filter((l) => l.cloneSuspeitoEm).length;

  return (
    <>
      <PageHeader
        trilha="hermes"
        titulo="Instalações Hermes"
        descricao="Frota do Hermes: servidor, container, canal e licença de cada cliente."
        acoes={
          pode(perfil, "servidores.cadastrar") ? (
            <Btn asChild variante="primario">
              <Link href="/painel/hermes/chaves">Gerar chave de instalação</Link>
            </Btn>
          ) : undefined
        }
      />
      <AbasHermes ativa="instalacoes" />

      <div className="rv-entrar-1 mb-4 grid gap-3 md:grid-cols-4">
        <Kpi icone={<Boxes />} rotulo="instalações ativas" valor={String(ativas.length)} tom="verde" sub={`${linhas.length} no total`} />
        <Kpi icone={<Radio />} rotulo="online agora" valor={String(online)} tom="ciano" sub="contato nos últimos 5 minutos" />
        <Kpi icone={<Timer />} rotulo="em carência" valor={String(carencia)} tom={carencia > 0 ? "ambar" : "neutro"} sub={carencia > 0 ? "pagamento atrasado, ainda operando" : "nenhuma em carência"} />
        <Kpi
          icone={clones > 0 ? <ShieldAlert /> : <CircleAlert />}
          rotulo="bloqueantes / clones"
          valor={`${bloqueadas} / ${clones}`}
          tom={bloqueadas + clones > 0 ? "ambar" : "neutro"}
          sub="ativas com licença bloqueante / alertas de clone"
        />
      </div>

      <div className="rv-entrar-2 mb-5">
        <CardEnforcementHermes
          ativo={v.enforcement.ativo}
          ligadoEm={v.enforcement.ligado_em}
          ligadoPor={v.enforcement.ligado_por}
          motivoAtual={v.enforcement.motivo}
          pode={v.prontidao.pode}
          motivoBloqueio={v.prontidao.motivo}
          comProva={v.prontidao.comProva}
          total={v.prontidao.total}
          bloqueariam={v.bloqueariamAoValer}
          podeAlterar={pode(perfil, "plataforma.simulacao")}
          acao={definirEnforcementHermes}
        />
      </div>

      <div className="rv-entrar-3">
        {linhas.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02]">
            <EmptyState
              icone={<Boxes />}
              titulo="Nenhuma instalação Hermes ainda"
              dica="Gere uma chave de instalação para o cliente; a instalação aparece aqui quando o instalador a usa."
              acao={
                pode(perfil, "servidores.cadastrar") ? (
                  <Btn asChild variante="primario" tamanho="sm">
                    <Link href="/painel/hermes/chaves">Gerar chave de instalação</Link>
                  </Btn>
                ) : undefined
              }
            />
          </div>
        ) : (
          <ListaInstalacoesHermes linhas={linhas} />
        )}
      </div>
    </>
  );
}
