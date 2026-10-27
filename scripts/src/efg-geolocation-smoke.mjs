// Browser permission/position fixtures ONLY in a disposable test browser.
// Weather requests remain real Open-Meteo requests. No community mutations.
import assert from "node:assert/strict";
const root = process.env.EFG_TEST_URL || "http://localhost:80/";
const remote = process.env.EFG_CDP_URL || "http://localhost:9223";
const origin = new URL(root).origin;
const tabs = await (await fetch(`${remote}/json`)).json();
const socket = new WebSocket(tabs.find(p => p.type === "page").webSocketDebuggerUrl);
const pending = new Map(), errors = [], requests = [], checks = [];
let id = 0, holdGps = false, held = null;
const GPS = { latitude: -34.481237, longitude: -58.517842, accuracy: 100 };
const NEXT = { latitude: -34.540123, longitude: -58.423456, accuracy: 100 };
socket.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === "Network.requestWillBeSent") requests.push(m.params.request.url);
  if (m.method === "Fetch.requestPaused") {
    if (holdGps && m.params.request.url.includes(String(GPS.latitude))) held = m.params.requestId;
    else void call("Fetch.continueRequest", { requestId: m.params.requestId });
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
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, label, timeout = 22000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await sleep(100); }
  throw new Error(`Timed out: ${label}`);
}
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`);
const pref = () => evaluate(`JSON.parse(localStorage.getItem("efg-location-preference"))`);
async function page({ permission = "granted", setup = "" } = {}) {
  await call("Browser.setPermission", { permission: { name: "geolocation" }, setting: permission, origin });
  await call("Emulation.setGeolocationOverride", GPS);
  const token = crypto.randomUUID();
  const script = await call("Page.addScriptToEvaluateOnNewDocument", { source: `window.__efgCase=${JSON.stringify(token)};localStorage.clear(); ${setup}` });
  await call("Page.navigate", { url: root });
  await wait(`window.__efgCase===${JSON.stringify(token)} && !!document.querySelector('[data-testid="button-use-current-location"]')`, "new Home document loads");
  await call("Page.removeScriptToEvaluateOnNewDocument", { identifier: script.identifier });
}
async function reload() {
  const previous = await evaluate("window.__efgDocId");
  await call("Page.reload", { ignoreCache: true });
  await wait(`window.__efgDocId && window.__efgDocId!==${JSON.stringify(previous)} && !!document.querySelector('[data-testid="button-use-current-location"]')`, "reloaded document");
}
async function weather() {
  await wait(`!!document.querySelector('[data-testid="text-apparent-temperature"]')`, "real weather loads");
}
async function selectCity() {
  await click('[data-testid="button-select-location"]');
  await evaluate(`Array.from(document.querySelectorAll(".location-popover .search-result")).find(b=>b.textContent.includes("San Isidro"))?.click()`);
  await wait(`document.querySelector(".hero-location")?.textContent === "San Isidro"`, "manual city climate");
}
await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable");
await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
const instrument = await call("Page.addScriptToEvaluateOnNewDocument", { source: `
window.__efgDocId=crypto.randomUUID();window.__gpsCalls=0; window.__watchCalls=0;
if(navigator.geolocation) {
 const get=navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
 navigator.geolocation.getCurrentPosition=(...args)=>{window.__gpsCalls++;return get(...args)};
 navigator.geolocation.watchPosition=()=>{window.__watchCalls++;throw new Error("Continuous GPS must not be used")};
}
` });
try {
  await page({ permission: "prompt" }); await weather();
  await wait(`!!document.querySelector('[data-testid="location-consent"]')`, "friendly first consent explanation");
  assert.equal(await evaluate("window.__gpsCalls"), 0);
  assert.match(await evaluate(`document.querySelector('[data-testid="text-location-source"]').textContent`), /no es tu GPS/);
  checks.push("First visit explains GPS and never queries it before consent; Caseros labelled initial, not GPS");

  // Hold the actual forecast request briefly to verify no old city's data under the new label.
  holdGps = true;
  await call("Fetch.enable", { patterns: [{ urlPattern: "https://api.open-meteo.com/v1/forecast?*", requestStage: "Request" }] });
  await click('[data-testid="button-location-accept"]');
  await call("Browser.setPermission", { permission: { name: "geolocation" }, setting: "granted", origin });
  await wait(`document.querySelector('[data-testid="button-select-location"]').textContent.includes("Ubicación actual")`, "GPS selected");
  const start = Date.now(); while (!held && Date.now() - start < 5000) await sleep(50);
  assert.ok(held, "GPS forecast request is real and carries the actual test fix");
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="text-apparent-temperature"]')`), false, "old city's circle must not survive under GPS label");
  holdGps = false; await call("Fetch.continueRequest", { requestId: held }); held = null;
  await call("Fetch.disable"); await weather();
  assert.equal(await evaluate(`document.querySelector(".hero-location").textContent`), "Ubicación actual");
  assert.equal((await pref()).mode, "auto");
  assert.ok(!(await evaluate("JSON.stringify(localStorage)")).includes(String(GPS.latitude)));
  checks.push("Consented GPS drives a real forecast; old circle/tips clear atomically during the switch");

  await reload(); await weather();
  await wait(`document.querySelector(".hero-location")?.textContent === "Ubicación actual"`, "automatic next visit");
  assert.equal(await evaluate("window.__gpsCalls"), 1);
  checks.push("Returning visit reacquires a fresh fix automatically without storing GPS coordinates");

  // Simulate a 16-minute absence without waiting in real time or changing production clocks.
  const beforeResume = await evaluate("window.__gpsCalls");
  await evaluate(`window.__testVisibility="hidden";Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>window.__testVisibility});document.dispatchEvent(new Event("visibilitychange"));const real=Date.now;Date.now=()=>real()+16*60*1000`);
  await call("Emulation.setGeolocationOverride", NEXT);
  assert.equal(await evaluate("window.__gpsCalls"), beforeResume, "no background tracking");
  await evaluate(`window.__testVisibility="visible";document.dispatchEvent(new Event("visibilitychange"))`);
  await wait(`window.__gpsCalls === ${beforeResume + 1}`, "foreground refresh");
  await wait(`!document.querySelector('[data-testid="button-use-current-location"]').disabled && document.querySelector('[data-testid="location-status"]').textContent.includes("obtenida")`, "foreground GPS completed");
  await weather();
  assert.ok(requests.some(u => u.includes(String(NEXT.latitude)) && u.startsWith("https://api.open-meteo.com/")));
  await evaluate(`document.dispatchEvent(new Event("visibilitychange"));window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}))`);
  await sleep(200);
  assert.equal(await evaluate("window.__gpsCalls"), beforeResume + 1, "no foreground request loop");
  checks.push("Foreground refresh after 15 minutes, no hidden-tab tracking, no rapid-resume loops");

  // Explicitly saved GPS favorites retain only an approximate zone and toggle without duplicates.
  await click('[data-testid="button-toggle-favorite"]'); await sleep(100);
  const favs = await evaluate(`JSON.parse(localStorage.getItem("efg-favorites"))`);
  assert.ok(favs.some(f => f.name === "Zona guardada"));
  assert.ok(!JSON.stringify(favs).includes(String(NEXT.latitude)));
  const count = favs.length;
  await click('[data-testid="button-toggle-favorite"]'); await sleep(100);
  assert.equal((await evaluate(`JSON.parse(localStorage.getItem("efg-favorites"))`)).length, count - 1);
  checks.push("GPS bookmark is explicitly saved as an approximate zone, toggles correctly and stores no precise fix");

  await evaluate(`localStorage.setItem("efg-agro-fields",JSON.stringify([
    {id:"test-caba",label:"Campo de prueba CABA",name:"CABA",region:"Buenos Aires",latitude:-34.6037,longitude:-58.3816,manual:false},
    {id:"test-san-isidro",label:"Campo de prueba San Isidro",name:"San Isidro",region:"Buenos Aires",latitude:-34.4708,longitude:-58.5286,manual:false}
  ]))`);
  await click('[data-testid="mobile-nav-agro"]');
  await wait(`!!document.querySelector('[data-testid="button-field-test-san-isidro"]')`, "Agro fields");
  await click('[data-testid="button-field-test-san-isidro"]');
  await wait(`localStorage.getItem("efg-agro-selected") === '"test-san-isidro"'`, "Agro selection persisted");
  const beforeAgroResume = await evaluate("window.__gpsCalls");
  await evaluate(`window.__testVisibility="hidden";document.dispatchEvent(new Event("visibilitychange"));const prior=Date.now;Date.now=()=>prior()+16*60*1000;window.__testVisibility="visible";document.dispatchEvent(new Event("visibilitychange"))`);
  await wait(`window.__gpsCalls === ${beforeAgroResume + 1}`, "GPS updates without replacing field");
  assert.match(await evaluate(`document.querySelector(".field-list li.selected .field-main").textContent`), /San Isidro/);
  await click('[data-testid="mobile-nav-inicio"]');
  await click('[data-testid="mobile-nav-agro"]');
  await wait(`document.querySelector(".field-list li.selected .field-main")?.textContent.includes("San Isidro")`, "Agro field survives navigation");
  await click('[data-testid="mobile-nav-inicio"]'); await weather();
  checks.push("Selected Agro field stays independent of GPS refresh and survives leaving/returning to Agro");

  await selectCity();
  assert.equal((await pref()).mode, "manual");
  await reload(); await weather();
  assert.equal(await evaluate("window.__gpsCalls"), 0);
  assert.equal(await evaluate(`document.querySelector(".hero-location").textContent`), "San Isidro");
  await evaluate(`window.__testVisibility="hidden";Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>window.__testVisibility});document.dispatchEvent(new Event("visibilitychange"));const real=Date.now;Date.now=()=>real()+16*60*1000;window.__testVisibility="visible";document.dispatchEvent(new Event("visibilitychange"))`);
  assert.equal(await evaluate("window.__gpsCalls"), 0);
  await click('[data-testid="button-use-current-location"]');
  await wait(`document.querySelector(".hero-location")?.textContent === "Ubicación actual"`, "explicitly return to GPS");
  checks.push("Manual city survives reload and foreground even with permission granted; explicit control returns to automatic");

  // The map and community receive only a rounded zone, never the full device fix.
  await click('[data-testid="mobile-nav-radar-y-alertas"]');
  await wait(`!!document.querySelector('[data-testid="text-radar-label"]')`, "radar navigation");
  await sleep(250);
  await click('[data-testid="mobile-nav-comunidad"]');
  await wait(`document.querySelector(".eyebrow")?.textContent === "COMUNIDAD"`, "community navigation");
  await sleep(250);
  await click('[data-testid="mobile-nav-inicio"]');
  for (const u of requests.filter(u => u.includes(String(GPS.latitude)) || u.includes(String(NEXT.latitude)))) {
    assert.equal(new URL(u).hostname, "api.open-meteo.com", "precise GPS only goes to weather provider");
  }
  checks.push("No precise fix sent to maps, community, reverse geocoders or the app backend");

  await page({ permission: "denied" }); await weather();
  await wait(`document.querySelector('[data-testid="location-status"]')?.textContent.includes("desactivada")`, "denied permission fallback");
  assert.equal(await evaluate("window.__gpsCalls"), 0);
  assert.equal(await evaluate(`document.querySelector(".hero-location").textContent`), "Caseros");
  await click('[data-testid="button-use-current-location"]');
  await wait(`document.querySelector('[data-testid="location-status"]')?.textContent.includes("No tenemos permiso")`, "denied retry feedback");
  assert.equal(await evaluate("window.__gpsCalls"), 1);
  await sleep(200); assert.equal(await evaluate("window.__gpsCalls"), 1);
  checks.push("Denied permission preserves real fallback weather and permits one explicit retry, not a loop");

  await page({ setup: `Object.defineProperty(navigator,"geolocation",{configurable:true,value:undefined})` }); await weather();
  assert.match(await evaluate(`document.querySelector('[data-testid="location-status"]').textContent`), /no está disponible/);
  assert.equal(await evaluate("window.__gpsCalls"), 0);
  checks.push("No GPS API: real weather, manual search and navigation remain available");

  await page({ setup: `navigator.geolocation.getCurrentPosition=(ok,fail)=>{window.__gpsCalls++;queueMicrotask(()=>fail({code:2}))}` }); await weather();
  await wait(`document.querySelector('[data-testid="location-status"]')?.textContent.includes("No pudimos obtener")`, "unavailable position");
  assert.equal(await evaluate("window.__gpsCalls"), 1);
  await click('[data-testid="button-use-current-location"]'); await sleep(100);
  assert.equal(await evaluate("window.__gpsCalls"), 2);
  checks.push("Unavailable fix keeps fallback and retry is user-triggered");

  await page({ setup: `navigator.geolocation.getCurrentPosition=()=>{window.__gpsCalls++};const timer=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>timer(fn,ms===11000?50:ms,...args)` }); await weather();
  await wait(`document.querySelector('[data-testid="location-status"]')?.textContent.includes("tardó demasiado")`, "bounded timeout");
  assert.equal(await evaluate("window.__gpsCalls"), 1);
  checks.push("Hung location request times out; app is never blocked");

  await page({ setup: `navigator.geolocation.getCurrentPosition=(ok)=>{window.__gpsCalls++;window.__deliverGps=ok}` }); await weather();
  await selectCity();
  await evaluate(`window.__deliverGps({coords:${JSON.stringify(GPS)}})`);
  await sleep(150);
  assert.equal(await evaluate(`document.querySelector(".hero-location").textContent`), "San Isidro");
  assert.equal((await pref()).mode, "manual");
  checks.push("Late GPS callback cannot override a manual city chosen while GPS was pending");

  await page({ permission: "denied", setup: `localStorage.setItem("efg-location",JSON.stringify({name:"Mi ubicación",region:"Ubicación actual",latitude:${GPS.latitude},longitude:${GPS.longitude}}))` }); await weather();
  assert.equal(await evaluate(`localStorage.getItem("efg-location")`), null);
  assert.ok(!(await evaluate("JSON.stringify(localStorage)")).includes(String(GPS.latitude)));
  assert.equal(await evaluate(`document.querySelector(".hero-location").textContent`), "Caseros");
  checks.push("Legacy precise stored fixes removed, never relabelled as newly verified GPS");
  assert.equal(await evaluate("window.__watchCalls"), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: "PASS", checks, runtimeErrors: errors, note: "GPS/permission/time fixtures in test browser only; actual forecasts fetched from Open-Meteo" }, null, 2));
} finally {
  if (held) await call("Fetch.continueRequest", { requestId: held }).catch(() => {});
  await call("Fetch.disable").catch(() => {});
  await call("Page.removeScriptToEvaluateOnNewDocument", { identifier: instrument.identifier }).catch(() => {});
  socket.close();
}
