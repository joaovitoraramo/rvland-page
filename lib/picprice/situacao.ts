/** Dados do token de um cliente já prontos para a tela (datas em ISO). */
export type ItemToken = {
  clienteId: string;
  cliente: string;
  cnpj: string;
  temToken: boolean;
  prefixo: string | null;
  status: "ativo" | "revogado" | null;
  criadoEm: string | null;
  revogadoEm: string | null;
  ultimoUsoEm: string | null;
  limite: number;
  usado: number;
  expiraEm: string | null;
  verEstabelecimento: boolean;
};

export type Situacao = "sem_token" | "revogado" | "expirado" | "vencendo" | "ativo";

const DIA_MS = 86_400_000;

/** Dias até expirar (negativo = já expirou); null = não expira. */
export function diasAte(iso: string | null, agora: number = Date.now()): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - agora) / DIA_MS);
}

/** Situação resumida do token, usada no filtro, nas cores e nos KPIs. */
export function situacaoDoItem(i: ItemToken, agora: number = Date.now()): Situacao {
  if (!i.temToken) return "sem_token";
  if (i.status === "revogado") return "revogado";
  const d = diasAte(i.expiraEm, agora);
  if (d !== null && d <= 0) return "expirado";
  if (d !== null && d <= 7) return "vencendo";
  return "ativo";
}
