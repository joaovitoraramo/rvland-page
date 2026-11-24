# Agente RVLand

Binário Go único que roda em cada servidor de cliente recorrente. Reporta saúde
e status dos serviços, recebe uma **licença assinada** (lease) que decide se os
serviços licenciados seguem no ar, executa verbos fechados (`status/start/stop/
update`) e se auto-atualiza a partir de binários assinados.

## Módulos

O agente é modular; os módulos de cada servidor ficam no **cadastro do servidor no painel** e chegam
dentro do **lease assinado** (servidores antigos: só licença).

- `licenca` — aplica a licença (para/religa os serviços licenciados). Desligado, o agente nunca para nem
  religa serviço por causa de licença (só devolve ao ar o que ele mesmo tinha bloqueado antes) e recusa
  comandos `start/stop`.
- `picprice` — API local do RV Pic Price em `127.0.0.1:7710` (porta: `--porta=N` no enroll/instalador ou
  `RVLAND_PICPRICE_PORTA`). Contrato para quem chama: [`docs/api-local.md`](docs/api-local.md) e
  [`docs/openapi.yaml`](docs/openapi.yaml).

Instalar só com RV Pic Price (sem licença): cadastre o servidor no painel com só esse módulo e use o
comando gerado (`--modulos=picprice`; vale o cadastro). `--driver=dry` garante que o systemd nunca é tocado.

## Modo Hermes

Servidor criado pela chave de instalação do Hermes: `agenterv enroll --token=… --modo=hermes --instalacao=ID`
(grava `"modo":"hermes"` e o bloco `hermes` no `agent.conf`). O `run` então NÃO faz heartbeat, lease, Pic Price
nem comandos: só o ciclo de licença (`POST /api/agente/hermes` a cada 60 s) e a credencial do registro. Servidor
do Credit que adotou o Hermes: `agenterv hermes configurar --instalacao=ID` (Credit segue igual + ciclo Hermes).
Contrato e regras: [`../docs/hermes-protocolo-agente.md`](../docs/hermes-protocolo-agente.md).

- Entrega ao Hermes, em `/var/lib/hermes`: `licenca/licenca.json`, `licenca/obrigatoria`, `licenca/bloqueio` e
  `rv/canal` (0644, atômico). Rede/RV fora = fail-open (nada muda).
- Só arma `obrigatoria` se o container aceitaria o documento (relógio do host, `HERMES_INSTALACAO_ID`) e a imagem
  traz `org.aramo.hermes.licenca-chave=real` + `org.aramo.hermes.licenca-chave-fp` igual ao fp do `hermesPK`.
- Observa o container `hermes` pela CLI `docker` (sem docker = estado `desconhecido`) e, com `digest_alvo`, roda
  `/usr/local/bin/hermes-imagem <canal>` (um por vez; o auto-update do agente espera ele terminar).
- `agenterv hermes credencial` (usuário e senha, uma linha cada, para o hook `/etc/hermes/credencial.sh`),
  `agenterv hermes sync` (um ciclo) e `agenterv hermes status`.
- Build: a chave pública Hermes (`h1`) entra por `-ldflags "-X main.hermesPK=<base64>"` (o `publicar-agente.ts` lê
  `RVLAND_HERMES_PK`); sem ela nenhum documento é aplicado. A unidade systemd não muda (o agente já roda como root).
- O sync reporta `container.chave_configurada` (imagem com chave real e fp igual ao do agente), que destrava o
  "Passar a valer" do painel.

## Instalação (produção)

No painel, cadastre o servidor e cole o comando gerado no SSH:

```bash
curl -fsSL https://SEU-SITE/api/agente/instalar | sudo bash -s -- --token=SEU_TOKEN
```

Ele baixa o binário da arquitetura certa, faz o enroll, instala a unidade
systemd e sobe o serviço. Opções: `--modulos=…` (informativo), `--versao=latest|X.Y.Z`
(ex.: canary fixado no servidor), `--porta=7710`, `--driver=systemd|dry`.

## CLI

```
agenterv enroll --token=TOKEN --servidor=URL [--driver=systemd|dry]
agenterv run          loop de heartbeat (rodado pelo systemd)
agenterv status       licença, serviços, último contato
agenterv reconnect    força um heartbeat
agenterv version
agenterv logs
```

### Token do enroll fora do `ps`

`--token=TOKEN` fica visível no argv (`ps`). Prefira uma das alternativas (precedência:
`--token-stdin` > `RVLAND_ENROLL_TOKEN` > `--token=`):

```
printf '%s\n' "$TOKEN" | agenterv enroll --token-stdin --servidor=URL    # lê UMA linha do stdin, sem eco no terminal
RVLAND_ENROLL_TOKEN=... agenterv enroll --servidor=URL                    # a variável é removida do ambiente do processo após a leitura
```

Se mais de uma fonte for informada e os valores divergirem, o enroll aborta (a mensagem cita só os
nomes das fontes). O valor nunca vai para log, erro ou estado. `--token=` segue funcionando.

`--driver=dry` não toca no systemd (registra a intenção) — para testar fora de
um servidor Linux.

## Segurança

- **Duas chaves Ed25519 públicas embutidas no build:** `licensePK` verifica o
  lease; `releasePK` verifica os binários de atualização. As privadas
  correspondentes vivem, respectivamente, na env da Vercel e OFFLINE na máquina
  do dono — nunca no agente.
- O agente gera o próprio par no enroll; a privada nunca sai do servidor. Cada
  heartbeat é assinado por ela.
- Verbos fechados, sem shell. Capacidade nova = versão nova do agente.
- Fail-safe: sem contato, opera até `operar_ate` do último lease e então bloqueia.

## Build / publicação

Da raiz do repositório (não daqui):

```bash
npx tsx scripts/publicar-agente.ts <versao> [estavel|canary]
```

Compila as arquiteturas, assina com `chaves/release.key`, sobe pro Storage e
registra em `agente_releases`. As chaves públicas são embutidas via `-ldflags`.
