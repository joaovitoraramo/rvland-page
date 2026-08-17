# Agente RVLand

Binário Go único que roda em cada servidor de cliente recorrente. Reporta saúde
e status dos serviços, recebe uma **licença assinada** (lease) que decide se os
serviços licenciados seguem no ar, executa verbos fechados (`status/start/stop/
update`) e se auto-atualiza a partir de binários assinados.

## Instalação (produção)

No painel, cadastre o servidor e cole o comando gerado no SSH:

```bash
curl -fsSL https://SEU-SITE/api/agente/instalar | sudo bash -s -- --token=SEU_TOKEN
```

Ele baixa o binário da arquitetura certa, faz o enroll, instala a unidade
systemd e sobe o serviço.

## CLI

```
agenterv enroll --token=TOKEN --servidor=URL [--driver=systemd|dry]
agenterv run          loop de heartbeat (rodado pelo systemd)
agenterv status       licença, serviços, último contato
agenterv reconnect    força um heartbeat
agenterv version
agenterv logs
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

## Build / publicação

Da raiz do repositório (não daqui):

```bash
npx tsx scripts/publicar-agente.ts <versao> [estavel|canary]
```

Compila as arquiteturas, assina com `chaves/release.key`, sobe pro Storage e
registra em `agente_releases`. As chaves públicas são embutidas via `-ldflags`.
