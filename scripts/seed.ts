import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

import * as schema from "../lib/db/schema";

/**
 * Seed idempotente: grupos padrão, configurações e (opcional) primeiro
 * usuário Dono via SEED_ADMIN_EMAIL / SEED_ADMIN_SENHA / SEED_ADMIN_NOME.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  // ── Grupos ────────────────────────────────────────────────────────────────
  const gruposPadrao: { nome: string; descricao: string; todas: boolean; permissoes: string[] }[] = [
    {
      nome: "Dono",
      descricao: "Acesso total, inclusive permissões futuras",
      todas: true,
      permissoes: [],
    },
    {
      nome: "Financeiro",
      descricao: "Contratos, valores, cobranças e pagamentos",
      todas: false,
      permissoes: [
        "clientes.ver",
        "contratos.ver",
        "contratos.criar",
        "contratos.editar",
        "contratos.encerrar",
        "financeiro.ver",
        "financeiro.lancar_pagamento",
        "financeiro.editar_cobranca",
        "financeiro.alterar_preco",
        "licencas.ver",
        "plataforma.auditoria",
      ],
    },
    {
      nome: "Operação",
      descricao: "Status de clientes e licenças, sem valores nem contratos",
      todas: false,
      permissoes: [
        "clientes.ver",
        "licencas.ver",
        "licencas.conceder_confianca",
        "licencas.bloquear",
        "licencas.desbloquear",
        "plataforma.auditoria",
      ],
    },
  ];

  for (const g of gruposPadrao) {
    const [existente] = await db
      .select()
      .from(schema.grupos)
      .where(eq(schema.grupos.nome, g.nome));

    let grupoId: string;
    if (existente) {
      grupoId = existente.id;
      console.log(`Grupo "${g.nome}" já existe.`);
    } else {
      const [criado] = await db
        .insert(schema.grupos)
        .values({ nome: g.nome, descricao: g.descricao, todasPermissoes: g.todas })
        .returning();
      grupoId = criado.id;
      console.log(`Grupo "${g.nome}" criado.`);
    }

    for (const permissao of g.permissoes) {
      await db
        .insert(schema.gruposPermissoes)
        .values({ grupoId, permissao })
        .onConflictDoNothing();
    }
  }

  // ── Configurações ─────────────────────────────────────────────────────────
  const configuracoesPadrao: [string, Record<string, unknown>][] = [
    ["modo_panico", { ativo: false }],
    // Simulação nasce LIGADA: nenhum bloqueio real até desligar conscientemente
    ["modo_simulacao", { ativo: true }],
    ["max_dias_confianca", { dias: 7 }],
  ];

  for (const [chave, valor] of configuracoesPadrao) {
    await db.insert(schema.configuracoes).values({ chave, valor }).onConflictDoNothing();
  }
  console.log("Configurações padrão garantidas.");

  // ── Primeiro usuário (opcional) ───────────────────────────────────────────
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminSenha = process.env.SEED_ADMIN_SENHA;
  const adminNome = process.env.SEED_ADMIN_NOME || "Administrador";

  if (adminEmail && adminSenha) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas");
    }

    const [jaExiste] = await db
      .select()
      .from(schema.perfis)
      .where(eq(schema.perfis.email, adminEmail));

    if (jaExiste) {
      console.log(`Perfil ${adminEmail} já existe — nada a fazer.`);
    } else {
      const admin = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data, error } = await admin.auth.admin.createUser({
        email: adminEmail,
        password: adminSenha,
        email_confirm: true,
      });
      if (error) throw new Error(`Falha ao criar usuário no Supabase Auth: ${error.message}`);

      const [grupoDono] = await db
        .select()
        .from(schema.grupos)
        .where(eq(schema.grupos.nome, "Dono"));

      await db.insert(schema.perfis).values({
        id: data.user.id,
        nome: adminNome,
        email: adminEmail,
        grupoId: grupoDono.id,
      });
      console.log(`Usuário Dono ${adminEmail} criado.`);
    }
  } else {
    console.log("SEED_ADMIN_EMAIL/SENHA ausentes — pulei a criação do primeiro usuário.");
  }

  await client.end();
  console.log("Seed concluído.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
