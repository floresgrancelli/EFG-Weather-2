/** Only coarse geography is retained, never people, device IDs or exact GPS.
 * Public Nominatim: explicit user requests only, identified UA, bounded cache,
 * globally serialized via PostgreSQL. Not a general address/search service.
 */
export type PlaceLabel = { name: string; region: string; level: "locality" | "jurisdiction" | "unavailable"; source: string };
export const UNKNOWN_PLACE: PlaceLabel = { name: "Ubicación actual", region: "", level: "unavailable", source: "" };
const clean = (value: unknown) => typeof value === "string" ? value.replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 100) : "";
export function georefLabel(value: unknown): PlaceLabel {
  const data = value as { ubicacion?: { provincia?: { nombre?: string }; departamento?: { nombre?: string }; municipio?: { nombre?: string }; gobierno_local?: { nombre?: string } } };
  const u = data?.ubicacion;
  const region = clean(u?.provincia?.nombre);
  const name = clean(u?.gobierno_local?.nombre || u?.municipio?.nombre || u?.departamento?.nombre);
  return name && region ? { name, region, level: "jurisdiction", source: "Georef" } : UNKNOWN_PLACE;
}
export function osmLabel(value: unknown, official: PlaceLabel): PlaceLabel {
  const data = value as { address?: Record<string, string> };
  const a = data?.address;
  if (!a) return official;
  // Never use neighbourhood, road, building, POI or display_name as a city.
  const cityIsJurisdiction = clean(a.city).toLocaleLowerCase("es") === official.name.toLocaleLowerCase("es");
  const name = clean(a.town || a.village || (cityIsJurisdiction ? a.suburb || a.city : a.city || a.suburb) || a.hamlet);
  const region = official.region || clean(a.state || a.region || a.country);
  if (!name || !region) return official;
  return { name, region, level: "locality", source: official.level === "jurisdiction" ? "Georef · OpenStreetMap" : "OpenStreetMap" };
}
const cache = new Map<string, { until: number; value: PlaceLabel }>();
export const coarsePoint = (lat: number, lon: number) => ({ lat: Number(lat.toFixed(3)), lon: Number(lon.toFixed(3)) });
const keyOf = (lat: number, lon: number) => `${lat.toFixed(3)},${lon.toFixed(3)}`;
export function cachedLabel(lat: number, lon: number) {
  const hit = cache.get(keyOf(lat, lon));
  return hit && hit.until > Date.now() ? hit.value : undefined;
}
export function cacheLabel(lat: number, lon: number, value: PlaceLabel) {
  if (cache.size >= 128) cache.delete(cache.keys().next().value!);
  cache.set(keyOf(lat, lon), { until: Date.now() + 10 * 60000, value });
}
setInterval(() => { for (const [key, entry] of cache) if (entry.until <= Date.now()) cache.delete(key); }, 60000).unref();
