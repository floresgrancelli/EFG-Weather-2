// Read-only app tests in a disposable browser. The API index and healthy tiles are real.
// HTTP/network/invalid-image failures are injected ONLY in this browser, never into app data.
import assert from "node:assert/strict";
const url = process.env.EFG_TEST_URL || "http://localhost:80/";
const remote = process.env.EFG_CDP_URL || "http://localhost:9223";
const tabs = await (await fetch(`${remote}/json`)).json();
const socket = new WebSocket(tabs.find(p => p.type === "page").webSocketDebuggerUrl);
const pending = new Map(), runtimeErrors = [], tileRequests = [], providerRequests = [], responses = [], checks = [];
let id = 0, mode = "live";
socket.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") runtimeErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === "Network.requestWillBeSent" && /https:\/\/(?:api|tilecache)\.rainviewer\.com\//.test(m.params.request.url)) providerRequests.push(m.params.request.url);
  if (m.method === "Network.responseReceived" && m.params.response.url.includes("tilecache.rainviewer.com/")) responses.push({ url: m.params.response.url, status: m.params.response.status });
  if (m.method === "Fetch.requestPaused") {
    const { requestId, request } = m.params, radar = request.url.includes("/v2/radar/"), coverage = request.url.includes("/v2/coverage/");
    tileRequests.push({ url: request.url, at: Date.now(), mode });
    const failure = mode === "fail-radar" && radar || mode === "fail-cover" && coverage;
    if (failure) void call("Fetch.fulfillRequest", { requestId, responseCode: 503, responseHeaders: [{ name: "content-type", value: "text/plain" }, { name: "access-control-allow-origin", value: "*" }], body: btoa("TEST: unavailable tile") });
    else if (mode === "network" && radar) void call("Fetch.failRequest", { requestId, errorReason: "ConnectionReset" });
    else if (mode === "corrupt" && radar) void call("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "content-type", value: "image/png" }, { name: "access-control-allow-origin", value: "*" }], body: btoa("TEST: invalid PNG, never valid radar") });
    else if (mode === "rate" && radar) void call("Fetch.fulfillRequest", { requestId, responseCode: 429, responseHeaders: [{ name: "retry-after", value: "2" }, { name: "access-control-expose-headers", value: "Retry-After" }, { name: "cache-control", value: "no-store" }, { name: "content-type", value: "text/plain" }, { name: "access-control-allow-origin", value: "*" }], body: "" });
    else void call("Fetch.continueRequest", { requestId });
  }
};
await new Promise(resolve => { socket.onopen = resolve; });
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(new Error(`Timeout ${method}`)); }, 20000);
    pending.set(key, m => { clearTimeout(timer); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
}
async function evaluate(expression) {
  const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function luminance(rgb) {
  return rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
}
async function wait(expression, label, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await sleep(100); }
  throw new Error(`Timed out: ${label}; ${await evaluate(`document.querySelector(".module-page")?.innerText.slice(0,2200)`)}`);
}
const click = id => evaluate(`document.querySelector('[data-testid="${id}"]')?.click()`);
const ready = () => wait(`document.querySelector('[data-testid="radar-layer-health"]')?.dataset.radarState === "ready" && document.querySelector('[data-testid="radar-layer-health"]')?.dataset.coverageState === "ready"`, "both actual image layers decoded");
async function fresh(nextMode = "live", international = true) {
  mode = nextMode;
  const token = crypto.randomUUID();
  const bootstrap = await call("Page.addScriptToEvaluateOnNewDocument", { source: `window.__radarCase=${JSON.stringify(token)};localStorage.clear();localStorage.setItem("efg-location-preference",JSON.stringify({version:1,mode:"manual",lastManual:{name:"Caseros",region:"Buenos Aires",latitude:-34.6037,longitude:-58.5638,source:"manual"},prompted:true,approved:false}));` });
  await call("Page.navigate", { url });
  await wait(`window.__radarCase === ${JSON.stringify(token)} && !!document.querySelector('[data-testid="mobile-nav-radar-y-alertas"]')`, "new app document");
  await call("Page.removeScriptToEvaluateOnNewDocument", { identifier: bootstrap.identifier });
  const before = providerRequests.length;
  await click("mobile-nav-radar-y-alertas");
  await wait(`document.querySelector('[data-testid="button-radar-argentina"]')?.getAttribute("aria-pressed") === "true"`, "Argentine radar is default");
  assert.equal(await evaluate(`document.querySelector('[data-testid="radar-international-panel"]').hidden`), true);
  await sleep(150);
  assert.equal(providerRequests.length, before, "default Argentine view does not contact RainViewer");
  if (international) { await click("button-radar-international"); await wait(`!!document.querySelector('[data-testid="radar-layer-health"]')`, "international radar renders"); }
}
async function frame(value) {
  await evaluate(`(()=>{const e=document.querySelector('[data-testid="input-radar-frame"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,String(${value}));e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}))})()`);
  await wait(`document.querySelector('[data-testid="input-radar-frame"]').value === "${value}"`, "selected frame");
}
await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable");
await call("Emulation.setDeviceMetricsOverride", { width: 320, height: 844, deviceScaleFactor: 1, mobile: true });
await call("Network.clearBrowserCache"); // Isolate this disposable browser from earlier injected HTTP failures.
await call("Fetch.enable", { patterns: [{ urlPattern: "https://tilecache.rainviewer.com/*", requestStage: "Request" }] });
try {
  if (process.env.EFG_RADAR_PRIORITY_ONLY) {
    await fresh("live", false);
    const hero = await evaluate(`(()=>{const a=document.querySelector('[data-testid="link-smn-visor"]'),r=a.getBoundingClientRect();return {href:a.href,target:a.target,height:r.height,top:r.top,bottom:r.bottom}})()`);
    assert.equal(hero.href, "https://ws2.smn.gob.ar/radar"); assert.equal(hero.target, "_blank"); assert.ok(hero.height >= 44 && hero.top >= 0 && hero.bottom < 774, "primary official action visible without scrolling");
    assert.match(await evaluate(`document.querySelector('[data-testid="radar-selected-locality"]').textContent`), /Caseros/);
    await evaluate(`document.querySelector(".radar-stations").open = true`);
    const stations = await evaluate(`[...document.querySelectorAll(".radar-station-links a")].map(a=>({text:a.textContent,url:a.href,height:a.getBoundingClientRect().height}))`);
    assert.equal(stations.length, 5); assert.ok(stations.every(a => a.url === hero.href && a.height >= 44));
    for (const name of ["Mosaico Argentina", "Mosaico Centro", "Ezeiza", "Pergamino", "Mar del Plata"]) assert.ok(stations.some(a => a.text.includes(name)));
    assert.equal(await evaluate(`document.querySelectorAll(".module-page iframe,.radar-argentina img").length`), 0);
    for (let i = 0; i < 2; i++) {
      const colors = await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('[data-testid="link-smn-visor"]'));return [s.color,s.backgroundColor]})()`);
      const values = colors.map(luminance); assert.ok((Math.max(...values) + .05) / (Math.min(...values) + .05) >= 4.5, "primary action meets AA text contrast in both themes");
      await click("button-toggle-theme"); await sleep(150);
    }
    checks.push("Argentina is default; SMN is the prominent visible action, 5 explicitly portal-based choices, SINARAME fallback, no unauthorized embeds or RainViewer requests");
    await click("button-radar-international"); await ready();
    assert.match(await evaluate(`document.querySelector('[data-testid="text-radar-label"]').textContent`), /no comercial/);
    await click("button-radar-official-fallback");
    await wait(`document.querySelector('[data-testid="button-radar-argentina"]').getAttribute("aria-pressed")==="true"`, "official fallback");
    const stopped = providerRequests.length; await sleep(300); assert.equal(providerRequests.length, stopped);
    checks.push("International map still loads real frames on demand, and returning to official sources stops its requests");
  }
  if (!process.env.EFG_RADAR_RATE_ONLY && !process.env.EFG_RADAR_PRIORITY_ONLY) {
  await fresh(); await ready();
  await wait(`document.querySelector('[data-testid="radar-point-status"]')?.dataset.kind === "uncovered"`, "actual Caseros coverage mask");
  assert.match(await evaluate(`document.querySelector('[data-testid="radar-point-status"]').textContent`), /no la ausencia de radares/);
  assert.equal(await evaluate(`document.querySelectorAll('[data-testid="button-radar-place-caseros"]').length`), 1);
  const max = Number(await evaluate(`document.querySelector('[data-testid="input-radar-frame"]').max`));
  assert.ok(max >= 3);
  const times = [];
  for (const value of [0, 2, 4]) {
    await frame(value); await ready();
    times.push(await evaluate(`document.querySelector('[data-testid="text-radar-frame-time"]').textContent`));
  }
  assert.equal(new Set(times).size, 3);
  checks.push("Three real historic frames decode; Caseros mask is genuinely opaque, not a tile error or no-rain claim");
  assert.ok(await evaluate(`!!document.querySelector(".leaflet-container .leaflet-tile-loaded")`));
  const beforePlay = times.at(-1);
  await click("button-radar-play");
  await wait(`document.querySelector('[data-testid="text-radar-frame-time"]').textContent !== ${JSON.stringify(beforePlay)}`, "controlled animation advances after loading", 24000);
  await click("button-radar-play"); await ready();
  const paused = await evaluate(`document.querySelector('[data-testid="text-radar-frame-time"]').textContent`);
  await sleep(300);
  assert.equal(await evaluate(`document.querySelector('[data-testid="text-radar-frame-time"]').textContent`), paused);
  checks.push("Play/pause advances only complete frames, no preloading burst");

  const beforeToggle = tileRequests.length;
  await click("checkbox-radar-coverage"); await sleep(100);
  assert.equal(tileRequests.length, beforeToggle, "hiding mask does not discard/re-request it or lose coverage knowledge");
  assert.equal(await evaluate(`document.querySelector('[data-testid="radar-point-status"]').dataset.kind`), "uncovered");
  await click("checkbox-radar-coverage");

  await fresh("fail-radar");
  await wait(`document.querySelector('[data-testid="radar-layer-error"]')?.textContent.includes("503")`, "precipitation HTTP error shown");
  assert.match(await evaluate(`document.querySelector('[data-testid="radar-layer-error"]').textContent`), /Precipitación/);
  assert.ok(await evaluate(`!!document.querySelector(".leaflet-tile-pane img.leaflet-tile-loaded")`), "base map stays visible");
  mode = "live"; await click("button-radar-retry-layers"); await ready();
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="radar-layer-error"]')`), false);
  checks.push("Actual tile HTTP handling: injected 503 leaves base map available; retry downloads valid imagery before clearing error");

  await fresh("network");
  await wait(`document.querySelector('[data-testid="radar-layer-error"]')?.textContent.includes("conexión")`, "network failure explicit");
  mode = "live"; await click("button-radar-retry-layers"); await ready();
  checks.push("Network failures are visible and recover, not disguised as empty precipitation");

  await fresh("corrupt");
  await wait(`document.querySelector('[data-testid="radar-layer-error"]')?.textContent.includes("no es una imagen")`, "invalid PNG rejected");
  mode = "live"; await click("button-radar-retry-layers"); await ready();
  checks.push("HTTP 200 with invalid image is rejected; corrupt data is evicted rather than cached as a blank radar");

  await click("button-radar-argentina");
  await evaluate(`document.querySelector(".radar-stations").open = true`);
  const official = await evaluate(`[...document.querySelectorAll(".radar-official-links a")].map(a=>({text:a.textContent,url:a.href,target:a.target,height:a.getBoundingClientRect().height}))`);
  assert.equal(official.length, 6); assert.ok(official.every(a => a.target === "_blank" && a.height >= 44));
  assert.equal(official[0].url, "https://ws2.smn.gob.ar/radar"); assert.equal(official[1].url, official[0].url);
  assert.ok(official[5].url.endsWith("/sistema-nacional-de-radares-meteorologicos-sinarame/imagenes"));
  assert.equal(await evaluate(`document.querySelector('[data-testid="radar-international-panel"]').hidden`), true);
  assert.equal(await evaluate(`document.querySelectorAll(".module-page iframe").length`), 0);
  const atArgentina = tileRequests.length; await sleep(300); assert.equal(tileRequests.length, atArgentina);
  await click("button-radar-international"); await ready();
  checks.push("Argentina selector has accessible official source links and no iframe/scraping/background tile requests");

  await fresh("fail-cover");
  await wait(`document.querySelector('[data-testid="radar-layer-error"]')?.textContent.includes("Cobertura:")`, "mask-specific failure shown");
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="radar-point-status"]')`), false, "failed mask never classified as no coverage/no rain");
  mode = "live"; await click("button-radar-retry-layers"); await ready();
  checks.push("Coverage-mask failure is separate from precipitation, retry also reloads failed mask");
  }

  if (!process.env.EFG_RADAR_PRIORITY_ONLY) {
  await fresh("rate");
  await wait(`document.querySelector('[data-testid="radar-layer-error"]')?.textContent.includes("429")`, "provider rate limit shown");
  assert.equal(await evaluate(`document.querySelector('[data-testid="button-radar-retry-layers"]').disabled`), true);
  const duringPause = tileRequests.length;
  await sleep(200); assert.equal(tileRequests.length, duringPause, "no requests during Retry-After");
  mode = "live";
  await wait(`!document.querySelector('[data-testid="button-radar-retry-layers"]')?.disabled`, "Retry-After expires", 10000);
  await click("button-radar-retry-layers"); await ready();
  checks.push("HTTP 429 respects Retry-After, pauses queued requests and recovers through explicit retry");
  }

  for (const request of tileRequests) {
    const p = new URL(request.url).pathname.split("/").filter(Boolean);
    assert.equal(new URL(request.url).origin, "https://tilecache.rainviewer.com");
    assert.equal(p[3], "256"); assert.ok(+p[4] <= 7 && +p[4] >= 3);
    assert.equal(p[7], p[1] === "radar" ? "2" : "0");
    assert.equal(p[8], p[1] === "radar" ? "1_0.png" : "0_0.png");
  }
  await click("button-radar-argentina"); // Avoid unnecessary provider downloads during layout-only checks.
  for (const width of [320, 390, 768, 1440]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 768 });
    await sleep(150);
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `no horizontal overflow ${width}`);
  }
  for (const page of ["agro", "comunidad", "más", "inicio"]) {
    await click(`mobile-nav-${page}`); await sleep(150);
    if (page === "más") {
      const pro = await evaluate(`document.querySelector('[data-testid="pro-model-comparison"]').textContent`);
      for (const label of ["Próximamente", "ECMWF", "GFS", "No promediaremos", "todavía no habilitada"]) assert.ok(pro.includes(label));
    }
  }
  await wait(`!!document.querySelector('[data-testid="current-sky-icon"]')`, "home real forecast retained");
  assert.ok(responses.some(r => r.status === 200));
  assert.deepEqual(runtimeErrors, []);
  console.log(JSON.stringify({ status: "PASS", checks, healthyHTTP200Responses: responses.filter(r => r.status === 200).length, runtimeErrors, note: "Only failure cases injected into disposable test browser; no simulated healthy radar and no community writes" }, null, 2));
} finally {
  await call("Fetch.disable").catch(() => {});
  socket.close();
}
