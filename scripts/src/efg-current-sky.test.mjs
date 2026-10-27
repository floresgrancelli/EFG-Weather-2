import { test } from "node:test";
import assert from "node:assert/strict";
import { currentSky } from "../../artifacts/efg-weather/src/lib/current-sky.ts";

// WMO fixtures only exercise icon selection; never sent to the app/API or stored as weather.
test("current WMO codes distinguish clear, partial cloud, overcast and fog", () => {
  for (const [code, kind] of [[0, "clear"], [1, "partly-cloudy"], [2, "partly-cloudy"], [3, "cloudy"], [45, "fog"], [48, "fog"]]) {
    assert.equal(currentSky(code, 1).kind, kind, `WMO ${code}`);
  }
});
test("drizzle and rain retain separate icons, including freezing precipitation and showers", () => {
  for (const code of [51, 53, 55, 56, 57]) assert.equal(currentSky(code, 1).kind, "drizzle");
  for (const code of [61, 63, 65, 66, 67, 80, 81, 82]) assert.equal(currentSky(code, 0).kind, "rain");
});
test("snow never falls through to a drizzle or rain glyph", () => {
  for (const code of [71, 73, 75, 77, 85, 86]) assert.equal(currentSky(code, 0).kind, "snow");
});
test("storm glyph describes model condition, not a scientific lightning detection or alert", () => {
  for (const code of [95, 96, 99]) {
    const sky = currentSky(code, 1);
    assert.equal(sky.kind, "thunderstorm");
    assert.ok(!/detectad|alerta|cayó|cerca/i.test(sky.label));
  }
});
test("day/night comes only from the provider's current is_day, including unknown illumination", () => {
  for (const code of [0, 2, 3, 61, 71, 95]) {
    assert.equal(currentSky(code, 1).phase, "day");
    assert.equal(currentSky(code, 0).phase, "night");
    for (const missing of [null, undefined, 2, -1]) assert.equal(currentSky(code, missing).phase, "unknown");
  }
});
test("missing and unrecognised WMO values stay explicitly unavailable", () => {
  for (const code of [null, undefined, NaN, -1, 4, 59, 100, 0.5]) {
    assert.equal(currentSky(code, 0).kind, "unknown");
    assert.match(currentSky(code, 0).label, /no disponible/);
  }
});
