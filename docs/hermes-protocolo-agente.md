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
canal_em_uso?, iniciado_em?}`, `fingerprint{machine_id_hash, boot_id?, hostname_hash?, so?, docker_versao?}`,
`relogio?{confiavel, sincronizado?}`, `eventos?[]` (até 20, só tipos `hermes_*` permitidos),
`ultimo_emitido_em?`.

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
