import { pool } from "@workspace/db";
import type { Request } from "express";
import { networkHash } from "./client";

export class RequestError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) { super(message); }
}
// Per-instance fast shedding before DB work. Bounded memory, no raw IPs retained.
type Window = { used: number; end: number };
const windows = new Map<string, Window>();
export function localLimit(key: string, max: number, milliseconds = 60000, now = Date.now()) {
  let window = windows.get(key);
  if (!window || window.end <= now) {
    if (windows.size >= 10000) {
      for (const [k, v] of windows) if (v.end <= now) windows.delete(k);
      if (windows.size >= 10000) throw new RequestError(503, "Hay muchas consultas. Probá de nuevo en unos segundos.", 10);
    }
    window = { used: 0, end: now + milliseconds }; windows.set(key, window);
  }
  if (++window.used > max) throw new RequestError(429, "Hiciste varias consultas seguidas. Esperá un momento y volvé a intentar.", Math.max(1, Math.ceil((window.end - now) / 1000)));
}
let inFlight = 0;
export function reserveCommunity() {
  if (inFlight >= 8) throw new RequestError(503, "Estamos atendiendo muchas consultas. Reintentá en unos segundos.", 5);
  inFlight++;
  return () => { inFlight--; };
}
export function fastRequestLimit(req: Request) {
  localLimit("all-community", 600);
  localLimit(`network:${networkHash(req)}`, 120);
}
export async function sharedLimit(req: Request, actor: string, action: string, max: number, periodSeconds = 3600) {
  const now = Date.now(), window = Math.floor(now / (periodSeconds * 1000));
  const network = networkHash(req);
  const entries = [
    { key: `${action}:browser:${actor}:${window}`, max },
    { key: `${action}:network:${network}:${window}`, max: max * 10 },
  ];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout='2500ms'");
    for (const entry of entries) {
      const result = await client.query(
        `INSERT INTO community_rate_limits (key,count,expires_at) VALUES ($1,1,$3)
         ON CONFLICT(key) DO UPDATE SET count=community_rate_limits.count+1
         WHERE community_rate_limits.count < $2 RETURNING count`,
        [entry.key, entry.max, new Date((window + 1) * periodSeconds * 1000 + 60000)]);
      if (!result.rowCount) throw new RequestError(429, "Alcanzaste el límite de esta acción. Esperá un rato y volvé a intentar.", Math.max(1, Math.ceil(((window + 1) * periodSeconds * 1000 - now) / 1000)));
    }
    await client.query("COMMIT");
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}
