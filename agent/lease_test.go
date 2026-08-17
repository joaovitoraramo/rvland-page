package main

import (
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"
)

// assina um payload de lease como a plataforma faria, e ajusta licensePK.
func leaseAssinado(t *testing.T, l Lease) LeaseEnvelope {
	seedB64, pubB64 := geraChaveAgente()
	licensePK = pubB64 // o agente confia nesta chave
	payload, _ := json.Marshal(l)
	sig, err := assina(payload, seedB64)
	if err != nil {
		t.Fatal(err)
	}
	return LeaseEnvelope{
		Payload:    base64.StdEncoding.EncodeToString(payload),
		Assinatura: sig,
	}
}

func TestVerificaLease(t *testing.T) {
	env := leaseAssinado(t, Lease{V: 1, Status: "atrasado", OperarAte: "2026-08-20T06:00:00.000Z"})
	l, err := verificaLease(env)
	if err != nil {
		t.Fatalf("deveria verificar: %v", err)
	}
	if l.Status != "atrasado" {
		t.Fatalf("status errado: %s", l.Status)
	}

	// adultera o payload → assinatura não confere
	env.Payload = base64.StdEncoding.EncodeToString([]byte(`{"status":"em_dia","operar_ate":"2099-01-01T00:00:00Z"}`))
	if _, err := verificaLease(env); err == nil {
		t.Fatal("lease adulterado deveria falhar")
	}
}

func TestAplicaLease_BloqueiaERecupera(t *testing.T) {
	gs := novoGerenciador("dry")
	est := &EstadoAgente{}
	unidade := "app.service"

	passado := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)
	futuro := time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339)

	// bloqueado: operar_ate no passado, sem simulação/pânico → para o serviço
	aplicaLease(&Lease{
		Status: "bloqueado", OperarAte: passado, ServicosLicenciados: []string{unidade},
	}, gs, est)
	if ativo, _ := gs.Ativo(unidade); ativo {
		t.Fatal("serviço deveria estar parado")
	}
	if !contem(est.Bloqueados, unidade) {
		t.Fatal("unidade deveria constar em bloqueados")
	}

	// pagou: operar_ate no futuro → religa o que foi bloqueado
	aplicaLease(&Lease{
		Status: "em_dia", OperarAte: futuro, ServicosLicenciados: []string{unidade},
	}, gs, est)
	if ativo, _ := gs.Ativo(unidade); !ativo {
		t.Fatal("serviço deveria ter sido religado")
	}
	if len(est.Bloqueados) != 0 {
		t.Fatal("bloqueados deveria estar vazio após recuperação")
	}
}

func TestAplicaLease_SimulacaoNaoBloqueia(t *testing.T) {
	gs := novoGerenciador("dry")
	est := &EstadoAgente{}
	unidade := "app.service"
	passado := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)

	aplicaLease(&Lease{
		Status: "bloqueado", OperarAte: passado, ModoSimulacao: true,
		ServicosLicenciados: []string{unidade},
	}, gs, est)
	if ativo, _ := gs.Ativo(unidade); !ativo {
		t.Fatal("simulação não deveria parar o serviço")
	}
}

func TestAplicaLease_PanicoNaoBloqueia(t *testing.T) {
	gs := novoGerenciador("dry")
	est := &EstadoAgente{}
	unidade := "app.service"
	passado := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)

	aplicaLease(&Lease{
		Status: "bloqueado", OperarAte: passado, Panico: true,
		ServicosLicenciados: []string{unidade},
	}, gs, est)
	if ativo, _ := gs.Ativo(unidade); !ativo {
		t.Fatal("pânico não deveria parar o serviço")
	}
}
