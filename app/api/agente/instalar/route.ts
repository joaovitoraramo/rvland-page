import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Script de instalação de uma linha. O operador cola no SSH do servidor:
 *   curl -fsSL <SITE_URL>/api/agente/instalar | sudo bash -s -- --token=XXX [--modulos=licenca,picprice]
 *        [--versao=latest|X.Y.Z] [--porta=7710] [--driver=systemd|dry]
 * Ele detecta a arquitetura, baixa o binário, faz o enroll, instala a unidade
 * systemd e sobe o serviço. Os módulos valem os do CADASTRO do servidor (vêm no
 * lease assinado); `--modulos` é só informativo e é conferido no fim.
 */
export async function GET() {
  const script = `#!/usr/bin/env bash
set -euo pipefail

SERVIDOR="${SITE_URL}"
TOKEN=""
MODULOS=""
VERSAO="latest"
PORTA=""
DRIVER="systemd"
for a in "$@"; do
  case "$a" in
    --token=*) TOKEN="\${a#*=}" ;;
    --servidor=*) SERVIDOR="\${a#*=}" ;;
    --modulos=*) MODULOS="\${a#*=}" ;;
    --versao=*) VERSAO="\${a#*=}" ;;
    --porta=*) PORTA="\${a#*=}" ;;
    --driver=*) DRIVER="\${a#*=}" ;;
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

[ -n "$MODULOS" ] && echo "rvland: módulos pedidos: $MODULOS (vale o cadastro do servidor no painel)"
echo "rvland: baixando agente $VERSAO ($A)..."
# Credencial de download: o token de enroll (uso único) autentica a instalação
# nova. O enroll em si ainda consome o token adiante.
curl -fsSL -H "X-RVLand-Enroll: $TOKEN" "$SERVIDOR/api/agente/binario?versao=$VERSAO&arch=$A" -o /usr/local/bin/agenterv
chmod 0755 /usr/local/bin/agenterv

echo "rvland: registrando servidor..."
EXTRA=""
[ -n "$PORTA" ] && EXTRA="--porta=$PORTA"
/usr/local/bin/agenterv enroll --token="$TOKEN" --servidor="$SERVIDOR" --driver="$DRIVER" $EXTRA

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
/usr/local/bin/agenterv status | grep -E "^(módulos|licença|api local)" || true
`;

  return new Response(script, {
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
