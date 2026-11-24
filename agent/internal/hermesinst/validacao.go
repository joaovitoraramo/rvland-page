package hermesinst

import (
	"regexp"
	"strconv"
	"strings"
)

// Validação das respostas: as MESMAS regras do install.sh do Hermes (valid_ipv4,
// valid_port, valid_host, ask_yes_no), para o operador não estranhar a diferença.

var (
	reIPv4  = regexp.MustCompile(`^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$`)
	reHost  = regexp.MustCompile(`^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$`)
	reChave = regexp.MustCompile(`^hmk_[A-Za-z0-9_-]{43}$`)
	reUUID  = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
)

// IPv4Valido: quatro octetos de 1 a 3 dígitos, cada um <= 255.
func IPv4Valido(s string) bool {
	m := reIPv4.FindStringSubmatch(s)
	if m == nil {
		return false
	}
	for _, o := range m[1:] {
		if n, _ := strconv.Atoi(o); n > 255 {
			return false
		}
	}
	return true
}

// PortaValida: só dígitos, 1..65535.
func PortaValida(s string) bool {
	if s == "" || len(s) > 5 {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	n, _ := strconv.Atoi(s)
	return n >= 1 && n <= 65535
}

// HostValido: IPv4 ou hostname/domínio (ex.: DDNS).
func HostValido(s string) bool {
	return IPv4Valido(s) || reHost.MatchString(s)
}

// SimNao interpreta s/sim/y/yes e n/nao/no (sem diferenciar maiúsculas); vazio = padrão.
// ok=false: resposta inválida (o interativo pergunta de novo).
func SimNao(s string, padrao bool) (valor, ok bool) {
	switch strings.ToLower(LimparResposta(s)) {
	case "":
		return padrao, true
	case "s", "sim", "y", "yes":
		return true, true
	case "n", "nao", "não", "no":
		return false, true
	}
	return false, false
}

// LimparResposta tira espaços, tabs e quebras de linha (como o ask_line do install.sh).
func LimparResposta(s string) string {
	return strings.Map(func(r rune) rune {
		switch r {
		case ' ', '\t', '\r', '\n':
			return -1
		}
		return r
	}, s)
}

// SoDigitos devolve só os dígitos de s.
func SoDigitos(s string) string {
	return strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, s)
}

func dvCNPJ(base string) int {
	pesos := []int{6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2}
	if len(base) == 12 {
		pesos = pesos[1:]
	}
	soma := 0
	for i := range len(base) {
		soma += int(base[i]-'0') * pesos[i]
	}
	if r := soma % 11; r >= 2 {
		return 11 - r
	}
	return 0
}

// CNPJValido: a mesma regra de lib/hermes/cnpj.ts (14 dígitos, não repetidos, dígitos verificadores).
func CNPJValido(s string) bool {
	d := SoDigitos(s)
	if len(d) != 14 || strings.Count(d, d[:1]) == 14 {
		return false
	}
	d1 := dvCNPJ(d[:12])
	d2 := dvCNPJ(d[:12] + strconv.Itoa(d1))
	return d == d[:12]+strconv.Itoa(d1)+strconv.Itoa(d2)
}

// RaizCNPJ: os 8 primeiros dígitos (matriz e filiais compartilham).
func RaizCNPJ(s string) string {
	d := SoDigitos(s)
	if len(d) < 8 {
		return ""
	}
	return d[:8]
}

// FormatoChaveValido: o formato de lib/hermes/chave.ts (hmk_ + 43 base64url).
func FormatoChaveValido(s string) bool { return reChave.MatchString(s) }

// UUIDValido: uuid em minúsculas (como o RVLand devolve e assina).
func UUIDValido(s string) bool { return reUUID.MatchString(s) }

// CanalValido: os canais do hermes-imagem.
func CanalValido(s string) bool { return s == "stable" || s == "preview" }
