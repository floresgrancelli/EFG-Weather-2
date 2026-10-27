// Run against an already-running Chromium remote debugging port. No packages needed.
import assert from "node:assert/strict";
const remote = process.env.EFG_CDP_URL || "http://localhost:9223";
const url = process.env.EFG_TEST_URL || "http://localhost:80/";
const pages = await (await fetch(`${remote}/json`)).json();
const socket = new WebSocket(pages.find(p => p.type === "page").webSocketDebuggerUrl);
const pending = new Map(), responses = [], exceptions = [], securityErrors = [];
let id = 0;
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
  if (message.method === "Network.responseReceived") responses.push(message.params.response);
  if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
  if (message.method === "Log.entryAdded" && message.params.entry.source === "security" && message.params.entry.level === "error") securityErrors.push(message.params.entry.text);
  if (message.method === "Page.javascriptDialogOpening") void call("Page.handleJavaScriptDialog", { accept: true });
};
await new Promise(resolve => { socket.onopen = resolve; });
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout ${method}`)); }, 15000);
    pending.set(key, result => { clearTimeout(timer); result.error ? reject(new Error(JSON.stringify(result.error))) : resolve(result); });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.result.exceptionDetails) throw new Error(result.result.exceptionDetails.text);
  return result.result.result?.value;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, max = 25000) {
  const start = Date.now();
  while (Date.now() - start < max) { if (await evaluate(expression)) return; await sleep(200); }
  throw new Error(`Timed out waiting for ${expression}; visible: ${(await evaluate("document.body.innerText")).slice(-1200)}`);
}
async function click(testid) {
  const selector = `[data-testid="${testid}"]`;
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function input(testid, value, tag = "input") {
  const selector = `[data-testid="${testid}"]`;
  await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(${tag === "select" ? "HTMLSelectElement" : "HTMLInputElement"}.prototype, "value").set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event("input", {bubbles:true})); e.dispatchEvent(new Event("change", {bubbles:true})); })()`);
}
const checks = [];
try {
  await Promise.all([call("Page.enable"), call("Network.enable"), call("Runtime.enable"), call("Log.enable")]);
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call("Page.navigate", { url });
  await wait(`document.querySelector('[data-testid="text-apparent-temperature"]')?.textContent.match(/\\d/)`);
  assert.equal(await evaluate("document.title.includes('EFG Weather')"), true);
  assert.equal(await evaluate("[...document.body.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).length"), 0, "Unexpected text outside the app root");
  assert.equal(await evaluate(`document.querySelectorAll('[data-testid^="forecast-day-"]').length`), 7);
  assert.equal(await evaluate(`document.querySelectorAll('[data-testid^="forecast-hour-"]').length`), 24);
  assert.equal(await evaluate(`document.querySelector('[data-testid="card-night-out"]').textContent.trim().endsWith("¡Perfúmese mucho!")`), true);
  assert.ok((await evaluate(`document.querySelector('[data-testid="link-sponsor-whatsapp"]').href`)).startsWith("https://wa.me/5491126825231"));
  assert.ok((await evaluate(`document.querySelector('[data-testid="link-sponsor-maps"]').href`)).startsWith("https://www.google.com/maps/search/"));
  await click("profile-femenino");
  await click("button-fragrance-advice");
  await wait(`/notas|salida/i.test(document.body.innerText)`);
  assert.ok(await evaluate(`document.body.innerText.includes("¿Por qué funciona con este clima?")`));
  await click("profile-masculino");
  assert.equal(await evaluate(`document.querySelector('[data-testid="profile-sin-preferencia"]')`), null, "Only male/female choices should be visible");
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Preferencia de fragancia"] button').length`), 2);
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Ocasión opcional"] button').length`), 4);
  const fragranceHasNoOverlaps = () => evaluate(`(() => {
    const card = document.querySelector('.fragrance-advice');
    const items = ['.fragrance-family', 'strong', '.fragrance-intensity', 'h3', 'p'].map(s => card.querySelector(s));
    if (items.some(x => !x)) return false;
    const rectangles = items.map(x => x.getBoundingClientRect());
    return rectangles.every((r,i) => i===0 || r.top >= rectangles[i-1].bottom - 1);
  })()`);
  for (const width of [320, 375, 390, 430]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(100);
    assert.equal(await fragranceHasNoOverlaps(), true, `Fragrance text overlaps at ${width}px`);
  }
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await click("button-toggle-theme"); await click("button-toggle-theme");
  checks.push("Home: live apparent temperature, 24 hourly/7 daily forecasts, two fragrance profiles and no overlapping advice, exact night signature, sponsor links, theme");
  await click("mobile-nav-radar-y-alertas");
  await wait(`Number(document.querySelector('[data-testid="input-radar-frame"]')?.max)>1`, 30000);
  await wait(`!!document.querySelector('.leaflet-tile-pane img[src*="rainviewer.com"][src*="/radar/"]')?.complete`, 20000);
  await click("button-radar-play");
  assert.equal(await evaluate(`document.querySelector('[data-testid="button-radar-play"]').getAttribute("aria-label")`), "Pausar animación");
  await click("button-radar-play");
  assert.equal(await evaluate(`document.querySelector('[data-testid="button-radar-play"]').getAttribute("aria-label")`), "Reproducir animación");
  assert.ok(await evaluate(`document.body.innerText.includes("Radar observado, NO pronóstico") && document.body.innerText.includes("buscá refugio")`));
  checks.push("Radar: real historical metadata and tile images, map, play/pause, source and safety labels");
  await click("mobile-nav-agro"); await click("button-agro-add"); await click("tab-agro-manual");
  await input("input-agro-name", "Campo de prueba técnica"); await input("input-agro-lat", "-33.89"); await input("input-agro-lon", "-60.57"); await click("button-agro-save-manual");
  await wait(`!!document.querySelector('[data-testid="text-ith-now"]')`, 30000);
  assert.ok(await evaluate(`document.body.innerText.includes("Campo de prueba técnica") && document.body.innerText.includes("24 h")`));
  await call("Page.reload");
  await wait(`!!document.querySelector('[data-testid="mobile-nav-agro"]')`);
  await click("mobile-nav-agro");
  await wait(`document.querySelector('[data-testid="text-agro-field"]')?.textContent === "Campo de prueba técnica"`);
  const removeId = await evaluate(`document.querySelector('[data-testid^="button-remove-"]').dataset.testid`);
  await click(removeId);
  await wait(`!document.querySelector('[data-testid^="button-remove-"]')`);
  checks.push("Agro: real field-specific forecast/ITH, local persistence across reload, field deletion");
  await click("mobile-nav-comunidad");
  await wait(`!!document.querySelector('[data-testid="input-survey-perfume"]')`, 20000);
  await click("button-category-other");
  await input("input-report-city-search", "Ushuaia");
  await wait(`!!document.querySelector('[data-testid="button-report-city-result"]')`, 20000);
  await click("button-report-city-result");
  await click("checkbox-report-consent"); await click("button-report-next");
  assert.ok(await evaluate(`document.body.innerText.includes("Confirmá y enviá") && document.body.innerText.includes("Ushuaia")`));
  // Do not submit a fictional weather observation.
  checks.push("Community: shared feed and manual-city geocoding, 3-step opt-in reporting flow (no fabricated observation submitted)");
  await input("input-survey-perfume", "Chanel Chance Eau Fraîche EDP");
  const consentId = await evaluate(`document.querySelector('input[data-testid*="survey"][data-testid*="consent"]').dataset.testid`);
  await click(consentId); await click("button-survey-save");
  await wait(`document.body.innerText.includes("Guardado. Gracias")`, 15000);
  const deleteChoiceId = await evaluate(`[...document.querySelectorAll('[data-testid]')].find(e=>/button-survey-(delete|remove)/.test(e.dataset.testid))?.dataset.testid`);
  assert.ok(deleteChoiceId);
  await click(deleteChoiceId);
  await wait(`!!document.querySelector('[data-testid="input-survey-perfume"]')`);
  checks.push("Survey: browser-generated API calls save real opt-in answer and delete it");
  await click("mobile-nav-más");
  assert.ok(await evaluate(`document.body.innerText.includes("En preparación") && document.body.innerText.includes("No publicadas")`));
  await click("mobile-nav-inicio");
  await call("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await click("button-refresh-weather");
  await wait(`!!document.querySelector('[data-testid="button-retry-weather"]')`);
  await call("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await click("button-retry-weather");
  await wait(`!!document.querySelector('[data-testid="text-apparent-temperature"]')`);
  checks.push("More statuses and offline error/retry recovery");
  for (const width of [390, 1440]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
    await sleep(300);
    assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth+1"), `horizontal overflow at ${width}`);
  }
  assert.equal(exceptions.length, 0, exceptions.join("\n"));
  assert.equal(securityErrors.length, 0, securityErrors.join("\n"));
  const radar = responses.filter(r => r.url.includes("tilecache.rainviewer.com"));
  const successfulRadarImages = radar.filter(r => r.status === 200).length;
  assert.ok(successfulRadarImages > 0, "No real RainViewer image succeeded");
  assert.ok(responses.some(r => r.url.includes("api.open-meteo.com") && r.status === 200));
  assert.ok(responses.some(r => r.url.includes("/api/community/fragrance-choice") && r.status === 200));
  console.log(JSON.stringify({ status: "PASS", checks, runtimeExceptions: exceptions, securityErrors, successfulRadarImages, responseFailures: responses.filter(r => r.status >= 400).map(r => ({ status: r.status, url: r.url.split("?")[0] })) }, null, 2));
} finally {
  await call("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => {});
  // Test-profile cleanup only; never touch another browser's anonymous session.
  await evaluate(`fetch("/api/community/fragrance-choice",{method:"DELETE"}).catch(()=>{}); localStorage.removeItem("efg-agro-fields")`).catch(() => {});
  socket.close();
}
