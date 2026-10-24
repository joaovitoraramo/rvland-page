//go:build !windows

package main

import (
	"os"
	"path/filepath"
)

// parametroSO: no Linux a URL fica como sempre foi (o painel assume linux).
func parametroSO() string { return "" }

// trocaBinario (Linux): grava temp no mesmo diretório, rename por cima e guarda
// .bak. O systemd reinicia o serviço quando o processo sai.
func trocaBinario(bin []byte, versaoAlvo string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, _ = filepath.EvalSymlinks(exe)
	tmp := exe + ".novo"
	if err := os.WriteFile(tmp, bin, 0o755); err != nil {
		return err
	}
	_ = os.Rename(exe, exe+".bak")
	if err := os.Rename(tmp, exe); err != nil {
		_ = os.Rename(exe+".bak", exe) // rollback
		return err
	}
	logf("atualizado para %s — reiniciando", versaoAlvo)
	os.Exit(0) // systemd reinicia com o binário novo
	return nil
}

// No Linux a troca é atômica e o .bak fica; nada a confirmar nem desfazer.
func verificaAtualizacaoPendente() {}
func confirmaAtualizacao()         {}

func executarRun() { rodaAgente(nil) }

func cmdServico(args []string) {
	logf("o comando `servico` é do Windows; no Linux o instalador cria a unidade systemd")
}

func mostraUltimasLinhasLog(n int) {}
