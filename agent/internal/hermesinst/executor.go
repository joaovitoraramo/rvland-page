package hermesinst

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"
)

// Comando a executar. Segredos: valores que nunca aparecem na forma exibida (log).
// Stdin leva segredos que não podem ir no argv (ex.: senha do docker login).
type Comando struct {
	Nome  string
	Args  []string
	Env   []string // somadas ao ambiente (já filtrado)
	Stdin []byte
	Saida io.Writer // opcional: stdout+stderr também em tempo real
	// SoStdout: Resultado.Saida leva SÓ o stdout; o stderr vai separado em Resultado.Stderr
	// (para ler dados estruturados sem misturar avisos).
	SoStdout bool
	Timeout  time.Duration
	Segredos []string
}

// Exibir: a linha do comando para log/mensagem, com os segredos trocados por ***.
func (c Comando) Exibir() string {
	s := c.Nome
	if len(c.Args) > 0 {
		s += " " + strings.Join(c.Args, " ")
	}
	for _, x := range c.Segredos {
		if x != "" {
			s = strings.ReplaceAll(s, x, "***")
		}
	}
	return reChaveSolta.ReplaceAllString(s, "hmk_***")
}

// Resultado: Err != nil = o comando nem rodou até o fim (não encontrado, timeout).
type Resultado struct {
	Saida  []byte
	Stderr []byte // só preenchido com Comando.SoStdout
	Codigo int
	Err    error
}

func (r Resultado) ok() bool { return r.Err == nil && r.Codigo == 0 }

// Executor roda comandos. Os testes usam um fake; produção usa ExecutorReal.
type Executor interface {
	Executar(ctx context.Context, c Comando) Resultado
}

// variáveis que NUNCA passam para os processos filhos
var ambienteProibido = []string{"HERMES_CHAVE", "RVLAND_ENROLL_TOKEN"}

// ExecutorReal executa de verdade, com timeout (SIGTERM ao grupo, 30 s de graça).
type ExecutorReal struct{}

const maxSaidaCapturada = 1 << 20

type limitado struct {
	buf bytes.Buffer
}

func (l *limitado) Write(p []byte) (int, error) {
	if falta := maxSaidaCapturada - l.buf.Len(); falta > 0 {
		if len(p) > falta {
			l.buf.Write(p[:falta])
		} else {
			l.buf.Write(p)
		}
	}
	return len(p), nil
}

func ambienteFiltrado(extra []string) []string {
	var r []string
	for _, kv := range os.Environ() {
		proibida := false
		for _, p := range ambienteProibido {
			if strings.HasPrefix(kv, p+"=") {
				proibida = true
			}
		}
		if !proibida {
			r = append(r, kv)
		}
	}
	return append(r, extra...)
}

func (ExecutorReal) Executar(ctx context.Context, c Comando) Resultado {
	if c.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, c.Timeout)
		defer cancel()
	}
	cmd := exec.CommandContext(ctx, c.Nome, c.Args...)
	cmd.Env = ambienteFiltrado(c.Env)
	if c.Stdin != nil {
		cmd.Stdin = bytes.NewReader(c.Stdin)
	}
	var cap, capErr limitado
	var wOut, wErr io.Writer = &cap, &cap
	if c.SoStdout {
		wErr = &capErr
	}
	if c.Saida != nil {
		wOut, wErr = io.MultiWriter(wOut, c.Saida), io.MultiWriter(wErr, c.Saida)
	}
	cmd.Stdout, cmd.Stderr = wOut, wErr
	prepararGrupo(cmd)
	cmd.WaitDelay = 30 * time.Second
	err := cmd.Run()
	r := Resultado{Saida: cap.buf.Bytes()}
	if c.SoStdout {
		r.Stderr = capErr.buf.Bytes()
	}
	var ee *exec.ExitError
	switch {
	case err == nil:
	case ctx.Err() != nil:
		r.Codigo, r.Err = -1, errors.New("tempo esgotado")
	case errors.As(err, &ee):
		r.Codigo = ee.ExitCode()
	default:
		r.Codigo, r.Err = -1, err
	}
	return r
}
