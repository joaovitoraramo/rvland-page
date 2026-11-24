package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"time"
)

// Credencial de pull do GHCR (POST /api/agente/hermes/credencial). Entregue ao hermes-imagem
// pelo hook /etc/hermes/credencial.sh (Hermes: scripts/credencial.sh.exemplo), que roda
// `agenterv hermes credencial` e lê DUAS linhas do stdout: usuário e senha. O agente nunca
// grava a senha em disco nem a loga; nada além dessas duas linhas vai para o stdout.

var (
	errCredencialBloqueada = errors.New("instalação bloqueada: não recebe versões novas (403)")
	errCredencialLimite    = errors.New("limite de pedidos de credencial atingido (429)")

	reUsuarioRegistro = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)
	reSenhaRegistro   = regexp.MustCompile(`^[A-Za-z0-9_.-]+$`)
)

const corpoCredencialHermes = `{"pedido":"credencial"}`

// credencial pede a credencial ao RV. Sem anti-replay no servidor para esta rota: usa o relógio
// corrigido do estado (sem gravá-lo; o ciclo de sync é o dono do estado). RELOGIO = 1 retentativa.
func (a *agenteHermes) credencial() (usuario, senha string, err error) {
	est := carregaEstadoHermes(a.caminhoEstado)
	corpo := []byte(corpoCredencialHermes)
	for tentativa := 0; tentativa < 2; tentativa++ {
		inicio := a.agora()
		ts := formatoTs(agoraCorrigida(est, inicio))
		status, resp, hdr, e := a.enviar("credencial", rotaCredencialHermes, ts, corpo)
		if e != nil {
			return "", "", fmt.Errorf("rede: %v", e)
		}
		codigo, agoraSrv := erroDe(resp)
		switch {
		case status == http.StatusOK:
			var c struct {
				Usuario string `json:"usuario"`
				Senha   string `json:"senha"`
			}
			if json.Unmarshal(resp, &c) != nil || !reUsuarioRegistro.MatchString(c.Usuario) || !reSenhaRegistro.MatchString(c.Senha) {
				return "", "", errors.New("resposta da credencial fora do formato esperado")
			}
			return c.Usuario, c.Senha, nil
		case status == http.StatusConflict && codigo == "RELOGIO":
			t, perr := time.Parse(time.RFC3339Nano, agoraSrv)
			if perr != nil {
				return "", "", errors.New("RELOGIO sem o horário do servidor")
			}
			medeRelogio(est, t, inicio.Add(a.agora().Sub(inicio)/2))
			continue
		case status == http.StatusForbidden:
			return "", "", errCredencialBloqueada
		case status == http.StatusTooManyRequests:
			return "", "", fmt.Errorf("%w; tente após %s", errCredencialLimite, retryAfter(hdr, a.agora(), espera429Hermes))
		default:
			if codigo == "" {
				codigo = "?"
			}
			return "", "", fmt.Errorf("credencial recusada (%d %.40s)", status, codigo)
		}
	}
	return "", "", errors.New("relógio fora da janela do servidor")
}

// escreveCredencial: saída do `agenterv hermes credencial`. 0 ok; 3 bloqueada; 4 limite; 1 outro.
func escreveCredencial(a *agenteHermes, stdout, stderr io.Writer) int {
	u, s, err := a.credencial()
	if err != nil {
		fmt.Fprintln(stderr, "rvland-agent: hermes credencial: "+err.Error())
		switch {
		case errors.Is(err, errCredencialBloqueada):
			return 3
		case errors.Is(err, errCredencialLimite):
			return 4
		}
		return 1
	}
	fmt.Fprintf(stdout, "%s\n%s\n", u, s)
	return 0
}
