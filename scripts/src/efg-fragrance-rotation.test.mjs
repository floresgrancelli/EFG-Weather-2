import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickFragrances, nightOut } from "../../artifacts/efg-weather/src/lib/extras.ts";
import { localCalendarDay, nextLocalDayDelay, recordDailyChoice, validDailyChoices } from "../../artifacts/efg-weather/src/lib/fragrance-rotation.ts";
import { makeTip } from "../../artifacts/efg-weather/src/lib/weather.ts";

const { fragrances: catalog } = JSON.parse(readFileSync(new URL("../../artifacts/efg-weather/public/fragrances.json", import.meta.url)));
const timezone = "America/Argentina/Buenos_Aires";
function weather(t = 21, humidity = 50, rain = 0) {
  return {
    current: { time: "2026-10-23T12:00:00Z", temperature: t - 1, apparent: t, humidity, rain, wind: 12, gusts: 20, code: rain ? 61 : 2, isDay: 1 },
    hourly: [], daily: [], timezone, fetchedAt: "2026-10-23T12:00:00Z",
  };
}
const instant = d => new Date(Date.UTC(2026, 9, 23 + d, 12));
const profiles = ["Masculino", "Femenino", "Sin preferencia"];
const settings = ["", "interior", "exterior", "noche"];
const options = now => ({ now, latitude: -34.6 });

test("10 frozen days: all profiles, 3 thermal bands, humidity, rain and 4 occasions; compatible, stable, no consecutive repeats", () => {
  let segments = 0, minimum = Infinity;
  for (const profile of profiles) for (const t of [8, 20, 30]) for (const humidity of [50, 90]) for (const rain of [0, 1]) for (const setting of settings) {
    const w = weather(t, humidity, rain), ids = [], records = [];
    for (let day = 0; day < 10; day++) {
      const frozen = instant(day);
      const picked = pickFragrances(catalog, w, profile, setting, { ...options(frozen), records });
      minimum = Math.min(minimum, picked.candidateCount);
      assert.ok(picked.candidateCount >= 2, `insufficient options: ${profile}/${t}/${humidity}/${rain}/${setting}`);
      assert.ok(picked.top.climate.includes(picked.band));
      if (humidity >= 75 || rain) assert.equal(picked.top.humidOk, true);
      if (profile !== "Sin preferencia") assert.ok([profile, "Sin preferencia"].includes(picked.top.profile));
      if (picked.top.seasons) assert.ok(picked.top.seasons.includes(picked.season));
      assert.notEqual(picked.top.id, ids.at(-1));
      assert.equal(picked.alternatives.some(f => f.id === picked.top.id), false);
      assert.equal(new Set(picked.alternatives.map(f => f.id)).size, picked.alternatives.length);
      const stored = recordDailyChoice(records, { key: picked.key, day: picked.day, id: picked.top.id });
      records.splice(0, records.length, ...stored);
      // Same day, later time + a new JSON instance (reload), retains the exact reference and notes.
      const repeat = pickFragrances(JSON.parse(JSON.stringify(catalog)), w, profile, setting, {
        ...options(new Date(frozen.getTime() + 8 * 3600000)), records: JSON.parse(JSON.stringify(records)),
      });
      assert.equal(repeat.top.id, picked.top.id);
      assert.deepEqual(repeat.top.notes, picked.top.notes);
      assert.ok(repeat.why.includes(repeat.top.name));
      ids.push(picked.top.id);
      const size = Math.min(7, picked.candidateCount, ids.length);
      assert.equal(new Set(ids.slice(-size)).size, size, `short repetition: ${profile}/${t}/${setting}`);
    }
    segments++;
  }
  assert.equal(segments, 144);
  console.log(`144 segments × 10 days; minimum ${minimum} compatible references per segment.`);
});

test("without storage or randomness: calendar wheel rotates through eligible references and is independent of input order", () => {
  const originalRandom = Math.random;
  Math.random = () => { throw Error("randomness must not be used"); };
  try {
    for (const profile of profiles) for (const t of [8, 20, 30]) {
      const w = weather(t, 90, 1), ids = [];
      for (let d = 0; d < 10; d++) {
        const a = pickFragrances(catalog, w, profile, "", options(instant(d)));
        const b = pickFragrances([...catalog].reverse(), w, profile, "", options(instant(d)));
        assert.equal(a.top.id, b.top.id);
        assert.notEqual(a.top.id, ids.at(-1));
        ids.push(a.top.id);
      }
    }
  } finally { Math.random = originalRandom; }
});

test("Argentina calendar changes at 03:00Z, not UTC midnight; DST boundaries remain correct", () => {
  assert.equal(localCalendarDay(new Date("2026-10-24T02:59:59.999Z"), timezone), "2026-10-23");
  assert.equal(localCalendarDay(new Date("2026-10-24T03:00:00Z"), timezone), "2026-10-24");
  assert.equal(nextLocalDayDelay(Date.parse("2026-10-24T02:59:59Z"), timezone), 1000);
  assert.equal(nextLocalDayDelay(Date.parse("2026-03-08T05:00:00Z"), "America/New_York"), 23 * 3600000);
  assert.equal(nextLocalDayDelay(Date.parse("2026-11-01T04:00:00Z"), "America/New_York"), 25 * 3600000);
  const w = weather();
  const a = pickFragrances(catalog, w, "Femenino", "", options(new Date("2026-10-24T02:59:59Z")));
  const b = pickFragrances(catalog, w, "Femenino", "", options(new Date("2026-10-24T03:00:00Z")));
  assert.notEqual(a.top.id, b.top.id);
  assert.notEqual(pickFragrances(catalog, { ...w, timezone: "Asia/Tokyo" }, "Femenino", "", options(new Date("2026-10-23T23:00:00Z"))).day, a.day);
});

test("stored choice survives harmless weather drift, but climate compatibility overrides it; no same-day or recent-history duplicates", () => {
  const w = weather(20, 50), now = instant(0);
  const initial = pickFragrances(catalog, w, "Femenino", "interior", options(now));
  const records = recordDailyChoice([], { key: initial.key, day: initial.day, id: initial.top.id });
  const changed = pickFragrances(catalog, weather(22, 60), "Femenino", "interior", { ...options(now), records });
  assert.equal(changed.top.id, initial.top.id);
  const cold = pickFragrances(catalog, weather(8, 90, 1), "Femenino", "interior", { ...options(now), records });
  assert.ok(cold.top.climate.includes("frio")); assert.equal(cold.top.humidOk, true);
  const persisted = recordDailyChoice([...records, ...records], { key: initial.key, day: initial.day, id: cold.top.id });
  assert.equal(persisted.length, 1); assert.equal(persisted[0].id, cold.top.id);
  assert.deepEqual(validDailyChoices([{ id: "bad", key: "GPS -34.6", day: "2026-10-23" }]), []);
  assert.deepEqual(Object.keys(persisted[0]).sort(), ["day", "id", "key"]);
});

test("missing/unique eligible references are explicit, never filled with incompatible perfumes", () => {
  const w = weather(8, 90, 1);
  const zero = pickFragrances(catalog.filter(f => !f.humidOk), w, "Masculino", "", options(instant(0)));
  assert.equal(zero.top, null); assert.ok(zero.limitation);
  const one = pickFragrances(catalog.filter(f => f.id === "lattafa-nebras-edp"), w, "Femenino", "", options(instant(0)));
  assert.equal(one.candidateCount, 1); assert.ok(one.limitation.includes("una referencia"));
  const missing = pickFragrances(catalog, { ...w, current: { ...w.current, apparent: null } }, "Femenino", "", options(instant(0)));
  assert.equal(missing.band, null); assert.ok(missing.why.includes("Sin sensación térmica"));
});

test("night rotation uses only each Friday/Saturday 20–03 forecast; day/night context is separated", () => {
  const ids = [], records = [];
  for (let week = 0; week < 5; week++) for (let offset = 0; offset < 2; offset++) {
    const now = instant(week * 7 + offset);
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3);
    const w = weather(30, 50);
    w.hourly = Array.from({ length: 48 }, (_, i) => ({
      time: new Date(start + i * 3600000).toISOString(), temperature: 9, apparent: 8, humidity: 90,
      rain: 0.2, rainProbability: 60, wind: 20, gusts: 30,
    }));
    const n = nightOut(w, now);
    assert.equal(n.kind, "forecast"); assert.equal(n.hours.length, 8);
    const nocturnal = { ...w, hourly: n.hours, current: { ...w.current, apparent: 8, humidity: 90, rain: 0.2 } };
    const opts = { ...options(now), slot: "night-out", placement: "interior", records };
    const p = pickFragrances(catalog, nocturnal, "Femenino", "noche", opts);
    assert.ok(p.top.climate.includes("frio")); assert.equal(p.top.humidOk, true);
    assert.notEqual(p.key, pickFragrances(catalog, w, "Femenino", "noche", options(now)).key);
    assert.notEqual(p.top.id, ids.at(-1), "consecutive actual outings must differ, including next Friday");
    ids.push(p.top.id);
    records.splice(0, records.length, ...recordDailyChoice(records, { key: p.key, day: p.day, id: p.top.id }));
  }
});

test("notes retain documented provenance; tip signature and midnight timer never fetch weather", () => {
  assert.ok(catalog.length >= 22);
  for (const f of catalog) assert.ok(f.sourceLabel && (f.notes.destacadas || (f.notes.salida && f.notes.corazon && f.notes.fondo)));
  assert.ok(catalog.filter(f => f.id.startsWith("replica-") || f.id === "diptyque-eau-papier-edt").every(f => f.sourceUrl?.startsWith("https://")));
  assert.ok(makeTip(weather()).endsWith("¡Perfúmese mucho!"));
  const hook = readFileSync(new URL("../../artifacts/efg-weather/src/hooks/useLocalCalendarDay.ts", import.meta.url), "utf8");
  assert.doesNotMatch(hook, /fetchWeather|fetch\(|useWeatherRefresh/);
});


test("Weather 2.0: no perfume repeats within the first 15 days for all 144 climate and occasion scenarios", () => {
  for (const profile of profiles) for (const t of [8, 20, 30])
    for (const humidity of [50, 90]) for (const rain of [0, 1]) for (const setting of settings) {
      const w = weather(t, humidity, rain), records = [], ids = [];
      for (let d = 0; d < 16; d++) {
        const p = pickFragrances(catalog, w, profile, setting, { ...options(instant(d)), records });
        assert.ok(p.top, `missing ${profile}/${t}/${humidity}/${rain}/${setting}`);
        assert.ok(!ids.slice(-15).includes(p.top.id), `repetition ${profile}/${t}/${humidity}/${rain}/${setting} at day ${d}`);
        assert.ok(p.candidateCount >= 16);
        ids.push(p.top.id);
        records.splice(0, records.length, ...recordDailyChoice(records, {key:p.key,day:p.day,id:p.top.id}));
      }
    }
});

test("Weather 2.0: used fragrances stay excluded when climate and occasion changes, or when pool is exhausted", () => {
  const now=instant(0), a=pickFragrances(catalog,weather(20,50),"Femenino","",options(now));
  const records=recordDailyChoice([],{key:a.key,day:a.day,id:a.top.id});
  const next=pickFragrances(catalog,weather(30,90,1),"Femenino","noche",{...options(instant(1)),records});
  assert.notEqual(a.top.id,next.top.id);
  const only=pickFragrances(catalog.filter(f=>f.id===a.top.id),weather(20,50),"Femenino","",{...options(instant(1)),records});
  assert.equal(only.top,null);
  assert.match(only.limitation,/15 días/);
});

test("Weather 2.0: first 16 dates do not repeat with constant weather even when localStorage is unavailable", () => {
  for (const profile of profiles) for (const t of [8,20,30]) {
    const w=weather(t,90,1), ids=[];
    for (let d=0;d<16;d++) {
      const selected=pickFragrances(catalog,w,profile,"interior",options(instant(d)));
      assert.ok(selected.top);
      ids.push(selected.top.id);
    }
    assert.equal(new Set(ids).size, 16, `${profile}/${t} duplicated without saved history`);
  }
});

test("Weather 2.0: expanded catalog contains mainstream, Arabian brands and only Xerjoff among niche houses", () => {
  assert.equal(catalog.length, 138);
  assert.ok(catalog.filter(f=>f.profile==='Masculino').length>=70);
  assert.ok(catalog.filter(f=>f.profile==='Femenino').length>=50);
  assert.ok(catalog.some(f=>f.name==='Xerjoff Naxos'));
  assert.ok(catalog.some(f=>f.name==='Xerjoff Torino21'));
  assert.ok(catalog.some(f=>f.name==='Rasasi Daarej'));
  assert.ok(catalog.some(f=>f.name==='Lattafa Yara EDP'));
  assert.ok(catalog.every(f=> !/diptyque|jo malone|maison margiela|tom ford|byredo|creed|thomas kosmala|jo milano/i.test(f.name)));
});
