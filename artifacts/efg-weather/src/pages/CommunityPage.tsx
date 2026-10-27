import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, CloudHail, CloudRain, HelpCircle, LocateFixed, MapPin, RefreshCw, Trash2, Waves, Wind } from "lucide-react";
import {
  useListCommunityReports, getListCommunityReportsQueryKey, useCreateCommunityReport,
  useConfirmCommunityReport, useDeleteCommunityReport,
} from "@workspace/api-client-react";
import type { CommunityReport, ListCommunityReportsParams, ReportInputCategory } from "@workspace/api-client-react";
import type { Location } from "../lib/weather";
import { searchLocations } from "../lib/weather";
import { apiErrorMessage, roundApprox } from "../lib/extras";
import { useNow } from "../components/status-bits";
import { FragranceSurvey } from "../components/FragranceSurvey";

type Cat = ReportInputCategory;
const CATS: { id: Cat; label: string; icon: typeof CloudRain; life: number }[] = [
  { id: "rain", label: "Lluvia intensa", icon: CloudRain, life: 60 },
  { id: "hail", label: "Granizo observado", icon: CloudHail, life: 45 },
  { id: "wind", label: "Viento fuerte", icon: Wind, life: 30 },
  { id: "flood", label: "Calle anegada", icon: Waves, life: 180 },
  { id: "other", label: "Otro fenómeno", icon: HelpCircle, life: 60 },
];
const catInfo = (c: string) => CATS.find(x => x.id === c) ?? CATS[4];
const AGES = [30, 60, 120, 180];

export function CommunityPage({ location, favorites, onChooseLocation, onUseCurrentLocation, gpsBusy, gpsNotice }: { location: Location; favorites: Location[]; onChooseLocation: (place: Location) => void; onUseCurrentLocation: () => void; gpsBusy: boolean; gpsNotice: string }) {
  const qc = useQueryClient();
  const now = useNow(30000);
  const [center, setCenter] = useState<Location>(location);
  const [category, setCategory] = useState<Cat | "">("");
  const [maxAge, setMaxAge] = useState(120);
  const [cursor, setCursor] = useState<string | undefined>();
  const [actionError, setActionError] = useState("");
  useEffect(() => { setCenter(location); }, [location]);

  useEffect(() => { setCursor(undefined); }, [center.latitude, center.longitude, category, maxAge]);
  const params: ListCommunityReportsParams = { latitude: roundApprox(center.latitude), longitude: roundApprox(center.longitude), maxAgeMinutes: maxAge, limit: 30, ...(cursor ? { cursor } : {}), ...(category ? { category } : {}) };
  const feed = useListCommunityReports(params, { query: { queryKey: getListCommunityReportsQueryKey(params), refetchInterval: 60000 } });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/community/reports"] });
  const confirm = useConfirmCommunityReport({ mutation: { onSuccess: invalidate, onError: e => setActionError(apiErrorMessage(e)) } });
  const del = useDeleteCommunityReport({ mutation: { onSuccess: invalidate, onError: e => setActionError(apiErrorMessage(e)) } });

  const serverOffset = useMemo(() => feed.data ? Date.parse(feed.data.serverTime) - feed.dataUpdatedAt : 0, [feed.data, feed.dataUpdatedAt]);
  const serverNow = now + serverOffset;
  const visibleReports = feed.data?.reports.filter(r => Date.parse(r.expiresAt) > serverNow) ?? [];

  const places = [location, ...favorites.filter(f => f.latitude !== location.latitude || f.longitude !== location.longitude)];

  return <section className="module-page module-wide">
    <p className="eyebrow">COMUNIDAD</p>
    <h1>Lo que ven <em className="accent">tus vecinos.</em></h1>
    <p className="module-intro">Reportes anónimos y aproximados de personas que usan EFG Weather. No están verificados y no son alertas oficiales.</p>

    <div className="community-layout">
      <div className="community-feed">
        <div className="chip-row">
          <button className="chip" onClick={onUseCurrentLocation} disabled={gpsBusy} data-testid="button-community-gps"><LocateFixed size={14} />{gpsBusy ? "Buscando…" : "Ubicación actual"}</button>
          {places.map(p => <button key={`${p.latitude}${p.longitude}`} className={`chip ${center.latitude === p.latitude && center.longitude === p.longitude ? "selected" : ""}`} onClick={() => p.source === "gps" ? onUseCurrentLocation() : onChooseLocation(p)} data-testid={`button-community-place-${p.name.toLowerCase().replaceAll(" ", "-")}`}><MapPin size={14} />{p.name}</button>)}
        </div>
        {gpsNotice && <p className="hint-line" role="status">{gpsNotice}</p>}
        <div className="filter-row">
          <select value={category} onChange={e => setCategory(e.target.value as Cat | "")} aria-label="Filtrar fenómeno" data-testid="select-community-category"><option value="">Todos los fenómenos</option>{CATS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          <select value={maxAge} onChange={e => setMaxAge(Number(e.target.value))} aria-label="Antigüedad" data-testid="select-community-age">{AGES.map(a => <option key={a} value={a}>Últimos {a < 60 ? `${a} min` : `${a / 60} h`}</option>)}</select>
          <button className="chip" onClick={() => void feed.refetch()} disabled={feed.isFetching} data-testid="button-community-refresh"><RefreshCw size={14} className={feed.isFetching ? "spin" : ""} /> Actualizar</button>
        </div>
        <p className="hint-line">Zona de hasta ~110 km alrededor de {center.name}. Se actualiza cada minuto mientras está abierta.</p>
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        {feed.isError && feed.data && <p className="form-error" role="alert">No pudimos actualizar: {apiErrorMessage(feed.error)} Mostramos la última lista recibida.</p>}

        {feed.isLoading ? <div className="report-list">{[0, 1, 2].map(i => <div key={i} className="report-card skeleton-panel" />)}</div>
          : feed.isError && !feed.data ? <div className="panel error-panel" role="alert"><AlertTriangle size={20} /><div><b>No pudimos cargar los reportes.</b><span>{apiErrorMessage(feed.error)}</span></div><button className="retry-button" onClick={() => void feed.refetch()} data-testid="button-community-retry">Reintentar</button></div>
          : feed.data && visibleReports.length === 0 ? <div className="panel empty-soft big"><CloudRain size={24} /><p>No hay reportes activos en esta zona. Que no haya reportes no significa que no pase nada.</p></div>
          : <div className="report-list">{visibleReports.map(r => <ReportCard key={r.id} r={r} serverNow={serverNow}
              onConfirm={() => { setActionError(""); confirm.mutate({ id: r.id }); }}
              onDelete={() => { if (window.confirm("¿Borrar tu reporte?")) { setActionError(""); del.mutate({ id: r.id }); } }}
              busy={confirm.isPending || del.isPending} />)}</div>}
        {feed.data?.notice && <p className="fine-print">{feed.data.notice}</p>}
        <div className="chip-row">
          {cursor && <button className="chip" onClick={() => setCursor(undefined)} data-testid="button-reports-first">Volver a los más recientes</button>}
          {feed.data?.nextCursor && <button className="chip" onClick={() => setCursor(feed.data!.nextCursor!)} data-testid="button-reports-next">Ver siguientes reportes</button>}
        </div>
      </div>
      <ReportForm center={center} onDone={() => { setCursor(undefined); void invalidate(); }} />
    </div>

    <details className="panel privacy-details">
      <summary>Privacidad y límites, en simple</summary>
      <ul>
        <li>No pedimos registro. Tu navegador recibe una cookie anónima (dura 90 días) para saber cuáles reportes son tuyos y evitar duplicados. Si la borrás, el sistema te ve como alguien nuevo: no es una identidad verificada.</li>
        <li>La ubicación se redondea a una grilla de unos 2 km y se muestra solo el nombre de zona que escribas. Nunca una dirección exacta.</li>
        <li>Límites: hasta 6 reportes, 20 confirmaciones y 8 elecciones de perfume por hora por navegador. También limitamos consultas y tráfico por red, sin guardar IPs crudas ni usarlas para seguimiento. Si llegás al límite, podés seguir consultando el clima.</li>
        <li>Cada reporte vence solo: viento 30 min, granizo 45, lluvia y otros 60, anegamiento 180. Podés borrar los tuyos cuando quieras.</li>
        <li>Los reportes vencidos se ocultan inmediatamente y se borran por lotes cada 5 minutos mientras el servidor está activo; si estuvo pausado, la limpieza se reanuda al arrancar.</li>
      </ul>
    </details>

    <FragranceSurvey location={location} />
  </section>;
}

function ReportCard({ r, serverNow, onConfirm, onDelete, busy }: { r: CommunityReport; serverNow: number; onConfirm: () => void; onDelete: () => void; busy: boolean }) {
  const info = catInfo(r.category); const Icon = info.icon;
  const age = Math.max(0, Math.round((serverNow - Date.parse(r.observedAt)) / 60000));
  const left = Math.max(0, Math.round((Date.parse(r.expiresAt) - serverNow) / 60000));
  return <article className={`report-card cat-${r.category}`} data-testid={`card-report-${r.id}`}>
    <span className="report-icon"><Icon size={20} /></span>
    <div className="report-body">
      <div className="report-top"><b>{info.label}</b><span className="unverified">Comunidad, no verificado</span></div>
      <p>{r.area} · visto hace {age} min · vence en {left} min</p>
      <small>{r.confirmations === 0 ? "Sin confirmaciones" : `${r.confirmations} ${r.confirmations === 1 ? "confirmación adicional" : "confirmaciones adicionales"}`}{r.mine ? " · Tu reporte" : ""}</small>
    </div>
    <div className="report-actions">
      {r.mine ? <button className="chip danger" onClick={onDelete} disabled={busy} data-testid={`button-delete-report-${r.id}`}><Trash2 size={14} /> Borrar</button>
        : <button className={`chip ${r.confirmed ? "selected" : ""}`} onClick={onConfirm} disabled={busy || r.confirmed} data-testid={`button-confirm-report-${r.id}`}><Check size={14} />{r.confirmed ? "Ya lo confirmaste" : "Yo también lo veo"}</button>}
    </div>
  </article>;
}

function ReportForm({ center, onDone }: { center: Location; onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [cat, setCat] = useState<Cat | null>(null);
  const [area, setArea] = useState(center.name);
  const [coords, setCoords] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [minutesAgo, setMinutesAgo] = useState(0);
  const [consent, setConsent] = useState(false);
  const [gpsMsg, setGpsMsg] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [cities, setCities] = useState<Location[]>([]);
  const [cityMessage, setCityMessage] = useState("");
  const [done, setDone] = useState(false);
  const create = useCreateCommunityReport({ mutation: { onSuccess: () => { setDone(true); onDone(); } } });
  const life = cat ? catInfo(cat).life : 120;
  const options = [0, 10, 20, 30, 45, 60, 90, 120].filter(m => m < Math.min(120, life));
  const loc = coords ?? { lat: roundApprox(center.latitude), lon: roundApprox(center.longitude), label: center.name };
  useEffect(() => { if (!coords) setArea(center.name); }, [center.name, coords]);
  useEffect(() => {
    setCities([]);
    if (cityQuery.trim().length < 2) { setCityMessage(""); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCityMessage("Buscando ciudades…");
      searchLocations(cityQuery, controller.signal).then(items => {
        if (!controller.signal.aborted) { setCities(items); setCityMessage(items.length ? "" : "No encontramos esa ciudad."); }
      }).catch(() => { if (!controller.signal.aborted) setCityMessage("No pudimos buscar ciudades. Reintentá o usá el lugar seleccionado."); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [cityQuery]);

  const gps = () => {
    if (!navigator.geolocation) return setGpsMsg("Este navegador no permite compartir tu ubicación.");
    setGpsMsg("Buscando…");
    navigator.geolocation.getCurrentPosition(
      p => { setCoords({ lat: roundApprox(p.coords.latitude), lon: roundApprox(p.coords.longitude), label: "tu zona (redondeada a ~2 km)" }); setArea("Mi zona aproximada"); setGpsMsg("Listo: usamos una posición aproximada, no la exacta."); },
      () => setGpsMsg("No pudimos usar tu ubicación. Se usará el lugar elegido."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  };
  const reset = () => { setStep(1); setCat(null); setConsent(false); setMinutesAgo(0); setDone(false); setCoords(null); setArea(center.name); create.reset(); };
  const send = () => {
    if (!cat || !consent) return;
    create.mutate({ data: { category: cat, latitude: loc.lat, longitude: loc.lon, area: area.trim(), observedAt: new Date(Date.now() - minutesAgo * 60000).toISOString(), consent: true } });
  };

  return <aside className="panel report-form" aria-label="Reportar lo que ves">
    <div className="steps" aria-hidden>{[1, 2, 3].map(s => <i key={s} className={s <= step ? "on" : ""} />)}</div>
    {done ? <div className="form-done"><Check size={26} /><h3>Reporte enviado</h3><p>Se ve como “Comunidad, no verificado” y vence solo. Podés borrarlo desde la lista.</p><button className="primary-btn" onClick={reset} data-testid="button-report-new">Hacer otro reporte</button></div>
    : step === 1 ? <><h3>¿Qué estás viendo?</h3><div className="cat-grid">{CATS.map(c => { const I = c.icon; return <button key={c.id} className={`cat-btn ${cat === c.id ? "selected" : ""}`} onClick={() => { setCat(c.id); setMinutesAgo(0); setStep(2); }} data-testid={`button-category-${c.id}`}><I size={24} /><span>{c.label}</span></button>; })}</div></>
    : step === 2 ? <><button className="back-link" onClick={() => setStep(1)}><ArrowLeft size={14} /> Cambiar fenómeno</button><h3>¿Dónde y cuándo?</h3>
      <label className="field-label">Zona elegida (nunca una dirección)<input value={area} readOnly data-testid="input-report-area" /></label>
      <label className="field-label">Elegir otra ciudad (opcional)<input type="search" value={cityQuery} onChange={e => setCityQuery(e.target.value)} placeholder="Buscar localidad argentina" data-testid="input-report-city-search" /></label>
      {cityMessage && <p role="status" className="hint-line">{cityMessage}</p>}
      {cities.length > 0 && <div className="search-results">{cities.map(city => <button key={`${city.latitude}-${city.longitude}`} className="chip" onClick={() => {
        setCoords({ lat: roundApprox(city.latitude), lon: roundApprox(city.longitude), label: `${city.name}, ${city.region}` });
        setArea(city.name); setCityQuery(""); setCities([]);
      }} data-testid="button-report-city-result">{city.name} · {city.region}</button>)}</div>}
      <p className="hint-line">Posición: {loc.label}. <button className="link-btn" onClick={gps} data-testid="button-report-gps">Usar mi ubicación aproximada</button></p>
      {gpsMsg && <p className="hint-line" role="status">{gpsMsg}</p>}
      <label className="field-label">¿Cuándo lo viste?<select value={minutesAgo} onChange={e => setMinutesAgo(Number(e.target.value))} data-testid="select-report-time">{options.map(m => <option key={m} value={m}>{m === 0 ? "Ahora" : `Hace ${m} min`}</option>)}</select></label>
      <label className="check-line"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} data-testid="checkbox-report-consent" /> Acepto que este reporte se publique de forma anónima, con zona aproximada (~2 km).</label>
      <button className="primary-btn" disabled={!consent || area.trim().length < 2} onClick={() => setStep(3)} data-testid="button-report-next">Revisar</button></>
    : <><button className="back-link" onClick={() => setStep(2)}><ArrowLeft size={14} /> Volver</button><h3>Confirmá y enviá</h3>
      <dl className="summary"><div><dt>Fenómeno</dt><dd>{cat ? catInfo(cat).label : ""}</dd></div><div><dt>Zona</dt><dd>{area}</dd></div><div><dt>Visto</dt><dd>{minutesAgo === 0 ? "Ahora" : `Hace ${minutesAgo} min`}</dd></div><div><dt>Vence</dt><dd>{life} min después de visto</dd></div></dl>
      {create.isError && <p className="form-error" role="alert">{apiErrorMessage(create.error)}</p>}
      <button className="primary-btn big" onClick={send} disabled={create.isPending} data-testid="button-report-send">{create.isPending ? "Enviando…" : "Enviar reporte"}</button></>}
  </aside>;
}
