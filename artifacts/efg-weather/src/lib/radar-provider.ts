export const RAIN_HOST = "https://tilecache.rainviewer.com";
export const RAIN_INDEX = "https://api.rainviewer.com/public/weather-maps.json";
export const MAX_RADAR_AGE = 2 * 3600000;
export type RadarFrame = { time: number; path: string };
export type RadarIndex = { host: string; generated: number; frames: RadarFrame[] };
export type TileIssue = { kind: "network" | "http" | "decode" | "timeout" | "rate-limit"; status?: number; retryAt?: number; local?: boolean };
export type LayerHealth = { phase: "idle" | "loading" | "ready" | "error" | "waiting"; loaded: number; pending: number; failed: number; issue?: TileIssue };
export const emptyLayer: LayerHealth = { phase: "idle", loaded: 0, pending: 0, failed: 0 };
export function recentFrame(frame: RadarFrame, now = Date.now()) {
  return Number.isInteger(frame.time) && frame.time * 1000 <= now && frame.time * 1000 >= now - MAX_RADAR_AGE;
}
export function parseRadarIndex(data: unknown, now = Date.now()): RadarIndex {
  const value = data as { host?: unknown; generated?: unknown; radar?: { past?: unknown } };
  let host: URL;
  try { host = new URL(String(value?.host)); } catch { throw new Error("RainViewer devolvió un servidor de imágenes no válido."); }
  if (host.origin !== RAIN_HOST || host.username || host.password) throw new Error("El servidor de imágenes de RainViewer no es el esperado.");
  if (typeof value.generated !== "number" || !Number.isInteger(value.generated) || value.generated * 1000 > now + 60000 || now - value.generated * 1000 > MAX_RADAR_AGE) throw new Error("El índice de RainViewer no tiene una fecha vigente. No mostramos imágenes como actuales.");
  const raw = Array.isArray(value.radar?.past) ? value.radar.past : [];
  const frames = raw.filter((f): f is RadarFrame => !!f && typeof f.path === "string" && /^\/v2\/radar\/[A-Za-z0-9_]+$/.test(f.path) && recentFrame(f, now));
  const unique = [...new Map(frames.map(f => [f.time, { time: f.time, path: f.path }])).values()].sort((a, b) => a.time - b.time);
  return { host: host.origin, generated: value.generated, frames: unique };
}
export function radarTemplate(host: string, frame: RadarFrame) {
  return `${host}${frame.path}/256/{z}/{x}/{y}/2/1_0.png`;
}
export function coverageTemplate(host: string) {
  return `${host}/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png`;
}
export function tilePoint(latitude: number, longitude: number, zoom: number) {
  const z = Math.min(7, Math.max(0, Math.floor(zoom))), n = 2 ** z;
  const lon = ((longitude + 180) % 360 + 360) % 360;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180;
  const tx = lon / 360 * n, ty = Math.max(0, Math.min(n - 1e-8, (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * n));
  return { z, x: Math.floor(tx), y: Math.floor(ty), px: Math.floor((tx % 1) * 256), py: Math.floor((ty % 1) * 256) };
}
export function pointDescription(maskAlpha: number | null, echoAlpha: number | null) {
  if (maskAlpha === null) return { kind: "unknown", title: "Cobertura sin comprobar", detail: "No podemos interpretar un área vacía mientras falta la máscara de RainViewer." };
  if (maskAlpha >= 240) return { kind: "uncovered", title: "Sin cobertura de RainViewer en este punto", detail: "El gris es la máscara de este proveedor, no la ausencia de radares en Argentina. No permite saber si está lloviendo." };
  if (maskAlpha > 15) return { kind: "unknown", title: "Borde de cobertura de RainViewer", detail: "La máscara es orientativa. Consultá las fuentes oficiales argentinas para esa zona." };
  if (echoAlpha === null) return { kind: "unknown", title: "Imagen de precipitación pendiente", detail: "Hay cobertura nominal en la máscara, pero todavía no tenemos un píxel válido de este cuadro." };
  if (echoAlpha > 0) return { kind: "echo", title: "Ecos visibles en el centro del mapa", detail: "Son ecos del mosaico observado, no una predicción ni una detección de granizo o rayos." };
  return { kind: "no-echo", title: "Sin ecos visibles en este punto y cuadro", detail: "No garantiza ausencia de precipitación: la llovizna puede no verse y la máscara no confirma que cada radar esté operativo." };
}
export function issueText(issue?: TileIssue) {
  if (issue?.kind === "rate-limit") return issue.local ? "Esperando el cupo de esta pestaña. No descartamos imágenes como si fueran fallos de red." : "RainViewer respondió HTTP 429: límite de consultas por IP. Pausamos las solicitudes.";
  if (issue?.kind === "http") return `El servidor de imágenes respondió HTTP ${issue.status}. No pudimos completar la capa.`;
  if (issue?.kind === "decode") return "La respuesta no es una imagen de radar válida o el navegador no pudo interpretarla.";
  if (issue?.kind === "timeout") return "El servidor de imágenes tardó demasiado. La capa quedó incompleta.";
  return "No pudimos descargar una imagen. Puede ser la conexión o el proveedor; no significa ausencia de lluvia.";
}
