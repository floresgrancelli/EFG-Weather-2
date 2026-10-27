import type { Fragrance, Profile, Setting } from "./extras";
import type { Weather } from "./weather";

export type DailyChoice = { key: string; day: string; id: string };
export type RotationOptions = {
  now?: Date; latitude?: number; placement?: "interior" | "exterior";
  slot?: "day" | "night-out";
  records?: readonly DailyChoice[];
};
export const ROTATION_STORAGE = "efg-fragrance-days-v1";
const DAY_MS = 86400000;
export function localCalendarDay(now: Date, timezone: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (key: string) => p.find(x => x.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
const ordinal = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

/** Binary search the next local calendar boundary, including DST's 23/25-hour days. */
export function nextLocalDayDelay(now: number, timezone: string) {
  const today = localCalendarDay(new Date(now), timezone);
  let lo = now, hi = now + 27 * 3600000;
  while (hi - lo > 1) {
    const mid = Math.floor((hi + lo) / 2);
    if (localCalendarDay(new Date(mid), timezone) === today) lo = mid; else hi = mid;
  }
  return Math.max(1, hi - now);
}
function stableHash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** Only date, opaque context key and catalog ID. Never coordinates, names or weather. */
export function validDailyChoices(value: unknown): DailyChoice[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-1024).filter((x): x is DailyChoice =>
    x && typeof x.key === "string" && /^[0-9a-f]{1,8}$/.test(x.key) &&
    typeof x.id === "string" && /^[a-z0-9-]{1,120}$/.test(x.id) &&
    typeof x.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.day) &&
    Number.isFinite(ordinal(x.day)));
}
export function recordDailyChoice(records: readonly DailyChoice[], choice: DailyChoice) {
  const date = ordinal(choice.day);
  const unique = new Map<string, DailyChoice>();
  for (const x of [...records, choice]) {
    if (date - ordinal(x.day) >= -1 && date - ordinal(x.day) <= 30) unique.set(`${x.key}|${x.day}`, x);
  }
  return [...unique.values()].slice(-1024);
}

/** Weather gates the pool; a calendar wheel rotates ALL eligible references, not only score ties.
 * Today's stored ID wins while still compatible. If weather disqualifies it, safety/style fit wins.
 * Fifteen-day history avoids repetition across pool/season changes, without a server or tracking.
 */
export function pickFragrances(catalog: Fragrance[], weather: Weather, profile: Profile, setting: Setting, options: RotationOptions = {}) {
  const day = localCalendarDay(options.now ?? new Date(Date.now()), weather.timezone);
  const dayNumber = ordinal(day), c = weather.current;
  const band = c.apparent == null ? null : c.apparent >= 24 ? "calor" : c.apparent < 14 ? "frio" : "templado";
  const humid = c.humidity != null && c.humidity >= 75;
  const reference = Date.parse(c.time);
  const rainHours = setting === "noche" ? weather.hourly : weather.hourly.filter(h =>
    Date.parse(h.time) >= reference && Date.parse(h.time) < reference + 6 * 3600000);
  const wet = (c.rain != null && c.rain > 0) || rainHours.some(h => h.rainProbability != null && h.rainProbability >= 40);
  const latitude = options.latitude;
  const hemisphere = latitude == null ? "unknown" : latitude < 0 ? "south" : "north";
  // Calendar season is only an editorial extra; real apparent temperature remains primary.
  const quarter = Math.floor((Number(day.slice(5, 7)) % 12) / 3);
  const season = latitude == null || Math.abs(latitude) < 23 ? null :
    (hemisphere === "south" ? ["verano", "otoño", "invierno", "primavera"] : ["invierno", "primavera", "verano", "otoño"])[quarter] as NonNullable<Fragrance["seasons"]>[number];
  const space = options.placement ?? (setting === "exterior" ? "exterior" : "interior");
  const base = `${weather.timezone}|${hemisphere}|${profile}|${setting}|${space}|${options.slot ?? "day"}`;
  const key = stableHash(base).toString(16);
  const seen = new Set<string>();
  const pool = catalog.filter(f => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return (profile === "Sin preferencia" || f.profile === profile || f.profile === "Sin preferencia") &&
      (!band || f.climate.includes(band)) && (!(humid || wet) || f.humidOk) &&
      (!season || !f.seasons || f.seasons.includes(season)) &&
      (!f.occasions || f.occasions.includes(setting));
  }).sort((a, b) => {
    const score = (f: Fragrance) => Number(f.profile === profile) + (setting === "noche" && f.night ? 2 : 0);
    return score(b) - score(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const records = validDailyChoices(options.records ?? []);
  // Hold previous choices across all settings and weather categories for 15 days.
  // Never persist locations or any meteorological measurements.
  const recent = records.filter(r => dayNumber - ordinal(r.day) >= 1 && dayNumber - ordinal(r.day) <= 15);
  const used = new Set(recent.map(r => r.id));
  const today = records.findLast(r => r.key === key && r.day === day);
  const offset = pool.length ? (dayNumber + stableHash(base)) % pool.length : 0;
  const wheel = [...pool.slice(offset), ...pool.slice(0, offset)];
  const fresh = wheel.filter(f => !used.has(f.id));
  // Today's saved pick is stable while climate compatible. If the climate
  // changes and makes it incompatible, select another *unused* reference.
  const top = pool.find(f => f.id === today?.id && !used.has(f.id)) ?? fresh[0] ?? null;
  const why = [
    top ? `${top.name}: una referencia de familia ${top.family.toLocaleLowerCase("es")}.` : "No hay referencias compatibles disponibles.",
    band == null ? "Sin sensación térmica disponible: solo podemos orientar sobre estilo, no sobre compatibilidad meteorológica." :
      `Con ${Math.round(c.apparent!)}° de sensación, ${band === "calor" ? "priorizamos perfiles livianos" : band === "frio" ? "buscamos comodidad sin exigir una estela pesada" : "elegimos un perfil versátil"}.`,
    humid ? "La humedad alta invita a aplicar menos." : "",
    wet ? "Hay lluvia o probabilidad de lluvia: preferimos una presencia discreta, especialmente si terminás adentro." : "",
    setting === "noche" ? "Para la salida nocturna, acompañá el ambiente sin invadir." : "",
    space === "exterior" ? "Al aire libre no compenses el viento aplicando más." : "En interiores, mantené una intensidad discreta.",
    top?.intensity ?? "",
    "La compatibilidad y la estación son criterios editoriales, no una regla científica.",
  ].filter(Boolean).join(" ");
  return {
    top, alternatives: fresh.filter(f => f.id !== top?.id).slice(0, 2), why, band, day, key, season,
    rotationKey: `${day}|${key}|${band ?? "unknown"}|${humid}|${wet}|${season ?? "unknown"}`,
    candidateCount: pool.length,
    limitation: !pool.length ? "No hay una referencia compatible; no elegimos otra solo para completar la tarjeta." :
      !fresh.length ? "No quedan perfumes compatibles sin repetir los últimos 15 días. Preferimos no inventar una recomendación." :
      fresh.length === 1 ? "Queda una referencia compatible sin utilizar en los últimos 15 días." : null,
  };
}
