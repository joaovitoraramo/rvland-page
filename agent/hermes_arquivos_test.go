package main

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

func umaskTeste(m int) int { return syscall.Umask(m) }

func arquivosTeste(t *testing.T) arquivosHermes {
	t.Helper()
	base := t.TempDir()
	return arquivosHermes{dirLicenca: filepath.Join(base, "licenca"), dirHermes: base}
}

func modo(t *testing.T, p string) os.FileMode {
	t.Helper()
	st, err := os.Stat(p)
	if err != nil {
		t.Fatal(err)
	}
	return st.Mode().Perm()
}

func TestArquivosHermes_DocAtomico0644(t *testing.T) {
	a := arquivosTeste(t)
	if err := a.gravarDoc(vetorEnvelope()); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(a.dirLicenca, "licenca.json")
	if modo(t, p) != 0o644 {
		t.Fatalf("licenca.json deveria ser 0644, é %v", modo(t, p))
	}
	if modo(t, a.dirLicenca) != 0o755 {
		t.Fatalf("diretório deveria ser 0755, é %v", modo(t, a.dirLicenca))
	}
	b, _ := a.lerDoc()
	if string(b) != string(vetorEnvelope()) {
		t.Fatal("bytes gravados diferem dos recebidos")
	}
	// nada de temporário largado no diretório (o container lê o diretório montado)
	ents, _ := os.ReadDir(a.dirLicenca)
	if len(ents) != 1 {
		t.Fatalf("só licenca.json deveria existir, há %d entradas", len(ents))
	}
}

func TestArquivosHermes_DiretorioComPermissaoErradaVira0755(t *testing.T) {
	a := arquivosTeste(t)
	if err := os.MkdirAll(a.dirLicenca, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := a.gravarDoc(vetorEnvelope()); err != nil {
		t.Fatal(err)
	}
	if modo(t, a.dirLicenca) != 0o755 {
		t.Fatalf("o container (uid 1001) precisa ler: diretório deveria virar 0755, é %v", modo(t, a.dirLicenca))
	}
}

func TestArquivosHermes_UmaskNaoAfetaPermissao(t *testing.T) {
	a := arquivosTeste(t)
	velho := umaskTeste(0o077)
	defer umaskTeste(velho)
	if _, err := a.marcador(marcadorObrigatoria, true); err != nil {
		t.Fatal(err)
	}
	if err := a.gravarDoc(vetorEnvelope()); err != nil {
		t.Fatal(err)
	}
	for _, n := range []string{"obrigatoria", "licenca.json"} {
		if m := modo(t, filepath.Join(a.dirLicenca, n)); m != 0o644 {
			t.Fatalf("%s deveria ser 0644 mesmo com umask 077, é %v", n, m)
		}
	}
}

func TestArquivosHermes_Marcadores(t *testing.T) {
	a := arquivosTeste(t)
	p := filepath.Join(a.dirLicenca, "bloqueio")
	mudou, err := a.marcador(marcadorBloqueio, true)
	if err != nil || !mudou {
		t.Fatalf("criar: mudou=%v err=%v", mudou, err)
	}
	if modo(t, p) != 0o644 {
		t.Fatalf("marcador deveria ser 0644")
	}
	if mudou, _ = a.marcador(marcadorBloqueio, true); mudou {
		t.Fatal("idempotente: já existia, não deveria reportar mudança")
	}
	if mudou, _ = a.marcador(marcadorBloqueio, false); !mudou {
		t.Fatal("remover deveria reportar mudança")
	}
	if _, err := os.Lstat(p); !os.IsNotExist(err) {
		t.Fatal("marcador deveria ter sido removido")
	}
	if mudou, err = a.marcador(marcadorBloqueio, false); mudou || err != nil {
		t.Fatalf("remover o que não existe: mudou=%v err=%v", mudou, err)
	}
}

func TestArquivosHermes_CanalNoCaminhoDoHermesImagem(t *testing.T) {
	a := arquivosTeste(t)
	if _, err := a.gravarCanal("talvez"); err == nil {
		t.Fatal("canal inválido não pode ser gravado")
	}
	mudou, err := a.gravarCanal("preview")
	if err != nil || !mudou {
		t.Fatalf("gravar canal: %v %v", mudou, err)
	}
	// o hermes-imagem lê $ESTADO_DIR/rv/canal (/var/lib/hermes/rv/canal), não dentro da licença
	p := filepath.Join(a.dirHermes, "rv", "canal")
	b, _ := os.ReadFile(p)
	if string(b) != "preview\n" || modo(t, p) != 0o644 || modo(t, filepath.Dir(p)) != 0o755 {
		t.Fatalf("rv/canal errado: %q %v", b, modo(t, p))
	}
	if mudou, _ = a.gravarCanal("preview"); mudou {
		t.Fatal("canal igual não deveria regravar")
	}
}
