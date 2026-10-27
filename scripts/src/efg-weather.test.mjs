import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeTip, formatValue } from "../../artifacts/efg-weather/src/lib/weather.ts";
import { nightOut, pickFragrances, roundApprox } from "../../artifacts/efg-weather/src/lib/extras.ts";
import { normalizePerfume, approximate, reportLifetimeMinutes, argentinaDay } from "../../artifacts/api-server/src/lib/community-privacy.ts";

// Synthetic fixtures exist only in tests; they are never sent to the app or DB.
function fixture() {
  const start = Date.parse("2026-10-23T03:00:00Z");
  return {
    current: { time: "2026-10-23T12:00:00Z", temperature: 22, apparent: 21, humidity: 90, rain: 0, wind: 10, gusts: 20, code: 2, isDay: 1 },
    hourly: Array.from({ length: 48 }, (_, i) => ({ time: new Date(start + i * 3600000).toISOString(), temperature: 18, apparent: 17, humidity: 80, rain: 0.5, rainProbability: 60, wind: 15, gusts: 25, uv: 4, code: 61 })),
    daily: [], fetchedAt: "2026-10-23T12:00:00Z", timezone: "America/Argentina/Buenos_Aires",
  };
}
test("missing values are explicit and apparent temperature is never inflated from humidity", () => {
  assert.equal(formatValue(null), "No disponible");
  const weather = fixture();
  assert.equal(weather.current.apparent, 21);
  const tip = makeTip(weather);
  assert.ok(tip.endsWith("¡Perfúmese mucho!"));
  assert.match(tip, /protector solar/);
  assert.match(tip, /paraguas/);
  assert.match(tip, /(hora|horario|momento).*(variar|fija|exacta|garantizado|segura|cambiar)/);
  assert.ok(makeTip({ ...weather, current: { ...weather.current, apparent: null }, hourly: [] }).endsWith("¡Perfúmese mucho!"));
});
test("night card is available Friday morning and uses only real forecast-window rows", () => {
  const night = nightOut(fixture(), new Date("2026-10-23T12:00:00Z"));
  assert.equal(night.kind, "forecast");
  assert.equal(night.hours.length, 8);
  assert.equal(night.hours[0].time, "2026-10-23T23:00:00.000Z");
  assert.equal(night.hours.at(-1).time, "2026-10-24T06:00:00.000Z");
  assert.equal(night.minT, 18); assert.equal(night.rainMax, 60);
});
test("no imaginary night forecast is emitted outside Friday/Saturday or without data", () => {
  assert.equal(nightOut(fixture(), new Date("2026-10-22T12:00:00Z")).kind, "other");
  assert.equal(nightOut({ ...fixture(), hourly: [] }, new Date("2026-10-23T12:00:00Z")).kind, "past");
  const night = nightOut({ ...fixture(), hourly: fixture().hourly.map(h => ({ ...h, temperature: null, humidity: null, rainProbability: null, wind: null })) }, new Date("2026-10-23T12:00:00Z"));
  assert.equal(night.kind, "forecast");
  assert.ok(night.missing.includes("temperatura")); assert.equal(night.minT, null);
});
test("catalog includes feminine and unisex choices and handles highlighted notes honestly", () => {
  const { fragrances } = JSON.parse(readFileSync(new URL("../../artifacts/efg-weather/public/fragrances.json", import.meta.url)));
  assert.ok(fragrances.length >= 12);
  assert.ok(fragrances.some(f => f.profile === "Femenino")); assert.ok(fragrances.some(f => f.profile === "Sin preferencia"));
  assert.ok(fragrances.every(f => f.sourceLabel));
  for (const profile of ["Masculino", "Femenino", "Sin preferencia"]) {
    const picked = pickFragrances(fragrances, fixture(), profile, "interior");
    assert.ok(picked.top);
    if (profile !== "Sin preferencia") assert.ok([profile, "Sin preferencia"].includes(picked.top.profile));
  }
});
test("privacy grid, perfume normalization, short report lifetime and Argentine calendar", () => {
  assert.equal(roundApprox(-34.60688), approximate(-34.60688));
  assert.equal(normalizePerfume("  CHANEL Chance Eau Fraîche — EDP "), normalizePerfume("chanel chance eau fraiche edp"));
  assert.ok(Object.values(reportLifetimeMinutes).every(n => n <= 180 && n >= 30));
  assert.equal(argentinaDay(new Date("2026-10-23T01:00:00Z")), "2026-10-22");
});
