import type { Hour, Location, Weather } from "./weather";

export function readStorage<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
export function store(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* almacenamiento no disponible */ }
}

/** Redondea a una grilla de 0,02 grados (aprox. 2 km) para no compartir posiciones exactas. */
export function roundApprox(value: number) {
  return Number((Math.round(value / 0.02) * 0.02).toFixed(2));
}

export function apiErrorMessage(error: unknown, fallback = "No pudimos completar la acción. Intentá de nuevo.") {
  if (error && typeof error === "object") {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string") return (data as { error: string }).error;
    const status = (error as { status?: number }).status;
    if (status === 429) return "Alcanzaste el límite de envíos por ahora. Probá más tarde.";
    if (status === 503) return "La base de datos no está disponible en este momento.";
    if (status === 409) return "Ya registraste esta acción.";
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) return "Estás sin conexión. Revisá tu red y volvé a intentar.";
  return error instanceof Error && error.message ? error.message : fallback;
}

export function sameLocation(a: Location, b: Location) {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

/** Partes de fecha/hora locales de un instante en la zona horaria del pronóstico. */
export function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), weekday: get("weekday") };
}

function addDay(day: string) {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);
}

export type NightOut = {
  kind: "forecast"; label: string; hours: Hour[]; expected: number; minT: number | null; maxT: number | null;
  humMin: number | null; humMax: number | null; rainMax: number | null; windMax: number | null; gustMax: number | null; missing: string[];
} | { kind: "other"; nextLabel: string } | { kind: "past" };

const range = (values: (number | null)[]) => {
  const v = values.filter((x): x is number => x != null);
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
};

/** Ventana de salida 20:00 a 03:00 locales, solo viernes y sábados, solo horas futuras del pronóstico real. */
export function nightOut(weather: Weather, now = new Date()): NightOut {
  const tz = weather.timezone;
  const today = localParts(now, tz);
  if (today.weekday !== "Fri" && today.weekday !== "Sat") {
    const offset = (({ Sun: 5, Mon: 4, Tue: 3, Wed: 2, Thu: 1 }) as Record<string, number>)[today.weekday] ?? 0;
    const next = new Date(now.getTime() + offset * 86400000);
    return { kind: "other", nextLabel: new Intl.DateTimeFormat("es-AR", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(next) };
  }
  const tomorrow = addDay(today.day);
  const nowHour = Math.floor(now.getTime() / 3600000) * 3600000;
  const inWindow = (h: Hour) => {
    const p = localParts(new Date(h.time), tz);
    return (p.day === today.day && p.hour >= 20) || (p.day === tomorrow && p.hour <= 3);
  };
  const all = weather.hourly.filter(inWindow);
  const hours = all.filter(h => Date.parse(h.time) >= nowHour);
  if (!hours.length) return { kind: "past" };
  const t = range(hours.map(h => h.temperature)); const hu = range(hours.map(h => h.humidity));
  const r = range(hours.map(h => h.rainProbability)); const w = range(hours.map(h => h.wind)); const g = range(hours.map(h => h.gusts));
  const missing: string[] = [];
  if (!t) missing.push("temperatura"); if (!hu) missing.push("humedad"); if (!r) missing.push("probabilidad de lluvia"); if (!w) missing.push("viento");
  return {
    kind: "forecast", label: today.weekday === "Fri" ? "Viernes a la noche" : "Sábado a la noche", hours, expected: 8,
    minT: t?.min ?? null, maxT: t?.max ?? null, humMin: hu?.min ?? null, humMax: hu?.max ?? null,
    rainMax: r?.max ?? null, windMax: w?.max ?? null, gustMax: g?.max ?? null, missing,
  };
}

/* ---------- Catálogo de fragancias ---------- */
export type Profile = "Masculino" | "Femenino" | "Sin preferencia";
export type Setting = "" | "interior" | "exterior" | "noche";
export type Fragrance = {
  id: string; name: string; profile: Profile; family: string;
  notes: { salida?: string; corazon?: string; fondo?: string; destacadas?: string };
  climate: Array<"calor" | "templado" | "frio">; humidOk: boolean; night: boolean;
  intensity: string; sourceLabel: string; sourceUrl?: string;
  seasons?: Array<"verano" | "otoño" | "invierno" | "primavera">;
  occasions?: Setting[];
};

let catalogPromise: Promise<Fragrance[]> | null = null;
export function loadCatalog(): Promise<Fragrance[]> {
  if (!catalogPromise) {
    catalogPromise = fetch(`${import.meta.env.BASE_URL}fragrances.json`, { cache: "no-cache" })
      .then(r => { if (!r.ok) throw new Error("catálogo"); return r.json(); })
      .then((d: { fragrances?: Fragrance[] }) => Array.isArray(d.fragrances) ? d.fragrances.filter(f => f && f.id && f.name) : [])
      .catch(err => { catalogPromise = null; throw err; });
  }
  return catalogPromise;
}

export { pickFragrances } from "./fragrance-rotation";
