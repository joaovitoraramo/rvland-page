"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

const esquemaLogin = z.object({
  email: z.string().trim().email(),
  senha: z.string().min(1),
});

export type EstadoLogin = { erro?: string };

export async function entrar(_estado: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const dados = esquemaLogin.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
  });

  // Mensagem única e genérica: não revelar se o email existe
  if (!dados.success) return { erro: "Credenciais inválidas." };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: dados.data.email,
    password: dados.data.senha,
  });

  if (error) return { erro: "Credenciais inválidas." };

  redirect("/painel");
}

export async function sair(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
