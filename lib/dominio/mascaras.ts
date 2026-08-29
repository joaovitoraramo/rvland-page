/**
 * Máscaras progressivas dos formulários do painel.
 *
 * Todas recebem o texto cru do input (com o que o usuário digitou ou colou),
 * extraem os dígitos e devolvem o texto formatado. São puras — o componente
 * só repassa o retorno para o value.
 */

const digitos = (texto: string) => texto.replace(/\D/g, "");

/** "042026" → "04/2026" (progressivo, máx. 6 dígitos). */
export function mascararCompetencia(texto: string): string {
  const d = digitos(texto).slice(0, 6);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

/** Estilo banco: cada dígito entra pelos centavos. "150000" → "1.500,00". */
export function mascararDinheiro(texto: string): string {
  const d = digitos(texto).replace(/^0+(?=\d)/, "");
  if (d === "") return "";
  const centavos = d.padStart(3, "0");
  const inteiro = centavos.slice(0, -2);
  const decimais = centavos.slice(-2);
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${comMilhar},${decimais}`;
}

/** CPF até 11 dígitos, CNPJ do 12º em diante (máx. 14). */
export function mascararDocumento(texto: string): string {
  const d = digitos(texto).slice(0, 14);

  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }

  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

/** "(41) 8489-1365" (10 dígitos) ou "(41) 98489-1365" (11). */
export function mascararTelefone(texto: string): string {
  const d = digitos(texto).slice(0, 11);
  if (d === "") return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  if (resto.length <= 8) return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
  return `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`;
}

/** Estilo banco US: cada dígito entra pelos centavos. "149700" → "1,497.00". */
export function mascararDinheiroUS(texto: string): string {
  const d = digitos(texto).replace(/^0+(?=\d)/, "");
  if (d === "") return "";
  const centavos = d.padStart(3, "0");
  const inteiro = centavos.slice(0, -2);
  const decimais = centavos.slice(-2);
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${comMilhar}.${decimais}`;
}
