package hermesinst

import (
	"bufio"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"strings"
)

// Opcoes: linha de comando + variáveis HERMES_* (a flag vence a variável).
type Opcoes struct {
	Modo                 string // instalar | adotar | solicitar | identificacao
	DryRun               bool
	NaoInterativo        bool
	Chave                string
	ChaveArgumento       bool
	ChaveArquivo         string
	ChaveStdin           bool
	CNPJ                 string
	Instalacao           string
	AgenteVersao         string
	WildflyIP            string
	WildflyPorta         string
	AcessoExterno        string // s|n (vazio = perguntar/padrão)
	ExternoEndereco      string
	ExternoPorta         string
	IgnorarTags          string // s|n|true|false
	AllowedHost          string
	MostrarVersao        bool
	MostrarIdentificacao bool
}

const usoTexto = `hermesinstalador — instalador do Hermes (RVLand)

uso:
  hermesinstalador instalar  [opções]   instalação nova com a chave de instalação (hmk_...)
  hermesinstalador adotar    [opções]   servidor com o agente RV já instalado + chave de adoção
  hermesinstalador solicitar [opções]   sem chave: registra o pedido e imprime o protocolo (sai 3)
  hermesinstalador --mostrar-identificacao [--wildfly-porta=8080]
  hermesinstalador --versao

chave (prefira arquivo, stdin ou variável; pelo argumento ela fica visível no ps/histórico):
  --chave-arquivo=CAMINHO | --chave-stdin | HERMES_CHAVE=... | --chave=hmk_...

opções:
  --dry-run                 só valida e mostra o plano (não grava nada, não consome a chave)
  --nao-interativo          sem perguntas (falha se faltar dado)
  --cnpj=CNPJ               CNPJ (quando a identificação local não está disponível)
  --instalacao=UUID         adoção: a instalação mostrada no painel junto da chave
  --agente-versao=X.Y.Z     versão do agente RV (padrão: latest estável)
  --wildfly-ip=IPv4         [HERMES_WILDFLY_IP]
  --wildfly-porta=8080      [HERMES_WILDFLY_PORTA]
  --acesso-externo=s|n      [HERMES_ACESSO_EXTERNO]
  --externo-endereco=HOST   [HERMES_EXTERNO_ENDERECO]
  --externo-porta=65381     [HERMES_EXTERNO_PORTA]
  --ignorar-tags=s|n        [HERMES_IGNORE_TAGS]
  --allowed-host=HOST       [HERMES_ALLOWED_HOST]

saída: 0 ok · 2 uso · 3 aguardando chave · 4 chave inválida · 5 CNPJ divergente · 6 pré-requisito · 7 falha
`

// lerOpcoesAmbiente: HERMES_* (incluindo os nomes antigos do install.sh: HERMES_API_URL,
// HERMES_API_URL_EXTERNAL, HERMES_IGNORE_TAGS, HERMES_ALLOWED_HOST).
func lerOpcoesAmbiente(o *Opcoes, getenv func(string) string) {
	v := func(k string) string { return strings.TrimSpace(getenv(k)) }
	o.CNPJ = v("HERMES_CNPJ")
	o.Instalacao = v("HERMES_INSTALACAO")
	o.WildflyIP = v("HERMES_WILDFLY_IP")
	o.WildflyPorta = v("HERMES_WILDFLY_PORTA")
	o.AcessoExterno = v("HERMES_ACESSO_EXTERNO")
	o.ExternoEndereco = v("HERMES_EXTERNO_ENDERECO")
	o.ExternoPorta = v("HERMES_EXTERNO_PORTA")
	o.IgnorarTags = v("HERMES_IGNORE_TAGS")
	o.AllowedHost = v("HERMES_ALLOWED_HOST")
	if u := v("HERMES_API_URL"); u != "" && o.WildflyIP == "" {
		if h, p, ok := hostPorta(u); ok {
			o.WildflyIP = h
			if o.WildflyPorta == "" {
				o.WildflyPorta = p
			}
		}
	}
	if u := v("HERMES_API_URL_EXTERNAL"); u != "" && o.ExternoEndereco == "" {
		if h, p, ok := hostPorta(u); ok {
			o.ExternoEndereco = h
			if o.ExternoPorta == "" {
				o.ExternoPorta = p
			}
			if o.AcessoExterno == "" {
				o.AcessoExterno = "s"
			}
		}
	}
}

func hostPorta(s string) (string, string, bool) {
	u, err := url.Parse(s)
	if err != nil || u.Hostname() == "" {
		return "", "", false
	}
	return u.Hostname(), u.Port(), true
}

// lerArgs: modo + flags. Erro = uso (exit 2).
func lerArgs(args []string, o *Opcoes, saida io.Writer) error {
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		o.Modo, args = args[0], args[1:]
	}
	fs := flag.NewFlagSet("hermesinstalador", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	fs.BoolVar(&o.DryRun, "dry-run", false, "")
	fs.BoolVar(&o.NaoInterativo, "nao-interativo", false, "")
	chave := fs.String("chave", "", "")
	fs.StringVar(&o.ChaveArquivo, "chave-arquivo", "", "")
	fs.BoolVar(&o.ChaveStdin, "chave-stdin", false, "")
	fs.StringVar(&o.CNPJ, "cnpj", o.CNPJ, "")
	fs.StringVar(&o.Instalacao, "instalacao", o.Instalacao, "")
	fs.StringVar(&o.AgenteVersao, "agente-versao", "latest", "")
	fs.StringVar(&o.WildflyIP, "wildfly-ip", o.WildflyIP, "")
	fs.StringVar(&o.WildflyPorta, "wildfly-porta", o.WildflyPorta, "")
	fs.StringVar(&o.AcessoExterno, "acesso-externo", o.AcessoExterno, "")
	fs.StringVar(&o.ExternoEndereco, "externo-endereco", o.ExternoEndereco, "")
	fs.StringVar(&o.ExternoPorta, "externo-porta", o.ExternoPorta, "")
	fs.StringVar(&o.IgnorarTags, "ignorar-tags", o.IgnorarTags, "")
	fs.StringVar(&o.AllowedHost, "allowed-host", o.AllowedHost, "")
	fs.BoolVar(&o.MostrarVersao, "versao", false, "")
	fs.BoolVar(&o.MostrarIdentificacao, "mostrar-identificacao", false, "")
	ajuda := fs.Bool("ajuda", false, "")
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			fmt.Fprint(saida, usoTexto)
			return falha(SaidaUso, "")
		}
		// a mensagem do flag pode ecoar o valor (ex.: a chave): só o nome da flag
		return falha(SaidaUso, "opção inválida (veja hermesinstalador --ajuda)")
	}
	if *ajuda {
		fmt.Fprint(saida, usoTexto)
		return falha(SaidaUso, "")
	}
	if fs.NArg() > 0 {
		return falha(SaidaUso, "argumento inesperado (veja hermesinstalador --ajuda)")
	}
	if *chave != "" {
		o.Chave, o.ChaveArgumento = *chave, true
	}
	if o.MostrarIdentificacao {
		if o.Modo != "" {
			return falha(SaidaUso, "--mostrar-identificacao não combina com o modo %s", o.Modo)
		}
		o.Modo = "identificacao"
	}
	switch o.Modo {
	case "instalar", "adotar", "solicitar", "identificacao":
	case "":
		if !o.MostrarVersao {
			fmt.Fprint(saida, usoTexto)
			return falha(SaidaUso, "")
		}
	default:
		return falha(SaidaUso, "modo desconhecido %q (instalar, adotar ou solicitar)", corta(o.Modo, 20))
	}
	if !reVersaoAgente.MatchString(o.AgenteVersao) {
		return falha(SaidaUso, "--agente-versao deve ser latest ou X.Y.Z")
	}
	n := 0
	for _, b := range []bool{o.Chave != "", o.ChaveArquivo != "", o.ChaveStdin} {
		if b {
			n++
		}
	}
	if n > 1 {
		return falha(SaidaUso, "informe a chave por UMA fonte (--chave, --chave-arquivo ou --chave-stdin)")
	}
	return nil
}

// ── as 6 perguntas ──

type pergunta struct {
	leitor *bufio.Reader
	saida  io.Writer
}

const maxTentativas = 20

func (p *pergunta) linha(prompt string) (string, error) {
	fmt.Fprint(p.saida, prompt)
	l, err := p.leitor.ReadString('\n')
	if err != nil && (l == "" || !errors.Is(err, io.EOF)) {
		return "", falha(SaidaUso, "entrada encerrada antes da resposta")
	}
	return LimparResposta(l), nil
}

func (p *pergunta) valida(validar func(string) bool, prompt, padrao, msgErro string) (string, error) {
	for range maxTentativas {
		v, err := p.linha(prompt)
		if err != nil {
			return "", err
		}
		if v == "" {
			v = padrao
		}
		if validar(v) {
			return v, nil
		}
		fmt.Fprintf(p.saida, "  %s\n", msgErro)
	}
	return "", falha(SaidaUso, "respostas inválidas demais")
}

func (p *pergunta) simNao(prompt string, padrao bool) (bool, error) {
	dica := "[s/N]"
	if padrao {
		dica = "[S/n]"
	}
	for range maxTentativas {
		v, err := p.linha(prompt + " " + dica + ": ")
		if err != nil {
			return false, err
		}
		if b, ok := SimNao(v, padrao); ok {
			return b, nil
		}
		fmt.Fprint(p.saida, "  Responda 's' ou 'n'.\n")
	}
	return false, falha(SaidaUso, "respostas inválidas demais")
}

const (
	msgIP    = "IP inválido. Informe um IPv4 (ex.: 192.168.1.230)."
	msgPorta = "Porta inválida. Informe um número entre 1 e 65535."
	msgHost  = "Endereço inválido. Informe um IP ou hostname (ex.: aramo-ourobrancomatriz.ddns.com.br)."
)

func comPadrao(prompt, padrao string) string {
	if padrao == "" {
		return prompt + ": "
	}
	return prompt + " [" + padrao + "]: "
}

// coletarRespostas: interativo (leitor != nil) faz as 6 perguntas do install.sh, com os
// valores de flag/ambiente como padrão; não interativo usa flags/ambiente e falha (uso) se
// faltar ou for inválido. padroes (opcional) vem de um .env.production existente.
func coletarRespostas(o *Opcoes, padroes *Respostas, leitor *bufio.Reader, saida io.Writer, ipMaquina string) (Respostas, error) {
	var r Respostas
	def := Respostas{WildflyPorta: "8080", ExternoPorta: "65381"}
	if padroes != nil {
		def = *padroes
	}
	escolhe := func(a, b string) string {
		if strings.TrimSpace(a) != "" {
			return LimparResposta(a)
		}
		return b
	}
	defIP := escolhe(o.WildflyIP, def.WildflyIP)
	defPorta := escolhe(o.WildflyPorta, def.WildflyPorta)
	defExtEnd := escolhe(o.ExternoEndereco, def.ExternoEndereco)
	defExtPorta := escolhe(o.ExternoPorta, def.ExternoPorta)
	defExterno, okExt := SimNao(o.AcessoExterno, def.Externo || defExtEnd != "")
	defTags, okTags := SimNao(normalizaBool(o.IgnorarTags), def.IgnorarTags)
	r.AllowedHost = escolhe(o.AllowedHost, def.AllowedHost)
	if r.AllowedHost == "" {
		r.AllowedHost = ipMaquina
	}

	if leitor != nil {
		p := &pergunta{leitor: leitor, saida: saida}
		if defIP == "" {
			defIP = ipMaquina
		}
		var err error
		if r.WildflyIP, err = p.valida(IPv4Valido, comPadrao("Endereço IP interno do servidor WildFly", defIP), defIP, msgIP); err != nil {
			return r, err
		}
		if r.WildflyPorta, err = p.valida(PortaValida, comPadrao("Porta do servidor WildFly", defPorta), defPorta, msgPorta); err != nil {
			return r, err
		}
		if r.Externo, err = p.simNao("Deseja habilitar acesso externo?", defExterno && okExt); err != nil {
			return r, err
		}
		if r.Externo {
			if r.ExternoEndereco, err = p.valida(HostValido, comPadrao("Endereço externo (IP ou hostname)", defExtEnd), defExtEnd, msgHost); err != nil {
				return r, err
			}
			if r.ExternoPorta, err = p.valida(PortaValida, comPadrao("Porta externa", defExtPorta), defExtPorta, msgPorta); err != nil {
				return r, err
			}
		}
		if r.IgnorarTags, err = p.simNao("Ativar o Hermes SEM validar permissões (ignorar tags)?", defTags && okTags); err != nil {
			return r, err
		}
		if r.AllowedHost == "" {
			r.AllowedHost = r.WildflyIP
		}
		if !validaAllowedHost(r.AllowedHost) {
			return r, falha(SaidaUso, "HERMES_ALLOWED_HOST/--allowed-host inválido")
		}
		return r, nil
	}

	// não interativo
	switch {
	case defIP == "":
		return r, falha(SaidaUso, "falta o IP do WildFly: use --wildfly-ip ou HERMES_WILDFLY_IP")
	case !IPv4Valido(defIP):
		return r, falha(SaidaUso, "HERMES_WILDFLY_IP/--wildfly-ip inválido: %s", msgIP)
	case !PortaValida(defPorta):
		return r, falha(SaidaUso, "HERMES_WILDFLY_PORTA/--wildfly-porta inválida: %s", msgPorta)
	case !okExt:
		return r, falha(SaidaUso, "HERMES_ACESSO_EXTERNO/--acesso-externo deve ser s ou n")
	case !okTags:
		return r, falha(SaidaUso, "HERMES_IGNORE_TAGS/--ignorar-tags deve ser s ou n")
	}
	r.WildflyIP, r.WildflyPorta, r.Externo, r.IgnorarTags = defIP, defPorta, defExterno, defTags
	if r.Externo {
		if defExtEnd == "" || !HostValido(defExtEnd) {
			return r, falha(SaidaUso, "acesso externo ligado: informe HERMES_EXTERNO_ENDERECO/--externo-endereco válido (%s)", msgHost)
		}
		if !PortaValida(defExtPorta) {
			return r, falha(SaidaUso, "HERMES_EXTERNO_PORTA/--externo-porta inválida: %s", msgPorta)
		}
		r.ExternoEndereco, r.ExternoPorta = defExtEnd, defExtPorta
	}
	if r.AllowedHost == "" {
		r.AllowedHost = r.WildflyIP
	}
	if !validaAllowedHost(r.AllowedHost) {
		return r, falha(SaidaUso, "HERMES_ALLOWED_HOST/--allowed-host inválido")
	}
	return r, nil
}

// normalizaBool aceita também true/false (o HERMES_IGNORE_TAGS do install.sh).
func normalizaBool(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "true", "1":
		return "s"
	case "false", "0":
		return "n"
	}
	return s
}

// ALLOWED_HOST aceita lista separada por vírgula (como o install.sh documenta).
func validaAllowedHost(s string) bool {
	for _, h := range strings.Split(s, ",") {
		if !HostValido(strings.TrimSpace(h)) {
			return false
		}
	}
	return s != ""
}

// respostasDoEnv: padrões a partir de um .env.production existente.
func respostasDoEnv(texto string) *Respostas {
	r := &Respostas{WildflyPorta: "8080", ExternoPorta: "65381"}
	if v, ok := valorVariavel(texto, "NEXT_PUBLIC_API_URL"); ok {
		if h, p, ok := hostPorta(strings.Trim(v, `"'`)); ok {
			r.WildflyIP = h
			if p != "" {
				r.WildflyPorta = p
			}
		}
	}
	if v, ok := valorVariavel(texto, "NEXT_PUBLIC_API_URL_EXTERNAL"); ok {
		if h, p, ok := hostPorta(strings.Trim(v, `"'`)); ok {
			r.Externo, r.ExternoEndereco = true, h
			if p != "" {
				r.ExternoPorta = p
			}
		}
	}
	if v, ok := valorVariavel(texto, "NEXT_PUBLIC_IGNORE_TAGS"); ok {
		r.IgnorarTags = strings.Trim(v, `"' `) == "true"
	}
	if v, ok := valorVariavel(texto, "ALLOWED_HOST"); ok {
		r.AllowedHost = strings.Trim(v, `"' `)
	}
	return r
}
