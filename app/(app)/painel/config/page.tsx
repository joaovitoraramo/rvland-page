import Link from "next/link";
import { ShieldAlert, FlaskConical, Users, UserCog, CircleDollarSign } from "lucide-react";

import { exigirPerfil, pode } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import {
  alternarPanico,
  alternarSimulacao,
  salvarTetoConfianca,
} from "./actions";
import { PageHeader } from "@/components/painel/page-header";
import {
  FormTetoConfianca,
  FormToggleConfig,
} from "@/components/painel/form-toggle-config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Configurações" };

export default async function PaginaConfig() {
  const perfil = await exigirPerfil();
  const config = await getConfig();

  const podePanico = pode(perfil, "plataforma.panico");
  const podeSimulacao = pode(perfil, "plataforma.simulacao");
  const podeGrupos = pode(perfil, "plataforma.grupos");
  const podeUsuarios = pode(perfil, "plataforma.usuarios");
  const podePrecos = pode(perfil, "site.precos");

  return (
    <>
      <PageHeader trilha="config" titulo="Configurações" />

      <div className="rv-entrar-1 grid gap-4 lg:grid-cols-2">
        {podePanico ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-white">
                <ShieldAlert className="h-4 w-4 text-red-300" />
                Botão de pânico
              </CardTitle>
              <CardDescription className="text-white/60">
                {config.modoPanico
                  ? "ATIVO — nenhum cliente é bloqueado por atraso."
                  : "Inativo — bloqueios por atraso seguem as regras."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormToggleConfig
                acao={alternarPanico}
                ligado={config.modoPanico}
                palavraLigar="SUSPENDER"
                palavraDesligar="REATIVAR"
                rotuloLigar="Suspender todos os bloqueios"
                rotuloDesligar="Reativar bloqueios"
                perigoso={config.modoPanico}
              />
            </CardContent>
          </Card>
        ) : null}

        {podeSimulacao ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-white">
                <FlaskConical className="h-4 w-4 text-cyan-200" />
                Modo simulação
              </CardTitle>
              <CardDescription className="text-white/60">
                {config.modoSimulacao
                  ? "LIGADO — bloqueios são apenas indicados, nada é executado."
                  : "DESLIGADO — bloqueios valem de verdade (Fase 2: agente executa)."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormToggleConfig
                acao={alternarSimulacao}
                ligado={config.modoSimulacao}
                palavraLigar="SIMULAR"
                palavraDesligar="VALER"
                rotuloLigar="Ligar simulação"
                rotuloDesligar="Desligar simulação (bloqueios valem)"
                perigoso={config.modoSimulacao}
              />
            </CardContent>
          </Card>
        ) : null}

        {podePanico ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-white">Dias de confiança — teto</CardTitle>
              <CardDescription className="text-white/60">
                Máximo que grupos sem acesso total podem conceder de uma vez.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormTetoConfianca acao={salvarTetoConfianca} atual={config.maxDiasConfianca} />
            </CardContent>
          </Card>
        ) : null}

        {podeGrupos || podeUsuarios ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-white">Acesso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {podeGrupos ? (
                <Link
                  href="/painel/config/grupos"
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/80 transition-colors hover:bg-black/30"
                >
                  <UserCog className="h-4 w-4" />
                  Grupos e permissões
                </Link>
              ) : null}
              {podeUsuarios ? (
                <Link
                  href="/painel/config/usuarios"
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/80 transition-colors hover:bg-black/30"
                >
                  <Users className="h-4 w-4" />
                  Usuários
                </Link>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {podePrecos ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-white">Site</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href="/painel/config/precos-site"
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/80 transition-colors hover:bg-black/30"
              >
                <CircleDollarSign className="h-4 w-4" />
                Preços do site (/en)
              </Link>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
