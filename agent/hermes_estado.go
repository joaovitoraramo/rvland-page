package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

// Estado do modo Hermes, persistido em <state>/hermes.json (0600; sem segredos). Sobrevive a
// reinício e a relógio que volta: o último X-RVLand-Timestamp enviado é gravado ANTES do envio,
// então uma requisição assinada nunca se repete, mesmo se o processo cair no meio.

const (
	janelaLimiteHermes  = 60 * time.Second
	maxEnviosNaJanela   = 2
	limiarRelogioHermes = 2 * time.Minute // |servidor - local| acima disto = relógio não confiável
	maxEventosHermes    = 20
)

// tipos que o agente pode reportar (lib/hermes/protocolo.ts TIPOS_EVENTO_AGENTE)
var tiposEventoHermes = map[string]bool{
	"hermes_bloqueio":          true,
	"hermes_bloqueio_simulado": true,
	"hermes_liberado":          true,
	"hermes_update_ok":         true,
	"hermes_update_falhou":     true,
	"hermes_adulteracao":       true,
	"hermes_relogio":           true,
}

type EventoHermes struct {
	Tipo       string         `json:"tipo"`
	Severidade string         `json:"severidade,omitempty"`
	Mensagem   string         `json:"mensagem"`
	Dados      map[string]any `json:"dados,omitempty"`
}

type EstadoHermes struct {
	UltimoTsMs int64 `json:"ultimo_ts_ms"`
	// último timestamp que o servidor aceitou (200/503): piso do timestamp após um RELOGIO
	UltimoAceitoMs  int64          `json:"ultimo_aceito_ms,omitempty"`
	EnviosMs        []int64        `json:"envios_ms,omitempty"`
	OffsetMs        int64          `json:"offset_ms"`
	RelogioSuspeito bool           `json:"relogio_suspeito"`
	UltimoEmitidoEm string         `json:"ultimo_emitido_em,omitempty"`
	ShaDoc          string         `json:"sha_doc,omitempty"`
	Decisao         string         `json:"decisao,omitempty"` // "" | liberado | bloqueado | simulado
	Eventos         []EventoHermes `json:"eventos,omitempty"`
	SemInstalacao   bool           `json:"sem_instalacao,omitempty"`
	ProximaMs       int64          `json:"proxima_ms,omitempty"`
	UltimoContato   string         `json:"ultimo_contato,omitempty"`
	UltimoErro      string         `json:"ultimo_erro,omitempty"`
	AvisoContainer  string         `json:"aviso_container,omitempty"` // dedupe do aviso "o container recusaria"
	AvisoFP         string         `json:"aviso_fp,omitempty"`
}

func caminhoEstadoHermes() string { return filepath.Join(dirState(), "hermes.json") }
func caminhoTravaHermes() string  { return filepath.Join(dirState(), "hermes.lock") }

func carregaEstadoHermes(p string) *EstadoHermes {
	b, err := os.ReadFile(p)
	if err != nil {
		return &EstadoHermes{}
	}
	var e EstadoHermes
	if json.Unmarshal(b, &e) != nil {
		return &EstadoHermes{}
	}
	return &e
}

func salvaEstadoHermes(p string, e *EstadoHermes) error {
	b, err := json.MarshalIndent(e, "", "  ")
	if err != nil {
		return err
	}
	return escreveAtomicoArquivo(p, b, 0o600)
}

// escreveAtomicoArquivo: como escreveAtomico, mas sem forçar a permissão do diretório
// (o diretório de estado do agente é dele, 0755 desde o enroll).
func escreveAtomicoArquivo(p string, b []byte, perm os.FileMode) error {
	dir := filepath.Dir(p)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, "."+filepath.Base(p)+".tmp-*")
	if err != nil {
		return err
	}
	tmp := f.Name()
	if _, err = f.Write(b); err == nil {
		if err = f.Chmod(perm); err == nil {
			err = f.Sync()
		}
	}
	if e := f.Close(); err == nil {
		err = e
	}
	if err == nil {
		err = os.Rename(tmp, p)
	}
	if err != nil {
		_ = os.Remove(tmp)
		return err
	}
	syncDir(dir)
	return nil
}

// travaHermes serializa ciclos entre processos (serviço + `agenterv hermes sync`): sem ela,
// dois processos poderiam ler o mesmo último timestamp. Devolve a função que solta a trava.
func travaHermes() (func(), error) {
	_ = os.MkdirAll(dirState(), 0o755)
	f, err := os.OpenFile(caminhoTravaHermes(), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		_ = f.Close()
		return nil, err
	}
	return func() {
		_ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
		_ = f.Close()
	}, nil
}

// formatoTs: RFC 3339 em UTC com milissegundos (o servidor compara em ms).
func formatoTs(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

// proximoTimestamp: agora (truncado em ms) ou, se não for maior, último+1 ms.
func proximoTimestamp(e *EstadoHermes, agora time.Time) time.Time {
	ms := agora.UnixMilli()
	if ms <= e.UltimoTsMs {
		ms = e.UltimoTsMs + 1
	}
	return time.UnixMilli(ms).UTC()
}

// esperaLimite: quanto falta para poder enviar sem passar de 2 envios em 60 s. Envios "no
// futuro" (relógio voltou ou offset mudou) contam como agora: a espera nunca passa de 60 s.
func esperaLimite(e *EstadoHermes, agora time.Time) time.Duration {
	ms := agora.UnixMilli()
	janela := janelaLimiteHermes.Milliseconds()
	recentes := e.EnviosMs[:0:0]
	for _, v := range e.EnviosMs {
		if v > ms {
			v = ms
		}
		if ms-v < janela {
			recentes = append(recentes, v)
		}
	}
	e.EnviosMs = recentes
	if len(recentes) < maxEnviosNaJanela {
		return 0
	}
	maisAntigo := recentes[len(recentes)-maxEnviosNaJanela]
	return time.Duration(maisAntigo+janela-ms) * time.Millisecond
}

func registraEnvio(e *EstadoHermes, agora time.Time) {
	e.EnviosMs = append(e.EnviosMs, agora.UnixMilli())
	if len(e.EnviosMs) > maxEnviosNaJanela {
		e.EnviosMs = e.EnviosMs[len(e.EnviosMs)-maxEnviosNaJanela:]
	}
}

// medeRelogio compara o `agora` do servidor com o relógio local (no meio da requisição).
// NUNCA altera o relógio da máquina: só guarda o offset usado nos timestamps e na decisão.
func medeRelogio(e *EstadoHermes, servidor, localMeio time.Time) {
	d := servidor.Sub(localMeio)
	if d > limiarRelogioHermes || d < -limiarRelogioHermes {
		e.OffsetMs = d.Milliseconds()
		e.RelogioSuspeito = true
		return
	}
	e.OffsetMs = 0
	e.RelogioSuspeito = false
}

func agoraCorrigida(e *EstadoHermes, local time.Time) time.Time {
	return local.Add(time.Duration(e.OffsetMs) * time.Millisecond)
}

// enfileiraEvento: só tipos permitidos pelo servidor; guarda os 20 mais recentes.
func enfileiraEvento(e *EstadoHermes, ev EventoHermes) {
	if !tiposEventoHermes[ev.Tipo] {
		return
	}
	ev.Mensagem = corta(ev.Mensagem, 300)
	e.Eventos = append(e.Eventos, ev)
	if len(e.Eventos) > maxEventosHermes {
		e.Eventos = e.Eventos[len(e.Eventos)-maxEventosHermes:]
	}
}

// corta limita a string a n BYTES sem partir um caractere UTF-8 ao meio.
func corta(s string, n int) string {
	if len(s) <= n {
		return s
	}
	for n > 0 && n < len(s) && s[n]&0xC0 == 0x80 {
		n--
	}
	return s[:n]
}
