import { Router, type Request, type Response, type NextFunction } from "express";
import { pool } from "@workspace/db";
import {
  CreateCommunityReportBody, ConfirmCommunityReportParams, DeleteCommunityReportParams,
  ListCommunityReportsQueryParams, SaveFragranceChoiceBody,
} from "@workspace/api-zod";
import { approximate, argentinaDay, normalizePerfume, reportLifetimeMinutes, seasonInArgentina } from "../lib/community-privacy";
import { actorHash, browserCookie, issueBrowser, networkHash, readBrowser, safeOrigin } from "../security/client";
import { fastRequestLimit, localLimit, RequestError, reserveCommunity, sharedLimit } from "../security/limits";

const router = Router();
const cookieName = "efg_community";
type ActorRequest = Request & { communityActor?: string };
const safeText = (value: string) => value.normalize("NFKC").replace(/[<>\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, "").replace(/\s+/g, " ").trim();
const actorOf = (req: Request) => (req as ActorRequest).communityActor!;

router.use((req: ActorRequest, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    if (!["GET", "HEAD"].includes(req.method) && !safeOrigin(req)) throw new RequestError(403, "Enviá la respuesta desde EFG Weather, no desde otro sitio.");
    fastRequestLimit(req);
    let browser = readBrowser(req);
    if (!browser || browser.legacy) {
      if (req.method !== "GET") throw new RequestError(403, "Actualizá la sección Comunidad para habilitar tu participación anónima.");
      localLimit(`issue-cookie:${networkHash(req)}`, 30, 3600000);
      browser ??= issueBrowser();
      res.cookie(cookieName, browserCookie(browser.token), {
        httpOnly: true, sameSite: "strict",
        secure: process.env.NODE_ENV === "production" || req.secure,
        maxAge: 90 * 86400000, path: "/api/community",
      });
    }
    req.communityActor = actorHash(browser.token);
    next();
  } catch (err) { next(err); }
});

// Anonymous cookie identifies this browser, not a verified person. No account or GPS identity.
function wrap(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const release = reserveCommunity();
      try {
        if (["GET", "HEAD"].includes(req.method)) await sharedLimit(req, actorOf(req), "read", 30, 60);
        await fn(req, res);
      } finally { release(); }
    })().catch(next);
  };
}
async function limit(req: Request, action: string, max: number) {
  localLimit(`burst:${action}:${actorOf(req)}`, action === "confirm" ? 10 : 6);
  await sharedLimit(req, actorOf(req), action, max);
}

const reportSelect = `SELECT r.id,r.category,r.latitude,r.longitude,r.area,
 r.observed_at AS "observedAt",r.created_at AS "createdAt",r.expires_at AS "expiresAt",
 (SELECT count(*)::int FROM community_confirmations c WHERE c.report_id=r.id) AS confirmations,
 (r.actor_hash=$1) AS mine,
 EXISTS(SELECT 1 FROM community_confirmations c WHERE c.report_id=r.id AND c.actor_hash=$1) AS confirmed
 FROM community_reports r`;

router.get("/reports", wrap(async (req, res) => {
  const parsed = ListCommunityReportsQueryParams.strict().safeParse(req.query);
  if (!parsed.success) throw new RequestError(400, "Los filtros de ubicación o antigüedad no son válidos.");
  const p = parsed.data;
  const params: unknown[] = [actorOf(req), p.maxAgeMinutes ?? 180];
  const clauses = ["r.expires_at > now()", "r.observed_at >= now()-($2::int * interval '1 minute')"];
  if (p.category) { params.push(p.category); clauses.push(`r.category=$${params.length}`); }
  if ((p.latitude == null) !== (p.longitude == null)) throw new RequestError(400, "Indicá latitud y longitud juntas.");
  if (p.latitude != null && p.longitude != null) {
    params.push(p.latitude, p.longitude);
    clauses.push(`abs(r.latitude-$${params.length - 1}::float8)<=1 AND abs(r.longitude-$${params.length}::float8)*greatest(0.1,cos(radians($${params.length - 1}::float8)))<=1`);
  }
  if (p.cursor) {
    let cursor: { time: string; id: string };
    try {
      cursor = JSON.parse(Buffer.from(p.cursor, "base64url").toString("utf8"));
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id) || typeof cursor.time !== "string" || !Number.isFinite(Date.parse(cursor.time))) throw new Error();
    } catch { throw new RequestError(400, "La página solicitada no es válida."); }
    params.push(cursor.time, cursor.id);
    clauses.push(`(r.observed_at,r.id)<($${params.length - 1}::timestamptz,$${params.length}::uuid)`);
  }
  const size = p.limit ?? 30;
  params.push(size + 1);
  const result = await pool.query(`${reportSelect} WHERE ${clauses.join(" AND ")} ORDER BY r.observed_at DESC,r.id DESC LIMIT $${params.length}`, params);
  const reports = result.rows.slice(0, size);
  const last = reports.at(-1);
  const nextCursor = result.rows.length > size && last ? Buffer.from(JSON.stringify({ time: last.observedAt.toISOString(), id: last.id })).toString("base64url") : null;
  res.json({ reports, nextCursor, serverTime: new Date().toISOString(), notice: "Comunidad, no verificado. Zona aproximada; no reemplaza alertas oficiales. Ventana geográfica aproximada de 110 km." });
}));

router.post("/reports", wrap(async (req, res) => {
  const parsed = CreateCommunityReportBody.strict().safeParse(req.body);
  if (!parsed.success || !parsed.data.consent) throw new RequestError(400, "Revisá el reporte y aceptá compartir la zona aproximada.");
  const p = parsed.data;
  let observed = new Date(p.observedAt);
  const delta = Date.now() - observed.getTime();
  if (!Number.isFinite(delta) || delta < -120000 || delta > 120 * 60000) throw new RequestError(400, "Usá una hora de observación de las últimas dos horas, no del futuro.");
  if (delta < 0) observed = new Date();
  const expires = new Date(observed.getTime() + reportLifetimeMinutes[p.category] * 60000);
  if (expires.getTime() <= Date.now()) throw new RequestError(400, "Esa observación ya habría caducado. Reportá solamente lo que seguís observando.");
  const latitude = approximate(p.latitude), longitude = approximate(p.longitude), area = safeText(p.area);
  if (area.length < 2 || area.length > 80 || /https?:|www\.|@|\d{5,}/i.test(area)) throw new RequestError(400, "Usá solo el nombre de la ciudad o zona, sin direcciones ni datos personales.");
  await limit(req, "report", 6);
  // Actor advisory lock prevents concurrent requests from bypassing duplicate protection.
  const client = await pool.connect();
  let id: string;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout='2500ms'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${p.category}:${latitude}:${longitude}`]);
    const duplicate = await client.query(
      `SELECT id FROM community_reports WHERE (actor_hash=$1 OR created_at>now()-interval '15 minutes') AND category=$2 AND latitude=$3 AND longitude=$4 AND expires_at>now() LIMIT 1`,
      [actorOf(req), p.category, latitude, longitude]);
    if (duplicate.rowCount) throw new RequestError(409, "Ya hay un reporte reciente de este fenómeno en esta zona. Buscalo en la lista y confirmalo si también lo ves.");
    const result = await client.query(
      `INSERT INTO community_reports(actor_hash,category,latitude,longitude,area,observed_at,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [actorOf(req), p.category, latitude, longitude, area, observed, expires]);
    id = result.rows[0].id;
    await client.query("COMMIT");
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
  const result = await pool.query(`${reportSelect} WHERE r.id=$2`, [actorOf(req), id!]);
  res.status(201).json(result.rows[0]);
}));

router.post("/reports/:id/confirm", wrap(async (req, res) => {
  const parsed = ConfirmCommunityReportParams.safeParse(req.params);
  if (!parsed.success) throw new RequestError(400, "Reporte no válido.");
  await limit(req, "confirm", 20);
  const result = await pool.query(
    `INSERT INTO community_confirmations(report_id,actor_hash)
     SELECT id,$2 FROM community_reports WHERE id=$1 AND expires_at>now() AND actor_hash<>$2
     ON CONFLICT (report_id,actor_hash) DO NOTHING RETURNING id`, [parsed.data.id, actorOf(req)]);
  if (!result.rowCount) {
    const existing = await pool.query(`${reportSelect} WHERE r.id=$2 AND r.expires_at>now()`, [actorOf(req), parsed.data.id]);
    if (!existing.rowCount) throw new RequestError(404, "El reporte ya caducó o no está disponible.");
    if (existing.rows[0].mine) throw new RequestError(400, "No hace falta confirmar tu propio reporte.");
  }
  res.json((await pool.query(`${reportSelect} WHERE r.id=$2`, [actorOf(req), parsed.data.id])).rows[0]);
}));

router.delete("/reports/:id", wrap(async (req, res) => {
  const parsed = DeleteCommunityReportParams.safeParse(req.params);
  if (!parsed.success) throw new RequestError(400, "Reporte no válido.");
  await limit(req, "delete-report", 20);
  const result = await pool.query("DELETE FROM community_reports WHERE id=$1 AND actor_hash=$2 RETURNING id", [parsed.data.id, actorOf(req)]);
  if (!result.rowCount) throw new RequestError(404, "No se encontró un reporte propio para eliminar.");
  res.json({ ok: true });
}));

async function surveyResponse(actor: string) {
  const result = await pool.query(
    `SELECT perfume,day,occasion,city,weather_available AS "weatherAvailable" FROM fragrance_choices
     WHERE actor_hash=$1 AND day=$2`, [actor, argentinaDay()]);
  // No totals or small cells disclosed; count distinct browsers, not verified people.
  const aggregate = await pool.query(
    `SELECT min(perfume) AS perfume,count(DISTINCT actor_hash)::int AS count FROM fragrance_choices
     WHERE day >= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date-30
     AND (SELECT count(DISTINCT actor_hash) FROM fragrance_choices WHERE day >= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date-30)>=10
     GROUP BY normalized_perfume HAVING count(DISTINCT actor_hash)>=5 ORDER BY count DESC LIMIT 10`);
  return { choice: result.rows[0] ?? null, aggregates: aggregate.rows,
    notice: "Encuesta voluntaria, no representativa de la población. Resumen de 30 días solo con al menos 10 navegadores y 5 por fragancia; no son personas verificadas. Una elección por navegador y día argentino; conservar la cookie permite corregir y eliminar. Retención máxima operativa: 90 días." };
}
router.get("/fragrance-choice", wrap(async (req, res) => { res.json(await surveyResponse(actorOf(req))); }));

router.put("/fragrance-choice", wrap(async (req, res) => {
  const parsed = SaveFragranceChoiceBody.strict().safeParse(req.body);
  if (!parsed.success || !parsed.data.consent) throw new RequestError(400, "Elegí una fragancia y aceptá el uso estadístico voluntario.");
  const p = parsed.data, perfume = safeText(p.perfume);
  const normalized = normalizePerfume(perfume);
  if (normalized.length < 2 || perfume.length > 100 || /https?:|www\.|@|\d{7,}/i.test(perfume)) throw new RequestError(400, "Ingresá solo el nombre de la fragancia, sin enlaces ni datos personales.");
  await limit(req, "survey", 8);
  let weather: object | null = null;
  const consentCity = p.cityConsent === true;
  const city = consentCity && p.city ? safeText(p.city).slice(0, 80) : null;
  if (city && /https?:|www\.|@|\d{5,}/i.test(city)) throw new RequestError(400, "Usá solo el nombre de la ciudad, sin datos personales.");
  if (consentCity && p.latitude != null && p.longitude != null) {
    // Coordinates are transient input rounded before upstream lookup; never persisted.
    try {
      const query = new URLSearchParams({
        latitude: String(approximate(p.latitude)), longitude: String(approximate(p.longitude)),
        current: "temperature_2m,relative_humidity_2m,precipitation,weather_code", timezone: "auto",
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, { signal: AbortSignal.timeout(6000) });
      if (response.ok) {
        const data = await response.json() as { current?: Record<string, unknown>; timezone?: string };
        if (data.current && typeof data.current.temperature_2m === "number" && Number.isFinite(data.current.temperature_2m)) weather = {
          temperature: data.current.temperature_2m, humidity: data.current.relative_humidity_2m ?? null,
          precipitation: data.current.precipitation ?? null, code: data.current.weather_code ?? null,
          time: data.current.time, timezone: data.timezone, source: "Open-Meteo", season: seasonInArgentina(new Date()),
        };
      }
    } catch { /* Save is real without context; weatherAvailable explicitly false. */ }
  }
  await pool.query(
    `INSERT INTO fragrance_choices(actor_hash,day,perfume,normalized_perfume,occasion,city,weather_available,weather)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(actor_hash,day) DO UPDATE SET
     perfume=excluded.perfume,normalized_perfume=excluded.normalized_perfume,occasion=excluded.occasion,
     city=excluded.city,weather_available=excluded.weather_available,weather=excluded.weather,updated_at=now()`,
    [actorOf(req), argentinaDay(), perfume, normalized, p.occasion ?? null, city, weather != null, weather == null ? null : JSON.stringify(weather)]);
  res.json(await surveyResponse(actorOf(req)));
}));
router.delete("/fragrance-choice", wrap(async (req, res) => {
  await limit(req, "delete-choice", 20);
  await pool.query("DELETE FROM fragrance_choices WHERE actor_hash=$1", [actorOf(req)]);
  res.json({ ok: true });
}));

router.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof RequestError) {
    if (err.retryAfter) res.set("Retry-After", String(err.retryAfter));
    res.status(err.status).json({ error: err.message }); return;
  }
  req.log.error("Community storage request failed; details withheld for privacy");
  res.status(503).json({ error: "No pudimos acceder al almacenamiento compartido. No confirmamos ningún guardado. Volvé a intentar." });
});
export default router;
