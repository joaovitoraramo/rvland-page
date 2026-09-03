import "server-only";
import { cache } from "react";

import { supabaseAdmin } from "@/lib/supabase/admin";

export const BUCKET_PRINTS = "prints";

/**
 * URL assinada do screenshot da varredura. Bucket privado: o print é material
 * de trabalho interno, não vai para o mundo. Devolve null se o print ainda não
 * foi enviado — a tela mostra a instrução em vez de uma imagem quebrada.
 */
export const urlAssinadaPrint = cache(async (caminho: string | null): Promise<string | null> => {
  if (!caminho) return null;
  // a planilha guarda "prospeccao/fotos/x.png"; no bucket vive só "x.png"
  const arquivo = caminho.split("/").pop();
  if (!arquivo) return null;

  const { data, error } = await supabaseAdmin()
    .storage.from(BUCKET_PRINTS)
    .createSignedUrl(arquivo, 60 * 60);

  if (error) return null;
  return data?.signedUrl ?? null;
});
