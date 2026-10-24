//go:build windows

package main

import (
	"os"
	"path/filepath"
	"time"
)

// parametroSO: o Windows pede o binário .exe da release.
func parametroSO() string { return "&so=windows" }

func exeAtual() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	if r, err := filepath.EvalSymlinks(exe); err == nil {
		return r
	}
	return exe
}

// trocaBinario (Windows): o Windows deixa RENOMEAR o .exe em uso, mas não
// sobrescrever. O atual vira .old, o novo entra no lugar, o marcador fica em
// disco e o processo sai com código 1 — as ações de recuperação do serviço
// (configuradas no `servico instalar`) sobem o binário novo.
func trocaBinario(bin []byte, versaoAlvo string) error {
	if contem(versoesRecusadas(), versaoAlvo) {
		return nil // já falhou aqui antes: fica na versão atual até sair outra
	}
	exe := exeAtual()
	if exe == "" {
		return os.ErrNotExist
	}
	novo, velho := exe+".novo", exe+".old"
	if err := os.WriteFile(novo, bin, 0o755); err != nil {
		return err
	}
	_ = os.Remove(velho)
	if err := os.Rename(exe, velho); err != nil {
		_ = os.Remove(novo)
		return err
	}
	if err := os.Rename(novo, exe); err != nil {
		_ = os.Rename(velho, exe) // rollback imediato
		return err
	}
	salvaMarcador(&marcadorAtualizacao{VersaoNova: versaoAlvo, VersaoAnterior: versao, Exe: exe, Em: time.Now()})
	logf("atualizado para %s — reiniciando pelo Gerenciador de Serviços", versaoAlvo)
	os.Exit(1) // saída não limpa: a recuperação do serviço reinicia
	return nil
}

// verificaAtualizacaoPendente roda na subida (dentro do serviço).
func verificaAtualizacaoPendente() {
	m := carregaMarcador()
	switch acaoNaSubida(m, versao) {
	case "nada":
		exe := exeAtual()
		_ = os.Remove(exe + ".old")
		_ = os.Remove(exe + ".falhou")
		return
	case "limpar":
		removeMarcador()
		return
	case "voltar":
		voltaVersaoAnterior(m, "subiu "+itoaSimples(m.Subidas)+" vezes sem falar com a RV")
		return
	}
	m.Subidas++
	salvaMarcador(m)
	logf("versão %s em observação (subida %d de %d): aguardando contato com a RV", m.VersaoNova, m.Subidas, maxSubidasSemConfirmar)
	go func() {
		time.Sleep(prazoConfirmacao)
		if mm := carregaMarcador(); mm != nil && mm.VersaoNova == versao {
			voltaVersaoAnterior(mm, "sem contato com a RV em "+prazoConfirmacao.String())
		}
	}()
}

// confirmaAtualizacao: a versão nova falou com a RV — fica, e o .old sai.
func confirmaAtualizacao() {
	m := carregaMarcador()
	if m == nil || m.VersaoNova != versao {
		return
	}
	removeMarcador()
	_ = os.Remove(m.Exe + ".old")
	logf("atualização para %s confirmada", versao)
}

func voltaVersaoAnterior(m *marcadorAtualizacao, motivo string) {
	velho := m.Exe + ".old"
	if _, err := os.Stat(velho); err != nil {
		logf("atualização %s não firmou (%s), mas não há versão anterior para voltar", m.VersaoNova, motivo)
		removeMarcador()
		return
	}
	recusaVersao(m.VersaoNova)
	_ = os.Remove(m.Exe + ".falhou")
	if err := os.Rename(m.Exe, m.Exe+".falhou"); err != nil {
		logf("voltar versão: %v", err)
		return
	}
	if err := os.Rename(velho, m.Exe); err != nil {
		_ = os.Rename(m.Exe+".falhou", m.Exe)
		logf("voltar versão: %v", err)
		return
	}
	removeMarcador()
	logf("VOLTOU para %s: a %s %s (recusada neste servidor)", m.VersaoAnterior, m.VersaoNova, motivo)
	os.Exit(1) // a recuperação do serviço sobe a versão anterior
}

func itoaSimples(n int) string { return itoa(n) }
