"use client";

import * as React from "react";
import { useActionState } from "react";

import type { EstadoUsuario } from "@/app/(app)/painel/config/actions";

/** Select que troca o grupo do usuário ao mudar (submit automático). */
export function TrocaGrupo({
  acao,
  grupoAtual,
  gruposDisponiveis,
}: {
  acao: (estado: EstadoUsuario, formData: FormData) => Promise<EstadoUsuario>;
  grupoAtual: string;
  gruposDisponiveis: { id: string; nome: string }[];
}) {
  const [estado, dispatch] = useActionState<EstadoUsuario, FormData>(acao, {});
  const formRef = React.useRef<HTMLFormElement | null>(null);

  return (
    <form ref={formRef} action={dispatch}>
      <select
        name="grupoId"
        defaultValue={grupoAtual}
        onChange={() => formRef.current?.requestSubmit()}
        className="!h-8 !w-auto rounded-lg text-[13px]"
      >
        {gruposDisponiveis.map((g) => (
          <option key={g.id} value={g.id}>
            {g.nome}
          </option>
        ))}
      </select>
      {estado.erro ? (
        <p role="alert" className="mt-1 text-xs text-red-300">
          {estado.erro}
        </p>
      ) : null}
    </form>
  );
}
