# Protocolo do agente Hermes (rotas assinadas)

Contrato que o agente Go (P4) implementa. Fonte de verdade no código:
`lib/hermes/assinatura-agente.ts` (assinatura), `lib/hermes/protocolo.ts` (corpos),
`lib/servicos/hermes-sync.ts` e `lib/servicos/hermes-credencial.ts` (regras).

Esquema PRÓPRIO do Hermes: não é o do heartbeat do Credit. Uma assinatura do
heartbeat não vale em nenhuma rota Hermes, e a de uma rota não vale na outra.
O agente Go tem UM único esquema para tudo: `hermes:<rota>:<timestamp>.<sha256_hex(corpo)>`
(rotas `sync`, `credencial` e `ativacao`).

## Isolamento: servidor Hermes não fala com o Credit nem com o Pic Price

Servidor criado pela ativação Hermes (chave de instalação) é recusado como se fosse
DESCONHECIDO (mesma resposta, sem revelar que existe) em `POST /api/agente/heartbeat`,
`POST /api/agente/picprice/autorizar` e `GET /api/licenca/<servidor>`; e o lease emitido para ele
(no enroll) nunca traz o módulo Pic Price. O agente Hermes deve usar SÓ as rotas deste documento
(mais o enroll/download do binário, que são compartilhados). Servidor ADOTADO (já existia como
servidor do Credit) não é marcado e continua como era. A marca é `hermes_instalacoes.criado_por =
'chave:<prefixo>'` (lib/hermes/origem-servidor.ts), sem coluna nova.

## Rotas

| `<rota>` | Método e caminho | Corpo |
|---|---|---|
| `sync` | `POST /api/agente/hermes` | JSON estrito (`esquemaSync`; campo desconhecido = 422) |
| `credencial` | `POST /api/agente/hermes/credencial` | exatamente `{"pedido":"credencial"}` (obrigatório e estrito) |
| `ativacao` | `POST /api/hermes/ativacao` (só a prova de adoção) | ver "Prova de adoção" |

Corpo máximo: 64 KB. `Content-Type: application/json`.

## Headers

- `X-RVLand-Servidor`: uuid do servidor (o agente RV já enrolado).
- `X-RVLand-Timestamp`: relógio do agente em ISO-8601/RFC 3339 (ex.: `2026-11-23T12:00:00.000Z`).
  A string é assinada exatamente como enviada. Precisa estar dentro de ±5 min do relógio do servidor.
- `X-RVLand-Assinatura`: base64 (64 bytes) da assinatura Ed25519 da mensagem abaixo,
  com a chave privada do servidor (a mesma cuja pública foi registrada no enroll).

## Mensagem assinada

```
hermes:<rota>:<timestamp>.<sha256_hex(corpo_cru)>
```

- `<rota>`: `sync`, `credencial` ou `ativacao`.
- `<timestamp>`: o valor do header `X-RVLand-Timestamp`.
- `sha256_hex`: SHA-256 dos bytes do corpo EXATAMENTE como enviado (o que vai no fio, sem
  reserializar), em hexadecimal minúsculo (64 caracteres). Corpo vazio = hash de `""`.
- A mensagem é UTF-8, sem quebra de linha. O Ed25519 assina a mensagem inteira (PureEd25519, sem pré-hash).

Exemplo (credencial, corpo `{"pedido":"credencial"}`):

```
hermes:credencial:2026-11-23T12:00:00.000Z.e36e5509ba40f9a4c2c38fe1c99c3e0c68410f73ac822a9d130af8f5450cf333
```

## Prova de adoção (`ativacao`)

Em `POST /api/hermes/ativacao` com chave de adoção, o agente RV já instalado prova a posse da
chave privada no objeto `agente_existente` do JSON (não usa os headers `X-RVLand-*`):

```json
{ "agente_existente": { "servidor_id": "<uuid>", "timestamp": "<RFC 3339>", "assinatura": "<base64>" } }
```

A mensagem assinada segue o esquema comum, com a rota `ativacao` e, como "corpo",
`instalacao_id + "\n" + machine_id_hash` (a prova fica dentro do corpo da requisição, então não dá para
assinar o corpo todo):

```
hermes:ativacao:<timestamp>.<sha256_hex(instalacao_id + "\n" + machine_id_hash)>
```

`instalacao_id` = uuid da instalação a adotar (o mesmo devolvido por `validar`/exibido pelo painel),
em texto minúsculo, UTF-8. `machine_id_hash` = o do `fingerprint` da MESMA requisição de ativação (a prova
fica amarrada à máquina que ativa; assinada para outro fingerprint, é recusada). O separador é um único `\n`
(0x0A). `timestamp` dentro de ±5 min. Não valem: o esquema anterior (só o `instalacao_id`), `ativar:<instalacao>`
(esquema antigo), a assinatura do heartbeat do Credit, nem a de `sync`/`credencial`. Falha = 401 `CHAVE_INVALIDA`
(igual a chave inexistente) e a chave NÃO é consumida.

## `sync`

Corpo (resumo; ver `esquemaSync`): `agente_versao?`, `container{estado, saude?, versao?, sha?, digest?,
canal_em_uso?, iniciado_em?, chave_configurada?}`, `fingerprint{machine_id_hash, boot_id?, hostname_hash?, so?, docker_versao?}`,
`relogio?{confiavel, sincronizado?}`, `eventos?[]` (até 20, só tipos `hermes_*` permitidos),
`ultimo_emitido_em?`.

`container.chave_configurada` (booleano, opcional; retrocompatível): `true` SOMENTE se o `docker inspect` do container
em uso traz `org.aramo.hermes.licenca-chave=real` E `org.aramo.hermes.licenca-chave-fp` igual ao fp da chave h1
embutida no agente (a cadeia imagem↔agente fecha); `false` quando o docker responde e isso não vale (inclusive container
ausente ou agente sem chave); omitido só quando o estado do docker é desconhecido. O servidor grava em
`saude.chave_configurada` SÓ o booleano recebido no corpo autenticado (nunca o inventa; string/número = 422) e o `saude`
é regravado inteiro a cada sync: agente antigo (sem o campo) = ausente = o painel continua bloqueando "Passar a valer"
(fail-closed, `lib/hermes/painel.ts`).

200:

```json
{ "licenca": { "payload": "<base64 JSON>", "assinatura": "<base64>", "kid": "h1" },
  "agora": "<ISO do servidor>", "intervalo_seg": 60, "canal": "stable|preview", "digest_alvo": null,
  "agente_alvo": { "versao": "0.6.1", "url": null, "sha256": null } }
```

`agente_alvo` (retrocompatível; agente que não o conhece ignora): versão-alvo do agente RV, ou `null` quando não há
release. É a MESMA regra do `versao_alvo` do heartbeat do Credit: pin do servidor (`servidores.versao_alvo`) e, se não
houver, a última release estável ativa do painel de release. `url` e `sha256` são reservados (hoje sempre `null`,
dependem da arquitetura): o P4 resolve a release por `GET /api/agente/release?versao=<versao>&arch=<arch>` (sha256 e
assinatura de release) e `GET /api/agente/binario`. `digest_alvo` (container) segue `null` até a atualização dirigida pelo RV.

`licenca` é o documento assinado com a chave Hermes (kid `h1`; verificar com a `RVLAND_HERMES_PK`
embutida). O modo (`simulacao`/`valendo`) vem só dele: o agente só bloqueia com `modo=valendo`.

Ciclo normal: 1 sync a cada 60 s, com `X-RVLand-Timestamp` estritamente crescente.
O servidor só ALERTA (nunca bloqueia) sobre sinais de clone: boot_id alternando, mais de 2 syncs em
60 s, `machine_id_hash` mudando entre syncs e REPLAYs assinados repetidos (3 em 10 min).

## Modo Hermes do agente (P4)

Agente em servidor criado por chave de instalação (`criado_por 'chave:%'`) NÃO chama `POST /api/agente/heartbeat`
(recebe 401, como servidor desconhecido): usa só `POST /api/agente/hermes` (`sync`) e `POST /api/agente/hermes/credencial`
(mais enroll/download do binário). Não há módulos, serviços gerenciados nem comandos do Credit/Pic Price para ele (o lease do
enroll sai sem módulos, sem serviços e sem o status de licença do Credit; o painel recusa editá-los).

- **Presença**: cada `sync` aceito (autenticado, sem RELOGIO/REPLAY) atualiza `servidores.ultimo_contato_em`; é o que mantém o
  servidor "online" no painel e evita o alerta `agente_offline` do cron de telemetria. O agente só precisa manter o ciclo de 60 s.
- **Auto-update do agente**: o `sync` traz `agente_alvo` (acima). Se `versao` difere da instalada, baixar e verificar a release
  (sha256 + assinatura de release) como o agente do Credit faz; hoje `url`/`sha256` vêm `null`.
- **Auto-update do container**: o `sync` traz `digest_alvo` (hoje `null`) e a credencial do registro vem da rota `credencial`.

### Comportamento implementado no agente Go (`agent/hermes_*.go`)

- **Seleção**: `agent.conf` com `"modo":"hermes"` + bloco `"hermes":{"instalacao_id":...}` (enroll com
  `--modo=hermes --instalacao=ID`) = só o ciclo Hermes. Só o bloco `hermes` (sem `modo`; `agenterv hermes configurar
  --instalacao=ID`) = servidor ADOTADO: Credit como sempre + ciclo Hermes em paralelo (o `agente_alvo` do sync é
  ignorado; quem atualiza o agente é o heartbeat, que ADIA o auto-update enquanto o `hermes-imagem` roda). Sem nada
  disso o agente é o de sempre.
- **Timestamp**: RFC 3339 UTC com ms (`2026-11-23T12:00:00.000Z`), `max(agora corrigida, último+1 ms)`, gravado em
  `/var/lib/rvland/hermes.json` ANTES do envio (nunca repete requisição assinada; sobrevive a reinício e a relógio que
  volta). No máximo 2 syncs em 60 s (também entre processos: trava `hermes.lock`).
- **Fingerprint**: `machine_id_hash` = sha256 hex minúsculo do conteúdo de `/etc/machine-id` (sem espaços/quebra; fallback
  `/var/lib/dbus/machine-id`, e por último um id aleatório persistido); `boot_id` de `/proc/sys/kernel/random/boot_id`;
  `hostname_hash` = sha256 hex do hostname. A prova de adoção usa o MESMO `machine_id_hash`.
- **Relógio**: `agora` de cada 200/409 mede a defasagem; acima de 2 min o agente usa o offset (sem mexer no relógio da
  máquina) e reporta `relogio.confiavel=false`. RELOGIO = 1 retentativa imediata com o relógio corrigido; o piso do
  timestamp volta para `max(min(último POSSIVELMENTE aceito, agora_servidor + 4 min 30 s), min(timestamp rejeitado,
  agora_servidor))`. "Possivelmente aceito" = o timestamp de toda resposta 200/503/5xx e de todo erro de rede (o servidor
  pode ter consumido o timestamp e a resposta se perdido); o teto mantém a retentativa dentro da janela (sem loop de
  RELOGIO) e o pior caso é um REPLAY que se resolve no ciclo seguinte.
- **Ações por resposta**: 200 aplica; RELOGIO retenta 1 vez; REPLAY espera o ciclo (timestamp maior); 401 espera 10 min;
  404 com `SEM_INSTALACAO` para o ciclo (sonda a cada 6 h, nunca mais que isso; documento e marcadores ficam como
  estão; 404 sem esse código = erro transitório, 60 s); 400/413/422 espera 5 min (422 descarta os eventos pendentes); 429 respeita
  `Retry-After` (sem ele, 60 min); 503/5xx/rede = FAIL-OPEN (documento e marcadores intocados). Eventos pendentes só saem
  da fila com 200/503 (o servidor os gravou).
- **Documento**: verificado como o `licenca/nucleo.mjs` do Hermes (kid `h1`, chave embutida por
  `-ldflags "-X main.hermesPK=<base64>"`; vazia = nada é aplicado) + `servidor_id` igual ao do agente; o envelope tem
  de ter exatamente as chaves `payload`, `assinatura`, `kid` (minúsculas, sem duplicadas nem extras). Só substitui o do
  disco se for autêntico, com `emitido_em` >= o do disco E >= o último aplicado (apagar o arquivo não reabre a porta a
  documento antigo) e se o CONTAINER também o aceitar ("entregável"): o agente o verifica de novo com o relógio do HOST
  (o do container, sem o offset do RV), com o `HERMES_INSTALACAO_ID` do container (`docker inspect`, `Config.Env`, com o
  mesmo `trim()` do JavaScript: tira U+FEFF, não tira U+0085) e com a chave h1 da IMAGEM (label fp abaixo).
  Documento autêntico e mais novo mas NÃO entregável (ex.: host atrasado > 10 min = "emitido no futuro"; env diferente;
  imagem com outra chave): não é gravado, `obrigatoria` é REMOVIDA (desarma, nunca arma) e o `bloqueio` é decidido pelo
  documento RECEBIDO, nunca pelo velho do disco (se o recebido bloqueia, cria; se não, não cria nem remove); evento
  `hermes_relogio` crítico (ou `hermes_adulteracao` aviso para env/chave), uma vez por motivo.
- **Checagem local em TODO ciclo** (antes do sync, inclusive com o RV fora, 401, 404, RELOGIO, 5xx): se existe
  `obrigatoria` e o container recusaria o `licenca.json` do disco (relógio do host, env, fp da chave, arquivo ausente),
  o agente REMOVE `obrigatoria` (com evento). Esse caminho nunca cria nem regrava nada. Agente sem chave h1 válida não
  julga (não mexe). Quem decide se o marcador pode ficar é a visão do CONTAINER (relógio do host, env, fp), nunca a
  do agente: documento que o agente não valida (ex.: `agora` do RV atrasado, que não é assinado; re-enroll com
  `servidor_id` novo) mas o container aceita = o marcador fica, sem evento.
- **Arquivos** (0644, diretórios 0755, atômico, o `licenca.json` sempre ANTES dos marcadores):
  `/var/lib/hermes/licenca/{licenca.json,obrigatoria,bloqueio}` e `/var/lib/hermes/rv/canal` (do `canal` do sync).
  `obrigatoria` só com `obrigatoria:true`, o documento do disco aceito pelo container E, na imagem em uso, os labels
  `org.aramo.hermes.licenca-chave=real` e `org.aramo.hermes.licenca-chave-fp=<fp>` com `<fp>` = sha256 em hex minúsculo
  dos 32 bytes CRUS da chave pública Ed25519 h1 da imagem (`licenca/chaves.json`; se ela estiver em SPKI DER, tirar o
  prefixo `302a300506032b6570032100` antes do hash), igual ao fp do `hermesPK` do agente. fp AUSENTE (imagem antiga) =
  não arma (log) e não derruba o que já existe; fp PRESENTE e DIFERENTE (troca da chave h1 sem trocar o kid, imagem com
  outra chave) = o container não verifica nada que o agente aceita: o documento não é entregue e `obrigatoria` é
  REMOVIDA (evento `hermes_adulteracao`); `licenca-chave` != `real` ou documento do disco recusado pelo container =
  remove; label desconhecido (docker indisponível) = não mexe. `bloqueio` = `modo=valendo && !panico && (bloqueante ||
  agora >= offline_ate)`, recalculado só a cada 200. DECISÃO: se o documento novo NÃO é entregável e não bloqueia, o
  `bloqueio` antigo é MANTIDO (nunca se mexe em bloqueio por falha; ele só impede o `up -d` do `hermes-imagem`). Eventos: `hermes_bloqueio`, `hermes_liberado`, `hermes_bloqueio_simulado` (transições) e
  `hermes_adulteracao` (licenca.json/marcador mexido fora do agente).
- **`digest_alvo`** diferente do em uso: `hermes-imagem <canal>` em segundo plano (1 por vez, timeout 45 min, via
  `systemd-run --scope` quando há systemd, para um restart do agente não matar o update; se o scope não sobe (sem
  dbus/LXC) executa direto; o mesmo alvo só é retentado após 1 h). Saída em arquivo temporário 0600 (sem pipe: o agente
  morrer não dá SIGPIPE no `up -d`; prefixo `rvland-hermes-imagem-` em `$TMPDIR`; restos com mais de 1 h, regulares e do
  próprio uid são apagados na inicialização; falha ao criar o arquivo vira `hermes_update_falhou` explícito). O fallback
  do scope só reexecuta direto se a saída NÃO começa com "Running scope as unit" e o texto (início + cauda + erro do
  Start) indica que o systemd-run não subiu, e nunca com o prazo esgotado. Timeout: SIGTERM ao grupo de processos (o
  `trap limpar` faz o logout do registro), 30 s de graça e SIGKILL ao grupo. O auto-update do agente é adiado enquanto
  o `hermes-imagem` roda, com nova conferência imediatamente antes da troca do binário. Resultado no próximo sync como
  `hermes_update_ok`/`hermes_update_falhou` (saída truncada, linhas com senha/token omitidas).
- **Build**: `scripts/publicar-agente.ts` embute a h1 com `-X main.hermesPK=<RVLAND_HERMES_PK>` (lida do ambiente/
  `.env.local` sem logar; validada: base64 canônico de 32 bytes ou SPKI). Sem a variável o build segue sem o `-X`, com
  aviso, e o agente nunca aplica documento (nem reporta `chave_configurada=true`).
- **Credencial**: `agenterv hermes credencial` imprime SÓ `usuario\nsenha` (o hook `/etc/hermes/credencial.sh` do
  Hermes lê essas duas linhas); 403 sai 3, 429 sai 4. Nada é gravado em disco nem logado.
- **Requisito do instalador**: `HERMES_INSTALACAO_ID` no `.env.production` SEM aspas (o `env_file` do compose v1
  mantém as aspas no valor; o container compararia `"<id>"` com o id e recusaria o documento; o agente espelha isso e
  não arma `obrigatoria`).
- **Pendências decididas**: o agente NÃO para o container no bloqueio (só marcador + recusa no start do container);
  desinstalação (404) não desarma nada até existir um documento ASSINADO de desinstalação; "forçar atualização" sem
  `digest_alvo` fica para um nonce `forcar_atualizacao_id` futuro.

## `credencial`

200 (`Cache-Control: no-store`):

```json
{ "repositorio": "ghcr.io/rvland-devs/hermes", "registro": "ghcr.io", "usuario": "...", "senha": "...", "expira_em": "<ISO>" }
```

`expira_em` sempre no futuro (a plataforma usa agora + 1 h quando não há data válida configurada).
Limite: 30 pedidos por hora por servidor. A senha nunca deve ser logada.

## Erros

| Status | Corpo | Quando | O que o agente faz |
|---|---|---|---|
| 401 | `{"erro":"AGENTE_NAO_AUTENTICADO"}` | servidor desconhecido/inativo, uuid inválido, assinatura inválida (inclui assinatura de outra rota ou do heartbeat) | não repetir sem corrigir; checar chave e mensagem assinada |
| 409 | `{"erro":"RELOGIO","agora":"<ISO>"}` | assinatura válida, mas o timestamp está fora de ±5 min do servidor (só sai para quem provou a chave) | usar `agora` para medir a defasagem; marcar relógio não confiável; tentar de novo com o relógio corrigido |
| 409 | `{"erro":"REPLAY"}` | `sync` com timestamp igual ou anterior ao último aceito (ou duas requisições simultâneas) | gerar timestamp novo e maior no próximo ciclo; repetições assinadas contam como sinal de clone |
| 404 | `{"erro":"SEM_INSTALACAO"}` | servidor sem instalação Hermes (ou desinstalada) | parar o ciclo de licença |
| 400 | `{"erro":"JSON_INVALIDO"}` | corpo não é JSON | corrigir |
| 422 | `{"erro":"CORPO_INVALIDO", ...}` | corpo fora do esquema (campo extra/ausente; na credencial, qualquer coisa diferente de `{"pedido":"credencial"}`, inclusive vazio) | corrigir |
| 403 | `{"erro":"INSTALACAO_BLOQUEADA"}` | `credencial`: instalação revogada, bloqueio manual, ou status financeiro bloqueante com enforcement valendo | não puxar versões novas |
| 413 | `{"erro":"CORPO_GRANDE"}` | corpo acima de 64 KB | reduzir |
| 429 | `{"erro":"LIMITE"}` + `Retry-After` | `credencial`: mais de 30 pedidos/hora | esperar o `Retry-After` |
| 503 | `{"erro":"INDISPONIVEL"}` | `sync`: chave de assinatura indisponível (o estado reportado foi gravado); `credencial`: registro não configurado | tentar no próximo ciclo; manter o último documento válido até `offline_ate` |

Ordem de validação no `sync`: 401 → 409 RELOGIO → 404 → 400/422 → 409 REPLAY → 200. Um corpo inválido (400/422)
não consome o timestamp. A `credencial` não usa anti-replay por timestamp (vale a janela de ±5 min, TLS e o limite de 30/h).
