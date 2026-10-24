# Agente RVLand

Binário Go único que roda em cada servidor de cliente recorrente, em **Linux**
(serviço systemd) ou **Windows** (serviço do Windows `rvland-agent`). Reporta saúde
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

No **Windows**, o módulo `licenca` usa o Gerenciador de Serviços: o nome cadastrado é o *Service Name*
(ex.: `wildfly`); o agente também aceita o *Display Name* e tira um `.service` que venha por engano.
Serviço inexistente é reportado como "serviço não encontrado: <nome>", sem parar nada. Bloquear = desativar
o início e parar esperando de verdade (até 90 s); liberar = início automático e subir.

## Instalação (produção)

No painel, cadastre o servidor e cole o comando gerado no SSH:

```bash
curl -fsSL https://SEU-SITE/api/agente/instalar | sudo bash -s -- --token=SEU_TOKEN
```

Ele baixa o binário da arquitetura certa, faz o enroll, instala a unidade
systemd e sobe o serviço. Opções: `--modulos=…` (informativo), `--versao=latest|X.Y.Z`
(ex.: canary fixado no servidor), `--porta=7710`, `--driver=systemd|dry`.

### Windows

Na tela do servidor, aba **Windows**: um comando para o Prompt de Comando aberto como administrador, ou o
botão **Baixar instalador (.cmd)** (dois cliques; pede o administrador pelo UAC). Os dois rodam
`/api/agente/instalar.ps1`, que:

1. detecta a arquitetura (amd64/arm64) e baixa o `agenterv.exe` da release (estável ou `-Versao`);
2. confere o SHA-256 com os metadados da release;
3. cria `C:\ProgramData\rvland` com acesso só de SYSTEM e Administradores e instala em
   `C:\Program Files\RVLand\agenterv.exe`;
4. faz o enroll, registra o serviço `rvland-agent` (início automático, reinicia em falha: 10 s, 30 s,
   60 s) e inicia; mostra o `status` no fim.

É idempotente (reinstalar por cima para o serviço, troca o exe e refaz). Parâmetros do script: `-Token`,
`-Servidor`, `-Modulos` (informativo), `-Versao`, `-Porta`, `-Simular` (só descreve os passos que mudam o
sistema). Guia: [`docs/agente-rv/instalar-windows.md`](../docs/agente-rv/instalar-windows.md).

Arquivos no Windows: configuração e chave em `C:\ProgramData\rvland`, estado em `...\rvland\estado`,
log em `...\rvland\logs\agent.log` (5 MB × 3 arquivos).

## CLI

```
agenterv enroll --token=TOKEN --servidor=URL [--driver=systemd|scm|dry] [--porta=7710]
agenterv run          loop de heartbeat (systemd no Linux; serviço no Windows)
agenterv status       licença, serviços, último contato
agenterv reconnect    força um heartbeat
agenterv version
agenterv logs         journald no Linux; agent.log no Windows
agenterv servico instalar|remover    (Windows) registra/remove o serviço rvland-agent
```

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
- Atualização no Windows: o `.exe` em uso não pode ser sobrescrito. O atual vira `.old`, o novo entra no
  lugar e o processo sai com código 1 (a recuperação do serviço sobe o novo). Um marcador fica em
  `estado\atualizacao.json` até a versão nova falar com a RV; se ela subir 3 vezes ou passar 10 min sem
  contato, volta para o `.old` e recusa aquela versão por 24 h neste servidor.

## Build / publicação

Da raiz do repositório (não daqui):

```bash
npx tsx scripts/publicar-agente.ts <versao> [estavel|canary] [--so=linux,windows]
```

Compila Linux e Windows (amd64 e arm64; `--so` limita), assina com `chaves/release.key`, sobe pro Storage e
registra em `agente_releases`. As chaves públicas são embutidas via `-ldflags`.
