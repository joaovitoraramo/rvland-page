import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Script de instalação de uma linha. O operador cola no SSH do servidor:
 *   curl -fsSL <SITE_URL>/api/agente/instalar | sudo bash -s -- --token=XXX
 * Ele detecta a arquitetura, baixa o binário, faz o enroll, instala a unidade
 * systemd e sobe o serviço.
 */
export async function GET() {
  const script = `#!/usr/bin/env bash
set -euo pipefail

SERVIDOR="${SITE_URL}"
TOKEN=""
for a in "$@"; do
  case "$a" in
    --token=*) TOKEN="\${a#*=}" ;;
    --servidor=*) SERVIDOR="\${a#*=}" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "rvland: rode como root (sudo)"; exit 1; }
[ -n "$TOKEN" ] || { echo "rvland: faltou --token"; exit 1; }

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) A=amd64 ;;
  aarch64|arm64) A=arm64 ;;
  *) echo "rvland: arquitetura não suportada: $ARCH"; exit 1 ;;
esac

echo "rvland: baixando agente ($A)..."
curl -fsSL "$SERVIDOR/api/agente/binario?versao=latest&arch=$A" -o /usr/local/bin/agenterv
chmod 0755 /usr/local/bin/agenterv

echo "rvland: registrando servidor..."
/usr/local/bin/agenterv enroll --token="$TOKEN" --servidor="$SERVIDOR"

echo "rvland: instalando serviço systemd..."
cat > /etc/systemd/system/rvland-agent.service <<'UNIT'
[Unit]
Description=RVLand Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/agenterv run
Restart=always
RestartSec=10
User=root
NoNewPrivileges=false

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now rvland-agent

echo "rvland: pronto. Agente ativo — verifique com: agenterv status"
`;

  return new Response(script, {
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
