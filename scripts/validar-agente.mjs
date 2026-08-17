/* Agente simulado: exercita enroll + heartbeat + lease ponta a ponta contra o
   dev server. Cria um servidor de teste, valida a assinatura do lease e a
   entrega de comando, e limpa tudo no fim. Não deixa resíduo no banco. */
import { readFileSync } from "node:fs";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  randomBytes,
} from "node:crypto";

const RAIZ = process.cwd();
const BASE = "http://localhost:3000";
const env = Object.fromEntries(
  readFileSync(`${RAIZ}/.env.local`, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const { default: postgres } = await import(`${RAIZ}/node_modules/postgres/src/index.js`);
const sql = postgres(env.DATABASE_URL, { prepare: false });

// ── cripto raw base64 (espelha lib/crypto/ed25519.ts) ──
const PRE_SPKI = Buffer.from("302a300506032b6570032100", "hex");
const PRE_PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
const pubDe = (raw) => createPublicKey({ key: Buffer.concat([PRE_SPKI, raw]), format: "der", type: "spki" });
const privDe = (seed) => createPrivateKey({ key: Buffer.concat([PRE_PKCS8, seed]), format: "der", type: "pkcs8" });
function gerarPar() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    pub: Buffer.from(publicKey.export({ format: "der", type: "spki" }).subarray(-32)),
    seed: Buffer.from(privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32)),
  };
}
const assinar = (msg, seed) => sign(null, Buffer.from(msg), privDe(seed)).toString("base64");
const verificar = (msg, sigB64, pubB64) =>
  verify(null, Buffer.from(msg), pubDe(Buffer.from(pubB64, "base64")), Buffer.from(sigB64, "base64"));

const ok = (c, m) => console.log(`${c ? "✓" : "✗ FALHA"} ${m}`);
let falhas = 0;
const checar = (c, m) => { ok(c, m); if (!c) falhas++; };

let servidorId;
try {
  const [cli] = await sql`select id, nome from clientes where nome ilike '%credit%' limit 1`;
  if (!cli) throw new Error("cliente Credit não encontrado — rode o app e cadastre-o antes");
  console.log(`cliente: ${cli.nome} (${cli.id})`);

  // servidor de teste + serviço licenciado + token
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [srv] = await sql`
    insert into servidores (cliente_id, nome, status, enrollment_token_hash, enrollment_expira_em)
    values (${cli.id}, ${"[TESTE] validar-agente"}, 'pendente', ${tokenHash}, ${new Date(Date.now() + 3600e3)})
    returning id`;
  servidorId = srv.id;
  await sql`insert into servico_gerenciados (servidor_id, nome, unidade_systemd, licenciado, ativo)
    values (${servidorId}, ${"Backend"}, ${"concicredit.service"}, true, true)`;
  console.log(`servidor de teste: ${servidorId}`);

  // agente gera par e faz enroll
  const agente = gerarPar();
  const rEnroll = await fetch(`${BASE}/api/agente/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token,
      agente_pubkey: agente.pub.toString("base64"),
      host: "10.0.0.9",
      so: "Debian 12",
      agente_versao: "0.1.0",
    }),
  });
  const jEnroll = await rEnroll.json();
  checar(rEnroll.status === 200, `enroll respondeu 200 (foi ${rEnroll.status})`);
  checar(jEnroll.servidor_id === servidorId, "enroll devolveu o servidor_id certo");
  checar(!!jEnroll.licenca?.payload, "enroll devolveu lease");

  // valida assinatura do lease com a chave pública de licença
  const bytes = Buffer.from(jEnroll.licenca.payload, "base64");
  checar(verificar(bytes, jEnroll.licenca.assinatura, env.RVLAND_LICENSE_PK), "assinatura do lease confere");
  const lease = JSON.parse(bytes.toString());
  console.log(`  lease: status=${lease.status} operar_ate=${lease.operar_ate} servicos=${JSON.stringify(lease.servicos_licenciados)}`);
  checar(lease.servicos_licenciados.includes("concicredit.service"), "lease lista o serviço licenciado");

  // servidor virou ativo?
  const [srvAtivo] = await sql`select status, agente_pubkey from servidores where id=${servidorId}`;
  checar(srvAtivo.status === "ativo" && srvAtivo.agente_pubkey, "servidor ficou ativo com pubkey");

  // enfileira um comando start para testar entrega
  const [cmd] = await sql`
    insert into comandos (servidor_id, verbo, estado, criado_por)
    values (${servidorId}, 'start', 'pendente', 'validar-agente') returning id`;

  // heartbeat assinado
  const corpo = JSON.stringify({
    agente_versao: "0.1.0",
    uptime_seg: 12345,
    telemetria: { cpu_pct: 17, memoria_pct: 42, disco_pct: 63, carga1: 55 },
    servicos: [{ unidade: "concicredit.service", ativo: true }],
    eventos: [{ tipo: "ssh_login", severidade: "info", mensagem: "login de 200.1.2.3" }],
    resultados_comandos: [],
  });
  const ts = new Date().toISOString();
  const msg = `${ts}.${createHash("sha256").update(corpo).digest("hex")}`;
  const rHb = await fetch(`${BASE}/api/agente/heartbeat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rvland-servidor": servidorId,
      "x-rvland-timestamp": ts,
      "x-rvland-assinatura": assinar(msg, agente.seed),
    },
    body: corpo,
  });
  const jHb = await rHb.json();
  checar(rHb.status === 200, `heartbeat respondeu 200 (foi ${rHb.status})`);
  checar(!!jHb.licenca?.payload, "heartbeat devolveu lease");
  checar(Array.isArray(jHb.comandos) && jHb.comandos.some((c) => c.id === cmd.id && c.verbo === "start" && c.servico_unidade === null), "comando start entregue no heartbeat");

  // efeitos colaterais gravados?
  const [tel] = await sql`select cpu_pct, disco_pct from telemetria_atual where servidor_id=${servidorId}`;
  checar(tel?.cpu_pct === 17 && tel?.disco_pct === 63, "telemetria_atual gravada");
  const [hist] = await sql`select count(*)::int n from telemetria_historico where servidor_id=${servidorId}`;
  checar(hist.n === 1, "snapshot no telemetria_historico");
  const [ev] = await sql`select count(*)::int n from eventos where servidor_id=${servidorId} and tipo='ssh_login'`;
  checar(ev.n === 1, "evento ssh_login gravado");
  const [srvStatus] = await sql`select status_reportado from servico_gerenciados where servidor_id=${servidorId}`;
  checar(srvStatus.status_reportado === "ativo", "status do serviço atualizado");
  const [cmdEstado] = await sql`select estado from comandos where id=${cmd.id}`;
  checar(cmdEstado.estado === "enviado", "comando marcado como enviado");

  // heartbeat com assinatura errada deve ser rejeitado
  const rMau = await fetch(`${BASE}/api/agente/heartbeat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rvland-servidor": servidorId,
      "x-rvland-timestamp": new Date().toISOString(),
      "x-rvland-assinatura": "YXNzaW5hdHVyYS1mYWxzYQ==",
    },
    body: corpo,
  });
  checar(rMau.status === 401, `heartbeat com assinatura inválida rejeitado (401, foi ${rMau.status})`);

  // token de enroll é de uso único
  const rReuso = await fetch(`${BASE}/api/agente/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, agente_pubkey: agente.pub.toString("base64") }),
  });
  checar(rReuso.status === 401, `token de enroll não reutilizável (401, foi ${rReuso.status})`);
} finally {
  if (servidorId) {
    await sql`delete from servidores where id=${servidorId}`;
    console.log("limpeza: servidor de teste removido");
  }
  await sql.end();
}

console.log(falhas === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${falhas} CHECK(S) FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
