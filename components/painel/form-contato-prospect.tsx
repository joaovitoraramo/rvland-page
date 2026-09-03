"use client";

import * as React from "react";
import { useActionState } from "react";
import { Instagram, Mail, Phone, ShieldCheck, Users } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import type { EstadoContato } from "@/app/(app)/painel/prospeccao/actions";

/**
 * Correção manual do contato. A varredura acha o que está no HTML; o resto
 * (aba contact, Google Maps, bio do Instagram) o João garimpa e anota aqui.
 */
export function FormContatoProspect({
  acao,
  emails,
  instagram,
  telefone,
  seguidores,
  manual,
}: {
  acao: (estado: EstadoContato, formData: FormData) => Promise<EstadoContato>;
  emails: string | null;
  instagram: string | null;
  telefone: string | null;
  seguidores: number | null;
  manual: boolean;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoContato, FormData>(acao, {});
  const [aberto, setAberto] = React.useState(false);

  const campo = (
    id: string,
    rotulo: string,
    icone: React.ReactNode,
    valor: string,
    props: React.ComponentProps<"input">
  ) => (
    <div>
      <label className="rv-eyebrow mb-1.5 flex items-center gap-1.5" htmlFor={id}>
        <span className="text-white/35 [&_svg]:size-3">{icone}</span>
        {rotulo}
      </label>
      <input id={id} name={id} defaultValue={valor} {...props} />
    </div>
  );

  if (!aberto) {
    return (
      <div className="space-y-3">
        <div className="grid gap-2.5 text-sm">
          <Linha icone={<Mail />} rotulo="e-mail" valor={emails} />
          <Linha icone={<Instagram />} rotulo="instagram" valor={instagram} />
          <Linha icone={<Phone />} rotulo="telefone" valor={telefone} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Btn tamanho="sm" onClick={() => setAberto(true)}>
            {emails || instagram || telefone ? "Corrigir contato" : "Adicionar contato"}
          </Btn>
          {manual ? (
            <span className="flex items-center gap-1.5 text-[11px] text-[#7DFFC4]">
              <ShieldCheck className="size-3" />
              protegido da reimportação
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form action={dispatch} className="space-y-3">
      {campo("emails", "e-mail", <Mail />, emails ?? "", {
        placeholder: "contato@empresa.com",
        type: "text",
      })}
      {campo("instagram", "instagram", <Instagram />, instagram ?? "", {
        placeholder: "@perfil ou link colado",
      })}
      {campo("telefone", "telefone", <Phone />, telefone ?? "", {
        placeholder: "(555) 123-4567",
        inputMode: "tel",
      })}
      {campo("seguidores", "seguidores", <Users />, seguidores ? String(seguidores) : "", {
        placeholder: "4200",
        inputMode: "numeric",
      })}

      <p className="text-[11px] leading-relaxed text-white/35">
        Pode colar mais de um e-mail separado por vírgula. Depois de salvar, a
        reimportação da planilha não sobrescreve mais estes campos.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Btn type="submit" variante="primario" tamanho="sm" disabled={pendente}>
          {pendente ? "Salvando..." : "Salvar contato"}
        </Btn>
        <Btn type="button" tamanho="sm" variante="fantasma" onClick={() => setAberto(false)}>
          Cancelar
        </Btn>
      </div>

      {estado.erro ? (
        <p role="alert" className="text-xs text-red-300">
          {estado.erro}
        </p>
      ) : null}
      {estado.ok ? <p className="text-xs text-emerald-300">{estado.ok}</p> : null}
    </form>
  );
}

function Linha({
  icone,
  rotulo,
  valor,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string | null;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-white/30 [&_svg]:size-3.5">{icone}</span>
      <span className="min-w-0 flex-1">
        <span className="rv-eyebrow block">{rotulo}</span>
        <span className={valor ? "break-all text-white/85" : "text-white/30"}>
          {valor ?? "não encontrado na varredura"}
        </span>
      </span>
    </div>
  );
}
