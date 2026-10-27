import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
// Node strips TS; resolve this Vite-style extensionless import to the same real source.
registerHooks({ resolve(specifier, context, next) {
  return next(specifier === "./weather" && context.parentURL?.endsWith("/location-preference.ts") ? "./weather.ts" : specifier, context);
} });
const { LOCATION_KEY, GPS_REFRESH_MS, approximatePlace, initialPlace, loadLocationPreference, locationKey, persistLocationPreference, savedPlace, validPlace } = await import("../../artifacts/efg-weather/src/lib/location-preference.ts");

const city = { name: "San Isidro", region: "Buenos Aires", latitude: -34.4708, longitude: -58.5286 };
// Public test coordinates, not a person's location.
const device = { name: "Ubicación actual", region: "Ubicación del dispositivo", latitude: -34.481237, longitude: -58.517842, source: "gps" };
const storage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k), data };
};
test("first visit is automatic but initial Caseros is explicitly not GPS", () => {
  const p = loadLocationPreference(storage());
  assert.equal(p.mode, "auto"); assert.equal(p.prompted, false); assert.equal(p.approved, false);
  assert.equal(p.lastManual.source, "default"); assert.equal(p.lastManual.name, "Caseros");
});
test("existing city choices migrate to manual and are not overwritten", () => {
  const p = loadLocationPreference(storage({ "efg-location": JSON.stringify(city) }));
  assert.equal(p.mode, "manual"); assert.equal(p.lastManual.name, city.name);
  assert.equal(locationKey(p.lastManual), locationKey(city));
});
test("legacy GPS is never restored as a fresh fix, and precise storage is removed", () => {
  const s = storage({ "efg-location": JSON.stringify({ ...device, name: "Mi ubicación" }) });
  const p = loadLocationPreference(s);
  assert.equal(p.mode, "auto"); assert.equal(p.lastManual.source, "default");
  persistLocationPreference(s, p);
  assert.equal(s.getItem("efg-location"), null);
  assert.ok(!s.getItem(LOCATION_KEY).includes(String(device.latitude)));
});
test("only mode, consent and last manual choice survive reload", () => {
  const s = storage();
  const p = { version: 1, mode: "auto", lastManual: city, prompted: true, approved: true };
  persistLocationPreference(s, p);
  const restored = loadLocationPreference(s);
  assert.equal(restored.approved, true); assert.equal(restored.mode, "auto");
  assert.equal(restored.lastManual.source, "manual"); assert.equal(restored.lastManual.name, city.name);
});
test("persistence whitelists fields and cannot accidentally archive GPS metadata", () => {
  const s = storage();
  persistLocationPreference(s, { ...loadLocationPreference(s), lastManual: { ...city, privateFix: device }, extraFix: device });
  assert.ok(!s.getItem(LOCATION_KEY).includes(String(device.latitude)));
  assert.ok(!s.getItem(LOCATION_KEY).includes("privateFix"));
  assert.ok(!s.getItem(LOCATION_KEY).includes("extraFix"));
});
test("device favorites and public map points are approximate, not precise histories", () => {
  const saved = savedPlace(device), point = approximatePlace(device);
  assert.equal(saved.name, "Zona guardada"); assert.equal(saved.source, "manual");
  assert.notEqual(saved.latitude, device.latitude); assert.notEqual(point.longitude, device.longitude);
  assert.equal(saved.latitude, point.latitude); assert.equal(saved.longitude, point.longitude);
  assert.equal(savedPlace(city).latitude, city.latitude);
});
test("bad storage and invalid coordinates fail safely", () => {
  assert.equal(loadLocationPreference(storage({ [LOCATION_KEY]: "broken" })).lastManual.name, "Caseros");
  for (const latitude of [NaN, Infinity, 91, -91, null]) assert.equal(validPlace({ ...city, latitude }), false);
  assert.equal(validPlace({ ...city, longitude: 181 }), false);
  assert.equal(validPlace(city), true);
});
test("even malformed saved preferences cannot restore GPS as last manual", () => {
  const s = storage({ [LOCATION_KEY]: JSON.stringify({ version: 1, mode: "auto", lastManual: device, prompted: true, approved: true }) });
  assert.deepEqual(loadLocationPreference(s).lastManual, initialPlace);
});
test("legacy precise GPS removal survives a full storage quota", () => {
  const s = storage({ "efg-location": JSON.stringify(device) });
  const p = loadLocationPreference(s);
  s.setItem = () => { throw new Error("Quota"); };
  assert.throws(() => persistLocationPreference(s, p));
  assert.equal(s.getItem("efg-location"), null);
});
test("foreground freshness threshold is fifteen minutes, not continuous tracking", () => {
  assert.equal(GPS_REFRESH_MS, 900000);
  assert.equal(locationKey(city), locationKey({ ...city }));
  assert.notEqual(locationKey(city), locationKey(device));
});
