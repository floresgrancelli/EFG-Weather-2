// Read-only live UI checks; synthetic conditions exist ONLY in a labelled, transient icon test panel.
import assert from "node:assert/strict";
import { currentSky } from "../../artifacts/efg-weather/src/lib/current-sky.ts";
import { formatValue } from "../../artifacts/efg-weather/src/lib/weather.ts";

const remote = process.env.EFG_CDP_URL || "http://localhost:9223";
const url = process.env.EFG_TEST_URL || "http://localhost:80/";
const pages = await (await fetch(`${remote}/json`)).json();
const socket = new WebSocket(pages.find(p => p.type === "page").webSocketDebuggerUrl);
const pending = new Map(), errors = [], securityErrors = [];
let id = 0, weatherResponse;
socket.onmessage = event => {
  const m = JSON.parse(event.data);
  if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.text);
  if (m.method === "Log.entryAdded" && m.params.entry.source === "security" && m.params.entry.level === "error") securityErrors.push(m.params.entry.text);
  if (m.method === "Network.responseReceived" && m.params.response.url.startsWith("https://api.open-meteo.com/v1/forecast?")) weatherResponse = m.params.requestId;
};
await new Promise(resolve => { socket.onopen = resolve; });
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(new Error(`Timeout ${method}`)); }, 15000);
    pending.set(key, m => { clearTimeout(timer); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m); });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
}
async function evaluate(expression) {
  const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
  return r.result.result?.value;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, max = 25000) {
  const start = Date.now();
  while (Date.now() - start < max) { if (await evaluate(expression)) return; await sleep(150); }
  throw new Error(`Not ready: ${expression}`);
}
async function click(testid) {
  await evaluate(`document.querySelector('[data-testid="${testid}"]').click()`);
}
const checks = [];
try {
  await Promise.all([call("Page.enable"), call("Network.enable"), call("Runtime.enable"), call("Log.enable")]);
  await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call("Page.navigate", { url });
  await wait(`!!document.querySelector('[data-testid="current-sky-icon"]')`);
  assert.ok(weatherResponse, "No real weather response received");
  const body = await call("Network.getResponseBody", { requestId: weatherResponse });
  const actual = JSON.parse(body.result.body).current;
  const expected = currentSky(actual.weather_code, actual.is_day);
  assert.equal(await evaluate(`document.querySelector('[data-testid="current-sky-icon"]').dataset.condition`), expected.kind);
  assert.equal(await evaluate(`document.querySelector('[data-testid="current-sky-icon"]').dataset.phase`), expected.phase);
  assert.equal(await evaluate(`document.querySelector('[data-testid="text-apparent-temperature"]').textContent`), `${formatValue(actual.apparent_temperature)}°C`);
  checks.push("Live Open-Meteo current WMO/is_day and apparent temperature match the rendered ring");

  await evaluate(`document.querySelector('[data-testid="card-sponsor-palopoli"]').scrollIntoView()`);
  await wait(`document.querySelector('.palopoli-logo img').complete && document.querySelector('.palopoli-logo img').naturalWidth > 0`);
  const ad = await evaluate(`(() => {
    const logo = document.querySelector('.palopoli-logo'), name = document.querySelector('.palopoli-name'), slogan = document.querySelector('.palopoli-slogan'), image = logo.querySelector('img');
    return { name: name.textContent, slogan: slogan.textContent, label: document.querySelector('.palopoli-label').textContent,
      order: logo.nextElementSibling === name && name.nextElementSibling === slogan,
      belowLogo: name.getBoundingClientRect().top >= logo.getBoundingClientRect().bottom,
      local: new URL(image.src).origin === location.origin, filter: getComputedStyle(image).filter, width: image.naturalWidth,
      whatsapp: document.querySelector('[data-testid="link-sponsor-whatsapp"]').href,
      maps: document.querySelector('[data-testid="link-sponsor-maps"]').href,
      buttons: [...document.querySelectorAll('.palopoli-actions a')].every(e => e.getBoundingClientRect().height >= 44) };
  })()`);
  assert.equal(ad.name, "Farmacia Palopoli"); assert.equal(ad.slogan, "Encontrá lo que estás necesitando");
  assert.equal(ad.label, "Publicidad"); assert.ok(ad.order && ad.belowLogo && ad.local && ad.buttons);
  assert.equal(ad.filter, "none"); assert.equal(ad.width, 174);
  assert.equal(ad.whatsapp, "https://wa.me/5491126825231");
  assert.equal(new URL(ad.maps).hostname, "www.google.com");
  assert.match(new URL(ad.maps).searchParams.get("query"), /Farmacia Palopoli/);
  checks.push("Original local logo, exact brand/slogan, vertical hierarchy, separate advertising label and original links");

  for (const width of [320, 390, 768, 1440]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    await sleep(150);
    const geometry = await evaluate(`(() => {
      const ring = document.querySelector('.sky-ring'), icon = document.querySelector('[data-testid="current-sky-icon"]'), temp = document.querySelector('.ring-temp');
      const r = ring.getBoundingClientRect(), i = icon.getBoundingClientRect(), t = temp.getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth+1,
        separate: i.bottom <= t.top, contained: i.top >= r.top && i.bottom <= r.bottom,
        glyph: i.height, numeral: parseFloat(getComputedStyle(temp).fontSize), animation: getComputedStyle(icon).animationName };
    })()`);
    assert.ok(!geometry.overflow && geometry.separate && geometry.contained, `Ring layout at ${width}`);
    assert.ok(geometry.glyph >= 48 && geometry.numeral >= 60 && geometry.numeral > geometry.glyph, `Temperature remains dominant at ${width}`);
    assert.equal(geometry.animation, "none");
  }
  checks.push("320/390/768/1440px, large unobstructed temperature, contextual glyph and reduced motion");
  await click("button-toggle-theme");
  assert.ok(await evaluate(`!!document.querySelector('.dark')`));
  await click("button-toggle-theme");
  checks.push("Light/dark theme remains usable");

  // Only icons in a labelled test panel, never replacing real weather or persisting fixtures.
  await evaluate(`(async () => {
    const resources = performance.getEntriesByType('resource').map(e=>e.name);
    const React = (await import(resources.find(s=>/\\/react\\.js\\?/.test(s)))).default;
    const client = await import(resources.find(s=>/\\/react-dom_client\\.js\\?/.test(s)));
    const createRoot = client.createRoot ?? client.default.createRoot;
    const {CurrentSkyIcon} = await import('/src/components/CurrentSkyIcon.tsx');
    const panel = document.createElement('aside'); panel.id='efg-icon-fixtures'; panel.setAttribute('aria-label','Prueba técnica de iconos: NO es pronóstico');
    panel.style.cssText='position:fixed;inset:0;z-index:99999;background:#425d8d;color:white;display:grid;grid-template-columns:repeat(3,1fr);padding:16px;overflow:auto';
    document.body.append(panel);
    window.__efgIconRoot = createRoot(panel);
    const cases = [[0,1],[0,0],[2,1],[2,0],[3,1],[51,1],[65,0],[95,0],[45,1],[71,0],[null,null],[0,null]];
    window.__efgIconRoot.render(React.createElement(React.Fragment,null,React.createElement('h2',null,'Prueba técnica — solo iconos, NO pronóstico'),...cases.map(([code,isDay],i)=>React.createElement('div',{key:i,'data-fixture':i},React.createElement(CurrentSkyIcon,{code,isDay})))));
  })()`);
  await wait(`document.querySelectorAll('#efg-icon-fixtures [data-testid="current-sky-icon"]').length === 12`);
  const variants = await evaluate(`[...document.querySelectorAll('#efg-icon-fixtures [data-testid="current-sky-icon"]')].map(e=>({kind:e.dataset.condition,phase:e.dataset.phase,label:e.getAttribute('aria-label'),svg:!!e.querySelector('svg')}))`);
  assert.deepEqual(variants.map(v=>v.kind), ["clear","clear","partly-cloudy","partly-cloudy","cloudy","drizzle","rain","thunderstorm","fog","snow","unknown","clear"]);
  assert.deepEqual(variants.slice(0,4).map(v=>v.phase), ["day","night","day","night"]);
  assert.ok(variants.every(v=>v.svg && v.label)); assert.equal(variants[11].phase, "unknown");
  await evaluate(`window.__efgIconRoot.unmount(); document.querySelector('#efg-icon-fixtures').remove(); delete window.__efgIconRoot`);
  checks.push("All weather glyphs rendered in an explicitly labelled temporary test panel; no fake weather or alerts stored");

  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const tab of ["radar-y-alertas", "agro", "comunidad", "más", "inicio"]) {
    await click(`mobile-nav-${tab}`); await sleep(250);
  }
  await wait(`!!document.querySelector('[data-testid="current-sky-icon"]')`);
  assert.equal(errors.length, 0, errors.join("\n")); assert.equal(securityErrors.length, 0, securityErrors.join("\n"));
  checks.push("All five tabs navigate without runtime or CSP errors");
  console.log(JSON.stringify({ status: "PASS", actualCondition: expected.kind, actualPhase: expected.phase, checks, runtimeErrors: errors, securityErrors }, null, 2));
} finally {
  await evaluate(`window.__efgIconRoot?.unmount();document.querySelector('#efg-icon-fixtures')?.remove();delete window.__efgIconRoot`).catch(()=>{});
  socket.close();
}
