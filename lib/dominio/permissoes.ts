/**
 * Catálogo de permissões da plataforma.
 *
 * Permissões vivem SEMPRE em grupos (nunca por usuário). O grupo com
 * `todasPermissoes` (Dono) passa em qualquer verificação, inclusive de
 * permissões criadas no futuro. As áreas de Fase 2 (servidores, agente)
 * já existem no catálogo para os grupos serem configuráveis desde já.
 */

export const PERMISSOES = [
  { chave: "clientes.ver", rotulo: "Ver clientes", area: "Clientes" },
  { chave: "clientes.criar", rotulo: "Cadastrar clientes", area: "Clientes" },
  { chave: "clientes.editar", rotulo: "Editar clientes", area: "Clientes" },
  { chave: "clientes.arquivar", rotulo: "Arquivar clientes", area: "Clientes" },

  { chave: "contratos.ver", rotulo: "Ver contratos (inclui valores)", area: "Contratos" },
  { chave: "contratos.criar", rotulo: "Criar contratos", area: "Contratos" },
  { chave: "contratos.editar", rotulo: "Editar contratos", area: "Contratos" },
  { chave: "contratos.encerrar", rotulo: "Encerrar contratos", area: "Contratos" },

  { chave: "financeiro.ver", rotulo: "Ver valores e faturas", area: "Financeiro" },
  { chave: "financeiro.lancar_pagamento", rotulo: "Lançar pagamentos", area: "Financeiro" },
  { chave: "financeiro.editar_cobranca", rotulo: "Editar/cancelar cobranças", area: "Financeiro" },
  { chave: "financeiro.alterar_preco", rotulo: "Alterar preço (vigências)", area: "Financeiro" },

  { chave: "licencas.ver", rotulo: "Ver status de licenças", area: "Licenças" },
  { chave: "licencas.conceder_confianca", rotulo: "Conceder dias de confiança", area: "Licenças" },
  { chave: "licencas.bloquear", rotulo: "Bloquear manualmente", area: "Licenças" },
  { chave: "licencas.desbloquear", rotulo: "Desbloquear", area: "Licenças" },

  { chave: "servidores.ver", rotulo: "Ver servidores", area: "Servidores" },
  { chave: "servidores.cadastrar", rotulo: "Cadastrar / revogar servidores", area: "Servidores" },
  { chave: "servidores.editar", rotulo: "Gerenciar serviços do servidor", area: "Servidores" },
  { chave: "servidores.executar", rotulo: "Executar comandos (start/stop)", area: "Servidores" },
  { chave: "servidores.manutencao", rotulo: "Janela de manutenção", area: "Servidores" },

  { chave: "agente.publicar", rotulo: "Publicar release do agente (Fase 2)", area: "Agente" },
  { chave: "agente.forcar_update", rotulo: "Forçar update do agente (Fase 2)", area: "Agente" },

  { chave: "plataforma.panico", rotulo: "Botão de pânico (suspender bloqueios)", area: "Plataforma" },
  { chave: "plataforma.simulacao", rotulo: "Modo simulação", area: "Plataforma" },
  { chave: "plataforma.usuarios", rotulo: "Gerenciar usuários", area: "Plataforma" },
  { chave: "plataforma.grupos", rotulo: "Gerenciar grupos", area: "Plataforma" },
  { chave: "plataforma.auditoria", rotulo: "Ver auditoria", area: "Plataforma" },
] as const;

export type Permissao = (typeof PERMISSOES)[number]["chave"];

export type PerfilPermissoes = {
  todasPermissoes: boolean;
  permissoes: Set<string>;
};

export function temPermissao(perfil: PerfilPermissoes, permissao: Permissao): boolean {
  if (perfil.todasPermissoes) return true;
  return perfil.permissoes.has(permissao);
}

export function permissoesPorArea(): Record<string, { chave: Permissao; rotulo: string }[]> {
  const areas: Record<string, { chave: Permissao; rotulo: string }[]> = {};
  for (const p of PERMISSOES) {
    (areas[p.area] ??= []).push({ chave: p.chave, rotulo: p.rotulo });
  }
  return areas;
}
