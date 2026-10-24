/**
 * Instalação do agente no Windows, sem depender do usuário para criar nada:
 *  - comandoInstalacaoWindows: uma linha para o Prompt de Comando aberto como
 *    administrador (baixa o instalar.ps1 do painel e executa com o token);
 *  - arquivoCmdWindows: o mesmo, num instalar-agente-rv.cmd que se eleva pelo
 *    UAC com dois cliques (gerado no navegador, o token não passa pela URL);
 *  - scriptInstalacaoWindows: o instalar.ps1 servido em /api/agente/instalar.ps1.
 *
 * Os textos do script são ASCII de propósito: o console do Windows antigo
 * troca acentos por lixo.
 */
import { listaModulos, type ModulosServidor } from "./agente-modulos";

/** Aspas simples do PowerShell ('' escapa '). */
function aspasPS(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

type ParamsInstalacao = { siteUrl: string; token: string; modulos: ModulosServidor; porta?: number };

/** Só a parte PowerShell (vai dentro do -Command "..."). */
function comandoPS(p: ParamsInstalacao): string {
  const args = [
    `-Token ${aspasPS(p.token)}`,
    `-Servidor ${aspasPS(p.siteUrl)}`,
    `-Modulos ${aspasPS(listaModulos(p.modulos))}`,
  ];
  if (p.porta && p.porta > 0 && p.porta < 65536) args.push(`-Porta ${Math.trunc(p.porta)}`);
  return (
    "[Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12; " +
    `& ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing -Uri ${aspasPS(`${p.siteUrl}/api/agente/instalar.ps1`)}).Content)) ` +
    args.join(" ")
  );
}

/** Uma linha para colar no Prompt de Comando (cmd) aberto como administrador. */
export function comandoInstalacaoWindows(p: ParamsInstalacao): string {
  return `powershell -NoProfile -ExecutionPolicy Bypass -Command "${comandoPS(p)}"`;
}

/**
 * Conteúdo do instalar-agente-rv.cmd (CRLF). Com dois cliques: se não estiver
 * como administrador, pede elevação pelo UAC e roda de novo; depois executa a
 * mesma instalação do comando de uma linha e espera uma tecla no fim.
 */
export function arquivoCmdWindows(p: ParamsInstalacao): string {
  const linhas = [
    "@echo off",
    "setlocal",
    "title Instalar agente RV",
    "rem Instalador do agente RVLand para Windows, gerado pelo painel.",
    "rem O token e de uso unico e vale 24h. Nao compartilhe este arquivo.",
    "net session >nul 2>&1",
    "if %errorlevel% neq 0 (",
    "  echo Pedindo permissao de administrador...",
    `  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"`,
    "  exit /b",
    ")",
    comandoInstalacaoWindows(p),
    "echo.",
    "pause",
  ];
  return linhas.join("\r\n") + "\r\n";
}

export const NOME_ARQUIVO_CMD = "instalar-agente-rv.cmd";

/**
 * instalar.ps1 (PowerShell 5.1+). Idempotente: reinstalar por cima para o
 * serviço, troca o exe, refaz o enroll e o serviço. -Simular só descreve os
 * passos que mudam o sistema (os downloads e a conferência acontecem).
 */
export function scriptInstalacaoWindows(siteUrl: string): string {
  return String.raw`param(
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$Servidor = '__SITE__',
  [string]$Modulos = '',
  [string]$Versao = 'latest',
  [int]$Porta = 0,
  [string]$Driver = 'scm',
  [switch]$Simular
)
# Instalador do agente RVLand para Windows (gerado por __SITE__/api/agente/instalar.ps1)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

function Info([string]$m) { Write-Host ('rvland: ' + $m) }
function Falha([string]$m) { Write-Host ('rvland: ERRO - ' + $m) -ForegroundColor Red; exit 1 }
function Fazer([string]$descricao, [scriptblock]$acao) {
  if ($Simular) { Write-Host ('[simulacao] ' + $descricao); return }
  Info $descricao
  & $acao
}

try {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $Simular -and -not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Falha 'abra o Prompt de Comando (ou o PowerShell) como administrador e rode de novo.'
  }

  $arq = $env:PROCESSOR_ARCHITEW6432
  if (-not $arq) { $arq = $env:PROCESSOR_ARCHITECTURE }
  switch ($arq) {
    'AMD64' { $A = 'amd64' }
    'ARM64' { $A = 'arm64' }
    default { Falha ('arquitetura nao suportada: ' + $arq) }
  }

  $Servidor = $Servidor.TrimEnd('/')
  $dirProg = Join-Path $env:ProgramFiles 'RVLand'
  $exe = Join-Path $dirProg 'agenterv.exe'
  $dirDados = Join-Path $env:ProgramData 'rvland'
  if ($Modulos) { Info ('modulos pedidos: ' + $Modulos + ' (vale o cadastro do servidor no painel)') }

  Info ('consultando a versao ' + $Versao + ' (' + $A + ')...')
  $meta = Invoke-RestMethod -UseBasicParsing -Uri ($Servidor + '/api/agente/release?versao=' + $Versao + '&arch=' + $A + '&so=windows')
  if (-not $meta.sha256) { Falha 'nao ha release do agente para Windows publicada no painel.' }

  $tmp = Join-Path $env:TEMP ('agenterv-' + [guid]::NewGuid().ToString() + '.exe')
  Info ('baixando o agente ' + $meta.versao + '...')
  Invoke-WebRequest -UseBasicParsing -Uri ($Servidor + '/api/agente/binario?versao=' + $meta.versao + '&arch=' + $A + '&so=windows') -OutFile $tmp
  $hash = (Get-FileHash -Algorithm SHA256 -Path $tmp).Hash.ToLower()
  if ($hash -ne ([string]$meta.sha256).ToLower()) {
    Remove-Item -Force $tmp
    Falha 'o SHA-256 do download nao confere com a release. Nada foi instalado.'
  }
  Info 'SHA-256 conferido.'

  # Pasta de dados: so SYSTEM (S-1-5-18) e Administradores (S-1-5-32-544).
  # SIDs em vez de nomes: funciona em Windows de qualquer idioma.
  Fazer ('preparando ' + $dirDados + ' (acesso so de SYSTEM e Administradores)') {
    New-Item -ItemType Directory -Force -Path $dirDados | Out-Null
    & icacls.exe $dirDados /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'icacls falhou ao proteger a pasta de dados' }
  }

  # Reinstalar por cima: para o servico atual antes de trocar o exe.
  $atual = Get-Service -Name 'rvland-agent' -ErrorAction SilentlyContinue
  if ($atual -and $atual.Status -ne 'Stopped') {
    Fazer 'parando o servico rvland-agent atual' {
      Stop-Service -Name 'rvland-agent' -Force
      $atual.WaitForStatus('Stopped', (New-TimeSpan -Seconds 60))
    }
  }

  Fazer ('instalando em ' + $exe) {
    New-Item -ItemType Directory -Force -Path $dirProg | Out-Null
    Copy-Item -Force -Path $tmp -Destination $exe
    Remove-Item -Force -ErrorAction SilentlyContinue ($exe + '.old'), ($exe + '.falhou'), ($exe + '.novo')
  }

  Fazer 'registrando o servidor no painel (enroll)' {
    $argsEnroll = @('enroll', ('--token=' + $Token), ('--servidor=' + $Servidor), ('--driver=' + $Driver))
    if ($Porta -gt 0) { $argsEnroll += ('--porta=' + $Porta) }
    & $exe @argsEnroll
    if ($LASTEXITCODE -ne 0) { throw 'o enroll falhou: o token pode ter vencido ou ja ter sido usado. Gere outro no painel.' }
  }

  Fazer 'registrando o servico do Windows rvland-agent (inicio automatico, reinicia em falha)' {
    & $exe servico instalar
    if ($LASTEXITCODE -ne 0) { throw 'nao consegui registrar o servico rvland-agent' }
  }

  Fazer 'iniciando o servico' {
    Start-Service -Name 'rvland-agent'
    (Get-Service -Name 'rvland-agent').WaitForStatus('Running', (New-TimeSpan -Seconds 30))
  }

  Remove-Item -Force -ErrorAction SilentlyContinue $tmp
  Info 'pronto. Agente instalado e rodando como servico do Windows.'
  Info 'A API local do RV Pic Price escuta so em 127.0.0.1: nao precisa abrir o firewall.'
  if (-not $Simular) { & $exe status }
} catch {
  Falha $_.Exception.Message
}
`.replaceAll("__SITE__", siteUrl.replace(/'/g, "''"));
}
