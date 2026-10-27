import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AlertTriangle, ExternalLink, LocateFixed, MapPin, Pause, Play, RefreshCw, ShieldAlert, Crosshair } from "lucide-react";
import type { Location } from "../lib/weather";
import { roundApprox } from "../lib/extras";
import { limitedRainLayer } from "../lib/radar-tiles";
import type { RainLayer } from "../lib/radar-tiles";
import { coverageTemplate, emptyLayer, issueText, parseRadarIndex, pointDescription, radarTemplate, RAIN_HOST, RAIN_INDEX, recentFrame } from "../lib/radar-provider";
import type { LayerHealth, RadarFrame, RadarIndex } from "../lib/radar-provider";
import { useNow } from "../components/status-bits";

const FRAME_MS = 3000; // mínimo; se adapta al tamaño del mapa para respetar 100 solicitudes/IP/minuto
const META_REFRESH_MS = 5 * 60 * 1000;

async function loadFrames(signal: AbortSignal): Promise<RadarIndex> {
  const response = await fetch(RAIN_INDEX, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
  if (response.status === 429) throw new Error("El proveedor del radar recibió demasiadas consultas. Esperá un minuto.");
  if (!response.ok) throw new Error("No pudimos consultar el índice del radar.");
  return parseRadarIndex(await response.json());
}

const fmt = (t: number) => new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(t * 1000));

export function RadarPage({ location, favorites, onChooseLocation, onUseCurrentLocation, gpsBusy, gpsNotice }: { location: Location; favorites: Location[]; onChooseLocation: (place: Location) => void; onUseCurrentLocation: () => void; gpsBusy: boolean; gpsNotice: string }) {
  const [center, setCenter] = useState<Location>(location);
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [host, setHost] = useState(RAIN_HOST);
  const [generated, setGenerated] = useState<number | null>(null);
  const [view, setView] = useState<"international" | "argentina">("argentina");
  const [retry, setRetry] = useState(0);
  const [radarHealth, setRadarHealth] = useState<LayerHealth>(emptyLayer);
  const [coverHealth, setCoverHealth] = useState<LayerHealth>(emptyLayer);
  const [point, setPoint] = useState<{ mask: number | null; echo: number | null }>({ mask: null, echo: null });
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [coverage, setCoverage] = useState(true);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const radar = useRef<RainLayer | null>(null);
  const cover = useRef<RainLayer | null>(null);
  const base = useRef<L.TileLayer | null>(null);
  const radarVersion = useRef(0), coverVersion = useRef(0);
  const marker = useRef<L.CircleMarker | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const now = useNow(1000);
  const readPoint = useCallback(() => {
    const m = map.current; if (!m) return;
    const p = m.getCenter(), z = m.getZoom();
    setPoint({ mask: cover.current?.sample(p.lat, p.lng, z) ?? null, echo: radar.current?.sample(p.lat, p.lng, z) ?? null });
  }, []);

  const refresh = useCallback(async () => {
    ctrl.current?.abort();
    const c = new AbortController(); ctrl.current = c;
    setLoading(true); setError(""); setPlaying(false);
    try {
      const next = await loadFrames(c.signal);
      if (c.signal.aborted) return;
      setFrames(next.frames); setHost(next.host); setGenerated(next.generated);
      setIndex(Math.max(0, next.frames.length - 1)); setFetchedAt(Date.now());
      if (!next.frames.length) setError("No hay imágenes de radar de las últimas 2 horas disponibles.");
    } catch (e) {
      if (!c.signal.aborted) { setFrames([]); setGenerated(null); setError(e instanceof Error ? e.message : "No pudimos cargar el radar."); setPlaying(false); }
    } finally { if (!c.signal.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    if (view !== "international") { setPlaying(false); setLoading(false); return; }
    void refresh();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, META_REFRESH_MS);
    const visibility = () => { if (document.visibilityState === "hidden") setPlaying(false); };
    document.addEventListener("visibilitychange", visibility);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", visibility); ctrl.current?.abort(); };
  }, [refresh, view]);

  useEffect(() => {
    if (!mapEl.current || map.current) return;
    const m = L.map(mapEl.current, { center: [center.latitude, center.longitude], zoom: 6, minZoom: 3, maxZoom: 7, zoomControl: true, attributionControl: true });
    base.current = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 7, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">colaboradores de OpenStreetMap</a>' });
    marker.current = L.circleMarker([roundApprox(center.latitude), roundApprox(center.longitude)], { radius: 8, color: "#465f91", weight: 3, fillColor: "#e9bd83", fillOpacity: .95 }).addTo(m).bindTooltip("Ubicación aproximada seleccionada");
    map.current = m;
    m.on("moveend zoomend", readPoint);
    m.on("movestart", () => setPoint({ mask: null, echo: null }));
    return () => { ++radarVersion.current; ++coverVersion.current; m.remove(); map.current = null; radar.current = null; cover.current = null; base.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current; if (!m) return;
    if (view === "international") { base.current?.addTo(m); const id = requestAnimationFrame(() => m.invalidateSize()); return () => cancelAnimationFrame(id); }
    base.current?.remove(); setPlaying(false);
    return undefined;
  }, [view]);
  useEffect(() => {
    const m = map.current, version = ++coverVersion.current;
    setCoverHealth(emptyLayer); setPoint(p => ({ ...p, mask: null }));
    if (!m || generated === null || view !== "international") return;
    const layer = limitedRainLayer(coverageTemplate(host), { maxNativeZoom: 7, maxZoom: 7, opacity: coverage ? .25 : 0, zIndex: 2 }, state => {
      if (coverVersion.current !== version) return;
      setCoverHealth(state); readPoint();
    });
    cover.current = layer; layer.addTo(m);
    return () => { ++coverVersion.current; layer.remove(); if (cover.current === layer) cover.current = null; };
  }, [host, generated, retry, view, readPoint]);
  useEffect(() => { cover.current?.setOpacity(coverage ? .25 : 0); }, [coverage]);

  const frame = frames[index];
  const expired = !!frame && !recentFrame(frame, now);
  useEffect(() => {
    const m = map.current, version = ++radarVersion.current;
    setRadarHealth(emptyLayer); setPoint(p => ({ ...p, echo: null }));
    if (!m || !frame || expired || view !== "international") return;
    const layer = limitedRainLayer(radarTemplate(host, frame), { maxNativeZoom: 7, maxZoom: 7, opacity: .78, zIndex: 3, attribution: '<a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a>' }, state => {
      if (radarVersion.current !== version) return;
      setRadarHealth(state); readPoint();
    });
    radar.current = layer; layer.addTo(m);
    return () => { ++radarVersion.current; layer.remove(); if (radar.current === layer) radar.current = null; };
  }, [frame, host, expired, retry, view, readPoint]);

  useEffect(() => {
    if (!playing || frames.length < 2 || radarHealth.phase !== "ready" || coverHealth.phase !== "ready" || expired || view !== "international") return;
    const size = map.current?.getSize();
    const estimate = size ? (Math.ceil(size.x / 256) + 1) * (Math.ceil(size.y / 256) + 1) : 12;
    const interval = Math.max(FRAME_MS, Math.ceil(estimate * 60000 / 50));
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % frames.length), interval);
    return () => window.clearTimeout(id);
  }, [playing, frames.length, index, radarHealth.phase, coverHealth.phase, expired, view]);
  const failed = radarHealth.phase === "error" || coverHealth.phase === "error";
  const waiting = radarHealth.phase === "waiting" || coverHealth.phase === "waiting";
  const retryAt = Math.max(radarHealth.issue?.retryAt ?? 0, coverHealth.issue?.retryAt ?? 0);
  useEffect(() => { if (failed || waiting || expired) setPlaying(false); }, [failed, waiting, expired]);
  const retryLayers = () => {
    setPlaying(false);
    if (!frames.length || expired || error || [404, 410].includes(radarHealth.issue?.status ?? 0)) {
      void refresh().then(() => setRetry(i => i + 1));
    } else setRetry(i => i + 1);
  };
  const description = pointDescription(point.mask, point.echo);
  const mapNote = failed ? "Capa incompleta · ver detalle debajo" : waiting ? "Esperando cupo de imágenes" : radarHealth.phase !== "ready" || coverHealth.phase !== "ready" ? "Cargando capas…" : description.kind === "uncovered" ? "Sin cobertura de RainViewer en el centro" : description.kind === "no-echo" ? "Sin ecos visibles · no garantiza ausencia de lluvia" : description.kind === "echo" ? "Ecos de radar observados" : "Cobertura en consulta";

  const recenter = (loc: Location) => {
    setCenter(loc);
    map.current?.setView([roundApprox(loc.latitude), roundApprox(loc.longitude)], Math.min(7, Math.max(map.current.getZoom(), 6)));
    marker.current?.setLatLng([roundApprox(loc.latitude), roundApprox(loc.longitude)]);
  };
  useEffect(() => { recenter(location); }, [location]);
  const places = [location, ...favorites.filter(f => f.latitude !== location.latitude || f.longitude !== location.longitude)];

  return <section className="module-page module-wide">
    <p className="eyebrow">RADAR Y ALERTAS</p>
    <h1>{view === "argentina" ? <>El radar, <em className="accent">de acá.</em></> : <>El cielo, <em className="accent">como se vio.</em></>}</h1>
    <div className="radar-label" data-testid="text-radar-label"><b>Radar observado, NO pronóstico ni alerta</b><span>{view === "argentina" ? "Para Argentina, primero las fuentes oficiales. Consultá la hora y la cobertura dentro del visor; no recibimos sus imágenes en esta app." : "Alternativa RainViewer: solo evaluación interna no comercial, no habilitada para lanzamiento con sponsors. Su mosaico puede no cubrir Buenos Aires."}</span></div>
    <div className="radar-provider-switch" role="group" aria-label="Elegir fuente de radar">
      <button aria-pressed={view === "argentina"} onClick={() => setView("argentina")} data-testid="button-radar-argentina">Radar argentino</button>
      <button aria-pressed={view === "international"} onClick={() => setView("international")} data-testid="button-radar-international">Radar internacional</button>
    </div>

    <section className="radar-argentina sources-block" hidden={view !== "argentina"} data-testid="radar-argentina-sources">
      <p className="eyebrow radar-locality" data-testid="radar-selected-locality"><MapPin size={13} /> Tu localidad: {location.name}</p>
      <h2>Radar oficial de Argentina</h2>
      <p>El Servicio Meteorológico Nacional reúne observaciones de la red argentina. Abrí su visor y elegí el mosaico o radar que querés consultar.</p>
      <a className="radar-official-primary" href="https://ws2.smn.gob.ar/radar" target="_blank" rel="noreferrer" data-testid="link-smn-visor">Abrir visor oficial del SMN <ExternalLink size={19} /></a>
      <p className="hint-line">Se abre una web oficial externa, no una capa integrada en EFG Weather.</p>
      <details className="radar-stations" open>
        <summary>¿Qué puedo elegir en el visor?</summary>
        <p>Todos estos accesos abren el mismo portal. Allí seleccioná la opción, si está disponible:</p>
        <div className="radar-official-links radar-station-links">
          <a href="https://ws2.smn.gob.ar/radar" target="_blank" rel="noreferrer" data-testid="link-smn-argentina">Mosaico Argentina <ExternalLink size={15} /></a>
          <a href="https://ws2.smn.gob.ar/radar" target="_blank" rel="noreferrer" data-testid="link-smn-centro">Mosaico Centro <ExternalLink size={15} /></a>
          <a href="https://ws2.smn.gob.ar/radar" target="_blank" rel="noreferrer" data-testid="link-smn-ezeiza">Ezeiza <ExternalLink size={15} /></a>
          <a href="https://ws2.smn.gob.ar/radar" target="_blank" rel="noreferrer" data-testid="link-smn-pergamino">Pergamino <ExternalLink size={15} /></a>
          <a href="https://ws2.smn.gob.ar/radar" target="_blank" rel="noreferrer" data-testid="link-smn-mar-del-plata">Mar del Plata <ExternalLink size={15} /></a>
        </div>
      </details>
      <div className="radar-official-links">
        <a href="https://www.argentina.gob.ar/obras-publicas/recursos-hidricos/sistema-nacional-de-radares-meteorologicos-sinarame/imagenes" target="_blank" rel="noreferrer" data-testid="link-sinarame-imagenes">Consultar SINARAME <ExternalLink size={15} /></a>
      </div>
      <p>Si el portal SMN no abre, probá SINARAME. Buenos Aires dispone de radares como Ezeiza y Pergamino; el gris de RainViewer no significa que no existan ni que el cielo esté despejado.</p>
      <details className="radar-source-details">
        <summary>Cobertura, actualización y permisos</summary>
        <p>La cobertura y disponibilidad dependen de cada radar y del estado del servicio. Revisá fecha y hora de la imagen en el visor oficial: no garantizamos una frecuencia de actualización ni un equipo activo.</p>
        <p>No tenemos una API ni un permiso de republicación comercial verificados para estas imágenes. Por eso ofrecemos enlaces, sin scraping, imágenes copiadas ni visores incrustados. La presencia de un sponsor no otorga esos derechos.</p>
      </details>
    </section>

    <div hidden={view !== "international"} data-testid="radar-international-panel">
    <div className="chip-row" role="group" aria-label="Centrar mapa">
      <button className="chip" onClick={onUseCurrentLocation} disabled={gpsBusy} data-testid="button-radar-gps"><LocateFixed size={14} />{gpsBusy ? "Buscando…" : "Ubicación actual"}</button>
      {places.map((p) => <button key={`${p.latitude}-${p.longitude}`} className={`chip ${center.latitude === p.latitude && center.longitude === p.longitude ? "selected" : ""}`} onClick={() => p.source === "gps" ? onUseCurrentLocation() : onChooseLocation(p)} data-testid={`button-radar-place-${p.name.toLowerCase().replaceAll(" ", "-")}`}><MapPin size={14} />{p.name}</button>)}
      <button className="chip" onClick={() => recenter(center)} data-testid="button-radar-recenter"><Crosshair size={14} /> Volver al centro</button>
    </div>
    {gpsNotice && <p className="hint-line" role="status">{gpsNotice}</p>}

    <div className="radar-frame" data-radar-state={radarHealth.phase} data-coverage-state={coverHealth.phase} data-testid="radar-layer-health">
      <div ref={mapEl} className="radar-map" data-testid="map-radar" aria-label="Mapa de radar" />
      {!loading && !error && <div className="radar-map-state" data-testid="radar-map-state" aria-hidden="true">{mapNote}</div>}
      {loading && !frames.length && <div className="radar-overlay"><RefreshCw size={18} className="spin" /> Cargando radar…</div>}
      {error && <div className="radar-overlay is-error" role="alert"><AlertTriangle size={18} /><span>{error}</span><button className="retry-button" onClick={() => void refresh()} data-testid="button-radar-retry">Reintentar</button></div>}
    </div>
    {(failed || waiting) && <div className="radar-layer-status is-error" role={failed ? "alert" : "status"} data-testid="radar-layer-error">
      <b>{failed ? "Fallo de capa: el mapa está incompleto" : "Esperando el cupo de imágenes"}</b>
      {radarHealth.issue && <p>Precipitación: {issueText(radarHealth.issue)}</p>}
      {coverHealth.issue && <p>Cobertura: {issueText(coverHealth.issue)}</p>}
      <p>No interpretes un área vacía como ausencia de lluvia.</p>
      <button className="chip" onClick={retryLayers} disabled={retryAt > now} data-testid="button-radar-retry-layers"><RefreshCw size={14} />{retryAt > now ? `Reintentar en ${Math.ceil((retryAt - now) / 1000)} s` : "Reintentar capas"}</button>
    </div>}
    {expired && <p role="alert" className="hint-line">Este cuadro superó las 2 horas. Lo retiramos: tocá Actualizar para consultar imágenes vigentes.</p>}
    {!failed && !waiting && !error && !expired && <div className="radar-layer-status" role="status" data-testid="radar-point-status" data-kind={description.kind}>
      <b>{description.title}</b><p>{description.detail}</p>
      <small>Centro del mapa · máscara estática orientativa de RainViewer. {radarHealth.phase === "loading" || coverHealth.phase === "loading" ? "Todavía se están cargando imágenes de la vista." : ""}</small>
    </div>}

    <div className="radar-controls">
      <button className="play-button" onClick={() => setPlaying(!playing)} disabled={frames.length < 2 || failed || waiting || expired || !!error} aria-label={playing ? "Pausar animación" : "Reproducir animación"} data-testid="button-radar-play">{playing ? <Pause size={18} /> : <Play size={18} />}</button>
      <div className="slider-wrap">
        <input type="range" min={0} max={Math.max(0, frames.length - 1)} value={index} onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)); }} disabled={!frames.length} aria-label="Elegir imagen de radar" data-testid="input-radar-frame" />
        <div className="slider-meta"><span data-testid="text-radar-frame-time">{frame ? `Mosaico seleccionado: ${fmt(frame.time)} (hora Argentina)${expired ? " · vencido" : ""}` : "Sin imagen"}</span><span>{frames.length ? `${index + 1} de ${frames.length}` : ""}</span></div>
      </div>
      <button className="chip" onClick={() => void refresh()} disabled={loading} data-testid="button-radar-refresh"><RefreshCw size={14} className={loading ? "spin" : ""} /> Actualizar</button>
    </div>
    <div className="radar-foot">
      <label className="check-line"><input type="checkbox" checked={coverage} onChange={(e) => setCoverage(e.target.checked)} data-testid="checkbox-radar-coverage" /> Sombrear zonas sin cobertura de RainViewer (no representa todos los radares argentinos)</label>
      <span>{fetchedAt ? `Índice consultado: ${fmt(fetchedAt / 1000)}; generado: ${generated ? fmt(generated) : "no disponible"}. Hora Argentina. Se consulta cada 5 min con esta vista activa.` : ""} La hora del mosaico no es la hora exacta de cada radar.</span>
      <span>Pasado únicamente · máximo 2 h · zoom hasta 7 · Universal Blue · sin satélite ni pronóstico de radar. Cola compartida de hasta 80 descargas/min por pestaña, caché temporal y dos descargas simultáneas. Otras pestañas o personas con la misma IP pueden agotar el límite del proveedor. Fuente: <a href="https://www.rainviewer.com/api/weather-maps-api.html" target="_blank" rel="noreferrer">RainViewer</a>.</span>
    </div>
    <button className="chip radar-return-official" onClick={() => { setView("argentina"); window.scrollTo({ top: 0, behavior: "auto" }); }} data-testid="button-radar-official-fallback">Consultar el radar oficial argentino <ExternalLink size={15} /></button>
    </div>

    <details className="sources-block radar-source-details" data-testid="radar-data-guide"><summary>Radar, satélite y pronóstico: no son lo mismo</summary>
      <p><b>Radar:</b> observa ecos de precipitación; no garantiza detectar toda la lluvia. <b>Satélite:</b> observa, entre otras cosas, nubosidad; no hay una capa satelital conectada aquí.</p>
      <p><b>Pronóstico:</b> Open-Meteo utiliza modelos para estimar condiciones futuras. El clima, la sensación térmica y los tips de Inicio siguen usando su fuente habitual, sin cambios ni mezclas con ecos de radar.</p>
      <p><b>Alertas oficiales:</b> son avisos del SMN, no una imagen de radar ni un reporte de la comunidad. No recibimos un feed oficial integrado.</p>
    </details>

    <div className="safety-note"><ShieldAlert size={20} /><p><b>Si escuchás truenos, buscá refugio inmediatamente.</b><br />No esperes una notificación de esta app. No hay detección de rayos ni granizo conectada y EFG Weather no emite alertas.</p></div>
    <div className="sources-block"><h2>Alertas oficiales</h2><p>Las alertas válidas son las del Servicio Meteorológico Nacional.</p>
      <a href="https://www.smn.gob.ar/alertas" target="_blank" rel="noreferrer" data-testid="link-smn-alertas">SMN · Alertas vigentes <ExternalLink size={15} /></a>
      <a href="https://www.argentina.gob.ar/obras-publicas/recursos-hidricos/sistema-nacional-de-radares-meteorologicos-sinarame" target="_blank" rel="noreferrer">SINARAME <ExternalLink size={15} /></a></div>
    {view === "international" && <div className="fine-print"><p>Privacidad: el mapa comparte la zona aproximada visible y tu dirección de red con OpenStreetMap y RainViewer. No enviamos coordenadas GPS exactas ni identidad; aun así, las imágenes solicitadas revelan la zona que consultás.</p><p>Prototipo interno no comercial. Integración comercial pendiente de autorización; no apto para lanzamiento con sponsors.</p></div>}
  </section>;
}
