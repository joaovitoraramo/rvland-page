// Package hermesinst implementa o instalador Go do Hermes (binário hermesinstalador):
// instalação nova por chave de instalação (hmk_), adoção de servidor que já tem o agente RV,
// solicitação de chave, dry-run e identificação local. Ver agent/hermesinstalador/README.md.
package hermesinst

import (
	"errors"
	"fmt"
)

// Códigos de saída (contrato FECHADO em docs/LICENCA-FASE2.md do Hermes).
const (
	SaidaOK              = 0
	SaidaUso             = 2
	SaidaAguardandoChave = 3
	SaidaChaveInvalida   = 4
	SaidaCNPJ            = 5
	SaidaPreRequisito    = 6
	SaidaFalha           = 7
)

// erroSaida carrega o código de saída junto da mensagem (já sem segredos).
type erroSaida struct {
	codigo int
	msg    string
}

func (e *erroSaida) Error() string { return e.msg }

func falha(codigo int, formato string, args ...any) error {
	return &erroSaida{codigo: codigo, msg: fmt.Sprintf(formato, args...)}
}

// codigoDe: o código de saída de um erro (nil = 0; erro sem código = falha genérica).
func codigoDe(err error) int {
	if err == nil {
		return SaidaOK
	}
	var e *erroSaida
	if errors.As(err, &e) {
		return e.codigo
	}
	return SaidaFalha
}
