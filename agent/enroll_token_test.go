package main

import (
	"errors"
	"strings"
	"testing"
)

const tokSegredo = "tok_SEGREDO_abc123"

type ambTok struct {
	env       map[string]string
	removido  []string
	lidoStdin int
	stdin     string
	errStdin  error
}

func (a *ambTok) resolve(args ...string) (string, error) {
	return resolveTokenEnroll(args,
		func(k string) (string, bool) { v, ok := a.env[k]; return v, ok },
		func(k string) error { a.removido = append(a.removido, k); delete(a.env, k); return nil },
		func() (string, error) { a.lidoStdin++; return a.stdin, a.errStdin })
}

func TestTokenSoFlag(t *testing.T) {
	a := &ambTok{env: map[string]string{}}
	got, err := a.resolve("--token="+tokSegredo, "--servidor=x")
	if err != nil || got != tokSegredo {
		t.Fatalf("got %q err %v", got, err)
	}
	if a.lidoStdin != 0 {
		t.Fatal("não deve ler stdin sem --token-stdin")
	}
}

func TestTokenSoEnvRemoveDoAmbiente(t *testing.T) {
	a := &ambTok{env: map[string]string{envTokenEnroll: " " + tokSegredo + "\n"}}
	got, err := a.resolve("--servidor=x")
	if err != nil || got != tokSegredo {
		t.Fatalf("got %q err %v", got, err)
	}
	if len(a.removido) != 1 || a.removido[0] != envTokenEnroll {
		t.Fatalf("env deveria ser removida: %v", a.removido)
	}
}

func TestTokenEnvVaziaTambemRemovidaEUsaFlag(t *testing.T) {
	a := &ambTok{env: map[string]string{envTokenEnroll: "  "}}
	got, err := a.resolve("--token=" + tokSegredo)
	if err != nil || got != tokSegredo || len(a.removido) != 1 {
		t.Fatalf("got %q err %v removido %v", got, err, a.removido)
	}
}

func TestTokenSoStdin(t *testing.T) {
	a := &ambTok{env: map[string]string{}, stdin: tokSegredo}
	got, err := a.resolve("--token-stdin")
	if err != nil || got != tokSegredo || a.lidoStdin != 1 {
		t.Fatalf("got %q err %v lido %d", got, err, a.lidoStdin)
	}
}

func TestTokenFontesIguaisNaoDivergem(t *testing.T) {
	a := &ambTok{env: map[string]string{envTokenEnroll: tokSegredo}, stdin: tokSegredo}
	got, err := a.resolve("--token-stdin", "--token="+tokSegredo)
	if err != nil || got != tokSegredo {
		t.Fatalf("got %q err %v", got, err)
	}
}

func TestTokenDivergenteErroSemValores(t *testing.T) {
	outro := "tok_OUTRO_zzz999"
	casos := []struct {
		nome string
		a    *ambTok
		args []string
	}{
		{"flag x env", &ambTok{env: map[string]string{envTokenEnroll: outro}}, []string{"--token=" + tokSegredo}},
		{"stdin x flag", &ambTok{env: map[string]string{}, stdin: outro}, []string{"--token-stdin", "--token=" + tokSegredo}},
		{"stdin x env", &ambTok{env: map[string]string{envTokenEnroll: tokSegredo}, stdin: outro}, []string{"--token-stdin"}},
	}
	for _, c := range casos {
		_, err := c.a.resolve(c.args...)
		if err == nil {
			t.Fatalf("%s: esperava erro", c.nome)
		}
		if strings.Contains(err.Error(), tokSegredo) || strings.Contains(err.Error(), outro) ||
			strings.Contains(err.Error(), "SEGREDO") || strings.Contains(err.Error(), "OUTRO") {
			t.Fatalf("%s: erro vaza token: %v", c.nome, err)
		}
		if !strings.Contains(err.Error(), "divergentes") {
			t.Fatalf("%s: mensagem inesperada: %v", c.nome, err)
		}
	}
}

func TestTokenDivergenteAindaRemoveEnv(t *testing.T) {
	a := &ambTok{env: map[string]string{envTokenEnroll: "a"}}
	if _, err := a.resolve("--token=b"); err == nil {
		t.Fatal("esperava erro")
	}
	if len(a.removido) != 1 {
		t.Fatal("env deve ser removida mesmo no erro")
	}
}

func TestTokenAusenteErro(t *testing.T) {
	a := &ambTok{env: map[string]string{}}
	_, err := a.resolve("--servidor=x", "--token=")
	if err == nil || !strings.Contains(err.Error(), "obrigatório") {
		t.Fatalf("err %v", err)
	}
}

func TestTokenStdinVazioOuFalhaErroSemVazar(t *testing.T) {
	a := &ambTok{env: map[string]string{}, stdin: ""}
	if _, err := a.resolve("--token-stdin", "--token="+tokSegredo); err == nil {
		t.Fatal("stdin vazio deve falhar (não cair para --token em silêncio)")
	}
	c := &ambTok{env: map[string]string{}, stdin: ""}
	if got, err := c.resolve("--token-stdin"); err == nil {
		t.Fatalf("stdin vazio sozinho deve falhar, veio %q", got)
	}
	b := &ambTok{env: map[string]string{}, errStdin: errors.New("leitura: " + tokSegredo)}
	_, err := b.resolve("--token-stdin")
	if err == nil || strings.Contains(err.Error(), tokSegredo) {
		t.Fatalf("erro deve existir e não repassar texto do erro original: %v", err)
	}
}

func TestPrecedenciaNomeNaDivergencia(t *testing.T) {
	a := &ambTok{env: map[string]string{envTokenEnroll: "b"}, stdin: "a"}
	_, err := a.resolve("--token-stdin", "--token=c")
	if err == nil || !strings.Contains(err.Error(), "--token-stdin e "+envTokenEnroll) {
		t.Fatalf("a ordem de precedência deve aparecer nos nomes: %v", err)
	}
}

func TestLeLinhaToken(t *testing.T) {
	for _, c := range []struct{ in, want string }{
		{tokSegredo + "\n", tokSegredo},
		{tokSegredo + "\r\n", tokSegredo},
		{tokSegredo, tokSegredo},
		{tokSegredo + "\nlinha2\n", tokSegredo},
		{"", ""},
	} {
		got, err := leLinhaToken(strings.NewReader(c.in))
		if err != nil || got != c.want {
			t.Fatalf("%q => %q err %v", c.in, got, err)
		}
	}
}
