package main

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

// Arquivos que o agente entrega ao Hermes no host (contrato com o container e com o
// hermes-imagem; ver docker-compose.imagem.yml e scripts/hermes-imagem.sh do Hermes):
//
//	<dir_licenca>/licenca.json   documento {payload,assinatura,kid}, bytes como vieram do RV
//	<dir_licenca>/obrigatoria    marcador: o container exige licença válida para subir
//	<dir_licenca>/bloqueio       marcador: o hermes-imagem não faz `up -d`
//	<dir_hermes>/rv/canal        "stable" | "preview": vence o argumento do hermes-imagem
//
// dir_licenca (padrão /var/lib/hermes/licenca) é montado :ro em /run/hermes no container,
// que roda como uid 1001: arquivos 0644 e diretórios 0755, gravados de forma atômica
// (temporário no MESMO diretório + fsync + rename + fsync do diretório).

const (
	nomeDocHermes       = "licenca.json"
	marcadorObrigatoria = "obrigatoria"
	marcadorBloqueio    = "bloqueio"
)

type arquivosHermes struct {
	dirLicenca string
	dirHermes  string
	// testes: chamado antes de criar/remover um marcador (prova a ordem documento -> marcador)
	antesMarcador func(nome string, existir bool)
}

// garanteDir cria o diretório e força 0755 (inclusive se já existia com outra permissão).
func garanteDir(dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.Chmod(dir, 0o755)
}

func syncDir(dir string) {
	if d, err := os.Open(dir); err == nil {
		_ = d.Sync()
		_ = d.Close()
	}
}

// escreveAtomico grava `conteudo` em dir/nome com permissão `perm` exata (independe da umask).
func escreveAtomico(dir, nome string, conteudo []byte, perm os.FileMode) error {
	if err := garanteDir(dir); err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, "."+nome+".tmp-*")
	if err != nil {
		return err
	}
	tmp := f.Name()
	ok := false
	defer func() {
		if !ok {
			_ = f.Close()
			_ = os.Remove(tmp)
		}
	}()
	if _, err := f.Write(conteudo); err != nil {
		return err
	}
	if err := f.Chmod(perm); err != nil {
		return err
	}
	if err := f.Sync(); err != nil {
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp, filepath.Join(dir, nome)); err != nil {
		return err
	}
	ok = true
	syncDir(dir)
	return nil
}

func (a arquivosHermes) lerDoc() ([]byte, error) {
	return os.ReadFile(filepath.Join(a.dirLicenca, nomeDocHermes))
}

func (a arquivosHermes) gravarDoc(b []byte) error {
	return escreveAtomico(a.dirLicenca, nomeDocHermes, b, 0o644)
}

func (a arquivosHermes) existe(nome string) bool {
	_, err := os.Lstat(filepath.Join(a.dirLicenca, nome))
	return err == nil
}

// marcador cria (existir=true) ou remove o marcador. Idempotente; mudou=true se alterou o disco.
func (a arquivosHermes) marcador(nome string, existir bool) (mudou bool, err error) {
	p := filepath.Join(a.dirLicenca, nome)
	if a.antesMarcador != nil {
		a.antesMarcador(nome, existir)
	}
	if existir {
		if a.existe(nome) {
			return false, nil
		}
		return true, escreveAtomico(a.dirLicenca, nome, []byte("gravado pelo agente RV (rvland-agent)\n"), 0o644)
	}
	if err := os.Remove(p); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return false, nil
		}
		return false, err
	}
	syncDir(a.dirLicenca)
	return true, nil
}

func canalValido(c string) bool { return c == "stable" || c == "preview" }

// gravarCanal grava <dir_hermes>/rv/canal (lido pelo hermes-imagem).
func (a arquivosHermes) gravarCanal(c string) (mudou bool, err error) {
	if !canalValido(c) {
		return false, errors.New("canal inválido")
	}
	dir := filepath.Join(a.dirHermes, "rv")
	conteudo := []byte(c + "\n")
	if b, err := os.ReadFile(filepath.Join(dir, "canal")); err == nil && string(b) == string(conteudo) {
		return false, nil
	}
	return true, escreveAtomico(dir, "canal", conteudo, 0o644)
}
