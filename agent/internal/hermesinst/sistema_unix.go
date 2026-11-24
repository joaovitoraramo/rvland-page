//go:build unix

package hermesinst

import (
	"os"
	"os/exec"
	"syscall"
)

// prepararGrupo: o comando roda no próprio grupo de processos; o timeout manda SIGTERM ao
// grupo inteiro (o hermes-imagem tem filhos; o trap dele faz o logout do registro).
func prepararGrupo(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return nil
		}
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
	}
}

// UmaskRestritivo: nada criado pelo instalador nasce legível por outros (os modos são
// sempre explícitos; isto cobre o que escapar, como arquivos de processos filhos).
func UmaskRestritivo() { syscall.Umask(0o077) }

// EspacoLivre: bytes disponíveis (para não-root) no sistema de arquivos de dir.
func EspacoLivre(dir string) (uint64, error) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(dir, &st); err != nil {
		return 0, err
	}
	return uint64(st.Bavail) * uint64(st.Bsize), nil //nolint:unconvert // tipos variam por SO
}

// abrirLogSemSeguirLink abre o log em modo append, 0600, recusando symlink no destino.
func abrirLogSemSeguirLink(p string) (*os.File, error) {
	f, err := os.OpenFile(p, os.O_WRONLY|os.O_APPEND|os.O_CREATE|syscall.O_NOFOLLOW, 0o600)
	if err != nil {
		return nil, err
	}
	_ = f.Chmod(0o600)
	return f, nil
}

// abrirLeituraSemSeguirLink: abre para leitura recusando symlink no último componente; o
// chamador confere o tipo com f.Stat() no MESMO descritor (sem janela entre stat e open).
func abrirLeituraSemSeguirLink(p string) (*os.File, error) {
	return os.OpenFile(p, os.O_RDONLY|syscall.O_NOFOLLOW, 0)
}

// travaExclusiva: flock exclusivo NÃO bloqueante em p (criado 0600, sem seguir link).
// ocupada=true quando outra execução segura a trava. liberar fecha o descritor.
func travaExclusiva(p string) (liberar func(), ocupada bool, err error) {
	f, err := os.OpenFile(p, os.O_RDWR|os.O_CREATE|syscall.O_NOFOLLOW, 0o600)
	if err != nil {
		return nil, false, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = f.Close()
		if err == syscall.EWOULDBLOCK {
			return nil, true, nil
		}
		return nil, false, err
	}
	_ = f.Chmod(0o600)
	return func() { _ = f.Close() }, false, nil
}
