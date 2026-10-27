import { Router } from "express";
import { ReverseGeocodeBody } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { safeOrigin, networkHash } from "../security/client";
import { localLimit, RequestError } from "../security/limits";
import { cachedLabel, cacheLabel, coarsePoint, georefLabel, osmLabel, UNKNOWN_PLACE } from "../lib/reverse-location";

const router = Router();
const UA = "EFGWeather/1.0 (https://opulent-hidden-wamp.replit.app; user-requested approximate locality)";
async function json(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(4500), headers: { "User-Agent": UA, Accept: "application/json", "Accept-Language": "es" }, redirect: "error" });
  if (!response.ok) throw new Error("Provider unavailable");
  return response.json();
}
router.post("/geolocation/reverse", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  if (!safeOrigin(req)) { res.status(403).json({ error: "Consultá desde EFG Weather." }); return; }
  const parsed = ReverseGeocodeBody.strict().safeParse(req.body);
  if (!parsed.success || !parsed.data.consent) { res.status(400).json({ error: "La identificación de localidad requiere tu consentimiento." }); return; }
  try {
    localLimit(`geo:${networkHash(req)}`, 4);
    localLimit("geo-total", 30);
    const { lat, lon } = coarsePoint(parsed.data.latitude, parsed.data.longitude);
    const hit = cachedLabel(lat, lon);
    if (hit) { res.json(hit); return; }
    let label = UNKNOWN_PLACE;
    // Georef supplies jurisdiction, not a guaranteed locality. v2.0 as requested.
    if (lat >= -56 && lat <= -21 && lon >= -74 && lon <= -53) {
      try { label = georefLabel(await json(`https://apis.datos.gob.ar/georef/api/v2.0/ubicacion?lat=${lat}&lon=${lon}`)); } catch { /* Honest fallback below. */ }
    }
    // One shared lock across ALL Autoscale instances. Fail closed if DB unavailable.
    const client = await pool.connect().catch(() => null);
    if (client) {
      let locked = false;
      try {
        locked = (await client.query("SELECT pg_try_advisory_lock(73261904) AS locked")).rows[0]?.locked === true;
        if (locked) {
          const slot = await client.query(`INSERT INTO community_rate_limits(key,count,expires_at)
            VALUES ('geocode:osm:global',1,now()+interval '1100 milliseconds')
            ON CONFLICT(key) DO UPDATE SET count=community_rate_limits.count+1,expires_at=now()+interval '1100 milliseconds'
            WHERE community_rate_limits.expires_at<=now() RETURNING key`);
          const budget = slot.rowCount ? await client.query(`INSERT INTO community_rate_limits(key,count,expires_at)
            VALUES ($1,1,now()+interval '24 hours')
            ON CONFLICT(key) DO UPDATE SET count=community_rate_limits.count+1
            WHERE community_rate_limits.count<500 RETURNING key`, [`geocode:osm:day:${new Date().toISOString().slice(0, 10)}`]) : null;
          if (slot.rowCount && budget?.rowCount) {
            try { label = osmLabel(await json(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=es`), label); } catch { /* Keep only confirmed jurisdiction. */ }
            // Minimum gap AFTER request finishes; no distributed bursts or periodic lookups.
            await client.query(`INSERT INTO community_rate_limits(key,count,expires_at) VALUES ('geocode:osm:global',1,now()+interval '1100 milliseconds')
              ON CONFLICT(key) DO UPDATE SET expires_at=now()+interval '1100 milliseconds'`);
          }
        }
      } catch { /* No provider calls without a confirmed shared quota. */ }
      finally {
        if (locked) await client.query("SELECT pg_advisory_unlock(73261904)").catch(() => {});
        client.release();
      }
    }
    // Do not cache missing/partial locality: an explicit retry may resolve it later.
    if (label.level === "locality") cacheLabel(lat, lon, label);
    res.json(label);
  } catch (err) {
    if (err instanceof RequestError) { res.set("Retry-After", String(err.retryAfter ?? 60)); res.status(err.status).json({ error: err.message }); return; }
    res.json(UNKNOWN_PLACE);
  }
});
export default router;
