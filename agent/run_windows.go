//go:build windows

package main

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const nomeServicoAgente = "rvland-agent"

// executarRun: como serviço do Windows, fala com o Gerenciador de Serviços
// (Stop/Shutdown) e grava log em arquivo; no console, roda direto.
func executarRun() {
	ehServico, err := svc.IsWindowsService()
	if err == nil && ehServico {
		iniciaLogArquivo()
		if err := svc.Run(nomeServicoAgente, servicoAgente{}); err != nil {
			logf("serviço do Windows: %v", err)
		}
		return
	}
	rodaAgente(nil)
}

type servicoAgente struct{}

func (servicoAgente) Execute(_ []string, pedidos <-chan svc.ChangeRequest, estado chan<- svc.Status) (bool, uint32) {
	estado <- svc.Status{State: svc.StartPending}
	parar := make(chan struct{})
	fim := make(chan struct{})
	go func() {
		rodaAgente(parar)
		close(fim)
	}()
	estado <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown}
	for {
		select {
		case p := <-pedidos:
			switch p.Cmd {
			case svc.Interrogate:
				estado <- p.CurrentStatus
			case svc.Stop, svc.Shutdown:
				estado <- svc.Status{State: svc.StopPending}
				close(parar)
				select {
				case <-fim:
				case <-time.After(15 * time.Second):
				}
				return false, 0
			}
		case <-fim:
			// o loop terminou sozinho: sai como falha para a recuperação reiniciar
			return false, 1
		}
	}
}

// cmdServico: `agenterv servico instalar|remover`. O instalador chama o
// `instalar` depois do enroll; é idempotente (reinstalar por cima atualiza).
func cmdServico(args []string) {
	acao := ""
	if len(args) > 0 {
		acao = args[0]
	}
	var err error
	switch acao {
	case "instalar":
		err = instalarServico()
	case "remover":
		err = removerServico()
	default:
		fatal("uso: agenterv servico instalar|remover")
	}
	if err != nil {
		fatal("servico " + acao + ": " + err.Error())
	}
}

func instalarServico() error {
	exe := exeAtual()
	if exe == "" {
		return fmt.Errorf("caminho do executável indisponível")
	}
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("abrir o Gerenciador de Serviços (rode como administrador): %w", err)
	}
	defer m.Disconnect()

	cfg := mgr.Config{
		DisplayName: "RVLand Agent",
		Description: "Agente RVLand: licença e RV Pic Price (API local só em 127.0.0.1).",
		StartType:   mgr.StartAutomatic,
	}
	s, err := m.OpenService(nomeServicoAgente)
	if err == nil {
		atual, e := s.Config()
		if e != nil {
			s.Close()
			return e
		}
		atual.BinaryPathName = `"` + exe + `" run`
		atual.DisplayName, atual.Description, atual.StartType = cfg.DisplayName, cfg.Description, cfg.StartType
		if e := s.UpdateConfig(atual); e != nil {
			s.Close()
			return e
		}
		logf("serviço %s atualizado", nomeServicoAgente)
	} else {
		s, err = m.CreateService(nomeServicoAgente, exe, cfg, "run")
		if err != nil {
			return err
		}
		logf("serviço %s criado", nomeServicoAgente)
	}
	defer s.Close()
	// recuperação: reinicia em falha (é assim que a atualização automática
	// sobe o binário novo) — 10 s, 30 s, 60 s; zera a contagem em 1 dia
	acoes := []mgr.RecoveryAction{
		{Type: mgr.ServiceRestart, Delay: 10 * time.Second},
		{Type: mgr.ServiceRestart, Delay: 30 * time.Second},
		{Type: mgr.ServiceRestart, Delay: 60 * time.Second},
	}
	if err := s.SetRecoveryActions(acoes, 86400); err != nil {
		return fmt.Errorf("ações de recuperação: %w", err)
	}
	if err := s.SetRecoveryActionsOnNonCrashFailures(true); err != nil {
		return fmt.Errorf("recuperação em saída com erro: %w", err)
	}
	return nil
}

func removerServico() error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	s, err := m.OpenService(nomeServicoAgente)
	if err != nil {
		return nil // já não existe
	}
	defer s.Close()
	g := novoGerenciadorSCMCom(scmReal{})
	_ = g.Stop(nomeServicoAgente)
	return s.Delete()
}

// ── log em arquivo com rotação simples (5 MB × 3 arquivos) ──

const (
	tamanhoMaxLog = 5 << 20
	arquivosLog   = 3
)

func caminhoLog() string { return filepath.Join(dirLogs(), "agent.log") }

type logRotativo struct {
	mu      sync.Mutex
	arq     *os.File
	tamanho int64
}

func rotaciona() {
	base := caminhoLog()
	_ = os.Remove(fmt.Sprintf("%s.%d", base, arquivosLog))
	for i := arquivosLog - 1; i >= 1; i-- {
		_ = os.Rename(fmt.Sprintf("%s.%d", base, i), fmt.Sprintf("%s.%d", base, i+1))
	}
	_ = os.Rename(base, base+".1")
}

func abreLog() (*os.File, int64, error) {
	if err := os.MkdirAll(dirLogs(), 0o755); err != nil {
		return nil, 0, err
	}
	if st, err := os.Stat(caminhoLog()); err == nil && st.Size() >= tamanhoMaxLog {
		rotaciona()
	}
	f, err := os.OpenFile(caminhoLog(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, 0, err
	}
	st, _ := f.Stat()
	var t int64
	if st != nil {
		t = st.Size()
	}
	return f, t, nil
}

func (l *logRotativo) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.tamanho+int64(len(p)) > tamanhoMaxLog {
		_ = l.arq.Close()
		rotaciona()
		if f, t, err := abreLog(); err == nil {
			l.arq, l.tamanho = f, t
		}
	}
	n, err := l.arq.Write(p)
	l.tamanho += int64(n)
	return n, err
}

func iniciaLogArquivo() {
	f, t, err := abreLog()
	if err != nil {
		return // sem log em arquivo: segue com stdout
	}
	saidaLog = &logRotativo{arq: f, tamanho: t}
}

func mostraUltimasLinhasLog(n int) {
	f, err := os.Open(caminhoLog())
	if err != nil {
		fmt.Println("sem log ainda em", caminhoLog())
		return
	}
	defer f.Close()
	linhas := []string{}
	sc := bufio.NewScanner(io.LimitReader(f, 64<<20))
	sc.Buffer(make([]byte, 64*1024), 1<<20)
	for sc.Scan() {
		linhas = append(linhas, sc.Text())
		if len(linhas) > n {
			linhas = linhas[1:]
		}
	}
	fmt.Println(strings.Join(linhas, "\n"))
}
