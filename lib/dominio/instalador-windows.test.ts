import { describe, expect, it } from "vitest";

import { arquivoCmdWindows, comandoInstalacaoWindows, scriptInstalacaoWindows } from "./instalador-windows";

const base = { siteUrl: "https://rv.exemplo", token: "Tok_en-123", modulos: { licenca: true, picprice: true } };

describe("instalação no Windows", () => {
  it("comando de uma linha para o Prompt de Comando", () => {
    const c = comandoInstalacaoWindows(base);
    expect(c.startsWith('powershell -NoProfile -ExecutionPolicy Bypass -Command "')).toBe(true);
    expect(c.endsWith('"')).toBe(true);
    expect(c).toContain("'https://rv.exemplo/api/agente/instalar.ps1'");
    expect(c).toContain("-Token 'Tok_en-123'");
    expect(c).toContain("-Modulos 'licenca,picprice'");
    expect(c).toContain("Tls12");
    // dentro do "..." do cmd não pode haver outra aspa dupla
    expect(c.slice(c.indexOf('"') + 1, -1)).not.toContain('"');
  });

  it("porta só entra quando informada e válida", () => {
    expect(comandoInstalacaoWindows({ ...base, porta: 7711 })).toContain("-Porta 7711");
    expect(comandoInstalacaoWindows({ ...base, porta: 0 })).not.toContain("-Porta");
    expect(comandoInstalacaoWindows({ ...base, porta: 70000 })).not.toContain("-Porta");
  });

  it("escapa aspas simples do PowerShell", () => {
    expect(comandoInstalacaoWindows({ ...base, siteUrl: "https://a'b" })).toContain("'https://a''b'");
  });

  it(".cmd se eleva pelo UAC, usa CRLF e roda o mesmo comando", () => {
    const f = arquivoCmdWindows(base);
    expect(f.split("\r\n").length).toBeGreaterThan(5);
    expect(f.replace(/\r\n/g, "")).not.toContain("\n");
    expect(f).toContain("net session");
    expect(f).toContain("-Verb RunAs");
    expect(f).toContain(comandoInstalacaoWindows(base));
    expect(f.trimEnd().endsWith("pause")).toBe(true);
    // ASCII: o console antigo do Windows troca acento por lixo
    expect(/^[\x00-\x7F]*$/.test(f)).toBe(true);
  });

  it("instalar.ps1: passos e segurança", () => {
    const s = scriptInstalacaoWindows("https://rv.exemplo");
    expect(s).toContain("[string]$Servidor = 'https://rv.exemplo'");
    expect(s).not.toContain("__SITE__");
    expect(s).toContain("&so=windows");
    expect(s).toContain("Get-FileHash -Algorithm SHA256");
    expect(s).toContain("*S-1-5-18:(OI)(CI)F");
    expect(s).toContain("*S-1-5-32-544:(OI)(CI)F");
    expect(s).toContain("/inheritance:r");
    expect(s).toContain("& $exe servico instalar");
    expect(s).toContain("Stop-Service -Name 'rvland-agent'");
    expect(s).toContain("Start-Service -Name 'rvland-agent'");
    expect(s).toContain("[switch]$Simular");
    expect(s).toContain("IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)");
    expect(/^[\x00-\x7F]*$/.test(s)).toBe(true);
    // não usa a variável automática $args do PowerShell
    expect(s).not.toMatch(/\$args\b/);
  });
});
