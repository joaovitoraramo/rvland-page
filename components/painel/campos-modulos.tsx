import type { ModulosServidor } from "@/lib/dominio/agente-modulos";

/** Checkboxes dos módulos do agente (moduloLicenca / moduloPicprice). */
export function CamposModulos({ valor }: { valor: ModulosServidor }) {
  const itens: { nome: string; titulo: string; texto: string; marcado: boolean }[] = [
    {
      nome: "moduloLicenca",
      titulo: "Licença",
      texto: "Aplica a licença do cliente: para e religa os serviços licenciados conforme o pagamento.",
      marcado: valor.licenca,
    },
    {
      nome: "moduloPicprice",
      titulo: "RV Pic Price",
      texto: "Sobe a API local do RV Pic Price em 127.0.0.1, usada pelo Hermes/SyncCompras do cliente.",
      marcado: valor.picprice,
    },
  ];
  return (
    <div className="space-y-3">
      {itens.map((i) => (
        <label key={i.nome} className="flex cursor-pointer items-start gap-2.5 text-sm text-white/70 transition-colors hover:text-white">
          <input type="checkbox" name={i.nome} defaultChecked={i.marcado} className="mt-1" />
          <span>
            <span className="font-medium text-white/85">{i.titulo}</span>
            <span className="block text-xs text-white/45">{i.texto}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
