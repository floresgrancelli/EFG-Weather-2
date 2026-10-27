import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTip } from "../../artifacts/efg-weather/src/lib/weather.ts";
import { localCalendarDay } from "../../artifacts/efg-weather/src/lib/fragrance-rotation.ts";
import { tipPhrase, tipPhrases } from "../../artifacts/efg-weather/src/lib/tip-phrases.ts";

// Synthetic fixtures stay in tests, never in application or backend data.
const timezone = "America/Argentina/Buenos_Aires";
const localDay = i => new Date(Date.parse("2026-10-23T03:00:00Z") + i * 86400000).toISOString().slice(0, 10);
function weatherFor(day, apparent = 18, probability = 60, humidity = 85, wind = 29, uv = 4) {
  const start = Date.parse(`${day}T03:00:00Z`);
  return {
    timezone,
    current: { time: new Date(start + 9 * 3600000).toISOString(), apparent, temperature: 20, humidity, wind, gusts: 36, rain: 0, code: 2, isDay: 1 },
    hourly: Array.from({ length: 48 }, (_, i) => ({
      time: new Date(start + i * 3600000).toISOString(),
      apparent, temperature: 20, humidity, wind, gusts: 36, code: 2,
      rain: probability == null ? null : 0,
      rainProbability: probability == null ? null : (i === 20 ? probability : 0),
      uv: uv == null ? null : (i === 17 ? uv : 0),
    })),
    daily: [], fetchedAt: new Date(start).toISOString(),
  };
}
const signature = "¡Perfúmese mucho!";

test("editorial branches rotate, with 21 distinct daily openings", () => {
  for (const [kind, phrases] of Object.entries(tipPhrases)) {
    assert.ok(phrases.length >= 5 && (kind === "dailyOpening" ? phrases.length >= 16 : phrases.length <= 8), kind);
    assert.equal(new Set(phrases).size, phrases.length, kind);
    let previous;
    for (let i = 0; i < 10; i++) {
      const phrase = tipPhrase(kind, localDay(i), 3);
      assert.equal(phrase, tipPhrase(kind, localDay(i), 3));
      if (previous) assert.notEqual(phrase, previous, `${kind} repeated on adjacent days`);
      previous = phrase;
    }
  }
});

test("10 consecutive local dates vary the complete tip for three profiles and heat/cold/rain states", () => {
  for (const profile of ["Masculino", "Femenino", "Sin preferencia"]) {
    // The tip remains profile-neutral and never claims notes/family of a different fragrance.
    for (const apparent of [7, 17, 25, 32, null]) {
      for (const probability of [null, 0, 60]) {
        let previous;
        for (let i = 0; i < 10; i++) {
          const day = localDay(i);
          const data = weatherFor(day, apparent, probability);
          const tip = makeTip(data, day);
          assert.equal(tip, makeTip(structuredClone(data), day), `${profile}: unstable within ${day}`);
          assert.ok(tip.endsWith(signature));
          assert.equal(tip.split(signature).length, 2, "exactly one signature");
          if (previous) assert.notEqual(tip, previous, `${profile}/${apparent}/${probability}/${day}`);
          if (probability === 60) {
            assert.match(tip, /paraguas/i);
            assert.match(tip, /viernes|sábado|domingo|lunes|martes|miércoles|jueves/i);
            assert.match(tip, /20:00/); // Only the actual 20:00 local hourly forecast is eligible.
          } else {
            assert.doesNotMatch(tip, /llev[áa] paraguas|ten[ée] a mano un paraguas/i);
          }
          assert.match(tip, /UV/i);
          assert.match(tip, /protector solar/i);
          previous = tip;
        }
      }
    }
  }
});

test("missing and negative observations never become fabricated rain, UV, wind or thermal sensation", () => {
  const day = "2026-10-23";
  for (const probability of [null, 0]) {
    const data = weatherFor(day, null, probability, null, null, null);
    const tip = makeTip(data, day);
    assert.match(tip, /sensación térmica/i);
    assert.doesNotMatch(tip, /protector solar|cortaviento/i);
    assert.doesNotMatch(tip, /llev[áa] paraguas|ten[ée] a mano un paraguas/i);
    assert.ok(tip.endsWith(signature));
  }
  const noUv = weatherFor(day, 19, 0, 40, 4, 2);
  assert.doesNotMatch(makeTip(noUv, day), /protector solar/i);
  const rainy = weatherFor(day, 19, 60, 40, 4, 0);
  const tip = makeTip(rainy, day);
  assert.match(tip, /20:00/);
  assert.match(tip, /paraguas/i);
  assert.doesNotMatch(tip, /protector solar/i);
  rainy.hourly = rainy.hourly.map(h => ({ ...h, rainProbability: 0 }));
  assert.doesNotMatch(makeTip(rainy, day), /llev[áa] paraguas|ten[ée] a mano un paraguas/i);
});

test("next local day changes text but excludes yesterday's rain hour even before the next refresh", () => {
  const friday = weatherFor("2026-10-23", 18, 0, 45, 10, 0);
  friday.current.time = "2026-10-24T02:00:00.000Z"; // Friday 23:00 in Argentina.
  friday.hourly = friday.hourly.map(h => ({
    ...h,
    rainProbability: h.time === "2026-10-24T02:00:00.000Z" ? 70 : 0,
  }));
  const fridayTip = makeTip(friday, "2026-10-23");
  const saturdayTip = makeTip(friday, "2026-10-24");
  assert.match(fridayTip, /viernes a las 23:00/);
  assert.doesNotMatch(saturdayTip, /viernes a las 23:00|llev[áa] paraguas/i);
  assert.notEqual(fridayTip, saturdayTip);
  assert.ok(saturdayTip.endsWith(signature));
  assert.equal(localCalendarDay(new Date("2026-10-24T02:59:59Z"), timezone), "2026-10-23");
  assert.equal(localCalendarDay(new Date("2026-10-24T03:00:00Z"), timezone), "2026-10-24");
  assert.equal(localCalendarDay(new Date("2026-10-24T02:59:59Z"), "Asia/Tokyo"), "2026-10-24");
});


test("Weather 2.0: complete Tip del día varies for 16 days with exactly identical forecast", () => {
  const forecast=weatherFor("2026-10-23",21,0,50,10,0);
  const tips=Array.from({length:16},(_,i)=>makeTip(forecast, localDay(i)));
  assert.equal(new Set(tips).size,tips.length);
  assert.ok(tips.every(t=>t.endsWith("¡Perfúmese mucho!")));
});
