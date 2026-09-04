/* Quem está esperando follow-up, e o que fazer com cada um.

   Consulta direto o banco em vez de usar lib/servicos: aquele módulo é
   server-only (Next), e o mesmo protocolo puro de lib/dominio/follow-up
   decide aqui e lá, então as duas respostas não podem divergir.

   Uso: npx tsx scripts/follow-ups.ts */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { db, prospeccao } from "../lib/db";
import { hojeSP } from "../lib/dominio/tempo";
import {
  followUpsDevidos,
  MAXIMO_DISPAROS,
  proximoDiaUtilDeDisparo,
  type ProspectContatado,
} from "../lib/dominio/follow-up";

async function main() {
  const hoje = hojeSP();
  const linhas = await db
    .select({
      id: prospeccao.id,
      negocio: prospeccao.negocio,
      dominio: prospeccao.dominio,
      emails: prospeccao.emails,
      status: prospeccao.status,
      contatadoEm: prospeccao.contatadoEm,
      disparos: prospeccao.disparos,
      teste: prospeccao.teste,
    })
    .from(prospeccao);

  const devidos = followUpsDevidos(
    linhas.filter((l) => !l.teste) as ProspectContatado[],
    hoje
  );

  const bomDia = proximoDiaUtilDeDisparo(hoje) === hoje;
  console.log(`hoje: ${hoje} (São Paulo)`);
  console.log(
    bomDia
      ? "bom dia para disparar: sim (terça a quinta)"
      : `bom dia para disparar: não, prefira ${proximoDiaUtilDeDisparo(hoje)}`
  );

  const emAndamento = linhas.filter((l) => !l.teste && l.status === "contatado");
  console.log(`aguardando resposta: ${emAndamento.length}`);
  console.log();

  if (devidos.length === 0) {
    for (const e of emAndamento) {
      console.log(`  ${e.negocio}: contatado em ${e.contatadoEm}, ainda dentro da espera`);
    }
    console.log(devidos.length === 0 && emAndamento.length === 0 ? "nenhum follow-up devido." : "\nnenhum follow-up devido ainda.");
    process.exit(0);
  }

  console.log(`${devidos.length} esperando follow-up:\n`);
  for (const d of devidos) {
    console.log(`  ${d.negocio}${d.atrasado ? "  [ATRASADO]" : ""}`);
    console.log(`    ${d.emails}  ·  ${d.dominio}`);
    console.log(
      `    contatado em ${d.contatadoEm} (${d.diasDesde} dias) · disparos: ${d.disparos}/${MAXIMO_DISPAROS}`
    );
    console.log();
  }
  console.log("Antes de insistir, confira no Gmail se ele respondeu.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
