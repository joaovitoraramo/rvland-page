# Plataforma RVLand — Fase 2: Agente e Parque (Design)

Data: 2026-08-17
Status: design para revisão; implementação por sub-fases (2A→2F)
Base: `2026-08-16-plataforma-rvland-design.md` (§11 lista o escopo desta fase)

## 1. Objetivo

Um agente em Go rodando no datacenter do João, em cada servidor de cliente
recorrente, que: (a) reporta saúde e status dos serviços à plataforma; (b)
recebe uma **licença assinada** que funciona como lease e determina se os
serviços licenciados seguem rodando ou param; (c) executa um conjunto fechado
de verbos (status/start/stop/update); (d) se auto-atualiza a partir de binários
assinados. A plataforma ganha inventário de servidores/serviços, fila de
comandos, telemetria e pipeline de releases.

## 2. Princípios de segurança (inegociáveis)

1. **Dois pares de chaves Ed25519, papéis distintos:**
   - **Licença** — privada na env da Vercel (`RVLAND_LICENSE_SK`), assina o
     lease em runtime a cada heartbeat. Vazamento = forjar licença = burlar
     bloqueio (ruim, não catastrófico). Pública embutida no agente.
   - **Release** — privada OFFLINE, só na máquina do João, assina cada binário
     antes do upload. Vazamento = RCE em todo o parque (catastrófico), por isso
     NUNCA toca Vercel/CI. Pública embutida no agente.
2. **Agente autentica-se por chave própria.** No enrollment o agente gera seu
   par Ed25519; a plataforma guarda só a pública. Cada heartbeat é assinado
   pela privada do agente (que nunca sai do servidor). Não há segredo
   compartilhado no banco para vazar.
3. **Verbos fechados, nunca shell.** O agente entende `status|start|stop|update`
   sobre unidades systemd previamente cadastradas. Capacidade nova = versão
   nova do agente.
4. **Fail-safe por expiração do lease.** Sem contato com a plataforma, o agente
   opera até o `operar_ate` do último lease válido e então bloqueia. Cliente não
   escapa cortando a rede; e uma queda da plataforma não derruba quem está em
   dia (o lease de quem está em dia tem `operar_ate` no futuro distante).
5. **Update atômico e verificado.** Baixa para temporário, confere sha256 +
   assinatura de release, `rename` por cima, reinicia via systemd, guarda o
   binário anterior para rollback. Versão fixável por servidor (canary).
6. **Bloqueio real só fora da simulação.** `modo_simulacao` global (nasce
   ligado) → agente reporta "seria bloqueado" e não para nada. `panico` global
   → `operar_ate` efetivamente infinito.

## 3. Modelo de dados (novas tabelas)

```
servidores
  id uuid PK, cliente_id FK, nome, descricao, host (informativo), so (informativo)
  status ('pendente'|'ativo'|'revogado')
  enrollment_token_hash text?, enrollment_expira_em timestamptz?
  agente_pubkey text?            -- base64, definida no enroll
  agente_versao text?, versao_alvo text?   -- alvo fixa canary; null = último estável
  ultimo_contato_em timestamptz?
  criado_em

servico_gerenciados
  id uuid PK, servidor_id FK, nome (label), unidade_systemd text
  licenciado bool default true   -- se o bloqueio para este serviço
  ativo bool default true
  status_reportado ('ativo'|'inativo'|'desconhecido') default 'desconhecido'
  atualizado_em

telemetria_atual                 -- 1 linha por servidor, sobrescrita
  servidor_id uuid PK, cpu_pct, memoria_pct, disco_pct, carga1, uptime_seg
  payload jsonb, coletado_em

telemetria_historico             -- podada por cron (48h em minuto → 90d agregada)
  id bigserial PK, servidor_id FK, cpu_pct, memoria_pct, disco_pct, coletado_em
  index (servidor_id, coletado_em)

eventos                          -- raros, viram alerta
  id bigserial PK, servidor_id FK
  tipo ('servico_caiu'|'disco_alto'|'reboot'|'ssh_login'|'agente_online'|'agente_offline'|'update_aplicado'|'update_falhou')
  severidade ('info'|'aviso'|'critico'), mensagem, dados jsonb
  reconhecido bool default false, criado_em

comandos                         -- fila; agente puxa no heartbeat
  id uuid PK, servidor_id FK, servico_id FK?
  verbo ('status'|'start'|'stop'|'update')
  estado ('pendente'|'enviado'|'concluido'|'falhou')
  resultado jsonb, criado_por, criado_em, concluido_em

agente_releases
  id uuid PK, versao text (semver) unique, canal ('estavel'|'canary')
  caminho_storage text, sha256 text, assinatura text (base64, chave de release)
  notas, ativo bool default true, criado_em
```

RLS ligado em todas (bucket novo `agentes` privado para os binários). Permissões
já no catálogo (Fase 0): `servidores.{ver,cadastrar,editar,executar,manutencao}`,
`agente.{publicar,forcar_update}`.

## 4. Protocolo HTTP (agente ↔ plataforma)

Base: `/api/agente/*`. Corpo JSON. Assinatura no header
`X-RVLand-Assinatura: <base64(sign(sk_agente, timestamp + "." + sha256(body)))>`
com `X-RVLand-Servidor` e `X-RVLand-Timestamp` (frescor ±5 min contra replay).

### 4.1 Enroll — `POST /api/agente/enroll`
Req: `{ token, agente_pubkey, host, so, agente_versao }`
- valida `sha256(token)` contra `enrollment_token_hash`, não expirado, servidor `pendente`
- grava pubkey, marca `ativo`, limpa token, evento `agente_online`
Resp: `{ servidor_id, licenca: <lease>, intervalo_seg }`

### 4.2 Heartbeat — `POST /api/agente/heartbeat` (assinado)
Req: `{ agente_versao, uptime_seg, telemetria:{...}, servicos:[{unidade,ativo}],
        eventos:[{tipo,severidade,mensagem,dados}], resultados_comandos:[{id,estado,saida}] }`
- verifica assinatura contra `agente_pubkey`; frescor do timestamp
- atualiza `telemetria_atual` (+append histórico), status dos serviços, grava
  eventos, fecha comandos reportados, seta `ultimo_contato_em`
Resp: `{ licenca:<lease>, comandos:[{id,verbo,servico_unidade}], versao_alvo, intervalo_seg }`

### 4.3 Download de release — `GET /api/agente/release/:versao` (assinado)
Resp: redireciona para URL assinada do Storage (curta). Metadados (sha256,
assinatura) já vieram no `versao_alvo` do heartbeat anterior via 4.2 — ou em
`GET /api/agente/release/:versao/meta`.

### Lease (documento assinado com `RVLAND_LICENSE_SK`)
```json
{
  "v": 1, "servidor_id": "...", "cliente_id": "...",
  "emitido_em": "2026-08-17T03:00:00Z",
  "status": "em_dia|atrasado|bloqueado|cancelado|sem_licenca",
  "operar_ate": "2026-08-20T06:00:00Z",   // instante-limite; roda licenciados até aqui
  "renovar_apos": "2026-08-17T15:00:00Z",  // busca lease novo após isto
  "servicos_licenciados": ["concicredit.service"],
  "modo_simulacao": true, "panico": false
}
```
Envelope: `{ "payload": <base64(json)>, "assinatura": <base64(sign)> }`.
`operar_ate` deriva de `statusLicenca` (Fase 1): em dia → próximo vencimento +
tolerância; atrasado → vencimento + tolerância + confiança às 03:00 SP;
bloqueado → agora (passado). Agente: `panico`→roda; `modo_simulacao`→roda e
reporta intenção; senão `now>=operar_ate && status∈{bloqueado}`→para licenciados.

## 5. O agente (Go, binário único)

Config `/etc/rvland/agent.conf` (TOML): `enderecos=["https://api.rvland...","https://rvland-page.vercel.app"]` (tenta em ordem — resolve troca de domínio sem hardcode), `servidor_id`, caminho das chaves. Chaves do agente em `/etc/rvland/agente.key` (0600). Lease em cache em `/var/lib/rvland/licenca.json`.

CLI:
```
agenterv enroll --token=XXX      # gera par, chama /enroll, escreve config
agenterv run                     # daemon: heartbeat no intervalo, aplica lease/comandos
agenterv status                  # licença, validade, serviços, último contato
agenterv reconnect               # força heartbeat imediato
agenterv version
agenterv logs                    # últimas linhas do journald da própria unidade
```
Roda como `rvland-agent.service` (systemd). Executa apenas: `systemctl is-active/start/stop <unidade>` para unidades cadastradas; self-update. Sem shell, sem eval.

## 6. Telas (painel, Fase 2)

- `/painel/servidores` — grid semáforo (online / offline / lease vencendo / bloqueado), última telemetria.
- `/painel/servidores/[id]` — serviços com status e botões start/stop/status; telemetria atual; eventos; janela de manutenção; versão do agente.
- `/painel/servidores/novo` — cadastra, gera **comando de instalação de uma linha com token** para colar no SSH.
- `/painel/agente/releases` — quem está em qual versão; publicar release (upload assinado); promover canary→estável.
- 360 do cliente ganha bloco "Servidores".

## 7. Endpoint público de licença (back do cliente)
`GET /api/licenca/:servidor_id` (chave de leitura própria, read-only) → status +
`operar_ate` para o back do cliente exibir "Licenciado até X". Cache curto,
falha silenciosa. Nunca do navegador do cliente (chave no server dele).

## 8. Sub-fases de implementação

- **2A — Fundação**: schema + migração + domínio do lease (`montarLease`,
  `operarAte`) com TDD; geração dos dois pares de chaves e onde vivem.
- **2B — Enroll + heartbeat + lease**: endpoints, verificação de assinatura,
  emissão de lease; harness de agente simulado (Node) para validar ponta a ponta.
- **2C — Comandos + telemetria + eventos**: fila, ingestão, alertas, cron de poda.
- **2D — Painel**: telas da §6 + bloco no 360.
- **2E — Agente Go**: binário, CLI, systemd, verbos, self-update; testes Go.
- **2F — Release pipeline**: assinar binário local, publicar, canary, rollback;
  endpoint público de licença.

## 9. Fora de escopo (Fase 3)
Medição por uso da Credit; e-mail/WhatsApp de aviso; chamados; leads.
```
