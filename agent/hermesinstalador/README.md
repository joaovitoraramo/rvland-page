# hermesinstalador

Instalador do Hermes (Fase 2, P10). Binário Go separado do agente, no mesmo módulo
(`agent/go.mod`): `main` aqui, lógica em `agent/internal/hermesinst/`. Não se auto-atualiza:
é entregue por `GET /api/hermes/instalador?arch=` (302 + `x-sha256`/`x-versao`) e publicado por
`scripts/publicar-instalador.ts`.

## Modos

| Comando | O que faz |
|---|---|
| `hermesinstalador instalar` | Servidor novo: chave de **instalação** (`hmk_…`). Agente RV + Hermes (modelo imagem). |
| `hermesinstalador adotar` | Servidor que **já tem o agente RV** (Credit/Pic Price): chave de **adoção** + prova assinada pelo agente existente. |
| `hermesinstalador solicitar` | Sem chave: `POST /api/hermes/solicitacoes`, imprime o protocolo (`HP-XXXXXX`) e sai **3**. |
| `--dry-run` (com qualquer modo) | Pré-requisitos, identificação e `ativacao/validar` (não consome a chave); lista o plano. **Nada é gravado** (nem log, nem temporário). |
| `--mostrar-identificacao` | Imprime o que o SyncAutenticacao local devolveu. Não envia nada. |
| `--versao` / `--ajuda` | |

Interativo (há `/dev/tty` e não há `--nao-interativo`): as **6 perguntas do `install.sh`**, com
validação e repetição — IP do WildFly (IPv4), porta (8080), acesso externo (s/N), endereço externo
(IP ou hostname), porta externa (65381), ignorar tags (s/N). Flags/variáveis viram o padrão.
Não interativo: flags ou `HERMES_WILDFLY_IP`, `HERMES_WILDFLY_PORTA`, `HERMES_ACESSO_EXTERNO`,
`HERMES_EXTERNO_ENDERECO`, `HERMES_EXTERNO_PORTA`, `HERMES_IGNORE_TAGS`, `HERMES_ALLOWED_HOST`,
`HERMES_CNPJ`, `HERMES_INSTALACAO` (e os nomes antigos `HERMES_API_URL`/`HERMES_API_URL_EXTERNAL`);
faltou o IP do WildFly ou algo inválido = saída 2 com a variável citada.

Chave: `--chave-arquivo=CAMINHO`, `--chave-stdin`, `HERMES_CHAVE` (removida do ambiente na hora; os
processos filhos não a herdam) ou `--chave=` (aceita, com aviso: fica visível no `ps`/histórico).

Códigos de saída: **0** ok · **2** uso · **3** aguardando chave · **4** chave inválida/expirada/usada ·
**5** CNPJ divergente/recusado · **6** pré-requisito (nada foi alterado) · **7** falha.

## Fluxo `instalar`

0. Trava: `flock` exclusivo e não bloqueante em `/run/hermesinstalador.lock` (0600, sem seguir link).
   Outra execução em andamento → 6. Liberada ao sair (inclusive erro, pânico e sinal). O dry-run não trava.
1. Estado atual (só leitura). Agente do Credit presente → 6 (use `adotar`). Hermes sem agente → 6
   (instale o agente e use `adotar`). Agente em modo Hermes → **retomada** sem chave (abaixo).
2. Pré-requisitos (todos listados de uma vez; exit 6): root, systemd ativo, `docker` (daemon) +
   `docker compose`/`docker-compose`, amd64/arm64, ≥ 3 GB livres no disco do Docker, e nenhum
   destino (nem diretório no caminho) é link simbólico.
3. As 6 perguntas (antes de qualquer rede, para não gastar a chave com resposta errada).
4. Identificação: `GET http://127.0.0.1:<porta do WildFly>/SyncAutenticacao/identificacao-instalacao`
   com `X-Hermes-Instalador: 1`, sem Origin e sem proxy. 403/404/sem resposta → 6, salvo `--cnpj`
   (origem `manual`). Raízes de CNPJ diferentes → exige `--cnpj` (2).
5. `POST /api/hermes/ativacao/validar` (401 → 4, 409 → 5, chave de adoção → 2).
6. `POST /api/hermes/ativacao` (consome a chave) → `instalacao_id`, `servidor_id`, `enroll_token`, `canal`.
7. Agente: `GET /api/agente/release?versao=latest&arch=` + `GET /api/agente/binario` com
   `X-RVLand-Enroll`; confere `x-rvland-sha256`, sha256 e **assinatura de release** (chave pública
   embutida, a mesma do agente; um build com chave vazia/placeholder/de ordem pequena recusa ANTES de
   consumir a chave); só então grava `/usr/local/bin/agenterv`, confere que a release tem o modo Hermes
   e roda `agenterv enroll --token-stdin --modo=hermes --instalacao=<id> --canal=<canal>` com o token
   **no stdin** (release antiga que não anuncia `--token-stdin` no `enroll --help` cai para `--token=`
   com aviso para atualizar o agente). Ponto sem volta:
   - falha **antes** do enroll: rollback completo; a chave vale de novo **nesta máquina por 30 min**
     (reentrada do RVLand);
   - enroll **tentado**: `agent.conf`/`agente.key` que tenham aparecido **nunca** são removidos. Com o
     `agent.conf` em modo Hermes e a instalação certa, segue como "já enrolado". Sem nada gravado, o
     resto é desfeito, mas a chave **não** é prometida de volta: se o enroll chegou ao RVLand, ele responde
     401 — peça uma nova chave ou acione o suporte.
   Sem `/etc/machine-id`, o id aleatório que o agente usará é gerado em memória e só é gravado em
   `/var/lib/rvland/hermes-machine-id` (0600) depois da ativação aceita.
8. Hermes (transação; qualquer falha = rollback de tudo que esta etapa gravou):
   `/etc/hermes/config` (0600, **sem token**), `.env.production` (0600, variáveis do `install.sh` +
   `HERMES_INSTALACAO_ID=<id>` **sem aspas**), hook `/etc/hermes/credencial.sh` (0700, chama
   `agenterv hermes credencial`), scripts de `/opt/hermes-ops` (ver "bootstrap"), nginx (porta 80 →
   3000, nunca fatal), `/etc/cron.d/hermes-update` (02:00, sem canal fixo), `hermes-imagem <canal>`
   e, só com sucesso, `/etc/hermes/modelo = imagem`.
9. Serviço do agente: `/etc/systemd/system/rvland-agent.service` (a mesma unidade do instalador do
   agente) + `systemctl enable --now rvland-agent`.
10. `/api/saude` (só avisa: o `hermes-imagem` já validou a saúde) e resumo sem segredos.

**Sinais:** SIGINT/SIGTERM/SIGHUP cancelam a etapa em curso; as limpezas (logout/`rm -f` do container
temporário, `docker rm -f hermes` criado nesta execução, `systemctl reload nginx`, `disable`/`daemon-reload`)
rodam com contexto próprio, não cancelado, e o rollback é completo. Pânico interno: rollback e saída 7.

**Retomada / idempotência:** rodar de novo depois de uma falha pós-enroll continua do ponto do Hermes
**sem chave** e sem nova ativação; rodar de novo com tudo pronto diz "já instalado" e não altera nada.

## Fluxo `adotar`

Exige `/etc/rvland/agent.conf` + `agente.key` (agente com o modo Hermes) e, se o Hermes já existe, o
modelo imagem (`hermes-migrar-imagem` antes). `instalacao_id`: o do `validar` (quando o RVLand passar a
devolver) ou `--instalacao=<uuid>` (mostrado no painel com a chave). A prova `agente_existente` assina
`hermes:ativacao:<ts>.<sha256hex(instalacao_id + "\n" + machine_id_hash)>` com a seed do agente
(`machine_id_hash` = sha256 hex de `/etc/machine-id` sem espaços, a mesma definição do agente; vetor
cruzado com `lib/hermes/assinatura-agente.ts` nos testes). Depois: `agenterv hermes configurar
--instalacao=<id> --canal=<canal>`, `HERMES_INSTALACAO_ID` no `.env.production` existente (o resto do
arquivo é preservado), hook, `hermes-imagem <canal>` e `systemctl restart rvland-agent`. Hermes ausente
= instala como no `instalar` (passo 8). Falha = rollback (inclusive do `agent.conf`).

## Bootstrap do `/opt/hermes-ops` (primeira instalação)

Não existe `hermes-imagem` antes da primeira instalação. O instalador usa o caminho que o próprio
`hermes-imagem`/`hermes-migrar-imagem` já usam a cada atualização: credencial curta do agente
(`agenterv hermes credencial`) → `docker login ghcr.io --password-stdin` com `DOCKER_CONFIG` temporário
(0700, apagado; logout sempre) → `docker pull ghcr.io/rvland-devs/hermes:<canal>` → digest pelos
`RepoDigests` → `docker create <repo>@sha256:…` → `docker cp :/opt/hermes-ops/.` para temporário 0700
→ exige os 6 arquivos regulares (sem link) e `bash -n` → instala por escrita atômica. Nenhum artefato
novo. **Limite:** a imagem não tem assinatura própria (a confiança é a mesma de todo update hoje:
registro autenticado + digest). Ver "Pendências".

## Segurança

Chave/token de enroll/senha do registro/seed do agente nunca aparecem em stdout, stderr, log
(`/var/log/hermes-instalador.log`, 0600, aberto só na primeira mudança) nem na forma exibida dos
comandos (mascarador + regex `hmk_…`). Senha só por stdin. `umask 077`; modos explícitos; escrita
atômica (temporário + fsync + rename); nenhum destino segue symlink; endereço do RVLand só por
`-ldflags` e só `https://host`; nenhuma chamada de API segue redirect; downloads com teto (JSON 1 MB,
binário 64 MB) e timeouts; nada de `curl | sh` interno; nada baixado executa sem sha256 + assinatura.

`RVLAND_ENROLL_TOKEN` e `HERMES_CHAVE` nunca passam para processos filhos. `--chave-arquivo` abre com
O_NOFOLLOW e confere o tipo no mesmo descritor. Uma `HERMES_CHAVE` inválida só vira erro quando a chave é
necessária (a retomada não usa chave). Nginx: só o `sites-enabled/default` de fábrica (link para
`sites-available/default`) sai; site do cliente nunca é apagado nem sobrescrito.

## Link público `…/hermes/instalar/<chave>` (NÃO implementado aqui; especificação para a rota TS)

O painel mostra: `curl -fsSL https://rvland.com.br/hermes/instalar/<chave> | sudo bash`
(o link É a credencial). A rota deve:

- aceitar só `<chave>` no formato `^hmk_[A-Za-z0-9_-]{43}$` (senão 404 genérico); rate limit por IP;
  **não** consumir nem validar a chave no GET (quem valida é o instalador); não logar o caminho;
- responder `content-type: text/x-shellscript; charset=utf-8`, `cache-control: no-store`,
  `x-robots-tag: noindex, nofollow` (e a página não pode ser indexável);
- para chave de **adoção**, embutir `MODO=adotar` e `--instalacao=<uuid>` (a rota conhece a instalação
  pelo hash da chave); para instalação, `MODO=instalar`;
- entregar exatamente este script mínimo (BASE = `SITE_URL`; CHAVE já validada pelo regex, logo sem
  caracteres de shell):

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE="https://rvland.com.br"
CHAVE="hmk_..."
MODO="instalar"            # ou: adotar
EXTRA=""                   # adoção: --instalacao=<uuid>
[ "$(id -u)" -eq 0 ] || { echo "hermes: rode como root (sudo)"; exit 6; }
case "$(uname -m)" in x86_64|amd64) A=amd64 ;; aarch64|arm64) A=arm64 ;; *) echo "hermes: arquitetura não suportada"; exit 6 ;; esac
D="$(mktemp -d)"; chmod 700 "$D"; trap 'rm -rf "$D"' EXIT
H="$(curl -fsS --proto '=https' --tlsv1.2 --max-time 30 -o /dev/null -D - "$BASE/api/hermes/instalador?arch=$A" | tr -d '\r')"
LOC="$(printf '%s\n' "$H" | sed -n 's/^[Ll]ocation: //p' | tail -1)"
SHA="$(printf '%s\n' "$H" | sed -n 's/^[Xx]-[Ss]ha256: //p' | tail -1)"
case "$SHA" in *[!0-9a-f]*|"") echo "hermes: release sem sha256"; exit 7 ;; esac
[ "${#SHA}" -eq 64 ] && [ "${LOC#https://}" != "$LOC" ] || { echo "hermes: resposta inesperada do instalador"; exit 7; }
curl -fsS --proto '=https' --tlsv1.2 --max-time 300 --max-filesize 67108864 -o "$D/hermesinstalador" "$LOC"
echo "$SHA  $D/hermesinstalador" | sha256sum -c --quiet - || { echo "hermes: sha256 do instalador NÃO confere"; exit 7; }
chmod 700 "$D/hermesinstalador"
# a chave vai por stdin (fora do argv); as perguntas usam /dev/tty
printf '%s\n' "$CHAVE" | "$D/hermesinstalador" "$MODO" --chave-stdin $EXTRA "$@"
```

Argumentos extras depois do `bash -s --` (ex.: `--nao-interativo`, `--dry-run`) chegam ao instalador.
A URL assinada do 302 vale 60 s: o segundo `curl` precisa vir logo após o primeiro (como acima).

## Build e publicação

```bash
cd agent && go vet ./... && go test -count=1 -race ./...
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /tmp/hi ./hermesinstalador
npx tsx scripts/publicar-instalador.ts 0.1.0              # dry-run (padrão): só o plano
npx tsx scripts/publicar-instalador.ts 0.1.0 --publicar   # garble obrigatório; sobe sem sobrescrever
```
`-ldflags`: `-X main.versao=X.Y.Z -X main.baseURL=https://… -X main.releasePK=<chaves/release.pub>`.
Sem `releasePK` válida o `instalar` recusa antes de consumir a chave.

## Endurecimento futuro (registrado, não feito)

- Pull por digest indicado pelo RVLand e/ou assinatura da imagem/ops (cosign ou assinatura de release
  em label), para o bootstrap não depender só do registro autenticado.
- `prctl(PR_SET_DUMPABLE, 0)` no processo do instalador (segredos em memória fora do alcance de
  ptrace/core dump de outro processo do mesmo usuário).
- Usar o `Date` do RVLand para o timestamp da prova de adoção (hoje só AVISA quando o relógio difere
  mais de 2 min).

## Pendências

- Release estável do agente com o modo Hermes e `--token-stdin` (ou `--agente-versao`).
