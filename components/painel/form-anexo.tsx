"use client";

import * as React from "react";
import { useActionState } from "react";
import { Paperclip, Upload } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import type { EstadoAnexo } from "@/app/painel/clientes/[id]/anexos-actions";

export function FormAnexo({
  acao,
}: {
  acao: (estado: EstadoAnexo, formData: FormData) => Promise<EstadoAnexo>;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoAnexo, FormData>(acao, {});
  const [nomeArquivo, setNomeArquivo] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  return (
    <form action={dispatch} className="space-y-2.5 border-t border-white/8 pt-4">
      {/* input nativo escondido; o rótulo estilizado é o gatilho */}
      <input
        ref={inputRef}
        type="file"
        name="arquivo"
        required
        className="sr-only"
        onChange={(e) => setNomeArquivo(e.target.files?.[0]?.name ?? "")}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Btn type="button" tamanho="sm" onClick={() => inputRef.current?.click()}>
          <Paperclip className="size-3.5" />
          Escolher arquivo
        </Btn>

        {nomeArquivo ? (
          <span className="max-w-[180px] truncate text-xs text-white/55">{nomeArquivo}</span>
        ) : (
          <span className="text-xs text-white/30">nenhum selecionado</span>
        )}

        <Btn type="submit" tamanho="sm" variante="primario" disabled={pendente || !nomeArquivo}>
          <Upload className="size-3.5" />
          {pendente ? "Enviando..." : "Enviar"}
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
