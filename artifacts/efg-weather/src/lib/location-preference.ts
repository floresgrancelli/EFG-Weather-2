import { defaultLocation } from "./weather";
import type { Location } from "./weather";

export const LOCATION_KEY = "efg-location-preference";
export const GPS_REFRESH_MS = 15 * 60 * 1000;
export type LocationPreference = { version: 1; mode: "auto" | "manual"; lastManual: Location; prompted: boolean; approved: boolean };
export const initialPlace: Location = { ...defaultLocation, source: "default" };
type Reader = Pick<Storage, "getItem">;
export function validPlace(value: unknown): value is Location {
  const p = value as Location | null;
  return !!p && typeof p.name === "string" && p.name.length > 0 && p.name.length <= 120 &&
    typeof p.region === "string" && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
}
export function isDevicePlace(p: Location) {
  return p.source === "gps" || /^(mi ubicación|ubicación actual)$/i.test(p.name);
}
export function approximatePlace(p: Location): Location {
  return { name: p.name, region: p.region, source: p.source, latitude: Math.round(p.latitude * 50) / 50, longitude: Math.round(p.longitude * 50) / 50 };
}
export function savedPlace(p: Location): Location {
  return isDevicePlace(p) ? { ...approximatePlace(p), name: "Zona guardada", region: "Ubicación aproximada", source: "manual" } : { name: p.name, region: p.region, latitude: p.latitude, longitude: p.longitude, source: p.source === "default" ? "default" : "manual" };
}
export function loadLocationPreference(storage?: Reader): LocationPreference {
  const fresh: LocationPreference = { version: 1, mode: "auto", lastManual: initialPlace, prompted: false, approved: false };
  try {
    const p = JSON.parse(storage?.getItem(LOCATION_KEY) || "null");
    if (p?.version === 1 && ["auto", "manual"].includes(p.mode)) {
      return { version: 1, mode: p.mode, lastManual: validPlace(p.lastManual) && !isDevicePlace(p.lastManual) ? savedPlace(p.lastManual) : initialPlace, prompted: p.prompted === true, approved: p.approved === true };
    }
    const old = JSON.parse(storage?.getItem("efg-location") || "null");
    // Legacy stored city might be intentional: never silently replace it with GPS.
    if (validPlace(old) && !isDevicePlace(old)) return { ...fresh, mode: "manual", lastManual: savedPlace(old), prompted: true };
    if (validPlace(old) && isDevicePlace(old)) return { ...fresh, prompted: true, approved: true };
  } catch { /* A bad/unavailable local preference must not block weather. */ }
  return fresh;
}
export function persistLocationPreference(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, p: LocationPreference) {
  try {
    const old = JSON.parse(storage.getItem("efg-location") || "null");
    if (validPlace(old) && isDevicePlace(old)) storage.removeItem("efg-location");
  } catch { /* Do not retain valid legacy GPS if storage is writable. */ }
  storage.setItem(LOCATION_KEY, JSON.stringify({ version: 1, mode: p.mode, prompted: p.prompted, approved: p.approved, lastManual: validPlace(p.lastManual) ? savedPlace(p.lastManual) : initialPlace }));
  storage.removeItem("efg-location"); // Remove precise legacy GPS, not just stop writing new fixes.
}
export function locationKey(p: Location) {
  return `${p.latitude}:${p.longitude}`;
}
