export type SkyKind = "clear" | "partly-cloudy" | "cloudy" | "drizzle" | "rain" | "thunderstorm" | "fog" | "snow" | "unknown";
export type SkyPhase = "day" | "night" | "unknown";

/** Current WMO condition only. Never infer weather/daylight from temperature or device time. */
export function currentSky(code: number | null | undefined, isDay: number | null | undefined) {
  const phase: SkyPhase = isDay === 1 ? "day" : isDay === 0 ? "night" : "unknown";
  let kind: SkyKind = "unknown";
  if (code === 0) kind = "clear";
  else if (code === 1 || code === 2) kind = "partly-cloudy";
  else if (code === 3) kind = "cloudy";
  else if (code === 45 || code === 48) kind = "fog";
  else if ([51, 53, 55, 56, 57].includes(code!)) kind = "drizzle";
  else if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code!)) kind = "rain";
  else if ([71, 73, 75, 77, 85, 86].includes(code!)) kind = "snow";
  else if ([95, 96, 99].includes(code!)) kind = "thunderstorm";
  const labels: Record<SkyKind, string> = {
    clear: "Despejado", "partly-cloudy": "Parcialmente nublado", cloudy: "Cubierto",
    drizzle: "Llovizna", rain: "Lluvia", thunderstorm: "Tormenta",
    fog: "Niebla", snow: "Nieve", unknown: "Condición actual no disponible",
  };
  return { kind, phase, label: labels[kind] };
}
