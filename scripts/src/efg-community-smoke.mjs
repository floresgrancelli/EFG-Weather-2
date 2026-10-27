// Live development-only API smoke test. Creates clearly labelled technical
// test records far from the app's default area and always deletes them.
import assert from "node:assert/strict";
const base = process.env.EFG_TEST_URL || "http://localhost:80";
const origin = new URL(base).origin;
const path = "/api/community";
function browser() {
  let cookie = "";
  return async (route, method = "GET", data) => {
    const response = await fetch(base + path + route, {
      method, headers: {
        ...(cookie ? { cookie } : {}), ...(method !== "GET" ? { origin } : {}),
        ...(data ? { "content-type": "application/json" } : {}),
      }, body: data ? JSON.stringify(data) : undefined,
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: response.status, data: await response.json() };
  };
}
const a = browser(), b = browser();
let reportId;
const checks = [];
try {
  const feed = await a("/reports?latitude=-54.81&longitude=-68.31");
  assert.equal(feed.status, 200); assert.ok(Array.isArray(feed.data.reports));
  await b("/reports");
  const input = { category: "other", latitude: -54.812345, longitude: -68.312345, area: "Prueba técnica automática", observedAt: new Date().toISOString(), consent: true };
  assert.equal((await a("/reports", "POST", { ...input, consent: false })).status, 400);
  assert.equal((await a("/reports", "POST", { ...input, latitude: 100 })).status, 400);
  assert.equal((await a("/reports", "POST", { ...input, observedAt: new Date(Date.now() + 3600000).toISOString() })).status, 400);
  assert.equal((await a("/reports", "POST", { ...input, category: "hail", observedAt: new Date(Date.now() - 60 * 60000).toISOString() })).status, 400);
  checks.push("consent, coordinate, future and expired-time validation");
  const created = await a("/reports", "POST", input);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  reportId = created.data.id;
  assert.ok(created.data.mine); assert.equal(created.data.confirmations, 0);
  assert.equal(created.data.latitude, -54.82); assert.equal(created.data.longitude, -68.32);
  assert.ok(Date.parse(created.data.expiresAt) > Date.now());
  assert.equal(created.data.actor_hash, undefined);
  assert.equal((await a("/reports", "POST", input)).status, 409);
  checks.push("real save, coordinate approximation, expiry, private fields and duplicate blocking");
  const shared = await b("/reports?latitude=-54.81&longitude=-68.31&category=other");
  assert.ok(shared.data.reports.some(r => r.id === reportId && r.mine === false));
  assert.equal((await a(`/reports/${reportId}/confirm`, "POST")).status, 400);
  const confirmed = await b(`/reports/${reportId}/confirm`, "POST");
  assert.equal(confirmed.status, 200); assert.equal(confirmed.data.confirmations, 1);
  assert.equal((await b(`/reports/${reportId}/confirm`, "POST")).data.confirmations, 1);
  assert.equal((await b(`/reports/${reportId}`, "DELETE")).status, 404);
  checks.push("cross-browser persistence, idempotent confirmation, no self-confirmation and ownership");
  const rejectedOrigin = await fetch(base + path + "/reports", {
    method: "POST", headers: { origin: "https://not-efg.invalid", "content-type": "application/json" }, body: JSON.stringify(input),
  });
  assert.equal(rejectedOrigin.status, 403); checks.push("cross-site write protection");
  await a("/fragrance-choice");
  assert.equal((await a("/fragrance-choice", "PUT", { perfume: "Dior Sauvage EDT", consent: false })).status, 400);
  const choice = await a("/fragrance-choice", "PUT", { perfume: "Dior Sauvage EDT", consent: true, occasion: "daily", city: "Must not be saved", cityConsent: false, latitude: -34.6, longitude: -58.56 });
  assert.equal(choice.status, 200, JSON.stringify(choice.data));
  assert.equal(choice.data.choice.city, null); assert.equal(choice.data.choice.weatherAvailable, false);
  assert.ok(Array.isArray(choice.data.aggregates));
  assert.equal((await a("/fragrance-choice")).data.choice.perfume, "Dior Sauvage EDT");
  const revised = await a("/fragrance-choice", "PUT", { perfume: "Chanel Chance Eau Fraîche EDP", consent: true, occasion: "work" });
  assert.equal(revised.data.choice.perfume, "Chanel Chance Eau Fraîche EDP");
  assert.equal((await b("/fragrance-choice")).data.choice, null);
  checks.push("real survey consent, persistence, correction, no city without opt-in and browser isolation");
  const withWeather = await a("/fragrance-choice", "PUT", { perfume: "Dior Sauvage EDT", consent: true, cityConsent: true, city: "Caseros", latitude: -34.6, longitude: -58.56 });
  assert.equal(withWeather.status, 200); assert.equal(withWeather.data.choice.city, "Caseros");
  checks.push(`server weather context reported honestly: ${withWeather.data.choice.weatherAvailable}`);
  console.log(JSON.stringify({ status: "PASS", checks, note: "Temporary technical records removed in finally." }, null, 2));
} finally {
  if (reportId) {
    const removed = await a(`/reports/${reportId}`, "DELETE");
    assert.equal(removed.status, 200);
  }
  assert.equal((await a("/fragrance-choice", "DELETE")).status, 200);
  assert.equal((await a("/fragrance-choice")).data.choice, null);
}
