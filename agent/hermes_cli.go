package main

import (
	"errors"
	"fmt"
	"os"
	"regexp"
	"time"
)

var reInstalacaoID = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)

// configurarHermes aplica --instalacao/--canal/--modo ao config (sem gravar).
// Sem --modo=hermes, o servidor segue no Credit e só ganha o ciclo Hermes (adoção).
func configurarHermes(cfg *Config, args []string) error {
	if cfg.Hermes == nil {
		cfg.Hermes = &ConfigHermes{}
	}
	if v := flagArg(args, "instalacao"); v != "" {
		if !reInstalacaoID.MatchString(v) {
			return errors.New("--instalacao inválida")
		}
		cfg.Hermes.InstalacaoID = v
	}
	if v := flagArg(args, "canal"); v != "" {
		if !canalValido(v) {
			return errors.New("--canal deve ser stable ou preview")
		}
		cfg.Hermes.Canal = v
	}
	if v := flagArg(args, "modo"); v != "" {
		if v != modoHermes {
			return errors.New("--modo só aceita hermes")
		}
		cfg.Modo = v
	}
	return nil
}

// cmdHermes: `agenterv hermes <credencial|sync|status|configurar>`.
func cmdHermes(args []string) {
	if len(args) == 0 {
		fatal("uso: agenterv hermes credencial|sync|status|configurar [--instalacao=ID] [--canal=stable|preview] [--modo=hermes]")
	}
	cfg, err := carregaConfig()
	if err != nil {
		fatal("config: " + err.Error())
	}
	switch args[0] {
	case "credencial":
		// stdout = só usuário e senha (lido pelo hook do hermes-imagem); nada de log aqui
		os.Exit(escreveCredencial(novoAgenteHermes(cfg, cfg.Modo == modoHermes), os.Stdout, os.Stderr))
	case "sync":
		if _, hermes, _ := planoExecucao(cfg); !hermes {
			fatal("modo Hermes não configurado neste servidor")
		}
		a := novoAgenteHermes(cfg, cfg.Modo == modoHermes)
		w := a.cicloSeguro()
		// um hermes_update disparado por este sync roda até o fim antes de sair
		for a.upd.Rodando() {
			time.Sleep(time.Second)
		}
		logf("hermes: sync concluído; próximo em %s", w.Round(time.Second))
	case "status":
		statusHermes(cfg)
	case "configurar":
		if err := configurarHermes(cfg, args[1:]); err != nil {
			fatal(err.Error())
		}
		if err := salvaConfig(cfg); err != nil {
			fatal("salvar config: " + err.Error())
		}
		logf("modo Hermes configurado (instalação %s, modo %q); reinicie o serviço: systemctl restart rvland-agent", cfg.Hermes.InstalacaoID, cfg.Modo)
	default:
		fatal("subcomando hermes desconhecido: " + args[0])
	}
}

func statusHermes(cfg *Config) {
	credit, hermes, _ := planoExecucao(cfg)
	hc := cfg.hermesResolvida()
	est := carregaEstadoHermes(caminhoEstadoHermes())
	arq := arquivosHermes{dirLicenca: hc.DirLicenca, dirHermes: hc.DirHermes}
	fmt.Printf("hermes:     ativo=%v (credit=%v)\n", hermes, credit)
	fmt.Printf("instalação: %s\n", hc.InstalacaoID)
	fmt.Printf("contato:    %s\n", est.UltimoContato)
	if est.UltimoErro != "" {
		fmt.Printf("último erro: %s\n", est.UltimoErro)
	}
	fmt.Printf("documento:  emitido_em %s | decisão %s\n", est.UltimoEmitidoEm, est.Decisao)
	fmt.Printf("marcadores: obrigatoria=%v bloqueio=%v (%s)\n", arq.existe(marcadorObrigatoria), arq.existe(marcadorBloqueio), hc.DirLicenca)
	fmt.Printf("relógio:    confiável=%v offset=%dms\n", !est.RelogioSuspeito, est.OffsetMs)
	if est.SemInstalacao {
		fmt.Println("situação:   servidor sem instalação Hermes no RV (ciclo parado)")
	}
}
