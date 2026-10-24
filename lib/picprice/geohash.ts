/**
 * Geohash padrão (alfabeto base32). Idêntico ao pacote npm "geohash" que a
 * fonte usa: normaliza lon/lat para [-100,100] e bissecciona alternando
 * lon, lat, lon... — resultado igual ao geohash clássico.
 */
const ALFABETO = "0123456789bcdefghjkmnpqrstuvwxyz";
const BITS = [16, 8, 4, 2, 1];
const meio = (i: number[]) => (i[0] + i[1]) / 2;

export function geohashEncode(lat: number, lon: number, precisao = 12): string {
  const alvo = [(lon / 180) * 100, (lat / 90) * 100];
  const intervalos = [
    [-100, 100],
    [-100, 100],
  ];
  let hash = "";
  let bit = 0;
  let ch = 0;
  let i = 0;
  while (hash.length < precisao) {
    const d = i++ % 2;
    const intervalo = intervalos[d];
    const m = meio(intervalo);
    if (alvo[d] > m) {
      ch |= BITS[bit];
      intervalo[0] = m;
    } else {
      intervalo[1] = m;
    }
    if (bit < 4) bit++;
    else {
      hash += ALFABETO[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

export function geohashDecode(hash: string): { lat: number; lon: number } {
  const intervalos = [
    [-100, 100],
    [-100, 100],
  ];
  let s = 0;
  for (const c of hash) {
    const v = ALFABETO.indexOf(c);
    if (v < 0) throw new Error("Caractere inválido no geohash: " + c);
    for (const b of BITS) {
      const intervalo = intervalos[s++ % 2];
      intervalo[v & b ? 0 : 1] = meio(intervalo);
    }
  }
  return { lat: (meio(intervalos[1]) / 100) * 90, lon: (meio(intervalos[0]) / 100) * 180 };
}

export function geohashValido(hash: string): boolean {
  return /^[0-9bcdefghjkmnpqrstuvwxyz]{5,12}$/.test(hash);
}
