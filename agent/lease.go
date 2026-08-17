package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"time"
)

type Lease struct {
	V                   int      `json:"v"`
	ServidorID          string   `json:"servidor_id"`
	ClienteID           string   `json:"cliente_id"`
	EmitidoEm           string   `json:"emitido_em"`
	Status              string   `json:"status"`
	OperarAte           string   `json:"operar_ate"`
	RenovarApos         string   `json:"renovar_apos"`
	ServicosLicenciados []string `json:"servicos_licenciados"`
	ModoSimulacao       bool     `json:"modo_simulacao"`
	Panico              bool     `json:"panico"`
}

// EstadoAgente é persistido em disco: sobrevive a restart e permite recuperação
// (só religa serviços que o próprio agente bloqueou).
type EstadoAgente struct {
	Lease      *Lease   `json:"lease"`
	Bloqueados []string `json:"bloqueados"`
}

// verificaLease decodifica o envelope e confere a assinatura com licensePK.
func verificaLease(env LeaseEnvelope) (*Lease, error) {
	payload, err := base64.StdEncoding.DecodeString(env.Payload)
	if err != nil {
		return nil, errors.New("payload inválido")
	}
	if !verificaComPub(payload, env.Assinatura, licensePK) {
		return nil, errors.New("assinatura do lease não confere")
	}
	var l Lease
	if err := json.Unmarshal(payload, &l); err != nil {
		return nil, err
	}
	return &l, nil
}

func carregaEstado() *EstadoAgente {
	b, err := os.ReadFile(caminhoLease())
	if err != nil {
		return &EstadoAgente{}
	}
	var e EstadoAgente
	if json.Unmarshal(b, &e) != nil {
		return &EstadoAgente{}
	}
	return &e
}

func salvaEstado(e *EstadoAgente) {
	_ = os.MkdirAll(dirState(), 0o755)
	if b, err := json.MarshalIndent(e, "", "  "); err == nil {
		_ = os.WriteFile(caminhoLease(), b, 0o644)
	}
}

func contem(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

func remove(s []string, v string) []string {
	out := s[:0]
	for _, x := range s {
		if x != v {
			out = append(out, x)
		}
	}
	return out
}

// aplicaLease decide operar ou bloquear os serviços licenciados. Pânico e
// simulação nunca bloqueiam. Quando volta a operar, religa só o que o agente
// havia bloqueado (recuperação após pagamento).
func aplicaLease(l *Lease, gs GerenciadorServico, est *EstadoAgente) {
	operarAte, err := time.Parse(time.RFC3339, l.OperarAte)
	agora := time.Now()
	deveBloquear := err == nil && !l.Panico && !l.ModoSimulacao && !agora.Before(operarAte)

	if deveBloquear {
		for _, u := range l.ServicosLicenciados {
			if contem(est.Bloqueados, u) {
				continue
			}
			if e := gs.Stop(u); e != nil {
				logf("falha ao parar %s: %v", u, e)
				continue
			}
			est.Bloqueados = append(est.Bloqueados, u)
			logf("BLOQUEIO: %s parado (licença %s, operar_ate %s)", u, l.Status, l.OperarAte)
		}
	} else {
		if l.ModoSimulacao && err == nil && !agora.Before(operarAte) {
			logf("[simulação] serviços SERIAM bloqueados agora (nada executado)")
		}
		// recuperação: religa o que foi bloqueado pelo agente
		for _, u := range append([]string{}, est.Bloqueados...) {
			if e := gs.Start(u); e != nil {
				logf("falha ao religar %s: %v", u, e)
				continue
			}
			est.Bloqueados = remove(est.Bloqueados, u)
			logf("RECUPERAÇÃO: %s religado (licença %s)", u, l.Status)
		}
	}

	est.Lease = l
	salvaEstado(est)
}
