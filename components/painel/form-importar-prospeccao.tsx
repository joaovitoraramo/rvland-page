"use client";

import * as React from "react";
import { useActionState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";

import { Btn } from "@/components/painel/ui";
import { cn } from "@/lib/utils";
import type { EstadoImportacao } from "@/app/(app)/painel/prospeccao/actions";

export function FormImportarProspeccao({
  acao,
}: {
  acao: (estado: EstadoImportacao, formData: FormData) => Promise<EstadoImportacao>;
}) {
  const [estado, dispatch, pendente] = useActionState<EstadoImportacao, FormData>(acao, {});
  const [nome, setNome] = React.useState<string | null>(null);
  const [arrastando, setArrastando] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const receber = (arquivos: FileList | null) => {
    const arquivo = arquivos?.[0];
    if (!arquivo) return;
    setNome(`${arquivo.name} · ${(arquivo.size / 1024).toFixed(0)} KB`);
  };

  return (
    <form action={dispatch} className="space-y-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          if (inputRef.current && e.dataTransfer.files.length > 0) {
            inputRef.current.files = e.dataTransfer.files;
            receber(e.dataTransfer.files);
          }
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center transition-colors",
          arrastando
            ? "border-[rgba(0,229,255,0.55)] bg-[rgba(0,229,255,0.07)]"
            : "border-white/12 bg-black/20 hover:border-white/25 hover:bg-black/30"
        )}
      >
        <span className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/50">
          {nome ? <FileSpreadsheet className="size-5" /> : <Upload className="size-5" />}
        </span>
        <span className="text-sm text-white/70">
          {nome ?? "Arraste o CSV aqui ou clique para escolher"}
        </span>
        <span className="text-xs text-white/35">planilha-leads.csv · até 5 MB</span>
        <input
          ref={inputRef}
          type="file"
          name="arquivo"
          accept=".csv,text/csv"
          required
          onChange={(e) => receber(e.target.files)}
          className="sr-only"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Btn type="submit" variante="primario" disabled={pendente}>
          {pendente ? "Importando..." : "Importar"}
        </Btn>
        {estado.erro ? (
          <p role="alert" className="text-sm text-red-300">
            {estado.erro}
          </p>
        ) : null}
        {estado.ok ? <p className="text-sm text-emerald-300">{estado.ok}</p> : null}
      </div>
    </form>
  );
}
