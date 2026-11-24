package hermesinst

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

// Caminhos do sistema (absolutos; o instalador os resolve dentro da raiz).
const (
	dirInstalacao   = "/Services/Hermes"
	arqConfig       = "/etc/hermes/config"
	arqModelo       = "/etc/hermes/modelo"
	arqHook         = "/etc/hermes/credencial.sh"
	arqEnv          = dirInstalacao + "/.env.production"
	arqCompose      = dirInstalacao + "/docker-compose.imagem.yml"
	dirBin          = "/usr/local/bin"
	arqAgente       = dirBin + "/agenterv"
	arqHermesImagem = dirBin + "/hermes-imagem"
	arqAgenteConf   = "/etc/rvland/agent.conf"
	arqAgenteChave  = "/etc/rvland/agente.key"
	arqUnit         = "/etc/systemd/system/rvland-agent.service"
	arqCron         = "/etc/cron.d/hermes-update"
	arqLog          = "/var/log/hermes-instalador.log"
	arqTrava        = "/run/hermesinstalador.lock"
	dirEstadoHermes = "/var/lib/hermes"
	registroHost    = "ghcr.io"
	imagemRepo      = "ghcr.io/rvland-devs/hermes"
	servicoAgente   = "rvland-agent"
	minDiscoBytes   = 3 << 30 // o mesmo mínimo do hermes-migrar-imagem
)

// opsArquivos: o que /opt/hermes-ops da imagem precisa trazer (o mesmo conjunto do migrador).
var opsArquivos = []string{"hermes-update.sh", "hermes-imagem.sh", "hermes-rebuild.sh", "hermes-modulos.sh", "hermes-manutencao.sh", "docker-compose.imagem.yml"}

// ordem de instalação dos scripts: hermes-update por ÚLTIMO (como o hermes-imagem faz)
var opsScripts = []string{"hermes-rebuild", "hermes-modulos", "hermes-manutencao", "hermes-imagem", "hermes-update"}

// unitAgente: a MESMA unidade do instalador do agente (app/api/agente/instalar/route.ts).
const unitAgente = `[Unit]
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
`

// Respostas: as 6 perguntas do install.sh (+ ALLOWED_HOST, que o install.sh detecta).
type Respostas struct {
	WildflyIP       string
	WildflyPorta    string
	Externo         bool
	ExternoEndereco string
	ExternoPorta    string
	IgnorarTags     bool
	AllowedHost     string
}

func (r Respostas) apiURL() string { return "http://" + r.WildflyIP + ":" + r.WildflyPorta }

func (r Respostas) apiURLExterna() string {
	if !r.Externo {
		return ""
	}
	return "http://" + r.ExternoEndereco + ":" + r.ExternoPorta
}

const comentarioInstalacao = "# Instalacao no RVLand (licenca). SEM aspas: o env_file do docker-compose v1 mantem as aspas no valor."

// renderEnv: o .env.production do install.sh (schema 2) + HERMES_INSTALACAO_ID SEM aspas.
func renderEnv(r Respostas, instalacaoID, versao string, agora time.Time) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# Hermes — Configuração de Produção (modelo imagem)\n")
	fmt.Fprintf(&b, "# Gerado pelo hermesinstalador v%s em %s\n", versao, agora.UTC().Format(time.RFC3339))
	b.WriteString("# hermes-env-schema: 2\n\n")
	b.WriteString("# URL da API interna (WildFly / SyncCeasa) — escolhida na instalação\n")
	fmt.Fprintf(&b, "NEXT_PUBLIC_API_URL=%s\n", r.apiURL())
	if ext := r.apiURLExterna(); ext != "" {
		b.WriteString("\n# URL da API para acesso externo\n")
		fmt.Fprintf(&b, "NEXT_PUBLIC_API_URL_EXTERNAL=%s\n", ext)
	}
	b.WriteString("\n# Ativar o Hermes sem validar permissões (ignorar tags)\n")
	fmt.Fprintf(&b, "NEXT_PUBLIC_IGNORE_TAGS=%t\n", r.IgnorarTags)
	b.WriteString("\n# IP/hostname desta máquina — usado pelo Next.js para liberar acesso via IP\n")
	fmt.Fprintf(&b, "ALLOWED_HOST=%s\n", r.AllowedHost)
	b.WriteString("\n# Cookies seguros: \"true\" apenas quando HTTPS estiver configurado.\n")
	b.WriteString("COOKIE_SECURE=false\n")
	b.WriteString("\n" + comentarioInstalacao + "\n")
	fmt.Fprintf(&b, "HERMES_INSTALACAO_ID=%s\n", instalacaoID)
	return b.String()
}

var reLinhaVar = regexp.MustCompile(`^[ \t]*(export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)=`)

// definirVariavel troca (ou acrescenta) NOME=valor no texto de um .env, sem aspas, mantendo
// todo o resto. Linhas repetidas da variável são removidas (fica uma).
func definirVariavel(texto, nome, valor string) string {
	linhas := strings.Split(texto, "\n")
	var saida []string
	feito := false
	for _, l := range linhas {
		if m := reLinhaVar.FindStringSubmatch(l); m != nil && m[2] == nome {
			if !feito {
				saida = append(saida, nome+"="+valor)
				feito = true
			}
			continue
		}
		saida = append(saida, l)
	}
	r := strings.Join(saida, "\n")
	if !feito {
		if r != "" && !strings.HasSuffix(r, "\n") {
			r += "\n"
		}
		r += "\n" + comentarioInstalacao + "\n" + nome + "=" + valor + "\n"
	}
	return r
}

// valorVariavel: o valor CRU (com aspas, se houver) da última linha NOME= do .env.
func valorVariavel(texto, nome string) (string, bool) {
	val, achou := "", false
	for _, l := range strings.Split(texto, "\n") {
		if m := reLinhaVar.FindStringSubmatch(l); m != nil && m[2] == nome {
			val, achou = strings.TrimRight(l[len(m[0]):], "\r"), true
		}
	}
	return val, achou
}

func renderConfig(versao string) string {
	return "# Configuracao operacional do Hermes (modelo imagem).\n" +
		"# Gerado pelo hermesinstalador v" + versao + ". SEM token: a credencial de pull vem do agente RV\n" +
		"# (hook /etc/hermes/credencial.sh -> agenterv hermes credencial).\n" +
		"INSTALL_DIR=\"" + dirInstalacao + "\"\n" +
		"# Modulos do WildFly atualizados pelo hermes-update (ver scripts/hermes-modulos.sh).\n" +
		"WILDFLY_DIR=\"/banco/wildfly/standalone\"\n"
}

var reInstallDir = regexp.MustCompile(`(?m)^[ \t]*INSTALL_DIR=["']?([^"'\n]*)["']?[ \t]*$`)

// installDirDoConfig lê INSTALL_DIR do /etc/hermes/config SEM executar o arquivo.
func installDirDoConfig(texto string) string {
	m := reInstallDir.FindAllStringSubmatch(texto, -1)
	if len(m) == 0 {
		return dirInstalacao
	}
	d := strings.TrimSpace(m[len(m)-1][1])
	if !strings.HasPrefix(d, "/") || strings.Contains(d, "..") || strings.ContainsAny(d, "$`") {
		return ""
	}
	return d
}

// hookCredencial: cópia de scripts/credencial.sh.exemplo do Hermes (o hermes-imagem faz
// `source` deste arquivo e chama obter_credencial). Não tem segredo.
const hookCredencial = `# Hook de credencial do hermes-imagem. Instalado pelo hermesinstalador em
# /etc/hermes/credencial.sh (modelo: scripts/credencial.sh.exemplo do Hermes). O hermes-imagem o
# carrega com ` + "`source`" + ` antes do login no registro; ele so precisa definir ` + "`obter_credencial`" + `,
# que preenche REG_USUARIO e REG_SENHA e retorna 0 (ou retorna != 0 se nao conseguiu).
#
# Fase 2: a credencial de pull e CURTA e vem do agente RV do servidor:
#     agenterv hermes credencial        # imprime DUAS linhas: usuario e senha
# Se o agente nao existe, falha ou responde fora do formato, cai nos arquivos
# /etc/hermes/registro.user e registro.token (o comportamento da Fase 1). Formato valido:
# usuario ^[A-Za-z0-9._-]+$ e senha/token ^[A-Za-z0-9_.-]+$ (cobre os tokens do GitHub);
# qualquer outro caractere (aspas, $, ;, *, :...) conta como resposta fora do formato.
#
# REGRAS (a senha e um segredo):
#   - NUNCA gravar a senha em disco, log, argumento de comando ou ` + "`set -x`" + `;
#   - o hermes-imagem a entrega ao ` + "`docker login`" + ` por stdin e usa um DOCKER_CONFIG isolado
#     que e apagado no logout.
# Variaveis do hermes-imagem usadas aqui: REGISTRO_USER_FILE, REGISTRO_TOKEN_FILE.
obter_credencial() {
    REG_USUARIO=""; REG_SENHA=""
    local saida="" u="" s=""
    if command -v agenterv >/dev/null 2>&1; then
        if command -v timeout >/dev/null 2>&1; then
            saida="$(timeout 30 agenterv hermes credencial 2>/dev/null)" || saida=""
        else
            saida="$(agenterv hermes credencial 2>/dev/null)" || saida=""
        fi
        u="$(printf '%s\n' "$saida" | sed -n '1p' | tr -d '[:space:]')"
        s="$(printf '%s\n' "$saida" | sed -n '2p' | tr -d '[:space:]')"
        saida=""
        case "$u" in ''|*[!A-Za-z0-9._-]*) u="" ;; esac
        case "$s" in ''|*[!A-Za-z0-9_.-]*) s="" ;; esac
        if [ -n "$u" ] && [ -n "$s" ]; then
            REG_USUARIO="$u"; REG_SENHA="$s"
            u=""; s=""
            return 0
        fi
        u=""; s=""
    fi
    # Fallback: arquivos da Fase 1.
    [ -r "$REGISTRO_USER_FILE" ] && [ -r "$REGISTRO_TOKEN_FILE" ] || return 1
    REG_USUARIO="$(tr -d '[:space:]' < "$REGISTRO_USER_FILE")"
    REG_SENHA="$(tr -d '[:space:]' < "$REGISTRO_TOKEN_FILE")"
    return 0
}
`

// nginxSite: o mesmo site do install.sh (porta 80 -> 127.0.0.1:3000).
const nginxSite = `server {
    listen 80;
    server_name _;

    # 64M: o Autorizar pode enviar N PDFs (1 por loja) em base64 numa request —
    # com 10M o nginx devolvia 413 e NENHUM pedido era gerado.
    client_max_body_size 64M;
    proxy_read_timeout 60s;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
`

// cronHermes: atualização diária às 02:00 SEM canal fixo (o RV decide pelo
// /var/lib/hermes/rv/canal; sem ele, stable), como decidido em 23/11.
const cronHermes = `# Hermes: atualizacao diaria (modelo imagem). Gerado pelo hermesinstalador.
# Sem canal fixo: o canal vem do RV (/var/lib/hermes/rv/canal); sem ele, stable.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 2 * * * root /usr/local/bin/hermes-update >> /var/log/hermes-cron.log 2>&1
`
