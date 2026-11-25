import { chaveDeIp } from "./hermes-http";
import { consumirLimite, UMA_HORA_MS } from "./hermes-limite";
import type { DepsInstalador } from "./hermes-instalador";

/**
 * GET /hermes/instalar — bootstrap de shell do instalador do Hermes:
 *   curl -fsSL https://rvland.com.br/hermes/instalar | sudo bash
 *   curl -fsSL https://rvland.com.br/hermes/instalar | sudo bash -s -- adotar
 *
 * O script é GENÉRICO (não contém chave; não existe variante com a chave no caminho): a chave vem, nesta
 * ordem, de HERMES_CHAVE, do terminal (/dev/tty, sem eco) ou da entrada padrão (sem terminal) e é entregue
 * ao instalador só pela entrada padrão (`--chave-stdin`). A entrada padrão só serve com `bash arquivo.sh < chave`:
 * sob `curl | sudo bash` ela é o próprio script (o `read` recebe EOF), então em automação use HERMES_CHAVE. Adoção não precisa de `--instalacao`: o `validar` devolve o
 * `instalacao_id` da chave de adoção (o instalador ainda aceita a flag, repassada como argumento).
 *
 * Cadeia de confiança: TLS até o RVLand → `x-sha256` do 302 de /api/hermes/instalador (cabeçalho do
 * RVLand, fora do corpo do binário, que vem do Storage) → o script confere o sha256 antes de executar
 * → o instalador confere sha256 + assinatura Ed25519 de release (releasePK embutida) de tudo que baixa.
 */

export const LIMITE_BOOTSTRAP_POR_HORA = 60;

export type RespostaTexto = { status: number; texto: string; headers: Record<string, string> };

const CABECALHOS = {
  "content-type": "text/x-shellscript; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
} as const;

/** Só `https://host[:porta]` (sem caminho, query, credencial ou caractere de shell). */
function validarBase(base: string): string {
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(base)) throw new Error("base do RVLand inválida para o bootstrap");
  return base;
}

export function scriptBootstrapHermes(baseParam: string): string {
  const base = validarBase(baseParam);
  return `#!/usr/bin/env bash
# Hermes (RVLand): bootstrap do instalador. Genérico: não contém chave.
#   curl -fsSL ${base}/hermes/instalar | sudo bash
#   curl -fsSL ${base}/hermes/instalar | sudo bash -s -- adotar
# A chave vem, nesta ordem, de HERMES_CHAVE, do terminal (pedida sem eco) ou da entrada padrão (sem terminal),
# e vai ao instalador só pela entrada padrão (--chave-stdin), nunca na linha de comando.
# A entrada padrão só vale com "bash arquivo.sh < chave": sob "curl | sudo bash" ela é o próprio script;
# em automação use HERMES_CHAVE.
# O instalador baixado só roda se o sha256 bater com o publicado pelo RVLand.
set -eu
umask 077

hermes_bootstrap() {
  BASE="${base}"
  LC_ALL=C

  erro() { printf 'hermes: %s\\n' "$1" >&2; }

  # o último argumento é a sentinela da chamada: script cortado em "hermes_bootstrap" ou "hermes_bootstrap "
  # (função completa, argumentos perdidos) não roda; aqui ela sai e a ordem dos argumentos é preservada
  for ULT; do :; done
  [ "\${ULT:-}" = "__HERMES_FIM__" ] || { erro "script incompleto (download interrompido?): nada foi executado"; exit 2; }
  N=$(($# - 1))
  while [ "$N" -gt 0 ]; do set -- "$@" "$1"; shift; N=$((N - 1)); done
  shift

  MODO=""
  case "\${1:-}" in
    instalar|adotar|solicitar) MODO=$1; shift ;;
    ""|-*) ;;
    *) erro "modo desconhecido (use instalar, adotar ou solicitar)"; exit 2 ;;
  esac
  INFO=0
  ARQUIVO=0
  # o instalador usa o pacote flag do Go: aceita -x, --x, -x=v e -x v (o valor de -chave-arquivo pode ser
  # o argumento seguinte, que passa intacto e não é examinado)
  PULAR=0
  for a in "$@"; do
    if [ "$PULAR" = 1 ]; then PULAR=0; continue; fi
    case "$a" in
      -chave|--chave|-chave=*|--chave=*|-chave-stdin|--chave-stdin|-chave-stdin=*|--chave-stdin=*)
        erro "não passe a chave na linha de comando: ela é pedida no terminal (ou use HERMES_CHAVE)"; exit 2 ;;
      -chave-arquivo|--chave-arquivo) ARQUIVO=1; PULAR=1 ;;
      -chave-arquivo=*|--chave-arquivo=*) ARQUIVO=1 ;;
      -h|-help|--help|-ajuda|--ajuda|-versao|--versao|-mostrar-identificacao|--mostrar-identificacao) INFO=1 ;;
    esac
  done
  if [ -z "$MODO" ] && [ "$INFO" = 0 ]; then MODO=instalar; fi
  PRECISA_CHAVE=0
  case "$MODO" in instalar|adotar) [ "$INFO$ARQUIVO" = 00 ] && PRECISA_CHAVE=1 ;; esac

  [ "$(uname -s)" = Linux ] || { erro "só Linux é suportado"; exit 6; }
  [ "$(id -u)" -eq 0 ] || { erro "rode como root (sudo)"; exit 6; }
  case "$(uname -m)" in
    x86_64|amd64) ARCH=amd64 ;;
    aarch64|arm64) ARCH=arm64 ;;
    *) erro "arquitetura não suportada (só amd64 e arm64)"; exit 6 ;;
  esac
  for c in curl sha256sum mktemp; do
    command -v "$c" >/dev/null 2>&1 || { erro "falta o comando $c"; exit 6; }
  done

  DIR=""
  trap '[ -z "$DIR" ] || rm -rf -- "$DIR"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  trap 'exit 129' HUP
  DIR=$(mktemp -d "\${TMPDIR:-/tmp}/hermes-instalador.XXXXXXXXXX") || { erro "não consegui criar o diretório temporário"; exit 7; }
  chmod 700 "$DIR"
  BIN="$DIR/hermesinstalador"

  printf 'hermes: baixando o instalador (%s)...\\n' "$ARCH" >&2
  CAB=$(curl -fsS --proto '=https' --tlsv1.2 --globoff --max-time 30 -o /dev/null -D - "$BASE/api/hermes/instalador?arch=$ARCH") ||
    { erro "não consegui obter o instalador do RVLand"; exit 7; }
  LOC=""
  SHA=""
  CR=$(printf '\\r')
  while IFS= read -r l; do
    l=\${l%"$CR"}
    case "$l" in
      [Ll][Oo][Cc][Aa][Tt][Ii][Oo][Nn]:*) LOC=\${l#*:} ;;
      [Xx]-[Ss][Hh][Aa]256:*) SHA=\${l#*:} ;;
    esac
  done <<EOF_CAB
$CAB
EOF_CAB
  LOC=\${LOC# }
  SHA=\${SHA# }
  case "$SHA" in ""|*[!0-9a-f]*) erro "o RVLand não informou um sha256 válido do instalador"; exit 7 ;; esac
  [ "\${#SHA}" -eq 64 ] || { erro "o RVLand não informou um sha256 válido do instalador"; exit 7; }
  case "$LOC" in https://*) ;; *) erro "resposta inesperada do RVLand (download sem https)"; exit 7 ;; esac
  case "$LOC" in *[[:space:]]*|*[[:cntrl:]]*) erro "resposta inesperada do RVLand"; exit 7 ;; esac

  # a URL assinada vale 60 s: baixar logo em seguida
  curl -fsS --proto '=https' --tlsv1.2 --globoff --max-time 300 --max-filesize 67108864 -o "$BIN" --url "$LOC" ||
    { erro "falha ao baixar o instalador"; exit 7; }
  # pela entrada padrão: a saída não leva nome de arquivo (o GNU prefixa "\\" quando o nome tem "\\" ou quebra de linha)
  CALC=$(sha256sum < "$BIN") || { erro "não consegui calcular o sha256 do instalador"; exit 7; }
  CALC=\${CALC%% *}
  [ "$CALC" = "$SHA" ] || { erro "sha256 do instalador NÃO confere: abortado, nada foi executado"; exit 7; }
  chmod 700 "$BIN"

  CHAVE=""
  RESTO=""
  if [ "$PRECISA_CHAVE" = 1 ]; then
    CHAVE=\${HERMES_CHAVE:-}
    if [ -z "$CHAVE" ]; then
      if (: </dev/tty) 2>/dev/null; then
        printf 'Chave do Hermes (hmk_..., do painel RVLand; Enter vazio para retomar): ' >/dev/tty
        IFS= read -rs CHAVE </dev/tty || CHAVE=""
        printf '\\n' >/dev/tty
      elif [ ! -t 0 ]; then
        IFS= read -r CHAVE || true
      fi
    fi
    CHAVE=$(printf '%s' "$CHAVE" | tr -d '[:space:]')
    if [ -n "$CHAVE" ]; then
      RESTO=\${CHAVE#hmk_}
      case "$RESTO" in *[!A-Za-z0-9_-]*) RESTO="" ;; esac
      if [ "$RESTO" = "$CHAVE" ] || [ "\${#RESTO}" -ne 43 ]; then
        CHAVE=""
        erro "chave em formato inválido (esperado hmk_...); confira no painel"
        exit 4
      fi
    fi
  fi
  unset HERMES_CHAVE

  RC=0
  if [ "$PRECISA_CHAVE" = 1 ]; then
    printf '%s\\n' "$CHAVE" | "$BIN" "$MODO" --chave-stdin "$@" || RC=$?
  elif [ -n "$MODO" ]; then
    "$BIN" "$MODO" "$@" </dev/null || RC=$?
  else
    "$BIN" "$@" </dev/null || RC=$?
  fi
  CHAVE=""
  RESTO=""
  [ "$RC" -ne 126 ] || erro "não consegui executar o instalador em $DIR (/tmp com noexec? tente TMPDIR=/root)"
  exit "$RC"
}

hermes_bootstrap "$@" __HERMES_FIM__
`;
}

/** GET /hermes/instalar: público, sem sessão, sem banco além do contador de rate limit por IP. */
export async function entregarBootstrapHermes(
  ip: string,
  base: string,
  deps: Pick<DepsInstalador, "agora" | "limites">
): Promise<RespostaTexto> {
  let texto: string;
  try {
    texto = scriptBootstrapHermes(base);
  } catch {
    return { status: 503, texto: "echo 'hermes: instalação indisponível' >&2; exit 7\n", headers: { ...CABECALHOS } };
  }
  const lim = await consumirLimite(deps.limites, chaveDeIp("instsh", ip), LIMITE_BOOTSTRAP_POR_HORA, UMA_HORA_MS, deps.agora());
  if (!lim.permitido) {
    return {
      status: 429,
      texto: "echo 'hermes: muitas tentativas deste endereço; tente de novo em 1 hora' >&2; exit 7\n",
      headers: { ...CABECALHOS, "retry-after": "3600" },
    };
  }
  return { status: 200, texto, headers: { ...CABECALHOS } };
}
