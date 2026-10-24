package main

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

// Gerenciador de serviços do Windows (SCM). A lógica fica aqui, sem build tag,
// para ser testada com um SCM simulado em qualquer SO; a ligação real com o
// svc/mgr do Windows fica em scm_windows.go.
//
// No cadastro do servidor o nome do serviço licenciado é o "Service Name" do
// Gerenciador de Serviços (ex.: wildfly). Também aceitamos o "Display Name" e
// tiramos um ".service" que venha por engano (costume do Linux).

// Estados normalizados de um serviço do SCM.
const (
	estadoRodando   = "rodando"
	estadoParado    = "parado"
	estadoIniciando = "iniciando"
	estadoParando   = "parando"
	estadoOutro     = "outro"
)

type infoServicoSCM struct {
	Nome     string // Service Name (chave do SCM)
	Exibicao string // Display Name
}

// servicoSCM é um serviço aberto no SCM.
type servicoSCM interface {
	Estado() (string, error)
	Iniciar() error
	Parar() error // envia o comando de parada; quem espera é o gerenciador
	// DefinirInicio: true = automático, false = desativado (equivale ao
	// enable/disable do systemd).
	DefinirInicio(automatico bool) error
	InicioAutomatico() (bool, error)
	Fechar()
}

type scmAPI interface {
	Abrir(nome string) (servicoSCM, error) // erro se não existir com esse Service Name
	Listar() ([]infoServicoSCM, error)
}

// ErrServicoNaoEncontrado: o nome cadastrado não existe neste servidor. Nunca
// derruba o agente nem faz parar outro serviço.
type ErrServicoNaoEncontrado struct{ Nome string }

func (e ErrServicoNaoEncontrado) Error() string { return "serviço não encontrado: " + e.Nome }

// normalizaNomeServicoWindows tira espaços e um ".service" final (qualquer caixa).
func normalizaNomeServicoWindows(nome string) string {
	n := strings.TrimSpace(nome)
	if len(n) > len(".service") && strings.EqualFold(n[len(n)-len(".service"):], ".service") {
		n = strings.TrimSpace(n[:len(n)-len(".service")])
	}
	return n
}

// casaServico procura por Service Name e, se não houver, por Display Name
// (os dois sem diferenciar maiúsculas). Devolve o Service Name real.
func casaServico(lista []infoServicoSCM, nome string) (string, bool) {
	for _, s := range lista {
		if strings.EqualFold(s.Nome, nome) {
			return s.Nome, true
		}
	}
	for _, s := range lista {
		if strings.EqualFold(s.Exibicao, nome) {
			return s.Nome, true
		}
	}
	return "", false
}

type gerenciadorSCM struct {
	api          scmAPI
	esperaParada time.Duration // tempo máximo esperando o serviço parar de verdade
	passo        time.Duration // intervalo entre consultas do estado
}

func novoGerenciadorSCMCom(api scmAPI) *gerenciadorSCM {
	return &gerenciadorSCM{api: api, esperaParada: 90 * time.Second, passo: 500 * time.Millisecond}
}

func (g *gerenciadorSCM) abrir(unidade string) (servicoSCM, string, error) {
	if g.api == nil {
		return nil, "", errors.New("gerenciador de serviços do Windows indisponível neste sistema")
	}
	nome := normalizaNomeServicoWindows(unidade)
	if nome == "" {
		return nil, "", ErrServicoNaoEncontrado{Nome: unidade}
	}
	if s, err := g.api.Abrir(nome); err == nil {
		return s, nome, nil
	}
	lista, err := g.api.Listar()
	if err != nil {
		return nil, nome, fmt.Errorf("listar serviços: %w", err)
	}
	real, ok := casaServico(lista, nome)
	if !ok {
		return nil, nome, ErrServicoNaoEncontrado{Nome: nome}
	}
	s, err := g.api.Abrir(real)
	if err != nil {
		return nil, real, err
	}
	return s, real, nil
}

func (g *gerenciadorSCM) Ativo(unidade string) (bool, error) {
	s, _, err := g.abrir(unidade)
	if err != nil {
		return false, err
	}
	defer s.Fechar()
	e, err := s.Estado()
	return e == estadoRodando, err
}

func (g *gerenciadorSCM) Start(unidade string) error {
	s, _, err := g.abrir(unidade)
	if err != nil {
		return err
	}
	defer s.Fechar()
	return g.iniciar(s)
}

func (g *gerenciadorSCM) iniciar(s servicoSCM) error {
	if e, _ := s.Estado(); e == estadoRodando || e == estadoIniciando {
		return nil
	}
	return s.Iniciar()
}

func (g *gerenciadorSCM) Stop(unidade string) error {
	s, _, err := g.abrir(unidade)
	if err != nil {
		return err
	}
	defer s.Fechar()
	return g.pararEsperando(s)
}

// pararEsperando manda parar e espera o estado "parado" até esperaParada.
func (g *gerenciadorSCM) pararEsperando(s servicoSCM) error {
	e, err := s.Estado()
	if err != nil {
		return err
	}
	if e == estadoParado {
		return nil
	}
	if e != estadoParando {
		if err := s.Parar(); err != nil {
			return err
		}
	}
	limite := time.Now().Add(g.esperaParada)
	for {
		e, err = s.Estado()
		if err == nil && e == estadoParado {
			return nil
		}
		if time.Now().After(limite) {
			return fmt.Errorf("o serviço não parou em %s (estado: %s)", g.esperaParada, e)
		}
		time.Sleep(g.passo)
	}
}

func (g *gerenciadorSCM) Status(unidade string) (string, error) {
	s, real, err := g.abrir(unidade)
	if err != nil {
		return err.Error(), err
	}
	defer s.Fechar()
	e, _ := s.Estado()
	auto, _ := s.InicioAutomatico()
	inicio := "manual/desativado"
	if auto {
		inicio = "automático"
	}
	return fmt.Sprintf("● %s (Gerenciador de Serviços do Windows)\n     Estado: %s\n     Início: %s", real, e, inicio), nil
}

// Bloquear: para (esperando de verdade) e desativa o início, para não voltar no boot.
func (g *gerenciadorSCM) Bloquear(unidade string) error {
	s, _, err := g.abrir(unidade)
	if err != nil {
		return err
	}
	defer s.Fechar()
	if err := s.DefinirInicio(false); err != nil {
		return fmt.Errorf("desativar início: %w", err)
	}
	return g.pararEsperando(s)
}

// Liberar: reativa o início automático e sobe.
func (g *gerenciadorSCM) Liberar(unidade string) error {
	s, _, err := g.abrir(unidade)
	if err != nil {
		return err
	}
	defer s.Fechar()
	if err := s.DefinirInicio(true); err != nil {
		return fmt.Errorf("reativar início: %w", err)
	}
	return g.iniciar(s)
}
