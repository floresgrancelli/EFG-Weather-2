import { test } from "node:test";
import assert from "node:assert/strict";
import { coverageTemplate, issueText, MAX_RADAR_AGE, parseRadarIndex, pointDescription, radarTemplate, RAIN_HOST, recentFrame, tilePoint } from "../../artifacts/efg-weather/src/lib/radar-provider.ts";
import { RadarRequestError, RadarRequests } from "../../artifacts/efg-weather/src/lib/radar-requests.ts";
const now = Date.UTC(2026, 9, 22, 23, 0), time = now / 1000;
// Transport fixtures stay in this test; never rendered as weather.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const response = () => new Response(png, { headers: { "content-type": "image/png" } });
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
test("real index contract keeps only validated past frames, host and generation time", () => {
  const good = { time: time - 600, path: "/v2/radar/abc123" };
  const data = { host: RAIN_HOST, generated: time, radar: { past: [good, good, { time: time + 1, path: "/v2/radar/future" }, { time: time - 7300, path: "/v2/radar/old" }, { time: time - 300, path: "/wrong/path" }], nowcast: [{ time: time + 600, path: "/v2/radar/nowcast" }] } };
  assert.deepEqual(parseRadarIndex(data, now).frames, [good]);
  assert.equal(recentFrame({ ...good, time: (now - MAX_RADAR_AGE) / 1000 }, now), true);
  assert.equal(recentFrame({ ...good, time: (now - MAX_RADAR_AGE) / 1000 - 1 }, now), false);
  for (const host of ["https://other.invalid", "http://tilecache.rainviewer.com", "https://user@tilecache.rainviewer.com"]) assert.throws(() => parseRadarIndex({ ...data, host }, now));
  assert.throws(() => parseRadarIndex({ ...data, generated: time - 8000 }, now));
});
test("2026 templates use Universal Blue, historic host/path and the separate mask endpoint", () => {
  assert.equal(radarTemplate(RAIN_HOST, { time, path: "/v2/radar/abc" }), `${RAIN_HOST}/v2/radar/abc/256/{z}/{x}/{y}/2/1_0.png`);
  assert.equal(coverageTemplate(RAIN_HOST), `${RAIN_HOST}/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png`);
});
test("Caseros sample matches the actual slippy tile and point used in the investigation", () => {
  assert.deepEqual(tilePoint(-34.6037, -58.5638, 6), { z: 6, x: 21, y: 38, px: 150, py: 144 });
  for (const lon of [-540, -180, 180, 540]) { const p = tilePoint(90, lon, 20); assert.equal(p.z, 7); assert.ok(p.x >= 0 && p.x < 128 && p.y >= 0 && p.y < 128); }
});
test("gray provider coverage, unknown data and no echo never become a no-rain assurance", () => {
  assert.equal(pointDescription(255, 0).kind, "uncovered");
  assert.match(pointDescription(255, 0).detail, /no la ausencia de radares/);
  assert.equal(pointDescription(null, 0).kind, "unknown");
  assert.equal(pointDescription(0, null).kind, "unknown");
  assert.equal(pointDescription(0, 200).kind, "echo");
  assert.equal(pointDescription(0, 0).kind, "no-echo");
  assert.match(pointDescription(0, 0).detail, /No garantiza ausencia/);
  assert.match(issueText({ kind: "http", status: 503 }), /503/);
});
test("real response blobs are cached; cache hits do not consume another network slot", async () => {
  let calls = 0;
  const q = new RadarRequests(async () => { calls++; return response(); });
  const signal = new AbortController().signal;
  const verified = await q.image("tile-a", signal, () => {});
  q.rememberVerified("tile-a", verified);
  await q.image("tile-a", signal, () => {});
  assert.equal(calls, 1);
  q.discard("tile-a"); await q.image("tile-a", signal, () => {});
  assert.equal(calls, 2);
});
test("browser native fetch is invoked without binding it to a custom class instance", async () => {
  const q = new RadarRequests(function () { assert.equal(this, undefined); return Promise.resolve(response()); });
  await q.image("native-receiver", new AbortController().signal, () => {});
});
test("tile transport never exceeds two simultaneous downloads", async () => {
  let active = 0, max = 0;
  const q = new RadarRequests(async () => { active++; max = Math.max(active, max); await new Promise(r => setTimeout(r, 10)); active--; return response(); });
  await Promise.all(Array.from({ length: 8 }, (_, i) => q.image(`tile-${i}`, new AbortController().signal, () => {})));
  assert.equal(max, 2);
});
test("local limit queues rather than fabricating a tile error; obsolete queued work cancels", async () => {
  let calls = 0, waiting;
  const q = new RadarRequests(async () => { calls++; return response(); }, () => 100000, 2);
  await q.image("a", new AbortController().signal, () => {});
  await q.image("b", new AbortController().signal, () => {});
  await pause();
  const controller = new AbortController(), pending = q.image("c", controller.signal, issue => { waiting = issue; });
  await pause();
  assert.equal(calls, 2); assert.equal(waiting.local, true); assert.equal(waiting.retryAt, 160001);
  controller.abort();
  await assert.rejects(pending, error => error.name === "AbortError");
  assert.equal(calls, 2);
});
test("HTTP 429 respects Retry-After and blocks the shared coverage/radar queue", async () => {
  let calls = 0, waiting;
  const q = new RadarRequests(async () => { calls++; return new Response("", { status: 429, headers: { "retry-after": "30" } }); }, () => 100000);
  await assert.rejects(q.image("radar", new AbortController().signal, () => {}), e => e instanceof RadarRequestError && e.issue.status === 429 && e.issue.retryAt === 130000);
  const controller = new AbortController(), pending = q.image("coverage", controller.signal, issue => { waiting = issue; });
  await pause();
  assert.equal(calls, 1); assert.equal(waiting.local, false); assert.equal(waiting.retryAt, 130000);
  controller.abort(); await assert.rejects(pending);
});
test("HTTP failures are not cached and retry can obtain a genuinely successful response", async () => {
  let calls = 0; const cacheModes = [];
  const q = new RadarRequests(async (_url, options) => { cacheModes.push(options.cache); return ++calls === 1 ? new Response("", { status: 404 }) : response(); });
  const signal = new AbortController().signal;
  await assert.rejects(q.image("same-tile", signal, () => {}), e => e.issue.status === 404);
  const blob = await q.image("same-tile", signal, () => {});
  assert.ok(blob.size > 0); assert.equal(calls, 2);
  assert.deepEqual(cacheModes, ["default", "reload"], "retry bypasses browser HTTP cache instead of repeating a cached error");
});
test("HTML responses and network failures are explicit, never treated as transparent radar", async () => {
  const html = new RadarRequests(async () => new Response("error page", { headers: { "content-type": "text/html" } }));
  await assert.rejects(html.image("a", new AbortController().signal, () => {}), e => e.issue.kind === "decode");
  const offline = new RadarRequests(async () => { throw new TypeError("Network unavailable"); });
  await assert.rejects(offline.image("b", new AbortController().signal, () => {}), e => e.issue.kind === "network");
});
