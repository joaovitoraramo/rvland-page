/**
 * O que a tela de um servidor mostra. Servidor criado pela ativação Hermes não usa módulos,
 * serviços gerenciados nem comandos do Credit/Pic Price (as actions recusam no servidor; aqui só
 * se evita oferecer o que vai ser recusado).
 */
export function capacidadesServidorPainel(e: { ehHermes: boolean; ativo: boolean; podeExecutar: boolean }): {
  mostrarModulos: boolean;
  mostrarServicos: boolean;
  mostrarComandos: boolean;
  mostrarCartaoHermes: boolean;
} {
  return {
    mostrarModulos: !e.ehHermes,
    mostrarServicos: !e.ehHermes,
    mostrarComandos: !e.ehHermes && e.ativo && e.podeExecutar,
    mostrarCartaoHermes: e.ehHermes,
  };
}
