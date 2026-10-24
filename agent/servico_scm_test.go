package main

import (
	"errors"
	"strings"
	"testing"
	"time"
)

// SCM simulado: serviços com nome, exibição, estado e tipo de início.
type servicoFake struct {
	info        infoServicoSCM
	estado      string
	auto        bool
	pararDemora int // consultas em "parando" antes de virar "parado"
	nuncaPara   bool
	chamadas    []string
}

type scmFake struct{ servicos map[string]*servicoFake }

func (f *scmFake) Abrir(nome string) (servicoSCM, error) {
	for k, s := range f.servicos {
		if strings.EqualFold(k, nome) {
			return &handleFake{s}, nil
		}
	}
	return nil, errors.New("The specified service does not exist as an installed service.")
}

func (f *scmFake) Listar() ([]infoServicoSCM, error) {
	out := []infoServicoSCM{}
	for _, s := range f.servicos {
		out = append(out, s.info)
	}
	return out, nil
}

type handleFake struct{ s *servicoFake }

func (h *handleFake) Estado() (string, error) {
	if h.s.estado == estadoParando && !h.s.nuncaPara {
		if h.s.pararDemora <= 0 {
			h.s.estado = estadoParado
		} else {
			h.s.pararDemora--
		}
	}
	return h.s.estado, nil
}
func (h *handleFake) Iniciar() error {
	h.s.chamadas = append(h.s.chamadas, "start")
	h.s.estado = estadoRodando
	return nil
}
func (h *handleFake) Parar() error {
	h.s.chamadas = append(h.s.chamadas, "stop")
	h.s.estado = estadoParando
	return nil
}
func (h *handleFake) DefinirInicio(a bool) error {
	if h.s.auto == a {
		return nil // como o real: não regrava o que já está certo
	}
	h.s.chamadas = append(h.s.chamadas, map[bool]string{true: "auto", false: "disabled"}[a])
	h.s.auto = a
	return nil
}
func (h *handleFake) InicioAutomatico() (bool, error) { return h.s.auto, nil }
func (h *handleFake) Fechar()                         {}

func novoFake() *scmFake {
	return &scmFake{servicos: map[string]*servicoFake{
		"wildfly": {info: infoServicoSCM{Nome: "wildfly", Exibicao: "WildFly Application Server"}, estado: estadoRodando, auto: true, pararDemora: 2},
		"Spooler": {info: infoServicoSCM{Nome: "Spooler", Exibicao: "Print Spooler"}, estado: estadoRodando, auto: true},
	}}
}

func gerenciadorTeste(f *scmFake) *gerenciadorSCM {
	g := novoGerenciadorSCMCom(f)
	g.passo = time.Millisecond
	g.esperaParada = 200 * time.Millisecond
	return g
}

func TestNormalizaNomeServicoWindows(t *testing.T) {
	casos := map[string]string{
		"wildfly":             "wildfly",
		" wildfly ":           "wildfly",
		"wildfly.service":     "wildfly",
		"WildFly.SERVICE":     "WildFly",
		"credit-back.service": "credit-back",
		".service":            ".service", // nada antes do sufixo: não vira vazio
		"":                    "",
	}
	for in, quer := range casos {
		if got := normalizaNomeServicoWindows(in); got != quer {
			t.Errorf("normaliza(%q) = %q, quer %q", in, got, quer)
		}
	}
}

func TestCasaPorServiceNameEDisplayName(t *testing.T) {
	g := gerenciadorTeste(novoFake())
	for _, nome := range []string{"wildfly", "WILDFLY", "wildfly.service", "WildFly Application Server", "print spooler"} {
		if ativo, err := g.Ativo(nome); err != nil || !ativo {
			t.Errorf("Ativo(%q) = %v, %v; quer true, nil", nome, ativo, err)
		}
	}
}

func TestServicoInexistenteNaoQuebraNemParaOutro(t *testing.T) {
	f := novoFake()
	g := gerenciadorTeste(f)
	ativo, err := g.Ativo("jboss")
	var nf ErrServicoNaoEncontrado
	if ativo || !errors.As(err, &nf) || err.Error() != "serviço não encontrado: jboss" {
		t.Fatalf("Ativo(jboss) = %v, %v", ativo, err)
	}
	if err := g.Bloquear("jboss"); !errors.As(err, &nf) {
		t.Fatalf("Bloquear(jboss) err = %v", err)
	}
	for _, s := range f.servicos {
		if len(s.chamadas) > 0 || s.estado != estadoRodando {
			t.Fatalf("um serviço inexistente mexeu em %s: %v", s.info.Nome, s.chamadas)
		}
	}
	if txt, _ := g.Status("jboss"); txt != "serviço não encontrado: jboss" {
		t.Fatalf("Status = %q", txt)
	}
}

func TestBloquearDesativaEEsperaParar(t *testing.T) {
	f := novoFake()
	g := gerenciadorTeste(f)
	if err := g.Bloquear("wildfly"); err != nil {
		t.Fatal(err)
	}
	w := f.servicos["wildfly"]
	if w.estado != estadoParado || w.auto {
		t.Fatalf("estado=%s auto=%v; quer parado e desativado", w.estado, w.auto)
	}
	if strings.Join(w.chamadas, ",") != "disabled,stop" {
		t.Fatalf("chamadas = %v", w.chamadas)
	}
	// idempotente
	if err := g.Bloquear("wildfly"); err != nil {
		t.Fatal(err)
	}
	if strings.Join(w.chamadas, ",") != "disabled,stop" {
		t.Fatalf("segundo bloqueio mexeu de novo: %v", w.chamadas)
	}
}

func TestLiberarReativaESobe(t *testing.T) {
	f := novoFake()
	w := f.servicos["wildfly"]
	w.estado, w.auto = estadoParado, false
	g := gerenciadorTeste(f)
	if err := g.Liberar("wildfly.service"); err != nil {
		t.Fatal(err)
	}
	if w.estado != estadoRodando || !w.auto {
		t.Fatalf("estado=%s auto=%v", w.estado, w.auto)
	}
}

func TestPararComTimeout(t *testing.T) {
	f := novoFake()
	f.servicos["wildfly"].nuncaPara = true
	g := gerenciadorTeste(f)
	err := g.Stop("wildfly")
	if err == nil || !strings.Contains(err.Error(), "não parou") {
		t.Fatalf("Stop sem parar = %v; quer timeout", err)
	}
}

func TestLicencaComSCMSimulado(t *testing.T) {
	// fail-safe igual ao Linux: vencida bloqueia, em dia religa só o que bloqueou
	f := novoFake()
	g := gerenciadorTeste(f)
	t.Setenv("RVLAND_STATE_DIR", t.TempDir())
	est := &EstadoAgente{}
	vencida := &Lease{Status: "vencido", OperarAte: time.Now().Add(-time.Hour).Format(time.RFC3339), ServicosLicenciados: []string{"wildfly", "naoexiste"}}
	aplicaLease(vencida, g, est)
	if f.servicos["wildfly"].estado != estadoParado || !contem(est.Bloqueados, "wildfly") || contem(est.Bloqueados, "naoexiste") {
		t.Fatalf("bloqueio: wildfly=%s bloqueados=%v", f.servicos["wildfly"].estado, est.Bloqueados)
	}
	if f.servicos["Spooler"].estado != estadoRodando {
		t.Fatal("bloqueio mexeu em serviço fora da lista")
	}
	emDia := &Lease{Status: "em_dia", OperarAte: time.Now().Add(24 * time.Hour).Format(time.RFC3339), ServicosLicenciados: []string{"wildfly"}}
	aplicaLease(emDia, g, est)
	if f.servicos["wildfly"].estado != estadoRodando || !f.servicos["wildfly"].auto || len(est.Bloqueados) != 0 {
		t.Fatalf("recuperação: wildfly=%s auto=%v bloqueados=%v", f.servicos["wildfly"].estado, f.servicos["wildfly"].auto, est.Bloqueados)
	}
}
