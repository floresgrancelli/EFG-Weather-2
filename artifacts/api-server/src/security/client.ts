import type { Request } from "express";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { argentinaDay, hashToken } from "../lib/community-privacy";

export const TRUSTED_PROXY_RANGES = ["loopback", "uniquelocal"];
export const PUBLIC_ORIGINS = new Set(["https://opulent-hidden-wamp.replit.app"]);
// Deploy-specific explicit origin, never inferred from untrusted Host/X-Forwarded-Host.
// A new public site accepts browser writes only from its own configured origin.
if (process.env.NODE_ENV === "production" && process.env.PUBLIC_ORIGIN) {
  const url = new URL(process.env.PUBLIC_ORIGIN);
  if (url.protocol !== "https:" || url.origin !== process.env.PUBLIC_ORIGIN || url.username || url.password) {
    throw new Error("Invalid PUBLIC_ORIGIN; use an exact https origin without path or trailing slash");
  }
  PUBLIC_ORIGINS.clear();
  PUBLIC_ORIGINS.add(url.origin);
}
const cookieName = "efg_community";

export function safeOrigin(req: Request): boolean {
  if (req.get("sec-fetch-site") === "cross-site") return false;
  const origin = req.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin) return false;
    if (PUBLIC_ORIGINS.has(origin)) return true;
    if (process.env.NODE_ENV === "production") return false;
    return origin === `https://${process.env.REPLIT_DEV_DOMAIN}` ||
      ["http://localhost", "http://localhost:80", "http://127.0.0.1", "http://127.0.0.1:80"].includes(origin);
  } catch { return false; }
}
function signingSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Community security unavailable");
  return secret;
}
function sign(token: string) {
  return createHmac("sha256", signingSecret()).update(`efg-cookie-v1:${token}`).digest("hex");
}
export function readBrowser(req: Request) {
  const raw = req.headers.cookie?.split(";").map(p => p.trim()).find(p => p.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!raw) return null;
  // Upgrade existing high-entropy anonymous cookies on GET without losing ownership.
  if (/^[a-f0-9]{64}$/.test(raw)) return { token: raw, legacy: true };
  const match = /^v1\.([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(raw);
  if (!match) return null;
  const expected = Buffer.from(sign(match[1]), "hex"), actual = Buffer.from(match[2], "hex");
  return timingSafeEqual(expected, actual) ? { token: match[1], legacy: false } : null;
}
export function issueBrowser() {
  const token = randomBytes(32).toString("hex");
  return { token, legacy: false };
}
export function browserCookie(token: string) { return `v1.${token}.${sign(token)}`; }
export function actorHash(token: string) { return hashToken(token); }
export function networkHash(req: Request, now = new Date()) {
  // Express resolves the rightmost untrusted hop, never arbitrary leftmost XFF.
  // Collapse the IPv6 host portion so rotating addresses in one /64 cannot reset quotas.
  const raw = (req.ip ?? req.socket.remoteAddress ?? "unknown").replace(/^::ffff:/, "");
  const address = raw.includes(":") ? ipv6Prefix(raw) : raw;
  return createHmac("sha256", signingSecret()).update(`network:${argentinaDay(now)}:${address}`).digest("hex");
}
function ipv6Prefix(value: string) {
  const clean = value.split("%")[0];
  const [left, right = ""] = clean.split("::");
  const a = left ? left.split(":") : [], b = right ? right.split(":") : [];
  const pieces = clean.includes("::") ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b] : a;
  return `${pieces.slice(0, 4).map(p => p.padStart(4, "0").toLowerCase()).join(":")}::/64`;
}
