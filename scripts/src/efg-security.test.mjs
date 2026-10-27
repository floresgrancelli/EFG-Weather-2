import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import app from "../../artifacts/api-server/src/app.ts";
import { pool } from "../../lib/db/src/index.ts";
import { browserCookie, actorHash, readBrowser, safeOrigin, networkHash, TRUSTED_PROXY_RANGES } from "../../artifacts/api-server/src/security/client.ts";
import { localLimit } from "../../artifacts/api-server/src/security/limits.ts";
import { purgeExpired } from "../../artifacts/api-server/src/security/retention.ts";
import { createWebApp } from "../../artifacts/efg-weather/server.mjs";

const require = createRequire(new URL("../../artifacts/api-server/package.json", import.meta.url));
const express = require("express");
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
let cookie = "";
async function request(path, method = "GET", body, headers = {}) {
  const response = await fetch(base + path, {
    method, headers: {
      ...(cookie ? { cookie } : {}), ...(method !== "GET" ? { origin: "http://localhost" } : {}),
      ...(body != null ? { "content-type": "application/json" } : {}), ...headers,
    }, body: body == null ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie?.startsWith("efg_community=")) cookie = setCookie.split(";")[0];
  const text = await response.text();
  let json; try { json = JSON.parse(text); } catch {}
  return { response, json, text };
}
after(async () => { server.close(); await pool.end(); });

test("proxy trust ignores spoofed leftmost XFF and rejects untrusted public peers", async () => {
  const probe = express();
  probe.set("trust proxy", TRUSTED_PROXY_RANGES);
  assert.equal(probe.get("trust proxy fn")("203.0.113.7", 0), false);
  assert.equal(probe.get("trust proxy fn")("127.0.0.1", 0), true);
  probe.get("/", (req, res) => res.json({ ip: req.ip, allowedOrigin: safeOrigin(req) }));
  const temp = probe.listen(0, "127.0.0.1"); await once(temp, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${temp.address().port}`, {
      headers: { "x-forwarded-for": "198.51.100.2, 203.0.113.8", "x-forwarded-host": "evil.invalid", origin: "https://evil.invalid" },
    });
    const data = await response.json();
    assert.equal(data.ip, "203.0.113.8");
    assert.equal(data.allowedOrigin, false);
  } finally { temp.close(); }
});
test("local limits are bounded, action-specific and return retry timing", () => {
  const key = randomUUID(); localLimit(key, 2, 1000, 1000); localLimit(key, 2, 1000, 1000);
  assert.throws(() => localLimit(key, 2, 1000, 1000), e => e.status === 429 && e.retryAfter === 1);
  assert.doesNotThrow(() => localLimit(key, 2, 1000, 2001));
});
test("network pseudonyms normalize mapped IPv4 and group IPv6 within a /64", () => {
  const hash = ip => networkHash({ ip });
  assert.equal(hash("::ffff:203.0.113.6") === hash("203.0.113.6"), true);
  assert.equal(hash("2001:db8:1:2::a") === hash("2001:db8:1:2::b"), true);
  assert.equal(hash("2001:db8:1:2::a") === hash("2001:db8:1:3::a"), false);
});
test("signed cookies detect tampering and retain legacy anonymous ownership", () => {
  const token = "a".repeat(64);
  const read = value => readBrowser({ headers: { cookie: `efg_community=${value}` } });
  const signed = browserCookie(token);
  assert.equal(read(signed)?.token, token);
  const parts = signed.split("."); parts[2] = "b".repeat(64);
  assert.equal(read(parts.join(".")), null);
  assert.equal(read(token)?.legacy, true);
  assert.equal(actorHash(read(browserCookie(read(token).token)).token), actorHash(token));
  assert.equal(safeOrigin({ get: name => name === "origin" ? "https://opulent-hidden-wamp.replit.app" : undefined }), true);
});
test("read endpoints work without accounts; JSON, size, origin and query guards fail safely", async () => {
  assert.equal((await request("/api/healthz")).response.status, 200);
  const reports = await request("/api/community/reports?limit=1");
  assert.equal(reports.response.status, 200); assert.ok(reports.json.reports.length <= 1);
  assert.ok(cookie.startsWith("efg_community=v1."));
  const secure = await request("/api/community/reports?limit=1", "GET", undefined, { cookie: "invalid", "x-forwarded-proto": "https" });
  assert.match(secure.response.headers.get("set-cookie"), /HttpOnly/);
  assert.match(secure.response.headers.get("set-cookie"), /SameSite=Strict/);
  assert.match(secure.response.headers.get("set-cookie"), /Secure/);
  assert.equal((await request("/api/community/reports?limit=51")).response.status, 400);
  assert.equal((await request("/api/community/reports?cursor=invalid")).response.status, 400);
  assert.equal((await request("/api/community/reports?unexpected=true")).response.status, 400);
  assert.equal((await request("/api/community/reports", "POST", {}, { origin: "https://evil.invalid", "x-forwarded-host": "evil.invalid" })).response.status, 403);
  assert.equal((await request("/api/community/reports", "POST", {}, { "sec-fetch-site": "cross-site" })).response.status, 403);
  const huge = await request("/api/community/reports", "POST", { text: "x".repeat(5000) });
  assert.equal(huge.response.status, 413); assert.ok(!/stack|postgres|secret/i.test(huge.text));
  assert.equal((await request("/api/community/reports", "POST", "{invalid")).response.status, 400);
  assert.equal((await request("/api/community/reports", "POST", "text", { "content-type": "text/plain" })).response.status, 415);
  assert.equal((await request(`/api/community/reports/${randomUUID()}/confirm`, "POST")).response.status, 404);
  assert.equal((await request("/api/community/fragrance-choice", "DELETE")).response.status, 200);
  assert.equal((await request("/api/admin")).response.status, 404);
  assert.equal((await request("/api/community/fragrance-choice", "PUT", { perfume: "x".repeat(101), consent: true })).response.status, 400);
  assert.equal((await request("/api/community/fragrance-choice", "PUT", { perfume: "Dior", consent: true, admin: true })).response.status, 400);
});
test("installed typography parser is patched, not only the lockfile", () => {
  const frontend = createRequire(new URL("../../artifacts/efg-weather/package.json", import.meta.url));
  const typography = createRequire(frontend.resolve("@tailwindcss/typography"));
  const [major, minor, patch] = typography("postcss-selector-parser/package.json").version.split(".").map(Number);
  assert.ok(major > 7 || major === 7 && (minor > 1 || minor === 1 && patch >= 6));
});
test("shared read quotas shed excess DB work and supply Retry-After", async () => {
  let limited;
  for (let i = 0; i < 31; i++) {
    const result = await request("/api/community/reports?limit=1");
    if (result.response.status === 429) { limited = result; break; }
    assert.equal(result.response.status, 200);
  }
  assert.ok(limited); assert.ok(Number(limited.response.headers.get("retry-after")) > 0);
  assert.equal((await request("/api/community/reports?limit=1", "HEAD")).response.status, 429);
});
test("expiry cleanup really deletes expired rows, not just hides them", async () => {
  const id = randomUUID();
  try {
    await pool.query(`INSERT INTO community_reports(id,actor_hash,category,latitude,longitude,area,observed_at,expires_at)
      VALUES($1,$2,'other',-54.82,-68.32,'Prueba técnica vencida',now()-interval '2 hours',now()-interval '1 minute')`, [id, "technical-test"]);
    await purgeExpired();
    assert.equal((await pool.query("SELECT id FROM community_reports WHERE id=$1", [id])).rowCount, 0);
  } finally { await pool.query("DELETE FROM community_reports WHERE id=$1", [id]); }
});
test("production HTML has CSP nonce and anti-framing headers; only public build files are served", async () => {
  const web = await createWebApp();
  const temp = web.listen(0, "127.0.0.1"); await once(temp, "listening");
  const address = `http://127.0.0.1:${temp.address().port}`;
  try {
    const r = await fetch(address);
    const html = await r.text(), policy = r.headers.get("content-security-policy");
    assert.equal(r.headers.get("x-frame-options"), "DENY");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.match(policy, /frame-ancestors 'none'/);
    assert.match(policy, /script-src-attr 'none'/);
    assert.match(policy, /api\.open-meteo\.com/);
    assert.match(policy, /tilecache\.rainviewer\.com/);
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
    assert.ok(nonce && html.includes(`nonce="${nonce}"`));
    assert.ok(!/onload=/.test(html));
    for (const path of ["/src/App.tsx", "/@vite/client", "/api/admin", "/.env", "/missing.map"]) {
      assert.equal((await fetch(address + path)).status, 404);
    }
    for (const path of ["/manifest.webmanifest", "/sw.js", "/icon-192.png", "/fragrances.json"]) {
      assert.equal((await fetch(address + path)).status, 200);
    }
  } finally { temp.close(); }
});
