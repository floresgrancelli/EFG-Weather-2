// Disposable browser only: synthetic weather/clock fixtures NEVER reach app files or DB.
// Run the real-weather navigation/GPS smoke separately.
import assert from "node:assert/strict";
const remote = process.env.EFG_CDP_URL || "http://localhost:9223";
const root = process.env.EFG_TEST_URL || "http://localhost:80/";
const target = await (await fetch(`${remote}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => { ws.onopen = resolve; });
let id = 0, weatherRequests = 0, clock = Date.parse("2026-10-24T02:59:58Z");
const pending = new Map(), exceptions = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id, timer = setTimeout(() => reject(new Error(`CDP timeout ${method}`)), 20000);
    pending.set(key, m => { clearTimeout(timer); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m); });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
}
function fixture() {
  const start = Date.parse("2026-10-23T03:00:00Z") / 1000;
  const hours = Array.from({ length: 72 }, (_, i) => start + i * 3600);
  const repeat = n => hours.map(() => n);
  return {
    timezone: "America/Argentina/Buenos_Aires",
    current: { time: clock / 1000, temperature_2m: 19, apparent_temperature: 20, relative_humidity_2m: 90, precipitation: 0, wind_speed_10m: 12, wind_gusts_10m: 20, weather_code: 2, is_day: 0 },
    hourly: { time: hours, temperature_2m: repeat(9), apparent_temperature: repeat(8), relative_humidity_2m: repeat(90), precipitation: repeat(0), precipitation_probability: repeat(0), wind_speed_10m: repeat(12), wind_gusts_10m: repeat(20), uv_index: repeat(0), weather_code: repeat(2) },
    daily: { time: Array.from({ length: 7 }, (_, i) => start + i * 86400), temperature_2m_min: [8,8,8,8,8,8,8], temperature_2m_max: [21,21,21,21,21,21,21] },
  };
}
ws.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") exceptions.push(m.params.exceptionDetails.text);
  if (m.method === "Fetch.requestPaused") {
    weatherRequests++;
    void call("Fetch.fulfillRequest", {
      requestId: m.params.requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Access-Control-Allow-Origin", value: "*" }],
      body: Buffer.from(JSON.stringify(fixture())).toString("base64"),
    });
  }
};
async function js(expression) {
  const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result.result?.value;
}
async function wait(expression) {
  for (let i = 0; i < 180; i++) {
    try { if (await js(`Boolean(${expression})`)) return; }
    catch (e) { if (!/context|navigat/i.test(e.message)) throw e; }
    await pause(100);
  }
  throw new Error(`Timeout: ${expression}`);
}
const click = id => js(`document.querySelector('[data-testid="${id}"]').click()`);
const name = () => js("document.querySelector('.fragrance-advice>strong')?.textContent");
try {
  await Promise.all([call("Page.enable"), call("Runtime.enable"), call("Network.enable")]);
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call("Browser.setPermission", { permission: { name: "geolocation" }, setting: "denied", origin: new URL(root).origin });
  await call("Page.addScriptToEvaluateOnNewDocument", { source: `
    if(!sessionStorage.getItem('efg-test-clock')){
      sessionStorage.setItem('efg-test-clock','${clock}');
      localStorage.removeItem('efg-fragrance-days-v1');
      localStorage.setItem('efg-profile',JSON.stringify('Femenino'));
      localStorage.setItem('efg-fragrance-setting',JSON.stringify('interior'));
    }
    window.__clock=Number(sessionStorage.getItem('efg-test-clock'));
    window.__NativeDate=Date;
    window.Date=class extends window.__NativeDate {
      constructor(...args){super(...(args.length?args:[window.__clock]));}
      static now(){return window.__clock;}
    };
  ` });
  await call("Fetch.enable", { patterns: [{ urlPattern: "*api.open-meteo.com/v1/forecast*", requestStage: "Request" }] });
  await call("Page.navigate", { url: root });
  await wait("document.querySelector('.fragrance-advice>strong') && document.querySelector('[data-testid=\"night-fragrance\"]')");
  assert.ok(await js("document.querySelector('[data-testid=\"fragrance-rotation-status\"]').textContent.includes('23/10/2026')"));
  const first = await name();
  const firstTip = await js("document.querySelector('.tip-text').textContent");
  const firstNight = await js("document.querySelector('[data-testid=\"night-fragrance\"]').textContent");
  const before = weatherRequests;
  clock += 3000;
  await js(`window.__clock=${clock};sessionStorage.setItem('efg-test-clock','${clock}')`);
  // Let the genuine two-second midnight timer fire; no simulated visibility event or reload.
  await wait("document.querySelector('[data-testid=\"fragrance-rotation-status\"]').textContent.includes('24/10/2026')");
  const second = await name();
  const secondTip = await js("document.querySelector('.tip-text').textContent");
  assert.notEqual(second, first);
  assert.notEqual(secondTip, firstTip, "The daily tip rotates at the city's midnight");
  assert.ok(firstTip.endsWith('¡Perfúmese mucho!') && secondTip.endsWith('¡Perfúmese mucho!'));
  assert.notEqual(await js("document.querySelector('[data-testid=\"night-fragrance\"]').textContent"), firstNight);
  assert.equal(weatherRequests, before, "Local midnight must not request weather");
  await click("button-fragrance-advice");
  assert.ok(await js("document.querySelector('.fragrance-advice>p').textContent").then(why => why.includes(second)));
  const notes = await js("document.querySelector('.fragrance-details').textContent");
  const beforeReload = weatherRequests;
  await call("Page.reload");
  for (let i = 0; i < 100 && weatherRequests === beforeReload; i++) await pause(100);
  assert.ok(weatherRequests > beforeReload);
  await wait("document.querySelector('.fragrance-advice>strong')");
  assert.equal(await name(), second, "Reload keeps the daily choice");
  assert.equal(await js("document.querySelector('.tip-text').textContent"), secondTip, "Reload keeps the local-day tip");
  assert.equal(await js("JSON.parse(localStorage.getItem('efg-profile'))"), "Femenino");
  assert.equal(await js("JSON.parse(localStorage.getItem('efg-fragrance-setting'))"), "interior");
  await click("button-fragrance-advice");
  assert.equal(await js("document.querySelector('.fragrance-details').textContent"), notes);
  const count = weatherRequests;
  await click("button-refresh-weather"); await pause(400);
  assert.equal(weatherRequests, count + 1);
  assert.equal(await name(), second);
  assert.equal(await js("document.querySelector('.tip-text').textContent"), secondTip, "Same forecast keeps the day's wording");
  await js("window.dispatchEvent(new Event('pageshow'))"); await pause(150);
  assert.equal(await name(), second); assert.equal(weatherRequests, count + 1);
  assert.ok(await js("document.querySelector('.tip-text').textContent.endsWith('¡Perfúmese mucho!')"));
  const records = JSON.parse(await js("localStorage.getItem('efg-fragrance-days-v1')"));
  assert.ok(records.every(r => Object.keys(r).sort().join() === "day,id,key"));
  assert.deepEqual(exceptions, []);
  console.log(JSON.stringify({ ok: true, beforeMidnight: first, afterMidnight: second, dailyTipChangedAtMidnight: firstTip !== secondTip, weatherRequestsAtMidnight: 0, reloadAndManualRefreshStable: true, notesAndExplanationSynced: true, nighttimeRotates: true, preferencesRetained: true, uncaughtErrors: exceptions.length }, null, 2));
} finally {
  await js("sessionStorage.removeItem('efg-test-clock');for(const k of ['efg-fragrance-days-v1','efg-profile','efg-fragrance-setting'])localStorage.removeItem(k)").catch(() => {});
  ws.close(); await fetch(`${remote}/json/close/${target.id}`);
}
