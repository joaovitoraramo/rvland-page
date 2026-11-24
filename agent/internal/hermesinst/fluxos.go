package hermesinst

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// ── instalar ──

func (i *instalador) instalar() error {
	if err := i.travar(); err != nil {
		return err
	}
	e, err := i.detectar()
	if err != nil {
		return err
	}
	retomar := false
	if e.agenteConf {
		if e.agente.Modo != modoHermes {
			return falha(SaidaPreRequisito, "o agente RV já está instalado neste servidor (Credit/Pic Price). Para incluir o Hermes use `hermesinstalador adotar` com uma CHAVE DE ADOÇÃO gerada no painel.")
		}
		if !UUIDValido(e.agente.instalacao()) {
			return falha(SaidaPreRequisito, "%s em modo hermes sem instalação válida; contate o suporte RVLand", arqAgenteConf)
		}
		retomar = true
	} else if e.hermesConfig {
		return falha(SaidaPreRequisito, "o Hermes já está instalado neste servidor, sem o agente RV. Instale o agente RV pelo painel e use `hermesinstalador adotar` com uma chave de adoção.")
	}

	id, canal, servidor := "", "", e.agente.ServidorID
	if retomar {
		id, canal = e.agente.instalacao(), e.agente.canal()
		if e.hermesCompleto(id) && e.unit && i.servicoAtivo() {
			i.ok("Hermes já instalado (instalação %s, canal %s); nada a fazer.", id, canal)
			return nil
		}
		i.info("Agente RV já registrado (instalação %s): retomando a instalação SEM usar a chave.", id)
	} else {
		if err := i.exigirChave(); err != nil {
			return err
		}
		if !chavePublicaReleaseValida(i.a.ReleasePK) {
			return falha(SaidaFalha, "este build do instalador não tem uma chave pública de release válida embutida; use o binário publicado pela RVLand (a chave NÃO foi consumida)")
		}
	}

	dockerVersao, err := i.preRequisitos(append(destinosHermes(e.installDir), destinosAgente()...))
	if err != nil {
		return err
	}
	precisaEnv := !e.hermesCompleto(id) && !e.envExiste
	var resp Respostas
	if precisaEnv {
		if resp, err = i.respostas(nil); err != nil {
			return err
		}
	} else {
		resp = *respostasDoEnv(e.envTexto)
	}

	if !retomar {
		cnpj, ident, origem, err := i.cnpjEIdentificacao(resp.WildflyPorta)
		if err != nil {
			return err
		}
		fp, idNovo, err := i.fingerprint(dockerVersao)
		if err != nil {
			return err
		}
		corpo := i.corpo(cnpj, &fp, ident, origem)
		val, err := i.validar(corpo)
		if err != nil {
			return err
		}
		if val.Tipo != "instalacao" {
			return falha(SaidaUso, "esta é uma chave de ADOÇÃO: use `hermesinstalador adotar` (servidor com o agente RV já instalado)")
		}
		if i.o.DryRun {
			i.planoInstalar(e, resp, "<da ativação>", val.Canal, true)
			return nil
		}
		if fp.MachineIDHash == "" {
			return falha(SaidaPreRequisito, "sem identificação da máquina (machine-id)")
		}
		i.abrirLog()
		atv, err := i.ativar(corpo, "instalar")
		if err != nil {
			return err
		}
		if err := i.persistirIDNovo(idNovo); err != nil {
			return err
		}
		i.ok("Chave consumida: instalação %s, servidor %s, canal %s.", atv.InstalacaoID, atv.ServidorID, atv.Canal)
		if err := i.instalarAgente(atv); err != nil {
			return err
		}
		id, canal, servidor = atv.InstalacaoID, atv.Canal, atv.ServidorID
	} else if i.o.DryRun {
		i.planoInstalar(e, resp, id, canal, false)
		return nil
	} else {
		i.abrirLog()
	}

	tx := i.novaTx()
	if err := i.instalarHermes(tx, e, id, canal, resp, precisaEnv); err != nil {
		i.desfazer(tx)
		return falha(SaidaFalha, "%v\nNada do Hermes ficou gravado (rollback feito). O agente RV continua registrado (instalação %s): rode o instalador de novo para retomar, sem chave.", err, id)
	}
	tx.Confirmar()
	if err := i.servicoAgente(); err != nil {
		return falha(SaidaFalha, "Hermes instalado, mas o serviço do agente RV não subiu (%v). Rode o instalador de novo para retomar.", err)
	}
	i.conferirSaude()
	i.resumo("Hermes instalado.", id, servidor, canal, resp.AllowedHost)
	return nil
}

func (i *instalador) planoInstalar(e *estado, r Respostas, id, canal string, consumir bool) {
	fmt.Fprintln(i.out, "=== DRY-RUN: nada foi gravado e a chave NÃO foi consumida ===")
	if consumir {
		i.plano("consumir a chave (POST %s/api/hermes/ativacao) e baixar o agente RV (%s, %s) conferindo sha256 + assinatura de release", i.rv.base, i.o.AgenteVersao, i.a.Arch)
		i.plano("instalar %s (0755) e registrar: agenterv enroll --modo=hermes --instalacao=<id> --canal=%s", arqAgente, canal)
	}
	i.plano("gravar %s (0600, sem token) e %s (0600): NEXT_PUBLIC_API_URL=%s%s, NEXT_PUBLIC_IGNORE_TAGS=%t, ALLOWED_HOST=%s, HERMES_INSTALACAO_ID=%s (sem aspas)",
		arqConfig, e.envPath(), r.apiURL(), map[bool]string{true: ", NEXT_PUBLIC_API_URL_EXTERNAL=" + r.apiURLExterna(), false: ""}[r.Externo], r.IgnorarTags, r.AllowedHost, id)
	i.plano("instalar o hook %s (0700) que chama `agenterv hermes credencial`", arqHook)
	i.plano("credencial do agente -> docker login (stdin) -> pull %s:%s -> extrair /opt/hermes-ops (por digest) -> instalar %s em %s e docker-compose.imagem.yml", imagemRepo, canal, strings.Join(opsScripts, ", "), dirBin)
	i.plano("nginx: site hermes (porta 80 -> 127.0.0.1:3000), se o nginx existir; cron: %s (02:00, sem canal fixo)", arqCron)
	i.plano("rodar: %s %s (pull, up por digest, saúde, rollback automático) e gravar %s = imagem", arqHermesImagem, canal, arqModelo)
	i.plano("instalar %s e subir o serviço %s (systemctl enable --now)", arqUnit, servicoAgente)
	i.plano("conferir /api/saude e imprimir o resumo (sem segredos)")
}

// ── adotar ──

func (i *instalador) adotar() error {
	if err := i.travar(); err != nil {
		return err
	}
	e, err := i.detectar()
	if err != nil {
		return err
	}
	if !e.agenteConf {
		return falha(SaidaPreRequisito, "adotar exige o agente RV já instalado neste servidor (%s). Para instalação nova use `hermesinstalador instalar` com a chave de instalação.", arqAgenteConf)
	}
	if e.agente.Modo == modoHermes {
		return falha(SaidaPreRequisito, "este servidor já é uma instalação Hermes criada por chave de instalação (instalação %s); use `hermesinstalador instalar` para retomar.", e.agente.instalacao())
	}
	if id := e.agente.instalacao(); UUIDValido(id) && e.hermesCompleto(id) {
		i.ok("Hermes já adotado (instalação %s); nada a fazer.", id)
		return nil
	}
	if e.hermesConfig && !e.modeloImagem {
		return falha(SaidaPreRequisito, "o Hermes deste servidor ainda está no modelo git: migre para o modelo imagem (hermes-migrar-imagem) antes de adotar.")
	}
	if e.hermesConfig && !e.envExiste {
		return falha(SaidaPreRequisito, "%s não existe: corrija a instalação do Hermes antes de adotar", e.envPath())
	}
	servidorID, seed, err := i.chaveDoAgente(e)
	if err != nil {
		return err
	}
	if err := i.exigirChave(); err != nil {
		return err
	}
	dockerVersao, err := i.preRequisitos(append(destinosHermes(e.installDir), arqAgenteConf))
	if err != nil {
		return err
	}
	if r := i.executar(Comando{Nome: real(i.a.Raiz, arqAgente), Args: []string{"ajuda"}, Timeout: 30 * time.Second}); !strings.Contains(string(r.Saida), "hermes configurar") {
		return falha(SaidaPreRequisito, "o agente RV instalado não tem o modo Hermes (versão antiga): atualize o agente pelo painel e rode de novo")
	}
	hermesNovo := !e.hermesConfig
	var resp Respostas
	if hermesNovo {
		if resp, err = i.respostas(nil); err != nil {
			return err
		}
	} else {
		resp = *respostasDoEnv(e.envTexto)
		if i.o.WildflyPorta != "" && PortaValida(LimparResposta(i.o.WildflyPorta)) {
			resp.WildflyPorta = LimparResposta(i.o.WildflyPorta)
		}
	}
	cnpj, ident, origem, err := i.cnpjEIdentificacao(resp.WildflyPorta)
	if err != nil {
		return err
	}
	fp, idNovo, err := i.fingerprint(dockerVersao)
	if err != nil {
		return err
	}
	corpo := i.corpo(cnpj, &fp, ident, origem)
	val, err := i.validar(corpo)
	if err != nil {
		return err
	}
	if val.Tipo != "adocao" {
		return falha(SaidaUso, "esta é uma chave de INSTALAÇÃO: para adotar, gere uma chave de ADOÇÃO no painel")
	}
	instalacao := strings.ToLower(strings.TrimSpace(i.o.Instalacao))
	if v := strings.ToLower(val.InstalacaoID); v != "" {
		if instalacao != "" && instalacao != v {
			return falha(SaidaUso, "--instalacao difere da instalação da chave (%s)", v)
		}
		instalacao = v
	}
	if instalacao == "" {
		return falha(SaidaUso, "informe --instalacao=<uuid> (mostrado no painel junto da chave de adoção)")
	}
	if !UUIDValido(instalacao) {
		return falha(SaidaUso, "--instalacao inválida (esperado uuid)")
	}
	if i.o.DryRun {
		fmt.Fprintln(i.out, "=== DRY-RUN: nada foi gravado e a chave NÃO foi consumida ===")
		i.plano("assinar a prova de adoção com a chave do agente (servidor %s) e consumir a chave (POST %s/api/hermes/ativacao)", servidorID, i.rv.base)
		i.plano("agenterv hermes configurar --instalacao=%s --canal=<da ativação>", instalacao)
		if hermesNovo {
			i.planoInstalar(e, resp, instalacao, val.Canal, false)
		} else {
			i.plano("gravar HERMES_INSTALACAO_ID=%s (sem aspas) em %s (0600), instalar %s (0700) e rodar %s %s", instalacao, e.envPath(), arqHook, arqHermesImagem, val.Canal)
		}
		i.plano("systemctl restart %s", servicoAgente)
		return nil
	}
	if fp.MachineIDHash == "" {
		return falha(SaidaPreRequisito, "sem identificação da máquina (machine-id)")
	}
	i.abrirLog()
	ts := FormatoTs(i.a.Agora())
	sig, err := ProvaAdocao(instalacao, fp.MachineIDHash, ts, seed)
	if err != nil {
		return falha(SaidaPreRequisito, "%v", err)
	}
	corpo.Agente = &provaAgente{ServidorID: servidorID, Timestamp: ts, Assinatura: sig}
	atv, err := i.ativar(corpo, "adotar")
	if err != nil {
		return err
	}
	if atv.InstalacaoID != instalacao || atv.ServidorID != servidorID {
		return falha(SaidaFalha, "a ativação devolveu outra instalação/servidor; nada foi alterado. Contate o suporte RVLand.")
	}
	if err := i.persistirIDNovo(idNovo); err != nil {
		return err
	}
	i.ok("Adoção aceita: instalação %s, servidor %s, canal %s.", atv.InstalacaoID, servidorID, atv.Canal)

	tx := i.novaTx()
	errAd := func() error {
		if err := tx.Preservar(arqAgenteConf); err != nil {
			return err
		}
		r := i.executar(Comando{Nome: real(i.a.Raiz, arqAgente), Args: []string{"hermes", "configurar", "--instalacao=" + instalacao, "--canal=" + atv.Canal}, Timeout: time.Minute})
		if !r.ok() {
			return fmt.Errorf("agenterv hermes configurar falhou: %s", i.resumoSaida(r))
		}
		if e2, err := i.detectar(); err != nil || e2.agente.instalacao() != instalacao {
			return fmt.Errorf("o agente não gravou a instalação no %s", arqAgenteConf)
		}
		if hermesNovo {
			return i.instalarHermes(tx, e, instalacao, atv.Canal, resp, true)
		}
		return i.atualizarHermes(tx, e, instalacao, atv.Canal)
	}()
	if errAd != nil {
		i.desfazer(tx)
		return falha(SaidaFalha, "%v\nRollback feito. A chave de adoção pode ser usada de novo NESTA máquina por 30 min.", errAd)
	}
	tx.Confirmar()
	if r := i.executar(Comando{Nome: "systemctl", Args: []string{"restart", servicoAgente}, Timeout: time.Minute}); !r.ok() {
		return falha(SaidaFalha, "Hermes adotado, mas o agente RV não reiniciou (%s): rode `systemctl restart %s`", i.resumoSaida(r), servicoAgente)
	}
	i.conferirSaude()
	i.resumo("Hermes adotado.", instalacao, servidorID, atv.Canal, resp.AllowedHost)
	return nil
}

// ── agente (instalação nova) ──

type metaRelease struct {
	Versao     string `json:"versao"`
	Arch       string `json:"arch"`
	SHA256     string `json:"sha256"`
	Assinatura string `json:"assinatura"`
}

var reSemver = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)

// baixarAgente: como o auto-update do agente (agent/update.go): metadados (sha256 + assinatura)
// e binário; só devolve bytes que conferem com a chave pública de release embutida.
func (i *instalador) baixarAgente(token string) ([]byte, string, error) {
	q := url.Values{"versao": {i.o.AgenteVersao}, "arch": {i.a.Arch}}
	r, err := i.rv.fazer(i.ctx, http.MethodGet, "/api/agente/release?"+q.Encode(), nil, nil, maxRespostaJSON, timeoutAPI)
	if err != nil {
		return nil, "", err
	}
	if r.status != http.StatusOK {
		return nil, "", fmt.Errorf("release do agente indisponível (HTTP %d)", r.status)
	}
	var meta metaRelease
	if json.Unmarshal(r.corpo, &meta) != nil || !reSemver.MatchString(meta.Versao) || meta.Arch != i.a.Arch {
		return nil, "", fmt.Errorf("metadados da release do agente fora do formato")
	}
	q = url.Values{"versao": {meta.Versao}, "arch": {i.a.Arch}}
	b, err := i.rv.fazer(i.ctx, http.MethodGet, "/api/agente/binario?"+q.Encode(), nil, map[string]string{"X-RVLand-Enroll": token}, maxBinarioAgente, timeoutDownload)
	if err != nil {
		return nil, "", fmt.Errorf("download do agente: %v", err)
	}
	if b.status != http.StatusOK {
		return nil, "", fmt.Errorf("download do agente recusado (HTTP %d)", b.status)
	}
	if h := strings.TrimSpace(b.hdr.Get("x-rvland-sha256")); h != "" && !strings.EqualFold(h, meta.SHA256) {
		return nil, "", fmt.Errorf("sha256 do download diverge dos metadados da release")
	}
	if err := VerificarRelease(b.corpo, meta.SHA256, meta.Assinatura, i.a.ReleasePK); err != nil {
		return nil, "", fmt.Errorf("binário do agente RECUSADO: %v", err)
	}
	return b.corpo, meta.Versao, nil
}

// instalarAgente: binário verificado + enroll em modo Hermes.
//   - falha ANTES do enroll: desfaz tudo; a chave vale de novo nesta máquina por 30 min (reentrada);
//   - enroll TENTADO: agent.conf/agente.key que tenham aparecido NUNCA são removidos (são a identidade
//     do servidor no RVLand). Com o conf certo, segue como "já enrolado"; sem nada gravado, desfaz o
//     resto, mas a chave não é prometida de volta (se o enroll chegou ao RVLand, ele responde 401).
func (i *instalador) instalarAgente(atv *respAtivacao) (err error) {
	tx := i.novaTx()
	enrollTentado := false
	defer func() {
		if err == nil {
			return
		}
		if !enrollTentado {
			i.desfazer(tx)
			err = falha(SaidaFalha, "%v\nA chave pode ser usada de novo NESTA máquina por 30 min (rode o instalador de novo).", err)
			return
		}
		if existe(i.a.Raiz, arqAgenteConf) || existe(i.a.Raiz, arqAgenteChave) {
			tx.Confirmar() // nada do agente é removido
			err = falha(SaidaFalha, "%v\nO enroll foi tentado e deixou %s/%s: eles foram PRESERVADOS (identidade do servidor no RVLand). A chave não pode ser reutilizada; rode o instalador de novo para retomar e, se não der, acione o suporte RVLand.", err, arqAgenteConf, arqAgenteChave)
			return
		}
		i.desfazer(tx)
		err = falha(SaidaFalha, "%v\nO enroll foi tentado: a chave NÃO pode ser reutilizada se ele chegou ao RVLand (o RVLand responde 401 depois que o agente se registra). Peça uma nova chave no painel ou acione o suporte RVLand.", err)
	}()
	for _, d := range []string{"/etc/rvland", "/var/lib/rvland", dirBin} {
		if err := tx.CriarDir(d, 0o755); err != nil {
			return err
		}
	}
	bin, versao, err := i.baixarAgente(atv.EnrollToken)
	if err != nil {
		return err
	}
	if err := tx.Escrever(arqAgente, bin, 0o755); err != nil {
		return err
	}
	ajuda := i.executar(Comando{Nome: real(i.a.Raiz, arqAgente), Args: []string{"ajuda"}, Timeout: 30 * time.Second})
	if !strings.Contains(string(ajuda.Saida), "--modo=hermes") {
		return fmt.Errorf("a release %s do agente não tem o modo Hermes; publique uma com Hermes ou use --agente-versao", versao)
	}
	// o agente anuncia --token-stdin no erro do `enroll --help` (sai antes de qualquer rede)
	help := i.executar(Comando{Nome: real(i.a.Raiz, arqAgente), Args: []string{"enroll", "--help"}, Timeout: 30 * time.Second})
	args := []string{"enroll", "--servidor=" + i.rv.base, "--modo=hermes", "--instalacao=" + atv.InstalacaoID, "--canal=" + atv.Canal}
	cmd := Comando{Nome: real(i.a.Raiz, arqAgente), Segredos: []string{atv.EnrollToken}, Timeout: 2 * time.Minute}
	if strings.Contains(string(ajuda.Saida)+string(help.Saida), "--token-stdin") {
		cmd.Args, cmd.Stdin = append(args, "--token-stdin"), []byte(atv.EnrollToken+"\n")
	} else {
		i.aviso("a release %s do agente não aceita --token-stdin: o token do enroll vai no argv (visível no ps durante o enroll). Atualize a release do agente.", versao)
		cmd.Args = append(args, "--token="+atv.EnrollToken)
	}
	enrollTentado = true
	r := i.executar(cmd)
	e, derr := i.detectar()
	if derr == nil && e.agente.Modo == modoHermes && e.agente.instalacao() == atv.InstalacaoID && strings.EqualFold(e.agente.ServidorID, atv.ServidorID) && existe(i.a.Raiz, arqAgenteChave) {
		if !r.ok() {
			i.aviso("o enroll saiu com erro (%s), mas o agente ficou registrado em modo Hermes; seguindo como já enrolado.", i.resumoSaida(r))
		}
		tx.Confirmar()
		i.ok("Agente RV %s registrado (servidor %s, modo hermes).", versao, atv.ServidorID)
		return nil
	}
	if !r.ok() {
		return fmt.Errorf("enroll do agente falhou: %s", i.resumoSaida(r))
	}
	return fmt.Errorf("o enroll não gravou o modo Hermes com a instalação esperada em %s", arqAgenteConf)
}

func (i *instalador) servicoAgente() error {
	tx := i.novaTx()
	if err := tx.Escrever(arqUnit, []byte(unitAgente), 0o644); err != nil {
		return err
	}
	// desfazer: `disable` ANTES de remover a unidade (não deixa o link do enable órfão)
	tx.Compensar("desabilitar "+servicoAgente, func() error {
		i.executarLimpeza(Comando{Nome: "systemctl", Args: []string{"disable", servicoAgente}, Timeout: time.Minute})
		return nil
	})
	for _, args := range [][]string{{"daemon-reload"}, {"enable", "--now", servicoAgente}} {
		if r := i.executar(Comando{Nome: "systemctl", Args: args, Timeout: 2 * time.Minute}); !r.ok() {
			i.desfazer(tx)
			i.executarLimpeza(Comando{Nome: "systemctl", Args: []string{"daemon-reload"}, Timeout: time.Minute})
			return fmt.Errorf("systemctl %s: %s", strings.Join(args, " "), i.resumoSaida(r))
		}
	}
	tx.Confirmar()
	i.ok("Serviço %s ativo.", servicoAgente)
	return nil
}

// ── Hermes ──

func (i *instalador) instalarHermes(tx *Transacao, e *estado, id, canal string, r Respostas, envNovo bool) error {
	if e.hermesCompleto(id) {
		return nil
	}
	for _, d := range []string{"/etc/hermes", e.installDir, dirEstadoHermes, dirBin} {
		if err := tx.CriarDir(d, 0o755); err != nil {
			return err
		}
	}
	env := renderEnv(r, id, i.a.Versao, i.a.Agora())
	if !envNovo {
		env = definirVariavel(e.envTexto, "HERMES_INSTALACAO_ID", id)
	}
	for _, f := range []struct {
		p    string
		b    string
		modo os.FileMode
	}{{arqConfig, renderConfig(i.a.Versao), 0o600}, {e.envPath(), env, 0o600}, {arqHook, hookCredencial, 0o700}} {
		if err := tx.Escrever(f.p, []byte(f.b), f.modo); err != nil {
			return err
		}
	}
	i.ok("Gravados %s, %s e %s.", arqConfig, e.envPath(), arqHook)
	if err := i.bootstrapOps(tx, canal, e.installDir); err != nil {
		return err
	}
	i.configurarNginx(tx)
	if ehDir(i.a.Raiz, "/etc/cron.d") {
		if err := tx.Escrever(arqCron, []byte(cronHermes), 0o644); err != nil {
			return err
		}
	} else {
		i.aviso("sem /etc/cron.d: a atualização diária fica só por conta do agente RV")
	}
	if r := i.executar(Comando{Nome: "docker", Args: []string{"inspect", "--format", "{{.Id}}", "hermes"}, Timeout: 30 * time.Second}); !r.ok() {
		tx.Compensar("remover o container hermes criado nesta execução", func() error {
			i.executarLimpeza(Comando{Nome: "docker", Args: []string{"rm", "-f", "hermes"}, Timeout: 2 * time.Minute})
			return nil
		})
	}
	if err := i.rodarHermesImagem(canal); err != nil {
		return err
	}
	return tx.Escrever(arqModelo, []byte("imagem\n"), 0o644)
}

func (i *instalador) atualizarHermes(tx *Transacao, e *estado, id, canal string) error {
	if err := tx.Escrever(e.envPath(), []byte(definirVariavel(e.envTexto, "HERMES_INSTALACAO_ID", id)), 0o600); err != nil {
		return err
	}
	if err := tx.Escrever(arqHook, []byte(hookCredencial), 0o700); err != nil {
		return err
	}
	i.ok("HERMES_INSTALACAO_ID gravado em %s e hook %s instalado.", e.envPath(), arqHook)
	return i.rodarHermesImagem(canal)
}

func (i *instalador) rodarHermesImagem(canal string) error {
	i.info("Rodando hermes-imagem %s (o primeiro download da imagem pode demorar)...", canal)
	w := i.escritorComando()
	r := i.executar(Comando{Nome: real(i.a.Raiz, arqHermesImagem), Args: []string{canal}, Saida: w, Timeout: 50 * time.Minute})
	w.Flush()
	if !r.ok() {
		return fmt.Errorf("hermes-imagem %s falhou (%s); veja /var/log/hermes-update.log", canal, i.resumoSaida(Resultado{Codigo: r.Codigo, Err: r.Err}))
	}
	i.ok("hermes-imagem %s concluído.", canal)
	return nil
}

var (
	reUsuarioReg = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)
	reSenhaReg   = regexp.MustCompile(`^[A-Za-z0-9_.-]+$`)
	reCID        = regexp.MustCompile(`^[0-9a-f]{12,64}$`)
)

// credencialRegistro: `agenterv hermes credencial` (duas linhas: usuário e senha). A senha só
// vive em memória, entra no mascarador e vai ao docker login por stdin.
func (i *instalador) credencialRegistro() (string, string, error) {
	r := i.executar(Comando{Nome: real(i.a.Raiz, arqAgente), Args: []string{"hermes", "credencial"}, Timeout: time.Minute})
	switch {
	case r.Err == nil && r.Codigo == 3:
		return "", "", fmt.Errorf("a instalação está bloqueada no RV (credencial 403): não recebe versões")
	case r.Err == nil && r.Codigo == 4:
		return "", "", fmt.Errorf("limite de pedidos de credencial atingido (429); tente em 1 hora")
	case !r.ok():
		return "", "", fmt.Errorf("agenterv hermes credencial falhou (código %d)", r.Codigo)
	}
	linhas := strings.Split(string(r.Saida), "\n")
	if len(linhas) < 2 {
		return "", "", fmt.Errorf("credencial do registro fora do formato")
	}
	u, s := strings.TrimSpace(linhas[0]), strings.TrimSpace(linhas[1])
	i.m.Adicionar(s)
	if !reUsuarioReg.MatchString(u) || !reSenhaReg.MatchString(s) {
		return "", "", fmt.Errorf("credencial do registro fora do formato")
	}
	return u, s, nil
}

// bootstrapOps: o PRIMEIRO hermes-imagem não existe ainda. Ele vem da própria imagem do canal,
// do mesmo jeito que o hermes-imagem/migrador fazem a cada atualização: login (stdin, DOCKER_CONFIG
// isolado) -> pull -> docker create POR DIGEST -> docker cp /opt/hermes-ops -> confere os 6
// arquivos (regulares, sem link) e a sintaxe (bash -n) -> instala por escrita atômica.
func (i *instalador) bootstrapOps(tx *Transacao, canal, installDir string) error {
	usuario, senha, err := i.credencialRegistro()
	if err != nil {
		return err
	}
	dcfg, err := os.MkdirTemp(i.a.TempDir, "hermesinst-docker-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dcfg)
	_ = os.Chmod(dcfg, 0o700)
	envDC := []string{"DOCKER_CONFIG=" + dcfg}
	r := i.executar(Comando{Nome: "docker", Args: []string{"login", registroHost, "--username", usuario, "--password-stdin"}, Stdin: []byte(senha), Env: envDC, Segredos: []string{senha}, Timeout: 2 * time.Minute})
	senha = ""
	defer i.executarLimpeza(Comando{Nome: "docker", Args: []string{"logout", registroHost}, Env: envDC, Timeout: time.Minute})
	if !r.ok() {
		return fmt.Errorf("login em %s recusado: %s", registroHost, i.resumoSaida(r))
	}
	ref := imagemRepo + ":" + canal
	i.info("Baixando %s...", ref)
	if r := i.executar(Comando{Nome: "docker", Args: []string{"pull", ref}, Env: envDC, Timeout: 30 * time.Minute}); !r.ok() {
		return fmt.Errorf("pull de %s falhou: %s", ref, i.resumoSaida(r))
	}
	r = i.executar(Comando{Nome: "docker", Args: []string{"image", "inspect", "--format", "{{range .RepoDigests}}{{println .}}{{end}}", ref}, Timeout: time.Minute})
	digest := ""
	for _, l := range strings.Split(string(r.Saida), "\n") {
		l = strings.TrimSpace(l)
		if strings.HasPrefix(l, imagemRepo+"@sha256:") && len(l) == len(imagemRepo)+8+64 {
			digest = l
			break
		}
	}
	if !r.ok() || digest == "" {
		return fmt.Errorf("não consegui resolver o digest de %s", ref)
	}
	r = i.executar(Comando{Nome: "docker", Args: []string{"create", digest}, Timeout: 2 * time.Minute})
	cid := strings.TrimSpace(string(r.Saida))
	if !r.ok() || !reCID.MatchString(cid) {
		return fmt.Errorf("docker create %s falhou", digest)
	}
	defer i.executarLimpeza(Comando{Nome: "docker", Args: []string{"rm", "-f", cid}, Timeout: time.Minute})
	ops, err := os.MkdirTemp(i.a.TempDir, "hermesinst-ops-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(ops)
	if r := i.executar(Comando{Nome: "docker", Args: []string{"cp", cid + ":/opt/hermes-ops/.", ops}, Timeout: 2 * time.Minute}); !r.ok() {
		return fmt.Errorf("não consegui extrair /opt/hermes-ops da imagem: %s", i.resumoSaida(r))
	}
	conteudo := map[string][]byte{}
	for _, n := range opsArquivos {
		p := filepath.Join(ops, n)
		fi, err := os.Lstat(p)
		if err != nil || !fi.Mode().IsRegular() || fi.Size() == 0 || fi.Size() > 2<<20 {
			return fmt.Errorf("a imagem %s não traz %s válido em /opt/hermes-ops (versão com o modelo imagem publicada neste canal?)", digest, n)
		}
		if conteudo[n], err = os.ReadFile(p); err != nil {
			return err
		}
		if strings.HasSuffix(n, ".sh") {
			if r := i.executar(Comando{Nome: "bash", Args: []string{"-n", p}, Timeout: time.Minute}); !r.ok() {
				return fmt.Errorf("%s extraído da imagem tem erro de sintaxe", n)
			}
		}
	}
	if err := tx.Escrever(installDir+"/docker-compose.imagem.yml", conteudo["docker-compose.imagem.yml"], 0o644); err != nil {
		return err
	}
	for _, n := range opsScripts {
		if err := tx.Escrever(dirBin+"/"+n, conteudo[n+".sh"], 0o755); err != nil {
			return err
		}
	}
	i.ok("Scripts operacionais instalados a partir de %s.", digest)
	return nil
}

// configurarNginx: o site do install.sh. Nunca é fatal: se o nginx não existe, já falha no
// `nginx -t` ou falha com o site novo, nada fica (o Hermes atende direto na porta 3000).
func (i *instalador) configurarNginx(tx *Transacao) {
	raiz := i.a.Raiz
	semNginx := func(motivo string) {
		i.aviso("%s: o Hermes fica acessível direto na porta 3000 (http://<ip>:3000).", motivo)
	}
	if !ehDir(raiz, "/etc/nginx") {
		semNginx("nginx não encontrado")
		return
	}
	conf, link := "", ""
	switch {
	case ehDir(raiz, "/etc/nginx/sites-available"):
		conf = "/etc/nginx/sites-available/hermes"
		if ehDir(raiz, "/etc/nginx/sites-enabled") {
			link = "/etc/nginx/sites-enabled/hermes"
		}
	case ehDir(raiz, "/etc/nginx/conf.d"):
		conf = "/etc/nginx/conf.d/hermes.conf"
	default:
		semNginx("diretório de sites do nginx não encontrado")
		return
	}
	if r := i.executar(Comando{Nome: "nginx", Args: []string{"-t"}, Timeout: time.Minute}); !r.ok() {
		semNginx("a configuração atual do nginx já falha no `nginx -t` (não mexi)")
		return
	}
	if b, err := lerArquivo(raiz, conf, 1<<20); err == nil && string(b) != nginxSite {
		semNginx(fmt.Sprintf("já existe %s que não é deste instalador (não mexi)", conf))
		return
	} else if err == nil {
		// o mesmo conteúdo: idempotente
	} else if existe(raiz, conf) {
		semNginx(fmt.Sprintf("%s existe e não é arquivo regular (não mexi)", conf))
		return
	}
	sub := i.novaTx()
	recarregado := false
	sub.Compensar("recarregar o nginx", func() error {
		if recarregado {
			i.executarLimpeza(Comando{Nome: "systemctl", Args: []string{"reload", "nginx"}, Timeout: time.Minute})
		}
		return nil
	})
	err := sub.Escrever(conf, []byte(nginxSite), 0o644)
	if err == nil && link != "" {
		if defaultDeFabrica(raiz) {
			err = sub.RemoverLink("/etc/nginx/sites-enabled/default")
		} else if existe(raiz, "/etc/nginx/sites-enabled/default") {
			i.aviso("o site default do nginx não é o de fábrica: mantido (a porta 80 pode continuar atendendo por ele; o Hermes segue na porta 3000).")
		}
		if err == nil {
			err = sub.CriarLink(link, conf)
		}
	}
	if err == nil {
		if r := i.executar(Comando{Nome: "nginx", Args: []string{"-t"}, Timeout: time.Minute}); !r.ok() {
			err = fmt.Errorf("nginx -t falhou com o site do Hermes")
		}
	}
	if err != nil {
		i.desfazer(sub)
		semNginx(fmt.Sprintf("nginx não configurado (%v; desfeito)", err))
		return
	}
	if r := i.executar(Comando{Nome: "systemctl", Args: []string{"reload", "nginx"}, Timeout: time.Minute}); !r.ok() {
		i.aviso("systemctl reload nginx falhou; recarregue o nginx à mão")
	}
	recarregado = true
	tx.Absorver(sub)
	i.ok("nginx: porta 80 -> 127.0.0.1:3000 (%s).", conf)
}

const modoHermes = "hermes"

// defaultDeFabrica: sites-enabled/default é o link do pacote para sites-available/default.
// Só esse é removido (como o install.sh); site do cliente nunca é apagado.
func defaultDeFabrica(raiz string) bool {
	r := real(raiz, "/etc/nginx/sites-enabled/default")
	fi, err := os.Lstat(r)
	if err != nil || fi.Mode()&os.ModeSymlink == 0 {
		return false
	}
	alvo, err := os.Readlink(r)
	return err == nil && (alvo == "/etc/nginx/sites-available/default" || alvo == "../sites-available/default")
}
