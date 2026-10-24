//go:build windows

package main

import (
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

// Ligação real com o Gerenciador de Serviços do Windows (svc/mgr).

type scmReal struct{}

func novoSCMReal() scmAPI { return scmReal{} }

func (scmReal) Abrir(nome string) (servicoSCM, error) {
	m, err := mgr.Connect()
	if err != nil {
		return nil, err
	}
	s, err := m.OpenService(nome)
	if err != nil {
		_ = m.Disconnect()
		return nil, err
	}
	return &servicoReal{m: m, s: s}, nil
}

func (scmReal) Listar() ([]infoServicoSCM, error) {
	m, err := mgr.Connect()
	if err != nil {
		return nil, err
	}
	defer m.Disconnect()
	nomes, err := m.ListServices()
	if err != nil {
		return nil, err
	}
	out := make([]infoServicoSCM, 0, len(nomes))
	for _, n := range nomes {
		info := infoServicoSCM{Nome: n}
		if s, e := m.OpenService(n); e == nil {
			if cfg, e2 := s.Config(); e2 == nil {
				info.Exibicao = cfg.DisplayName
			}
			s.Close()
		}
		out = append(out, info)
	}
	return out, nil
}

type servicoReal struct {
	m *mgr.Mgr
	s *mgr.Service
}

func (r *servicoReal) Estado() (string, error) {
	st, err := r.s.Query()
	if err != nil {
		return "", err
	}
	switch st.State {
	case svc.Running:
		return estadoRodando, nil
	case svc.Stopped:
		return estadoParado, nil
	case svc.StartPending, svc.ContinuePending:
		return estadoIniciando, nil
	case svc.StopPending, svc.PausePending:
		return estadoParando, nil
	default:
		return estadoOutro, nil
	}
}

func (r *servicoReal) Iniciar() error { return r.s.Start() }

func (r *servicoReal) Parar() error {
	_, err := r.s.Control(svc.Stop)
	return err
}

func (r *servicoReal) DefinirInicio(automatico bool) error {
	cfg, err := r.s.Config()
	if err != nil {
		return err
	}
	alvo := uint32(mgr.StartDisabled)
	if automatico {
		alvo = mgr.StartAutomatic
	}
	if cfg.StartType == alvo {
		return nil
	}
	cfg.StartType = alvo
	return r.s.UpdateConfig(cfg)
}

func (r *servicoReal) InicioAutomatico() (bool, error) {
	cfg, err := r.s.Config()
	if err != nil {
		return false, err
	}
	return cfg.StartType == mgr.StartAutomatic, nil
}

func (r *servicoReal) Fechar() {
	r.s.Close()
	_ = r.m.Disconnect()
}

// servicosDisponiveis lista os serviços do Windows (nome + exibição) para o
// painel oferecer na escolha do serviço licenciado. Best-effort.
func servicosDisponiveis() []map[string]string {
	lista, err := scmReal{}.Listar()
	if err != nil {
		return nil
	}
	out := make([]map[string]string, 0, len(lista))
	for _, s := range lista {
		out = append(out, map[string]string{"nome": s.Nome, "exibicao": s.Exibicao})
	}
	return out
}
