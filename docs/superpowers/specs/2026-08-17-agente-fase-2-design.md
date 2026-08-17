# Agente RVLand — Design da Fase 2

Data: 2026-08-17
Status: decisões macro aprovadas em conversa (2026-08-16); detalhamento técnico
neste documento. Escopo V1 definido na seção 2.

## 1. Visão

Agente em Go (`agenterv`) rodando como serviço systemd nos servidores Linux do
datacenter do João. Ele é o braço executor da plataforma: mantém a licença
assinada (o "lease"), reporta telemetria, executa verbos fechados sobre os
serviços Spring Boot dos clientes e se auto-atualiza com binários assinados.

```
servidor do cliente                     Vercel (Next.js)            Supabase
┌──────────────────────┐   heartbeat   ┌──────────────────┐   SQL   ┌──────┐
│ agenterv (systemd)   │ ─────60s────► │ /api/agente/*    │ ──────► │  PG  │
│  · licença Ed25519   │ ◄──resposta── │  emite licença   │         │      │
│  · systemctl start/  │  {licença,    │  fila de comandos│  Storage│      │
│    stop credit-back  │   comandos,   │  telemetria      │ ◄─bins──┤      │
│  · telemetria        │   update?}    └──────────────────┘         └──────┘
└──────────────────────┘
```

## 2. Escopo V1 (este ciclo) vs 2.1 (depois)

**V1:** enrollment por token; heartbeat 60s com telemetria; emissão e
verificação da licença assinada; bloqueio/desbloqueio automático e manual;
comandos start/stop pelo painel; eventos (serviço caiu/voltou, disco alto,
login SSH novo); releases assinados com update atômico + rollback e versão-alvo
por servidor (canary); telas do painel (inventário, servidor, novo servidor com
comando de instalação, releases); poda de telemetria.

**2.1 (anotado, fora deste ciclo):** janela de manutenção; alerta de SSL;
registro de versão do JAR em produção; endpoint público de licença para o back
dos clientes consultarem ("Licenciado até X"); `agenterv logs --follow` rico.

## 3. As duas chaves (decisão nova, destacada)

A conversa fixou "chave de assinatura nunca na Vercel". Isso vale para a chave
de **release** (supply chain). A licença, porém, é assinada dinamicamente a
cada heartbeat — a chave dela PRECISA estar no servidor da plataforma. São
riscos diferentes, então