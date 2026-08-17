import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { supabaseServer } from "@/lib/supabase/server";
import { FormLogin } from "./form-login";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

export default async function PaginaLogin() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/painel");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 text-white">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-lg font-semibold tracking-wide">RVLand Devs</div>
          <div className="mt-1 text-sm text-white/60">Central de gestão</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <FormLogin />
        </div>
      </div>
    </main>
  );
}
