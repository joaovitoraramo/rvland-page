/**
 * `db.execute` (SQL cru) devolve timestamptz como TEXTO ("2026-11-23 12:00:00+00"):
 * o driver do Drizzle desliga o parser de datas do postgres-js. Normaliza para Date.
 */
export function paraData(v: unknown): Date {
  if (v instanceof Date) return v;
  const t = String(v).trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  return new Date(t);
}
