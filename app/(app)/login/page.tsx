import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { supabaseServer } from "@/lib/supabase/server";
import { FormLogin } from "./form-login";

export const metadata: Metadata = {
  title: "Entrar | RVLand",
  robots: { index: false, follow: false },
};

export default async function PaginaLogin() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/painel");

  return (
    <main className="painel relative flex min-h-screen items-center justify-center overflow-hidden bg-[#05070b] px-4 text-white">
      {/* atmosfera */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(900px_circle_at_30%_15%,rgba(0,229,255,0.1),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(700px_circle_at_75%_85%,rgba(0,255,138,0.07),transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(rgba(255,255,255,0.4)_1px,transparent_1px)] [background-size:24px_24px]" />
      </div>

      <div className="relative w-full max-w-[400px]">
        {/* marca */}
        <div className="rv-entrar-escala mb-8 flex flex-col items-center gap-4">
          <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-[#00E5FF] to-[#00FF8A] font-mono text-lg font-bold text-[#05070B] shadow-[0_8px_40px_rgba(0,229,255,0.35)]">
            RV
          </span>
          <div className="text-center leading-tight">
            <div className="text-lg font-semibold tracking-wide">RVLand Devs</div>
            <div className="rv-eyebrow mt-1.5">central de gestão</div>
          </div>
        </div>

        {/* cartão com borda-gradiente */}
        <div className="rv-entrar-1 rounded-3xl bg-[linear-gradient(135deg,rgba(0,229,255,0.35),rgba(255,255,255,0.06)_35%,rgba(255,255,255,0.06)_65%,rgba(0,255,138,0.3))] p-[1px]">
          <div className="rounded-3xl border border-transparent bg-[#080b11]/95 p-7 backdrop-blur-xl">
            <FormLogin />
          </div>
        </div>

        <p className="rv-eyebrow rv-entrar-2 mt-6 text-center">acesso restrito · rvland devs</p>
      </div>
    </main>
  );
}
