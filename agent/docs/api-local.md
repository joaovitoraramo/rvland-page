# API local do agente RV (rvland-agent)

API HTTP que o **rvland-agent** sobe no próprio servidor do cliente, escutando **só em `127.0.0.1`**.
Hoje quem chama é o **SyncCompras**; qualquer outro sistema que rode **no mesmo servidor** pode chamar
seguindo este contrato. Especificação formal: [`openapi.yaml`](openapi.yaml).

- Base: `http://127.0.0.1:7710` (porta configurável: `agenterv enroll --porta=N`, `RVLAND_PICPRICE_PORTA` ou instalador `--porta=N`).
- Versão da API: `v1` (prefixo de todas as rotas).
- Formato: JSON UTF-8. **Toda resposta traz `estado`** (exceto `/v1/saude`, que traz `agente`).
- Chamadas de outra máquina são recusadas com `403 PROIBIDO`.

## Módulos do agente

O agente é modular. Os módulos de cada servidor são definidos no **cadastro do servidor no painel da RV**
e chegam ao agente **dentro do lease assinado** — o agente não aceita isso de outra fonte.

| Módulo | O que faz | Padrão |
|---|---|---|
| `licenca` | Aplica a licença do cliente: para e religa os serviços licenciados. Desligado, o agente **nunca** para nem religa serviço por causa de licença (e devolve ao ar o que ele mesmo tinha bloqueado antes). | ligado (servidores antigos) |
| `picprice` | Sobe as rotas `/v1/picprice/*` (RV Pic Price). Desligado, elas respondem `MODULO_DESATIVADO`. | desligado |

A API local sobe sempre (mesmo com `picprice` desligado), para `/v1/saude` permitir descobrir o agente.

## Descobrir se o agente está no servidor

```bash
curl -s http://127.0.0.1:7710/v1/saude
```

```json
{
  "agente": "rvland-agent",
  "versao": "0.5.0",
  "servidorId": "17e5348d-e7cf-42b7-ae05-8c8139fe2af9",
  "modulos": { "licenca": false, "picprice": true },
  "ultimoContatoRV": "2026-10-24T18:21:52Z",
  "apiLocal": { "porta": 7710, "versao": "v1" }
}
```

Sem resposta (conexão recusada) = agente não instalado ou parado. O SyncCompras mostra
`AGENTE_INDISPONIVEL` — "Agente RV não encontrado neste servidor".

## Autenticação das rotas do RV Pic Price

As rotas `/v1/picprice/*` recebem o **token RV Pic Price do cliente** (gerado no painel da RV, um por
CNPJ da matriz) no header `Authorization: Bearer rvpp_…`. O token fica no backend do cliente e nunca vai
para o navegador. O agente repassa o token à plataforma da RV, que valida a cada consulta.

## `GET /v1/picprice/status`

Confere token e status do serviço na RV e devolve o uso do dia. **Não conta na cota.** Use para "testar conexão".

```bash
curl -s -H "Authorization: Bearer rvpp_…" http://127.0.0.1:7710/v1/picprice/status
```

```json
{ "estado": "OK", "uso": { "usado": 5, "limite": 200, "zeraEm": "2026-10-25T00:00:00-03:00" } }
```

## `POST /v1/picprice/geohash`

Endereço da loja (Paraná) → geohash. **Conta 1 na cota.** Guarde o geohash no seu banco e mande-o em
todo ranking (o agente não acessa o banco do cliente).

```bash
curl -s -H "Authorization: Bearer rvpp_…" -H "Content-Type: application/json" \
  -d '{"endereco":"Rua Exemplo, 123, Centro, Curitiba, PR"}' http://127.0.0.1:7710/v1/picprice/geohash
```

```json
{ "estado": "OK", "geohash": "6gmp0v90nd4t", "lat": -25.43, "lon": -49.27,
  "endereco_encontrado": "Rua Exemplo, 123, Centro, Curitiba", "uso": { "usado": 6, "limite": 200, "zeraEm": "…" } }
```

## `POST /v1/picprice/ranking`

Os 10 menores preços de venda do EAN em volta de cada loja. **Conta 1 na cota por chamada** (não por loja).

Requisição:

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `gtin` | string | sim | EAN com 8 a 14 dígitos (zeros à esquerda são removidos) |
| `lojas` | array | sim | 1 a 30 lojas `{codigo, geohash, precoVenda?}` |
| `lojas[].codigo` | string | sim | código da loja no seu sistema (volta igual em `loja`) |
| `lojas[].geohash` | string | sim | geohash de 5 a 12 caracteres |
| `lojas[].precoVenda` | number | não | preço de venda atual da loja. Com ele o agente reconhece a **própria loja** na fonte (preço igual a até 0,2 km) e a tira dos concorrentes |
| `raio` | number | não | km, de 0,5 a 20 (padrão 3) |
| `data` | int | não | janela da venda: -1 = 2 meses (padrão), 0 = 1 mês, 1 = 15 dias, 2 = 1 semana, 3 = 24 h, 4 = 12 h, 5 = 6 h, 6 = 1 h |

```bash
curl -s -H "Authorization: Bearer rvpp_…" -H "Content-Type: application/json" \
  -d '{"gtin":"7891010793463","raio":3,"lojas":[{"codigo":"001","geohash":"6gmp0v90nd4t","precoVenda":12.99}]}' \
  http://127.0.0.1:7710/v1/picprice/ranking
```

Resposta `200 OK`:

```json
{
  "estado": "OK",
  "gtin": "7891010793463",
  "raio": 3,
  "data": -1,
  "consultadoEm": "2026-10-24T18:22:19Z",
  "lojas": [
    {
      "loja": "001",
      "geohash": "6gmp0v90nd4t",
      "totalNaArea": 55,
      "propriaLojaNaFonte": false,
      "precos": [
        { "posicao": 1, "valor": 9.99, "distanciaKm": 0.06, "ha": "há 3 horas",
          "dataHora": "2026-10-24T14:59:34.838Z", "descricao": "ABS S LIVRE ADAPT 16UN C ABAS SAUVE L" }
      ]
    }
  ],
  "lojasSemResposta": [],
  "uso": { "usado": 6, "limite": 200, "zeraEm": "2026-10-25T00:00:00-03:00" }
}
```

- `precos`: até 10 concorrentes, do mais barato para o mais caro (desempate pela distância), numerados 1..10
  **já sem a própria loja**. Nunca há nome nem endereço de concorrente.
- `totalNaArea`: quantos preços a fonte tem no raio, já descontada a própria loja.
- `lojasSemResposta`: códigos das lojas em que a fonte falhou nesta consulta.
- A posição do **seu** preço, margem e simulações são calculadas por quem chama (o SyncCompras faz isso
  com os custos do ERP).

## Estados

| `estado` | HTTP | Quando | O que fazer |
|---|---|---|---|
| `OK` | 200 | deu certo | usar |
| `REQUISICAO_INVALIDA` | 400 | JSON ou campos inválidos | corrigir o pedido |
| `ENDERECO_NAO_ENCONTRADO` | 400 | geohash: endereço fora do PR/não achado | ajustar o endereço |
| `TOKEN_INVALIDO` | 401 | token inexistente, revogado (`motivo: "revogado"`) ou de outro cliente | mostrar "Serviço inválido - token revogado"; falar com o suporte |
| `TOKEN_EXPIRADO` | 401 | token com validade vencida (`motivo: "expirado"`) | mostrar "Serviço inválido - token expirado"; pedir renovação ao suporte |
| `MODULO_DESATIVADO` | 403 | módulo `picprice` desligado no cadastro do servidor | esconder/avisar; ligar no painel da RV |
| `PROIBIDO` | 403 | chamada que não veio de 127.0.0.1 | chamar do próprio servidor |
| `LIMITE_EXCEDIDO` | 429 | mais de 120 consultas/minuto no token | esperar um pouco |
| `LIMITE_DIARIO` | 429 | cota diária do token atingida (traz `limite`, `usado`, `zeraEm`) | não repetir até `zeraEm` |
| `MANUTENCAO` | 503 | manutenção programada no painel (traz `mensagem` e `previsao`) | mostrar a mensagem |
| `FONTE_INDISPONIVEL` | 503 | a fonte de preços não respondeu ou só mandou itens falsos | tentar depois, por ação do usuário |
| `INALCANCAVEL` | 502 | o agente não falou com a plataforma da RV, ou a autorização veio inválida | tentar depois; conferir a internet do servidor |

Do lado de quem chama: conexão recusada/timeout no agente = **agente indisponível** (o SyncCompras usa
`AGENTE_INDISPONIVEL`, "Agente RV não encontrado neste servidor").

## Limites de uso (obrigatórios)

- **Só sob demanda.** Cada ranking corresponde a um item que o usuário selecionou. **Sem pré-carregamento**
  de outros itens, sem varredura, sem fila, sem rotina agendada.
- **Só as lojas do próprio cliente**, nunca consultas para terceiros.
- O agente faz **uma consulta por vez** e mantém **intervalo mínimo de 2 s** entre consultas à fonte;
  chamadas simultâneas esperam a vez.
- Cache local de **10 minutos** por EAN + loja + raio + período (repetir o mesmo item logo em seguida não
  vai à fonte, mas conta na cota, porque toda chamada é autorizada pela RV).
- Prazo de uma consulta: até ~40 s para todas as lojas; use timeout de 75 s no cliente.
- **Peça só as lojas necessárias.** Não mande todas as lojas de uma vez: o SyncCompras pede a loja que o
  usuário está vendo e, por baixo, no máximo a loja seguinte do mesmo item.
- **Guarde o resultado do dia no consumidor.** Cada chamada conta na cota diária do token. O SyncCompras
  guarda o ranking de cada loja (por EAN + loja + geohash + raio + período) em `sync.sync_picprice_cache`
  até o fim do dia (dia de São Paulo) e só chama o agente de novo quando o usuário pede para atualizar.
  O filtro de horas (`pcpr_horas`) é aplicado na leitura, sobre a menor janela da fonte que cobre o período.

## Segurança

- Escuta só em `127.0.0.1` e recusa qualquer conexão que não seja local.
- Antes de cada ranking o agente pede **autorização à plataforma da RV** (`POST /api/agente/picprice/autorizar`),
  assinando o pedido com a chave do servidor (gerada no enroll; a privada nunca sai do servidor).
  A RV confere módulo, token (tem que ser do mesmo cliente do servidor), manutenção e cota, conta a consulta e
  devolve uma autorização **assinada** (Ed25519, mesma chave do lease), válida por 90 s e amarrada ao servidor,
  ao EAN, às lojas, ao raio e ao período. O agente confere a assinatura e só então consulta a fonte.
  Alterar o agente localmente não libera consultas.
- O binário é publicado com strip e ofuscação (garble) e atualizado só por binário assinado.

## Como outro sistema deve chamar

1. Na subida (ou no "testar conexão"), `GET /v1/saude`: confirme `modulos.picprice = true`.
2. Guarde o token RV Pic Price do cliente no **backend** (nunca no front).
3. Localize cada loja uma vez com `POST /v1/picprice/geohash` e guarde o geohash no seu banco.
4. Quando o usuário selecionar um item: `POST /v1/picprice/ranking` com o EAN, as lojas (com o preço de
   venda de cada uma) e o raio. Timeout de 75 s.
5. Trate `estado` conforme a tabela. Não repita automaticamente em `LIMITE_DIARIO`, `TOKEN_INVALIDO`, `TOKEN_EXPIRADO`,
   `MODULO_DESATIVADO` nem `MANUTENCAO`.

Implementação de referência: `SyncCompras` — `com.aramo.picprice.PicPriceCliente` e
`com.aramo.rest.resource.PicPriceResource`.
