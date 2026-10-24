/**
 * Endereço de loja no Paraná -> coordenada -> geohash, via Photon
 * (geocodificador do OpenStreetMap). bbox do PR + filtro state=Paraná,
 * porque o retângulo também pega um pedaço de SC/SP.
 */
import { geohashEncode } from "./geohash";

const PHOTON = "https://photon.komoot.io/api/";
const BBOX_PARANA = "-54.62,-26.72,-48.02,-22.52";

export type ResultadoGeohash = {
  geohash: string;
  lat: number;
  lon: number;
  endereco_encontrado: string;
};

type Feature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
};

function descrever(p: Feature["properties"]): string {
  const rua = [p.street ?? p.name, p.housenumber].filter(Boolean).join(", ");
  return [rua, p.district ?? p.locality, p.city, p.state].filter(Boolean).join(" - ");
}

export async function geocodificar(endereco: string): Promise<ResultadoGeohash | null> {
  const url = `${PHOTON}?${new URLSearchParams({ q: endereco, limit: "8", bbox: BBOX_PARANA })}`;
  const resp = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) throw new Error(`geocodificador respondeu ${resp.status}`);
  const json = (await resp.json()) as { features?: Feature[] };
  const f = (json.features ?? []).find((x) => x.properties?.state === "Paraná");
  if (!f) return null;
  const [lon, lat] = f.geometry.coordinates;
  return { geohash: geohashEncode(lat, lon, 12), lat, lon, endereco_encontrado: descrever(f.properties) };
}
