# Instalar o agente RV no Windows

Guia curto para instalar o agente RVLand num servidor Windows do cliente (por exemplo, onde o WildFly roda como serviço do Windows).

## Antes de começar

- O servidor precisa rodar Windows Server 2012 R2 ou mais novo, ou Windows 10 ou mais novo, com PowerShell 5.1, que já vem no sistema.
- Você precisa de um usuário administrador do servidor.
- O servidor precisa acessar o painel da RV por HTTPS (porta 443 de saída). Não é preciso abrir nenhuma porta de entrada: a API local do RV Pic Price escuta só em `127.0.0.1`.

## Passo a passo

1. No painel da RV, em **Servidores**, cadastre o servidor e marque os módulos: **Licença**, **RV Pic Price** ou os dois.
2. Gere o token de instalação. Ele vale 24 horas e só pode ser usado uma vez.
3. Na área de instalação, escolha a aba **Windows**. Há duas formas, e as duas fazem a mesma coisa:
   - **Comando:** abra o Prompt de Comando **como administrador** no servidor, cole o comando e pressione Enter.
   - **Arquivo:** clique em **Baixar instalador (.cmd)**, copie o arquivo para o servidor, dê dois cliques e confirme o pedido de administrador.
4. No fim, o instalador mostra o status do agente. Pronto.

O instalador faz tudo sozinho:

- baixa o `agenterv.exe` da arquitetura certa e confere o SHA-256;
- protege `C:\ProgramData\rvland`, deixando acesso só para SYSTEM e Administradores;
- instala em `C:\Program Files\RVLand`;
- registra o servidor no painel;
- cria o serviço do Windows `rvland-agent`, com início automático e reinício em caso de falha, e o inicia.

## Serviço licenciado (módulo Licença)

No cadastro do servidor, informe o **nome do serviço no Gerenciador de Serviços**, por exemplo `wildfly`. Depois do primeiro contato, o painel mostra os serviços encontrados no servidor para você escolher.

Se o nome não existir, o painel mostra **não encontrado** e o agente não desliga nada.

| Licença | O que o agente faz com o serviço |
|---|---|
| Vencida | desativa o início e para o serviço |
| Em dia de novo | volta o início automático e sobe o serviço |

## Conferir

No Prompt de Comando como administrador:

```
sc query rvland-agent
"C:\Program Files\RVLand\agenterv.exe" status
"C:\Program Files\RVLand\agenterv.exe" logs
```

O log fica em `C:\ProgramData\rvland\logs\agent.log`.

## Reinstalar ou trocar de servidor

Gere um token novo no painel, com **Regenerar token**, e rode a instalação de novo por cima. O instalador para o serviço, troca o executável e refaz o registro.

## Remover

```
"C:\Program Files\RVLand\agenterv.exe" servico remover
rmdir /s /q "C:\Program Files\RVLand"
rmdir /s /q "C:\ProgramData\rvland"
```

No painel, revogue o servidor.

## Problemas comuns

| Mensagem (o instalador escreve sem acentos) | O que fazer |
|---|---|
| "abra o Prompt de Comando como administrador" | Clique com o botão direito no Prompt de Comando, escolha **Executar como administrador** e rode de novo. |
| "o enroll falhou: o token pode ter vencido ou ja ter sido usado" | Gere outro token no painel e rode de novo. |
| "nao ha release do agente para Windows publicada no painel" | A versão do agente para Windows ainda não foi publicada. Fale com a RV. |
| "o SHA-256 do download nao confere" | O download veio corrompido ou alterado. Nada foi instalado. Rode de novo; se repetir, fale com a RV. |
| Antivírus bloqueou o `agenterv.exe` | Libere `C:\Program Files\RVLand\agenterv.exe` no antivírus. O executável é assinado pela RV e conferido a cada atualização. |
