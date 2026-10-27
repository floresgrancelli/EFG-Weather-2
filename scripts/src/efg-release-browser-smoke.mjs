// Disposable Chromium only. Real weather; GPS is emulated, late-label fixture is
// confined to this browser request. No community writes or production requests.
import assert from "node:assert/strict";
const root = process.env.EFG_TEST_URL || "http://localhost:80/";
const remote = process.env.EFG_CDP_URL || "http://localhost:9223";
const tabs = await (await fetch(`${remote}/json`)).json();
const socket = new WebSocket(tabs.find(p => p.type === "page").webSocketDebuggerUrl);
const pending = new Map(), requests = [], errors = [], held = [];
let id = 0, holdReverse = false;
socket.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); }
  if (m.method === "Network.requestWillBeSent") requests.push(m.params.request.url);
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.text);
  if (m.method === "Page.javascriptDialogOpening") void call("Page.handleJavaScriptDialog", { accept: true });
  if (m.method === "Fetch.requestPaused") {
    if (holdReverse) held.push(m.params.requestId);
    else void call("Fetch.continueRequest", { requestId: m.params.requestId });
  }
};
await new Promise(resolve => { socket.onopen = resolve; });
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id, timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 20000);
    pending.set(key, r => { clearTimeout(timer); r.error ? reject(new Error(JSON.stringify(r.error))) : resolve(r); });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
}
async function js(expression) {
  const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
  return r.result.result?.value;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 35000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await js(expression)) return; await pause(150); }
  throw new Error(`Wait failed: ${expression}; ${(await js("document.body.innerText")).slice(-900)}`);
}
const click = id => js(`document.querySelector('[data-testid="${id}"]').click()`);
const forecastCount = () => requests.filter(u => u.includes("api.open-meteo.com/v1/forecast")).length;
const checks = [];
try {
  await Promise.all([call("Page.enable"), call("Network.enable"), call("Runtime.enable")]);
  await call("Browser.setPermission", { permission: { name: "geolocation" }, setting: "denied", origin: new URL(root).origin });
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await call("Page.navigate", { url: root });
  await wait(`/\\d/.test(document.querySelector('[data-testid="text-apparent-temperature"]')?.textContent || '')`);
  assert.equal(await js("document.querySelectorAll('.mobile-bottom-nav button').length"), 4);
  assert.equal(await js("[...document.querySelectorAll('.mobile-bottom-nav button')].some(b=>b.textContent.includes('Radar'))"), false);
  assert.equal(await js(`document.querySelectorAll('[data-testid^="forecast-day-"]').length`), 7);
  assert.equal(await js(`document.querySelectorAll('[data-testid^="forecast-hour-"]').length`), 24);
  assert.equal(await js("document.documentElement.scrollWidth<=innerWidth"), true);
  assert.ok(await js(`document.querySelector('[data-testid="link-sponsor-whatsapp"]').href.includes('5491126825231')`));
  assert.equal(await js(`document.querySelector('[data-testid="card-night-out"]').textContent.trim().endsWith("¡Perfúmese mucho!")`), true);
  assert.ok(await js("document.body.innerText.includes('¡Perfúmese mucho!')"));
  await click("button-toggle-theme");
  assert.equal(await js("document.documentElement.classList.contains('dark')"), true);
  await click("button-toggle-theme");
  for (const name of ["agro", "comunidad", "más"]) {
    await click(`mobile-nav-${name}`); await pause(500);
    assert.ok(await js("document.querySelector('main').innerText.length>80"));
  }
  assert.equal(await js(`[...document.querySelectorAll('a')].some(a=>/rainviewer|sinarame|ws2\\.smn/.test(a.href))`), false);
  assert.ok(await js("document.body.innerText.includes('Licencia comercial pendiente')"));
  assert.ok(await js(`[...document.querySelectorAll('a')].some(a=>a.href==='https://www.smn.gob.ar/alertas')`));
  await click("mobile-nav-inicio");
  checks.push("390px light/dark, reduced motion, real forecast, sponsor, night signature, Agro/Community/More, no radar links");

  await call("Emulation.setGeolocationOverride", { latitude: -34.6037, longitude: -58.5638, accuracy: 80 });
  await call("Browser.setPermission", { permission: { name: "geolocation" }, setting: "granted", origin: new URL(root).origin });
  await wait("!document.querySelector('[data-testid=\"button-use-current-location\"]').disabled");
  await click("button-use-current-location");
  await wait("document.querySelector('[data-testid=\"location-status\"]').textContent.includes('identificada')");
  for (const selector of ['[data-testid="header-location"]', '[data-testid="button-select-location"]', ".hero-location"])
    assert.ok(await js(`document.querySelector(${JSON.stringify(selector)}).textContent.includes('Caseros')`));
  assert.ok(await js(`document.querySelector('[data-testid="text-location-source"]').textContent.includes('GPS')`));
  checks.push("Real reverse API result appears in header/selector/circle; forecast coordinates stay GPS");

  await call("Fetch.enable", { patterns: [{ urlPattern: "*/api/geolocation/reverse", requestStage: "Request" }] });
  holdReverse = true;
  await click("button-use-current-location"); await wait("document.body.innerText.includes('Consultando el nombre')");
  while (!held.length) await pause(100);
  await click("button-select-location");
  await js(`[...document.querySelectorAll('.search-result')].find(b=>b.textContent.includes('CABA')).click()`);
  await pause(250);
  for (const requestId of held.splice(0)) await call("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ name: "TEST-LATE", region: "TEST", source: "Test fixture only", level: "locality" })).toString("base64") }).catch(() => {});
  holdReverse = false; await call("Fetch.disable"); await pause(400);
  assert.ok(await js(`document.querySelector('[data-testid="header-location"]').textContent.includes('CABA')`));
  assert.equal(await js("document.body.innerText.includes('TEST-LATE')"), false);
  await wait("!document.querySelector('[data-testid=\"button-refresh-weather\"]').disabled");
  checks.push("Late geocoder reply cannot overwrite manual CABA");

  const before = forecastCount();
  await js("window.__realNow=Date.now; Date.now=()=>window.__realNow()+21*60000; window.dispatchEvent(new Event('pageshow'))");
  await wait("!document.querySelector('[data-testid=\"button-refresh-weather\"]').disabled");
  await pause(300);
  assert.equal(forecastCount(), before + 1);
  await js("window.dispatchEvent(new Event('pageshow'))"); await pause(150);
  assert.equal(forecastCount(), before + 1, "No duplicate foreground fetch");
  await js(`window.__hidden=true; Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__hidden?'hidden':'visible'}); Date.now=()=>window.__realNow()+42*60000; document.dispatchEvent(new Event('visibilitychange'))`);
  await pause(150); assert.equal(forecastCount(), before + 1, "No background fetch");
  await js("window.__hidden=false; document.dispatchEvent(new Event('visibilitychange'))"); await pause(250);
  assert.equal(forecastCount(), before + 2);
  await js("Date.now=window.__realNow");
  checks.push("20-minute expiry refresh, foreground deduplication, hidden-page suppression");

  await call("Browser.setPermission", { permission: { name: "geolocation" }, setting: "denied", origin: new URL(root).origin });
  await click("button-use-current-location");
  await wait("document.body.innerText.includes('No tenemos permiso')");
  assert.ok(await js(`document.querySelector('[data-testid="header-location"]').textContent.includes('CABA')`));
  await js("Object.defineProperty(navigator,'geolocation',{configurable:true,value:undefined})");
  await click("button-use-current-location"); await wait("document.body.innerText.includes('no está disponible')");
  checks.push("Denied/unavailable GPS preserves manual place");
  await js("document.activeElement?.blur()");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  assert.ok(await js("!!document.activeElement && document.activeElement!==document.body"));
  for (const width of [360, 768, 1440]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
    assert.equal(await js("document.documentElement.scrollWidth<=innerWidth"), true, `Overflow at ${width}`);
  }
  assert.equal(requests.some(u => /rainviewer/.test(u)), false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks, weatherRequests: forecastCount(), uncaughtErrors: errors.length }, null, 2));
} finally { socket.close(); }
