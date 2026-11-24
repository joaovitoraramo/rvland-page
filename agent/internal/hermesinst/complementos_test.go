package hermesinst

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestValidarBaseSoHTTPSPuro(t *testing.T) {
	if b, err := ValidarBase("https://rvland.com.br/"); err != nil || b != "https://rvland.com.br" {
		t.Fatalf("%q %v", b, err)
	}
	for _, s := range []string{"http://rvland.com.br", "https://rvland.com.br/x", "https://u:p@rvland.com.br", "https://rvland.com.br?a=1", "rvland.com.br", "", "https://"} {
		if _, err := ValidarBase(s); err == nil {
			t.Errorf("ValidarBase(%q) aceitou", s)
		}
	}
}

func TestDefinirVariavelSemAspasPreservandoResto(t *testing.T) {
	env := "# topo\nA=1\nHERMES_INSTALACAO_ID=\"velho\"\nB=2\nexport HERMES_INSTALACAO_ID=outro\n"
	got := definirVariavel(env, "HERMES_INSTALACAO_ID", "novo-id")
	if strings.Count(got, "HERMES_INSTALACAO_ID") != 1 || !linhaExata(got, "HERMES_INSTALACAO_ID=novo-id") || !linhaExata(got, "A=1") || !linhaExata(got, "B=2") || !linhaExata(got, "# topo") {
		t.Fatalf("got:\n%s", got)
	}
	got = definirVariavel("A=1", "HERMES_INSTALACAO_ID", "x")
	if !linhaExata(got, "A=1") || !linhaExata(got, "HERMES_INSTALACAO_ID=x") {
		t.Fatalf("acréscimo:\n%s", got)
	}
	if v, ok := valorVariavel("HERMES_INSTALACAO_ID=\"x\"\n", "HERMES_INSTALACAO_ID"); !ok || v != `"x"` {
		t.Fatalf("valorVariavel deve devolver o valor cru (com aspas): %q", v)
	}
}

func TestRenderEnvTemIdSemAspasEExterno(t *testing.T) {
	r := Respostas{WildflyIP: "10.0.0.1", WildflyPorta: "8080", Externo: true, ExternoEndereco: "x.ddns.com.br", ExternoPorta: "65381", AllowedHost: "10.0.0.2"}
	env := renderEnv(r, "id-1", "1.0.0", time.Unix(0, 0))
	for _, l := range []string{"NEXT_PUBLIC_API_URL=http://10.0.0.1:8080", "NEXT_PUBLIC_API_URL_EXTERNAL=http://x.ddns.com.br:65381", "HERMES_INSTALACAO_ID=id-1", "NEXT_PUBLIC_IGNORE_TAGS=false"} {
		if !linhaExata(env, l) {
			t.Errorf("faltou %q:\n%s", l, env)
		}
	}
	if strings.Contains(env, `"id-1"`) {
		t.Fatal("aspas no HERMES_INSTALACAO_ID")
	}
}

func TestExecutorRealFiltraChaveETempoEsgotado(t *testing.T) {
	t.Setenv("HERMES_CHAVE", "hmk_naoPodeVazarParaFilhos")
	t.Setenv("RVLAND_ENROLL_TOKEN", "token-que-nao-pode-vazar")
	r := ExecutorReal{}.Executar(context.Background(), Comando{Nome: "/bin/sh", Args: []string{"-c", `printf '%s' "${HERMES_CHAVE:-vazio}${RVLAND_ENROLL_TOKEN:-}"; exit 3`}})
	if r.Codigo != 3 || string(r.Saida) != "vazio" || r.Err != nil {
		t.Fatalf("%+v %q", r, r.Saida)
	}
	r = ExecutorReal{}.Executar(context.Background(), Comando{Nome: "/bin/sh", Args: []string{"-c", "cat"}, Stdin: []byte("pelo-stdin")})
	if string(r.Saida) != "pelo-stdin" {
		t.Fatalf("stdin: %q", r.Saida)
	}
	r = ExecutorReal{}.Executar(context.Background(), Comando{Nome: "/bin/sh", Args: []string{"-c", "sleep 5"}, Timeout: 200 * time.Millisecond})
	if r.Err == nil {
		t.Fatal("timeout não detectado")
	}
}

func TestTransacaoDesfazSemApagarOQueExistia(t *testing.T) {
	raiz := t.TempDir()
	_ = os.MkdirAll(filepath.Join(raiz, "etc"), 0o755)
	_ = os.WriteFile(filepath.Join(raiz, "etc/existente"), []byte("antes"), 0o640)
	tx := NovaTransacao(raiz)
	if err := tx.Escrever("/etc/existente", []byte("depois"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := tx.Escrever("/opt/novo/dir/arq", []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := tx.Preservar("/etc/feito-por-comando"); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(raiz, "etc/feito-por-comando"), []byte("y"), 0o644)
	if errs := tx.Desfazer(); len(errs) > 0 {
		t.Fatal(errs)
	}
	b, _ := os.ReadFile(filepath.Join(raiz, "etc/existente"))
	fi, _ := os.Stat(filepath.Join(raiz, "etc/existente"))
	if string(b) != "antes" || fi.Mode().Perm() != 0o640 {
		t.Fatalf("restauração: %q %o", b, fi.Mode().Perm())
	}
	for _, p := range []string{"opt", "etc/feito-por-comando"} {
		if _, err := os.Lstat(filepath.Join(raiz, p)); err == nil {
			t.Fatalf("%s deveria ter saído", p)
		}
	}
	if _, err := os.Stat(filepath.Join(raiz, "etc")); err != nil {
		t.Fatal("diretório pré-existente apagado")
	}
}

func TestEscritaRecusaSymlinkNoDestino(t *testing.T) {
	raiz, fora := t.TempDir(), t.TempDir()
	_ = os.MkdirAll(filepath.Join(raiz, "etc"), 0o755)
	_ = os.Symlink(filepath.Join(fora, "alvo"), filepath.Join(raiz, "etc/arq"))
	if err := NovaTransacao(raiz).Escrever("/etc/arq", []byte("x"), 0o600); err == nil {
		t.Fatal("escreveu através de symlink")
	}
	if _, err := os.Lstat(filepath.Join(fora, "alvo")); err == nil {
		t.Fatal("criou o alvo do symlink")
	}
}
