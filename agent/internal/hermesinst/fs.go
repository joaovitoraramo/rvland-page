package hermesinst

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// Sistema de arquivos com RAIZ injetável ("/" em produção, diretório temporário nos testes).
// Regras: nunca seguir symlink em destino (nem no caminho até ele, abaixo da raiz), escrita
// atômica (temporário no mesmo diretório + fsync + rename) e permissões explícitas.

var errSymlink = errors.New("destino é (ou passa por) um link simbólico: recusado")

// real converte um caminho absoluto do sistema ("/etc/hermes/config") para dentro da raiz.
func real(raiz, p string) string {
	if !filepath.IsAbs(p) {
		panic("caminho do sistema precisa ser absoluto: " + p)
	}
	return filepath.Join(raiz, filepath.Clean(p))
}

// semSymlink confere cada componente de p ABAIXO da raiz: existente e symlink = erro.
// Componentes ausentes encerram a conferência (serão criados como diretórios comuns).
func semSymlink(raiz, p string) error {
	partes := strings.Split(strings.TrimPrefix(filepath.Clean(p), "/"), "/")
	atual := raiz
	for _, parte := range partes {
		if parte == "" {
			continue
		}
		atual = filepath.Join(atual, parte)
		fi, err := os.Lstat(atual)
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if fi.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("%s: %w", strings.TrimPrefix(atual, raiz), errSymlink)
		}
	}
	return nil
}

// criarDirs cria os diretórios ausentes de p (com modo) e devolve os que criou, do mais
// externo ao mais interno.
func criarDirs(raiz, p string, modo os.FileMode) ([]string, error) {
	if err := semSymlink(raiz, p); err != nil {
		return nil, err
	}
	var faltam []string
	for d := filepath.Clean(p); d != "/" && d != "."; d = filepath.Dir(d) {
		fi, err := os.Lstat(real(raiz, d))
		if err == nil {
			if !fi.IsDir() {
				return nil, fmt.Errorf("%s existe e não é diretório", d)
			}
			break
		}
		if !errors.Is(err, fs.ErrNotExist) {
			return nil, err
		}
		faltam = append([]string{d}, faltam...)
	}
	var criados []string
	for _, d := range faltam {
		if err := os.Mkdir(real(raiz, d), modo); err != nil && !errors.Is(err, fs.ErrExist) {
			return criados, err
		}
		if err := os.Chmod(real(raiz, d), modo); err != nil {
			return criados, err
		}
		criados = append(criados, d)
	}
	return criados, nil
}

// escreverAtomico grava dados em p com modo, sem seguir symlink. O diretório pai precisa existir.
func escreverAtomico(raiz, p string, dados []byte, modo os.FileMode) error {
	if err := semSymlink(raiz, p); err != nil {
		return err
	}
	destino := real(raiz, p)
	dir := filepath.Dir(destino)
	f, err := os.CreateTemp(dir, "."+filepath.Base(destino)+".novo-*") // O_EXCL, 0600
	if err != nil {
		return err
	}
	tmp := f.Name()
	ok := false
	defer func() {
		if !ok {
			_ = os.Remove(tmp)
		}
	}()
	if _, err := f.Write(dados); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Chmod(modo); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	// reconfere o destino imediatamente antes do rename (symlink plantado no meio do caminho)
	if fi, err := os.Lstat(destino); err == nil {
		if fi.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("%s: %w", p, errSymlink)
		}
		if fi.IsDir() {
			return fmt.Errorf("%s é um diretório", p)
		}
	}
	if err := os.Rename(tmp, destino); err != nil {
		return err
	}
	ok = true
	if d, err := os.Open(dir); err == nil {
		_ = d.Sync()
		_ = d.Close()
	}
	return nil
}

// lerArquivo lê p (regular, sem symlink) com teto de tamanho.
func lerArquivo(raiz, p string, max int64) ([]byte, error) {
	if err := semSymlink(raiz, p); err != nil {
		return nil, err
	}
	fi, err := os.Lstat(real(raiz, p))
	if err != nil {
		return nil, err
	}
	if !fi.Mode().IsRegular() {
		return nil, fmt.Errorf("%s não é arquivo regular", p)
	}
	if fi.Size() > max {
		return nil, fmt.Errorf("%s maior que o permitido (%d bytes)", p, max)
	}
	return os.ReadFile(real(raiz, p))
}

func existe(raiz, p string) bool {
	_, err := os.Lstat(real(raiz, p))
	return err == nil
}

func ehDir(raiz, p string) bool {
	fi, err := os.Lstat(real(raiz, p))
	return err == nil && fi.IsDir()
}

// ── transação: tudo que o instalador grava pode ser desfeito na ordem inversa ──

type passoDesfazer struct {
	desc string
	f    func() error
}

// Transacao registra cada escrita com o estado anterior. Desfazer restaura arquivos
// substituídos, apaga os criados e remove SÓ os diretórios que esta execução criou
// (nada que existia antes é apagado).
type Transacao struct {
	raiz   string
	passos []passoDesfazer
}

func NovaTransacao(raiz string) *Transacao { return &Transacao{raiz: raiz} }

func (t *Transacao) registrar(desc string, f func() error) {
	t.passos = append(t.passos, passoDesfazer{desc, f})
}

// Compensar registra uma ação de desfazer arbitrária (ex.: remover um container criado).
func (t *Transacao) Compensar(desc string, f func() error) { t.registrar(desc, f) }

// CriarDir garante p (e pais) com modo; os criados entram no desfazer.
func (t *Transacao) CriarDir(p string, modo os.FileMode) error {
	criados, err := criarDirs(t.raiz, p, modo)
	for _, d := range criados {
		d := d
		t.registrar("remover diretório criado "+d, func() error {
			fi, err := os.Lstat(real(t.raiz, d))
			if errors.Is(err, fs.ErrNotExist) {
				return nil
			}
			if err != nil || !fi.IsDir() {
				return fmt.Errorf("%s mudou de tipo; não removido", d)
			}
			return os.RemoveAll(real(t.raiz, d))
		})
	}
	return err
}

// Escrever grava p (atômico). Conteúdo e modo iguais ao atual = nada a fazer (idempotente).
func (t *Transacao) Escrever(p string, dados []byte, modo os.FileMode) error {
	if err := semSymlink(t.raiz, p); err != nil {
		return err
	}
	var antigo []byte
	var modoAntigo os.FileMode
	existia := false
	if fi, err := os.Lstat(real(t.raiz, p)); err == nil {
		if !fi.Mode().IsRegular() {
			return fmt.Errorf("%s existe e não é arquivo regular", p)
		}
		b, err := os.ReadFile(real(t.raiz, p))
		if err != nil {
			return err
		}
		if bytes.Equal(b, dados) && fi.Mode().Perm() == modo {
			return nil
		}
		antigo, modoAntigo, existia = b, fi.Mode().Perm(), true
	} else if !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	if err := t.CriarDir(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	if err := escreverAtomico(t.raiz, p, dados, modo); err != nil {
		return err
	}
	if existia {
		t.registrar("restaurar "+p, func() error { return escreverAtomico(t.raiz, p, antigo, modoAntigo) })
	} else {
		t.registrar("remover "+p, func() error {
			err := os.Remove(real(t.raiz, p))
			if errors.Is(err, fs.ErrNotExist) {
				return nil
			}
			return err
		})
	}
	return nil
}

// RemoverLink tira um symlink (ex.: sites-enabled/default do nginx); o desfazer o recria.
func (t *Transacao) RemoverLink(p string) error {
	if err := semSymlink(t.raiz, filepath.Dir(p)); err != nil {
		return err
	}
	r := real(t.raiz, p)
	fi, err := os.Lstat(r)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if fi.Mode()&os.ModeSymlink == 0 {
		return fmt.Errorf("%s não é link simbólico; não removido", p)
	}
	alvo, err := os.Readlink(r)
	if err != nil {
		return err
	}
	if err := os.Remove(r); err != nil {
		return err
	}
	t.registrar("recriar link "+p, func() error {
		if _, err := os.Lstat(r); err == nil {
			_ = os.Remove(r)
		}
		return os.Symlink(alvo, r)
	})
	return nil
}

// CriarLink cria o symlink p -> alvo (se p não existe); o desfazer o remove.
func (t *Transacao) CriarLink(p, alvo string) error {
	if err := semSymlink(t.raiz, filepath.Dir(p)); err != nil {
		return err
	}
	r := real(t.raiz, p)
	if fi, err := os.Lstat(r); err == nil {
		if fi.Mode()&os.ModeSymlink != 0 {
			if atual, _ := os.Readlink(r); atual == alvo {
				return nil
			}
		}
		return fmt.Errorf("%s já existe; não substituído", p)
	}
	if err := os.Symlink(alvo, r); err != nil {
		return err
	}
	t.registrar("remover link "+p, func() error { return os.Remove(r) })
	return nil
}

// Preservar fotografa p antes de um comando externo mexer nele (ex.: o enroll do agente): o
// desfazer devolve o conteúdo/modo anterior, ou apaga o arquivo se ele não existia.
func (t *Transacao) Preservar(p string) error {
	if err := semSymlink(t.raiz, p); err != nil {
		return err
	}
	r := real(t.raiz, p)
	fi, err := os.Lstat(r)
	if errors.Is(err, fs.ErrNotExist) {
		t.registrar("remover "+p+" (não existia)", func() error {
			if fi, err := os.Lstat(r); err == nil && fi.Mode()&os.ModeSymlink == 0 && !fi.IsDir() {
				return os.Remove(r)
			}
			return nil
		})
		return nil
	}
	if err != nil {
		return err
	}
	if !fi.Mode().IsRegular() {
		return fmt.Errorf("%s não é arquivo regular", p)
	}
	antigo, err := os.ReadFile(r)
	if err != nil {
		return err
	}
	modo := fi.Mode().Perm()
	t.registrar("restaurar "+p, func() error { return escreverAtomico(t.raiz, p, antigo, modo) })
	return nil
}

// Absorver incorpora os passos de uma sub-transação (que deu certo) a esta.
func (t *Transacao) Absorver(sub *Transacao) {
	t.passos = append(t.passos, sub.passos...)
	sub.passos = nil
}

// Desfazer executa os passos na ordem inversa e devolve os erros (o resto continua).
func (t *Transacao) Desfazer() []error {
	var errs []error
	for i := len(t.passos) - 1; i >= 0; i-- {
		if err := t.passos[i].f(); err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", t.passos[i].desc, err))
		}
	}
	t.passos = nil
	return errs
}

// Confirmar descarta o desfazer (as escritas ficam).
func (t *Transacao) Confirmar() { t.passos = nil }

// Pendentes: quantos passos o desfazer executaria.
func (t *Transacao) Pendentes() int { return len(t.passos) }
