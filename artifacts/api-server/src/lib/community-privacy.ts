import { createHash } from "node:crypto";

export const reportCategories = ["hail", "rain", "flood", "wind", "other"] as const;
export const reportLifetimeMinutes = { hail: 45, rain: 60, flood: 180, wind: 30, other: 60 };
export function approximate(value: number): number {
  return Math.round(value * 50) / 50;
}
export function normalizePerfume(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR")
    .replace(/[’‘`]/g, "'").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
export function argentinaDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function seasonInArgentina(date: Date): string {
  const month = Number(new Intl.DateTimeFormat("en", { timeZone: "America/Argentina/Buenos_Aires", month: "numeric" }).format(date));
  return month >= 9 && month <= 11 ? "primavera" : month === 12 || month <= 2 ? "verano" : month <= 5 ? "otoño" : "invierno";
}
