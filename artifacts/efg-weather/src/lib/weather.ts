import { localCalendarDay } from "./fragrance-rotation";
import { tipPhrase } from "./tip-phrases";

export type Location = { name: string; region: string; latitude: number; longitude: number; source?: "gps" | "manual" | "default" };
export type Hour = {
  time: string; temperature: number | null; apparent: number | null; humidity: number | null;
  rainProbability: number | null; rain: number | null; uv: number | null; wind: number | null; gusts: number | null; code: number | null;
};
export type Weather = {
  current: { time: string; temperature: number | null; apparent: number | null; humidity: number | null; wind: number | null; gusts: number | null; rain: number | null; code: number | null; isDay: number | null };
  hourly: Hour[];
  daily: Array<{ date: string; min: number | null; max: number | null; rainProbability: number | null; rain: number | null; uv: number | null; code: number | null }>;
  fetchedAt: string;
  timezone: string;
};

export const defaultLocation: Location = { name: "Caseros", region: "Buenos Aires", latitude: -34.60688, longitude: -58.56392 };
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const iso = (value: number) => new Date(value * 1000).toISOString();

async function request(url: string, signal?: AbortSignal) {
  const timeout = new AbortController();
  const abort = () => timeout.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 18000);
  try {
    const response = await fetch(url, { signal: timeout.signal, cache: "no-store", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error(response.status === 429 ? "La fuente está recibiendo muchas consultas. Probá de nuevo en un momento." : "No pudimos consultar la fuente meteorológica. Volvé a intentar.");
    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new Error("La consulta tardó demasiado. Revisá tu conexión y volvé a intentar.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function fetchWeather(location: Location, signal?: AbortSignal): Promise<Weather> {
  const params = new URLSearchParams({
    latitude: String(location.latitude), longitude: String(location.longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_gusts_10m",
    hourly: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,uv_index",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,uv_index_max",
    timezone: "auto", timeformat: "unixtime", forecast_days: "7",
  });
  const data = await request(`https://api.open-meteo.com/v1/forecast?${params}`, signal);
  if (data.error || !data.current || !Array.isArray(data.hourly?.time) || !Array.isArray(data.daily?.time)) {
    throw new Error("La fuente no devolvió un pronóstico válido. Probá de nuevo.");
  }
  const c = data.current;
  const h = data.hourly;
  const d = data.daily;
  return {
    current: {
      time: iso(c.time), temperature: number(c.temperature_2m), apparent: number(c.apparent_temperature),
      humidity: number(c.relative_humidity_2m), wind: number(c.wind_speed_10m), gusts: number(c.wind_gusts_10m),
      rain: number(c.precipitation), code: number(c.weather_code), isDay: number(c.is_day),
    },
    hourly: h.time.map((t: number, i: number) => ({
      time: iso(t), temperature: number(h.temperature_2m?.[i]), apparent: number(h.apparent_temperature?.[i]),
      humidity: number(h.relative_humidity_2m?.[i]), rainProbability: number(h.precipitation_probability?.[i]),
      rain: number(h.precipitation?.[i]), uv: number(h.uv_index?.[i]), wind: number(h.wind_speed_10m?.[i]), gusts: number(h.wind_gusts_10m?.[i]), code: number(h.weather_code?.[i]),
    })),
    daily: d.time.map((t: number, i: number) => ({
      date: iso(t), min: number(d.temperature_2m_min?.[i]), max: number(d.temperature_2m_max?.[i]),
      rainProbability: number(d.precipitation_probability_max?.[i]), rain: number(d.precipitation_sum?.[i]),
      uv: number(d.uv_index_max?.[i]), code: number(d.weather_code?.[i]),
    })),
    fetchedAt: new Date().toISOString(),
    timezone: typeof data.timezone === "string" ? data.timezone : "America/Argentina/Buenos_Aires",
  };
}

export async function searchLocations(query: string, signal?: AbortSignal): Promise<Location[]> {
  const normalized = query.trim().toLocaleLowerCase("es-AR");
  const name = ["caba", "capital federal"].includes(normalized) ? "Buenos Aires" : query.trim();
  if (name.length < 2) return [];
  const params = new URLSearchParams({ name, count: "12", language: "es", format: "json", countryCode: "AR" });
  const data = await request(`https://geocoding-api.open-meteo.com/v1/search?${params}`, signal);
  return (data.results ?? []).filter((r: { country_code: string }) => r.country_code === "AR").map((r: { name: string; admin1?: string; admin2?: string; latitude: number; longitude: number }) => ({
    name: r.name, region: [r.admin2, r.admin1].filter(Boolean).join(", "),
    latitude: r.latitude, longitude: r.longitude,
  }));
}

export function formatValue(value: number | null | undefined, suffix = ""): string {
  return value == null || !Number.isFinite(value) ? "No disponible" : `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}

export function conditionLabel(code: number | null): string {
  if (code == null) return "Condición no disponible";
  if (code === 0) return "Cielo despejado";
  if (code === 1) return "Mayormente despejado";
  if (code === 2) return "Parcialmente nublado";
  if (code === 3) return "Cielo nublado";
  if ([45, 48].includes(code)) return "Niebla";
  if (code >= 51 && code <= 57) return "Llovizna";
  if (code >= 61 && code <= 67) return "Lluvia";
  if (code >= 71 && code <= 77) return "Nevada";
  if (code >= 80 && code <= 82) return "Chaparrones";
  if (code >= 85 && code <= 86) return "Chaparrones de nieve";
  if (code >= 95) return "Tormenta prevista por modelo";
  return "Condición no disponible";
}

export function makeTip(weather: Weather, day = localCalendarDay(new Date(Date.now()), weather.timezone)): string {
  const c = weather.current;
  const reference = Date.parse(c.time);
  // If the app stays open across midnight, never suggest an hour from yesterday.
  const hours = weather.hourly.filter(h =>
    Date.parse(h.time) >= reference && Date.parse(h.time) < reference + 24 * 3600000 &&
    localCalendarDay(new Date(h.time), weather.timezone) >= day);
  const parts: string[] = [tipPhrase("dailyOpening", day)];
  if (c.apparent != null) {
    parts.push(tipPhrase(c.apparent < 12 ? "cold" : c.apparent < 21 ? "cool" : c.apparent < 28 ? "mild" : "hot", day));
  } else parts.push(tipPhrase("missingApparent", day));
  if (c.humidity != null && c.humidity >= 80) parts.push(tipPhrase("humidity", day, 1));
  if (c.wind != null && c.wind >= 25) parts.push(tipPhrase("wind", day, 2));
  const uv = hours.map(h => h.uv).filter((v): v is number => v != null);
  if (uv.length && Math.max(...uv) >= 3) parts.push(tipPhrase("uv", day, 3));
  const rainHour = hours.find(h => (h.rainProbability != null && h.rainProbability >= 40) || (h.rain != null && h.rain > 0.2));
  if (rainHour) {
    const date = new Date(rainHour.time);
    const weekday = new Intl.DateTimeFormat("es-AR", { weekday: "long", timeZone: weather.timezone }).format(date);
    const hour = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: weather.timezone, hour12: false }).format(date);
    parts.push(tipPhrase("rain", day, 4).replace("{when}", `${weekday} a las ${hour}`));
  } else if (!hours.some(h => h.rainProbability != null || h.rain != null)) parts.push(tipPhrase("noRainData", day, 4));
  else parts.push(tipPhrase("noRainSignal", day, 4));
  parts.push(tipPhrase("perfume", day, 5), "¡Perfúmese mucho!");
  return parts.join(" ");
}

export function fragranceAdvice(weather: Weather, profile: "Masculino" | "Femenino" | "Sin preferencia") {
  const c = weather.current;
  const warm = c.apparent != null && c.apparent >= 24;
  const humid = c.humidity != null && c.humidity >= 75;
  const wet = c.rain != null && c.rain > 0;
  const why = c.apparent == null
    ? "No hay sensación térmica disponible. Esta es una orientación general de estilo, no una selección meteorológica precisa."
    : `${warm ? "Con una sensación cálida, los perfiles frescos y ligeros pueden resultar más cómodos" : "Con esta sensación térmica, un perfil fresco con base amaderada ofrece una opción versátil"}${humid ? ". La humedad invita a moderar la aplicación" : ""}${wet ? ". Si llueve y pasás más tiempo adentro, evitá una estela invasiva" : ""}. En interiores usá poca cantidad; al aire libre no hace falta compensar el viento con más perfume. Es una sugerencia de gusto, no una regla científica.`;
  if (profile === "Femenino") return {
    family: "Cítrica, floral y amaderada", name: "Chanel Chance Eau Fraîche EDP",
    notes: { salida: "Cidra", corazon: "Jazmín", fondo: "Madera de teca" }, why,
    intensity: "Suave a moderada; más discreta en interiores.",
    source: "https://www.chanel.com/ar/perfumes/p/136150/chance-eau-fraiche-eau-de-parfum-vaporizador/",
  };
  if (profile === "Sin preferencia") return {
    family: "Amaderada fresca y salina", name: "Jo Malone Wood Sage & Sea Salt Cologne",
    notes: { salida: "Ambreta", corazon: "Sal marina", fondo: "Salvia" }, why,
    intensity: "Ligera y personal; elegí sin etiquetas de género.",
    source: "https://www.jomalone.com/scents/woody/wood-sage-sea-salt",
  };
  return {
    family: "Amaderada aromática", name: "Givenchy Gentleman Society Sport EDP",
    notes: { salida: "Limón", corazon: "Vetiver y narciso", fondo: "Cedro" }, why,
    intensity: warm || humid ? "Ligera: priorizá discreción con calor o humedad." : "Moderada, especialmente si vas a estar adentro.",
    source: "Atlas Olfativo: datos de notas suministrados por el propietario.",
  };
}
