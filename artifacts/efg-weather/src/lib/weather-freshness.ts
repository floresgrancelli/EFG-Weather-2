export const WEATHER_REFRESH_MS = 20 * 60000;
export function refreshDue(fetchedAt: string | undefined, lastAttempt: number, now: number) {
  const fetched = fetchedAt ? Date.parse(fetchedAt) : 0;
  return now - Math.max(Number.isFinite(fetched) ? fetched : 0, lastAttempt) >= WEATHER_REFRESH_MS;
}
export function staleWeather(fetchedAt: string | undefined, sourceTime: string | undefined, now: number) {
  if (!fetchedAt) return false;
  const age = now - Date.parse(fetchedAt);
  const sourceAge = sourceTime ? now - Date.parse(sourceTime) : 0;
  return age >= 30 * 60000 || sourceAge >= 90 * 60000;
}
