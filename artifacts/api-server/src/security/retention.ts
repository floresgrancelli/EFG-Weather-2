import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

let running = false;
export async function purgeExpired() {
  if (running) return;
  running = true;
  const client = await pool.connect().catch(() => null);
  if (!client) { running = false; return; }
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout='2500ms'");
    const lock = await client.query("SELECT pg_try_advisory_xact_lock(57328109) AS locked");
    if (lock.rows[0]?.locked) {
      await client.query(`DELETE FROM community_reports WHERE id IN
        (SELECT id FROM community_reports WHERE expires_at <= now() ORDER BY expires_at LIMIT 500)`);
      await client.query(`DELETE FROM community_rate_limits WHERE key IN
        (SELECT key FROM community_rate_limits WHERE expires_at <= now() ORDER BY expires_at LIMIT 1000)`);
      await client.query(`DELETE FROM fragrance_choices WHERE id IN
        (SELECT id FROM fragrance_choices WHERE day < (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date-90 ORDER BY day LIMIT 500)`);
    }
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    logger.warn("La limpieza programada no pudo completarse; se reintentará.");
  } finally { client.release(); running = false; }
}
export function startRetention() {
  void purgeExpired();
  const timer = setInterval(() => { void purgeExpired(); }, 5 * 60000);
  timer.unref();
  return () => clearInterval(timer);
}
