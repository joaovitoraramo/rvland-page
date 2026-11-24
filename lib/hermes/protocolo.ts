import { z } from "zod";

/**
 * Contratos de corpo das rotas do Hermes (zod ESTRITO: campo desconhecido é
 * recusado). O agente/instalador Go segue exatamente estes formatos.
 */

/** Eventos que o AGENTE pode reportar (whitelist). `hermes_clone_suspeito` só o servidor gera. */
export const TIPOS_EVENTO_AGENTE = [
  "hermes_bloqueio",
  "hermes_bloqueio_simulado",
  "hermes_liberado",
  "hermes_update_ok",
  "hermes_update_falhou",
  "hermes_adulteracao",
  "hermes_relogio",
] as const;
export type TipoEventoAgente = (typeof TIPOS_EVENTO_AGENTE)[number];

const iso = z.iso.datetime({ offset: true });

const camposMaquina = {
  machine_id_hash: z.string().min(16).max(128),
  boot_id: z.string().min(1).max(64).optional(),
  hostname_hash: z.string().max(128).optional(),
  so: z.string().max(80).optional(),
  docker_versao: z.string().max(40).optional(),
};

const fingerprintOpcional = z.strictObject({ ...camposMaquina, machine_id_hash: camposMaquina.machine_id_hash.optional() });
const fingerprintObrigatorio = z.strictObject(camposMaquina);

export type FingerprintHermes = z.infer<typeof fingerprintObrigatorio>;

// ── POST /api/agente/hermes ─────────────────────────────────────────────────

export const esquemaSync = z.strictObject({
  agente_versao: z.string().max(40).optional(),
  container: z.strictObject({
    estado: z.enum(["rodando", "parado", "ausente", "desconhecido"]),
    saude: z.enum(["saudavel", "nao_saudavel", "iniciando", "desconhecida"]).optional(),
    versao: z.string().max(40).optional(),
    sha: z.string().max(64).optional(),
    digest: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional(),
    canal_em_uso: z.enum(["stable", "preview"]).optional(),
    iniciado_em: iso.optional(),
    /**
     * Prova do AGENTE de que a imagem em uso fecha a cadeia de chave com ele: label
     * `org.aramo.hermes.licenca-chave=real` E `org.aramo.hermes.licenca-chave-fp` igual ao fp da chave h1
     * embutida no agente. Ausente (agente antigo, docker desconhecido) = sem prova (o painel bloqueia).
     */
    chave_configurada: z.boolean().optional(),
  }),
  fingerprint: fingerprintObrigatorio,
  relogio: z.strictObject({ confiavel: z.boolean(), sincronizado: z.boolean().optional() }).optional(),
  eventos: z
    .array(
      z.strictObject({
        tipo: z.string().max(40),
        severidade: z.enum(["info", "aviso", "critico"]).optional(),
        mensagem: z.string().max(300),
        dados: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .max(20)
    .optional(),
  /** `emitido_em` do último documento de licença que o agente aplicou. */
  ultimo_emitido_em: iso.nullable().optional(),
});
export type CorpoSync = z.infer<typeof esquemaSync>;

// ── Públicas ────────────────────────────────────────────────────────────────

const dadosInstalador = {
  identificacao: z.record(z.string(), z.unknown()).optional(),
  origem_identificacao: z.string().max(60).optional(),
  versao_instalador: z.string().max(40).optional(),
};

export const esquemaSolicitacao = z.strictObject({
  cnpj: z.string().min(1).max(30),
  fingerprint: fingerprintOpcional.optional(),
  ...dadosInstalador,
});
export type CorpoSolicitacao = z.infer<typeof esquemaSolicitacao>;

export const esquemaValidar = z.strictObject({
  chave: z.string().min(1).max(200),
  cnpj: z.string().min(1).max(30),
  fingerprint: fingerprintOpcional.optional(),
  ...dadosInstalador,
});
export type CorpoValidar = z.infer<typeof esquemaValidar>;

export const esquemaAtivacao = z.strictObject({
  chave: z.string().min(1).max(200),
  cnpj: z.string().min(1).max(30),
  fingerprint: fingerprintObrigatorio,
  ...dadosInstalador,
  /** Adoção: prova de posse do agente RV já instalado (assinatura `hermes:ativacao:<timestamp>.<sha256(instalacao_id + "\n" + machine_id_hash)>`). */
  agente_existente: z
    .strictObject({
      servidor_id: z.string().uuid(),
      timestamp: z.string().min(10).max(40),
      assinatura: z.string().min(10).max(200),
    })
    .optional(),
});
export type CorpoAtivacao = z.infer<typeof esquemaAtivacao>;

// ── Identificação lida pelo instalador ──────────────────────────────────────

const PROIBIDAS = /(senha|password|passwd|secret|token|credencial|usuario|user|login|jdbc|datasource|connection|chave)/i;
const MAX_IDENTIFICACAO_BYTES = 8 * 1024;

function limpar(v: unknown, prof: number): unknown {
  if (v === null || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v.slice(0, 200);
  if (prof >= 4) return undefined;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => limpar(x, prof + 1)).filter((x) => x !== undefined);
  if (typeof v === "object") {
    const saida: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 40)) {
      if (PROIBIDAS.test(k)) continue;
      const l = limpar(x, prof + 1);
      if (l !== undefined) saida[k.slice(0, 60)] = l;
    }
    return saida;
  }
  return undefined;
}

/**
 * Identificação do cliente (razão social, fantasia, município/UF, lojas…): NUNCA
 * credenciais. Mesmo que o instalador mande, campos com nome de senha/usuário/
 * token/conexão são removidos aqui. Null se não for objeto ou estourar o teto.
 */
export function sanitizarIdentificacao(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = limpar(v, 0) as Record<string, unknown>;
  if (Buffer.byteLength(JSON.stringify(r), "utf8") > MAX_IDENTIFICACAO_BYTES) return null;
  return r;
}
