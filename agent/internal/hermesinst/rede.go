package hermesinst

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	maxRespostaJSON    = 1 << 20  // respostas JSON do RVLand e da identificação
	maxBinarioAgente   = 64 << 20 // binário do agente
	timeoutAPI         = 30 * time.Second
	timeoutDownload    = 5 * time.Minute
	timeoutIdentificao = 10 * time.Second
)

// ValidarBase: o endereço do RVLand vem SÓ do build (-ldflags); tem de ser https puro
// (sem caminho, query, fragmento ou credenciais). Nada que venha da chave vira URL.
func ValidarBase(s string) (string, error) {
	u, err := url.Parse(s)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return "", errors.New("endereço do RVLand embutido no build é inválido (precisa ser https://host)")
	}
	return "https://" + u.Host, nil
}

// clienteSemRedirect copia o cliente (os testes passam o do httptest) e proíbe redirects:
// nenhuma chamada de API do instalador segue Location.
func clienteSemRedirect(base *http.Client, timeout time.Duration) *http.Client {
	c := &http.Client{}
	if base != nil {
		*c = *base
	}
	c.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	c.Timeout = timeout
	return c
}

// ClienteHTTPProducao: TLS >= 1.2, sem proxy de ambiente para o loopback (o cliente RV usa o padrão).
func ClienteHTTPProducao() *http.Client {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	return &http.Client{Transport: t}
}

// ClienteLoopback: sem proxy (o endpoint recusa qualquer header de proxy) e sem TLS.
func ClienteLoopback() *http.Client {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.Proxy = nil
	return &http.Client{Transport: t, Timeout: timeoutIdentificao}
}

type clienteRV struct {
	base   string
	http   *http.Client
	versao string
}

type respostaRV struct {
	status int
	corpo  []byte
	hdr    http.Header
}

func (r respostaRV) erro() string {
	var e struct {
		Erro string `json:"erro"`
	}
	_ = json.Unmarshal(r.corpo, &e)
	return e.Erro
}

func (c *clienteRV) fazer(ctx context.Context, metodo, caminho string, corpo any, hdr map[string]string, max int64, timeout time.Duration) (respostaRV, error) {
	var leitor *bytes.Reader
	if corpo != nil {
		b, err := json.Marshal(corpo)
		if err != nil {
			return respostaRV{}, err
		}
		leitor = bytes.NewReader(b)
	}
	var req *http.Request
	var err error
	if leitor != nil {
		req, err = http.NewRequestWithContext(ctx, metodo, c.base+caminho, leitor)
	} else {
		req, err = http.NewRequestWithContext(ctx, metodo, c.base+caminho, nil)
	}
	if err != nil {
		return respostaRV{}, err
	}
	if corpo != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("User-Agent", "hermesinstalador/"+c.versao)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := clienteSemRedirect(c.http, timeout).Do(req)
	if err != nil {
		return respostaRV{}, fmt.Errorf("sem resposta do RVLand (%s)", textoErroRede(err))
	}
	defer resp.Body.Close()
	b, err := LerLimitado(resp.Body, max)
	if err != nil {
		return respostaRV{}, err
	}
	return respostaRV{resp.StatusCode, b, resp.Header}, nil
}

// textoErroRede: erro de rede sem a URL (a URL não tem segredo, mas encurta a mensagem).
func textoErroRede(err error) string {
	var ue *url.Error
	if errors.As(err, &ue) {
		return ue.Err.Error()
	}
	return err.Error()
}

// ── identificação local (SyncAutenticacao) ──

// Identificacao: resposta de GET /SyncAutenticacao/identificacao-instalacao (somente leitura).
type Identificacao struct {
	Sistema      string            `json:"sistema"`
	VersaoModulo string            `json:"versao_modulo"`
	Lojas        []json.RawMessage `json:"lojas"`
	CNPJs        []string          `json:"cnpjs"`
}

// LerIdentificacao chama o endpoint local com o header do contrato. Só 127.0.0.1 (o Host
// sai 127.0.0.1:<porta>); sem Origin e sem nenhum header de proxy.
func LerIdentificacao(ctx context.Context, cli *http.Client, porta string) (*Identificacao, error) {
	if !PortaValida(porta) {
		return nil, falha(SaidaUso, "porta do WildFly inválida: %q", porta)
	}
	u := "http://127.0.0.1:" + porta + "/SyncAutenticacao/identificacao-instalacao"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Hermes-Instalador", "1")
	req.Header.Set("Accept", "application/json")
	resp, err := clienteSemRedirect(cli, timeoutIdentificao).Do(req)
	if err != nil {
		return nil, falha(SaidaPreRequisito, "o WildFly não respondeu em 127.0.0.1:%s (%s). A identificação só funciona no próprio servidor do WildFly; informe o CNPJ com --cnpj se o WildFly estiver em outra máquina", porta, textoErroRede(err))
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusForbidden:
		return nil, falha(SaidaPreRequisito, "o SyncAutenticacao recusou a identificação (403): o endpoint só atende chamada local direta, sem proxy (127.0.0.1, sem X-Forwarded-*). Rode o instalador no servidor do WildFly ou informe o CNPJ com --cnpj")
	case http.StatusNotFound:
		return nil, falha(SaidaPreRequisito, "o SyncAutenticacao não tem o endpoint de identificação (404): atualize o módulo para 2.0.0.8 ou mais novo, ou informe o CNPJ com --cnpj")
	default:
		return nil, falha(SaidaPreRequisito, "identificação local devolveu HTTP %d; informe o CNPJ com --cnpj", resp.StatusCode)
	}
	b, err := LerLimitado(resp.Body, maxRespostaJSON)
	if err != nil {
		return nil, falha(SaidaPreRequisito, "identificação local: %v", err)
	}
	var id Identificacao
	if err := json.Unmarshal(b, &id); err != nil {
		return nil, falha(SaidaPreRequisito, "identificação local fora do formato (JSON inválido)")
	}
	var cnpjs []string
	vistos := map[string]bool{}
	for _, c := range id.CNPJs {
		d := SoDigitos(c)
		if CNPJValido(d) && !vistos[d] {
			vistos[d] = true
			cnpjs = append(cnpjs, d)
		}
	}
	if len(cnpjs) == 0 {
		return nil, falha(SaidaPreRequisito, "identificação local sem nenhum CNPJ válido; informe o CNPJ com --cnpj")
	}
	id.CNPJs = cnpjs
	// texto vindo de fora vai para o terminal: sem sequências de escape
	id.Sistema, id.VersaoModulo = textoLimpo(id.Sistema), textoLimpo(id.VersaoModulo)
	return &id, nil
}

// identificacaoParaEnvio: só sistema, versão e lojas (o servidor ainda sanitiza). Lojas
// demais são cortadas para o corpo caber no limite das rotas públicas (16 KB).
func (id *Identificacao) paraEnvio() map[string]any {
	if id == nil {
		return nil
	}
	lojas := id.Lojas
	for {
		m := map[string]any{"sistema": corta(id.Sistema, 40), "versao_modulo": corta(id.VersaoModulo, 40), "lojas": lojas}
		if b, _ := json.Marshal(m); len(b) <= 6000 || len(lojas) == 0 {
			return m
		}
		lojas = lojas[:len(lojas)/2]
	}
}

func corta(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

// ── saúde do Hermes ──

func saudeOK(ctx context.Context, cli *http.Client, u string) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return false
	}
	resp, err := clienteSemRedirect(cli, 10*time.Second).Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	_, _ = LerLimitado(resp.Body, 64*1024)
	return resp.StatusCode == http.StatusOK
}

var reVersaoAgente = regexp.MustCompile(`^(latest|[0-9]+\.[0-9]+\.[0-9]+)$`)

// porta de uma URL http://host:porta (do .env.production); vazio se não der.
func portaDaURL(s string) string {
	u, err := url.Parse(strings.TrimSpace(s))
	if err != nil {
		return ""
	}
	p := u.Port()
	if _, err := strconv.Atoi(p); err != nil || !PortaValida(p) {
		return ""
	}
	return p
}
