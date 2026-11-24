package hermesinst

import (
	"bytes"
	"io"
	"regexp"
	"strings"
	"sync"
)

// Mascarador troca segredos conhecidos (chave hmk_, token de enroll, senha do registro) por
// "***" em TUDO que o instalador escreve (stdout, stderr, log). Qualquer coisa com o formato
// de uma chave hmk_ é mascarada mesmo sem ter sido registrada.
type Mascarador struct {
	mu       sync.Mutex
	segredos []string
}

var reChaveSolta = regexp.MustCompile(`hmk_[A-Za-z0-9_-]{8,}`)

// tamanho mínimo de um segredo mascarado: valores curtos trocariam texto comum.
const minSegredo = 6

func NovoMascarador() *Mascarador { return &Mascarador{} }

func (m *Mascarador) Adicionar(s string) {
	if len(s) < minSegredo {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, x := range m.segredos {
		if x == s {
			return
		}
	}
	m.segredos = append(m.segredos, s)
}

func (m *Mascarador) Mascarar(s string) string {
	m.mu.Lock()
	seg := append([]string(nil), m.segredos...)
	m.mu.Unlock()
	for _, x := range seg {
		s = strings.ReplaceAll(s, x, "***")
	}
	return reChaveSolta.ReplaceAllString(s, "hmk_***")
}

// EscritorMascarado acumula até a quebra de linha antes de mascarar: um segredo dividido
// entre dois Write não escapa. Flush escreve o resto (sem quebra) no fim.
type EscritorMascarado struct {
	mu  sync.Mutex
	m   *Mascarador
	w   io.Writer
	buf []byte
}

func (m *Mascarador) Escritor(w io.Writer) *EscritorMascarado {
	return &EscritorMascarado{m: m, w: w}
}

func (e *EscritorMascarado) Write(p []byte) (int, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.buf = append(e.buf, p...)
	for {
		i := bytes.IndexByte(e.buf, '\n')
		if i < 0 {
			break
		}
		linha := e.m.Mascarar(string(e.buf[:i+1]))
		e.buf = e.buf[i+1:]
		if _, err := io.WriteString(e.w, linha); err != nil {
			return len(p), err
		}
	}
	// linha gigante sem quebra: não acumula sem limite
	if len(e.buf) > 64*1024 {
		_, _ = io.WriteString(e.w, e.m.Mascarar(string(e.buf)))
		e.buf = e.buf[:0]
	}
	return len(p), nil
}

func (e *EscritorMascarado) Flush() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if len(e.buf) > 0 {
		_, _ = io.WriteString(e.w, e.m.Mascarar(string(e.buf)))
		e.buf = e.buf[:0]
	}
}
