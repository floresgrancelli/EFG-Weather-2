import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { georefLabel, osmLabel, UNKNOWN_PLACE, coarsePoint, cacheLabel, cachedLabel } from "../../artifacts/api-server/src/lib/reverse-location.ts";
import { refreshDue, staleWeather, WEATHER_REFRESH_MS } from "../../artifacts/efg-weather/src/lib/weather-freshness.ts";

test("Georef confirms jurisdiction, never fabricates Caseros", () => {
  const official = georefLabel({ ubicacion: { gobierno_local: { nombre: "Tres de Febrero" }, provincia: { nombre: "Buenos Aires" } } });
  assert.deepEqual(official, { name: "Tres de Febrero", region: "Buenos Aires", level: "jurisdiction", source: "Georef" });
  assert.deepEqual(georefLabel({ ubicacion: { provincia: { nombre: null } } }), UNKNOWN_PLACE);
  assert.equal(georefLabel({ ubicacion: { municipio: { nombre: "Merlo" }, provincia: { nombre: "Buenos Aires" } } }).name, "Merlo");
});
test("OSM locality does not mistake municipality for Caseros", () => {
  const official = { name: "Tres de Febrero", region: "Buenos Aires", level: "jurisdiction", source: "Georef" };
  assert.equal(osmLabel({ address: { city: "Tres de Febrero", suburb: "Caseros" } }, official).name, "Caseros");
  assert.equal(osmLabel({ address: { road: "Avenida", house_number: "123" } }, official), official);
  assert.equal(osmLabel({ address: { town: "Caseros" } }, official).region, "Buenos Aires");
});
test("International labels have a truthful fallback and no street address", () => {
  assert.equal(osmLabel({ address: { city: "Montevideo", state: "Montevideo" } }, UNKNOWN_PLACE).name, "Montevideo");
  assert.deepEqual(osmLabel({}, UNKNOWN_PLACE), UNKNOWN_PLACE);
});
test("Coarse geographic cache is bounded in time and not GPS history", () => {
  const { lat, lon } = coarsePoint(-34.6037123, -58.5638123);
  assert.equal(lat, -34.604); assert.equal(lon, -58.564);
  cacheLabel(lat, lon, { name: "Caseros", region: "Buenos Aires", level: "locality", source: "OpenStreetMap" });
  assert.equal(cachedLabel(lat, lon).name, "Caseros");
  const original = Date.now;
  try { Date.now = () => original() + 11 * 60000; assert.equal(cachedLabel(lat, lon), undefined); }
  finally { Date.now = original; }
});
test("Visible weather cadence backs off failed requests and detects stale source data", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");
  assert.equal(WEATHER_REFRESH_MS, 20 * 60000);
  assert.equal(refreshDue(new Date(now - 19 * 60000).toISOString(), 0, now), false);
  assert.equal(refreshDue(new Date(now - 21 * 60000).toISOString(), 0, now), true);
  assert.equal(refreshDue(undefined, now - 60000, now), false);
  assert.equal(staleWeather(new Date(now - 31 * 60000).toISOString(), undefined, now), true);
  assert.equal(staleWeather(new Date(now).toISOString(), new Date(now - 91 * 60000).toISOString(), now), true);
  assert.equal(staleWeather(undefined, undefined, now), false);
});
test("Radar cannot be mounted or linked from main navigation or More", () => {
  const app = readFileSync(new URL("../../artifacts/efg-weather/src/App.tsx", import.meta.url), "utf8");
  const more = readFileSync(new URL("../../artifacts/efg-weather/src/pages/MorePage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /RadarPage|Radar y alertas/);
  assert.doesNotMatch(more, /href="[^"]*(?:rainviewer|sinarame|ws2\.smn)/);
  assert.match(more, /https:\/\/www.smn.gob.ar\/alertas/);
  assert.match(more, /Licencia comercial pendiente/);
});
