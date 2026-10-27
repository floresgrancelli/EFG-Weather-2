import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Droplets, MapPin, Pencil, Plus, RefreshCw, Search, Snowflake, Thermometer, Trash2, Wind, X } from "lucide-react";
import { fetchWeather, formatValue, searchLocations } from "../lib/weather";
import type { Location, Weather } from "../lib/weather";
import { readStorage, store } from "../lib/extras";

type Field = Location & { id: string; label: string; manual: boolean };
const KEY = "efg-agro-fields";

function ith(t: number, rh: number) {
  return (1.8 * t + 32) - (0.55 - 0.0055 * rh) * (1.8 * t - 26);
}
const fmtTime = (iso: string, tz: string) => new Intl.DateTimeFormat("es-AR", { timeZone: tz, weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function AgroPage() {
  const [fields, setFields] = useState<Field[]>(() => readStorage<Field[]>(KEY, []));
  const [selected, setSelected] = useState<string | null>(() => {
    const fields = readStorage<Field[]>(KEY, []);
    const previous = readStorage<string | null>("efg-agro-selected", null);
    return fields.some(f => f.id === previous) ? previous : fields[0]?.id ?? null;
  });
  useEffect(() => store("efg-agro-selected", selected), [selected]);
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<"buscar" | "manual">("buscar");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Location[]>([]);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState({ name: "", lat: "", lon: "" });
  const [formError, setFormError] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => store(KEY, fields), [fields]);
  const field = fields.find(f => f.id === selected) ?? null;

  const load = (f: Field | null) => {
    ctrl.current?.abort();
    setWeather(null); setError("");
    if (!f) { setLoading(false); return; }
    const c = new AbortController(); ctrl.current = c;
    setLoading(true);
    fetchWeather(f, c.signal)
      .then(w => { if (!c.signal.aborted) setWeather(w); })
      .catch(e => { if (!c.signal.aborted) setError(e instanceof Error ? e.message : "No pudimos consultar el pronóstico."); })
      .finally(() => { if (!c.signal.aborted) setLoading(false); });
  };
  useEffect(() => { load(field); return () => ctrl.current?.abort(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field?.id, field?.latitude, field?.longitude]);

  useEffect(() => {
    if (mode !== "buscar" || query.trim().length < 2) { setResults([]); return; }
    const c = new AbortController();
    const t = window.setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchLocations(query, c.signal)); } catch { if (!c.signal.aborted) setResults([]); }
      finally { if (!c.signal.aborted) setSearching(false); }
    }, 280);
    return () => { window.clearTimeout(t); c.abort(); };
  }, [query, mode]);

  const addField = (loc: Location, manualEntry: boolean) => {
    const f: Field = { ...loc, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, label: loc.name, manual: manualEntry };
    setFields(prev => [...prev, f]); setSelected(f.id); setAdding(false); setQuery(""); setManual({ name: "", lat: "", lon: "" }); setFormError("");
  };
  const submitManual = () => {
    const lat = Number(manual.lat.replace(",", ".")); const lon = Number(manual.lon.replace(",", "."));
    if (manual.name.trim().length < 2) return setFormError("Poné un nombre de al menos 2 letras.");
    if (!Number.isFinite(lat) || lat < -56 || lat > -21) return setFormError("La latitud debe estar entre -56 y -21 (Argentina).");
    if (!Number.isFinite(lon) || lon < -74 || lon > -53) return setFormError("La longitud debe estar entre -74 y -53 (Argentina).");
    addField({ name: manual.name.trim(), region: "Coordenadas manuales", latitude: lat, longitude: lon }, true);
  };
  const remove = (id: string) => {
    if (!window.confirm("¿Quitar este campo de la lista? Se borra solo de este dispositivo.")) return;
    setFields(prev => prev.filter(f => f.id !== id));
    if (selected === id) setSelected(fields.find(f => f.id !== id)?.id ?? null);
  };
  const saveRename = (id: string) => {
    const v = renameValue.trim(); if (v.length < 2) return;
    setFields(prev => prev.map(f => f.id === id ? { ...f, label: v } : f)); setRenaming(null);
  };

  const stats = useMemo(() => {
    if (!weather) return null;
    const nowH = Math.floor(Date.now() / 3600000) * 3600000;
    const future = weather.hourly.filter(h => Date.parse(h.time) >= nowH);
    const within = (hrs: number) => future.filter(h => Date.parse(h.time) < nowH + hrs * 3600000);
    const sum = (list: (number | null)[]) => { const k = list.filter((x): x is number => x != null); return { total: k.reduce((a, b) => a + b, 0), known: k.length, of: list.length }; };
    const frost = future.find(h => h.temperature != null && h.temperature <= 0);
    const low = future.find(h => h.temperature != null && h.temperature <= 3);
    const thunder = future.find(h => h.code != null && h.code >= 95);
    const hailSignal = future.find(h => h.code === 96 || h.code === 99);
    const temps = future.filter(h => h.temperature != null);
    const minHour = temps.reduce<typeof temps[number] | null>((m, h) => !m || (h.temperature! < m.temperature!) ? h : m, null);
    const next24 = within(24);
    const maxOf = (v: (number | null)[]) => { const k = v.filter((x): x is number => x != null); return k.length ? Math.max(...k) : null; };
    const c = weather.current;
    const ithNow = c.temperature != null && c.humidity != null ? ith(c.temperature, c.humidity) : null;
    const ithHours = next24.filter(h => h.temperature != null && h.humidity != null).map(h => ({ h, v: ith(h.temperature!, h.humidity!) }));
    const ithMax = ithHours.reduce<{ h: typeof next24[number]; v: number } | null>((m, x) => !m || x.v > m.v ? x : m, null);
    return {
      frost, low, thunder, hailSignal, minHour, p24: sum(within(24).map(h => h.rain)), p72: sum(within(72).map(h => h.rain)), p7: sum(weather.daily.map(d => d.rain)),
      wind24: maxOf(next24.map(h => h.wind)), gust24: maxOf(next24.map(h => h.gusts)), ithNow, ithMax, tempMax: maxOf(next24.map(h => h.temperature)), humMax: maxOf(next24.map(h => h.humidity)),
    };
  }, [weather]);

  const tz = weather?.timezone ?? "America/Argentina/Buenos_Aires";
  const pct = (v: number) => `${Math.min(100, Math.max(0, ((v - 60) / 35) * 100))}%`;
  const rainLine = (s: { total: number; known: number; of: number }) => s.known ? `${formatValue(s.total, " mm")}${s.known < s.of ? ` (con ${s.known} de ${s.of} valores conocidos)` : ""}` : "Sin datos";

  return <section className="module-page module-wide">
    <p className="eyebrow">EFG AGRO</p>
    <h1>El tiempo <em className="accent">en tu campo.</em></h1>
    <p className="module-intro">Guardá tus campos o localidades en este dispositivo y mirá heladas posibles, lluvia prevista, viento e índice de temperatura y humedad. Todo es pronóstico de modelo.</p>

    <div className="agro-layout">
      <aside className="panel">
        <div className="panel-head"><h2>Tus campos</h2><button className="chip" onClick={() => setAdding(!adding)} data-testid="button-agro-add">{adding ? <X size={14} /> : <Plus size={14} />}{adding ? "Cerrar" : "Agregar"}</button></div>
        {adding && <div className="add-box">
          <div className="seg" role="tablist"><button className={mode === "buscar" ? "selected" : ""} onClick={() => setMode("buscar")} data-testid="tab-agro-search">Buscar localidad</button><button className={mode === "manual" ? "selected" : ""} onClick={() => setMode("manual")} data-testid="tab-agro-manual">Coordenadas</button></div>
          {mode === "buscar" ? <>
            <div className="search-input-wrap"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ej.: Pergamino" aria-label="Buscar localidad" data-testid="input-agro-search" /></div>
            <div className="search-results">{searching ? <p className="search-hint">Buscando…</p> : results.map(r => <button key={`${r.latitude}${r.longitude}`} className="search-result" onClick={() => addField(r, false)} data-testid={`button-agro-result-${r.name.toLowerCase().replaceAll(" ", "-")}`}><MapPin size={15} /><span><b>{r.name}</b><small>{r.region}</small></span></button>)}{query.trim().length >= 2 && !searching && !results.length && <p className="search-hint">Sin resultados.</p>}</div>
          </> : <div className="form-grid">
            <label>Nombre<input value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })} placeholder="Ej.: Lote norte" data-testid="input-agro-name" /></label>
            <label>Latitud<input inputMode="decimal" value={manual.lat} onChange={e => setManual({ ...manual, lat: e.target.value })} placeholder="-33.89" data-testid="input-agro-lat" /></label>
            <label>Longitud<input inputMode="decimal" value={manual.lon} onChange={e => setManual({ ...manual, lon: e.target.value })} placeholder="-60.57" data-testid="input-agro-lon" /></label>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <button className="primary-btn" onClick={submitManual} data-testid="button-agro-save-manual">Guardar campo</button>
          </div>}
        </div>}
        {fields.length === 0 && !adding && <div className="empty-soft"><MapPin size={20} /><p>Todavía no agregaste campos. Empezá con una localidad o tus coordenadas.</p></div>}
        <ul className="field-list">{fields.map(f => <li key={f.id} className={f.id === selected ? "selected" : ""}>
          {renaming === f.id ? <div className="rename-row"><input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => e.key === "Enter" && saveRename(f.id)} aria-label="Nuevo nombre" data-testid={`input-rename-${f.id}`} /><button onClick={() => saveRename(f.id)} aria-label="Guardar nombre"><Check size={15} /></button><button onClick={() => setRenaming(null)} aria-label="Cancelar"><X size={15} /></button></div>
            : <><button className="field-main" onClick={() => setSelected(f.id)} data-testid={`button-field-${f.id}`}><b>{f.label}</b><small>{f.manual ? `${f.latitude.toFixed(3)}, ${f.longitude.toFixed(3)}` : f.region || f.name}</small></button>
              <button className="icon-mini" onClick={() => { setRenaming(f.id); setRenameValue(f.label); }} aria-label="Renombrar" data-testid={`button-rename-${f.id}`}><Pencil size={14} /></button>
              <button className="icon-mini" onClick={() => remove(f.id)} aria-label="Quitar" data-testid={`button-remove-${f.id}`}><Trash2 size={14} /></button></>}
        </li>)}</ul>
      </aside>

      <div className="agro-main">
        {!field ? <div className="panel empty-soft big"><Thermometer size={24} /><p>Elegí o agregá un campo para ver su pronóstico.</p></div>
          : error ? <div className="panel error-panel" role="alert"><AlertTriangle size={20} /><div><b>No pudimos consultar el pronóstico.</b><span>{error}</span></div><button className="retry-button" onClick={() => load(field)} data-testid="button-agro-retry">Reintentar</button></div>
          : loading || !stats || !weather ? <div className="agro-grid">{[0, 1, 2, 3].map(i => <div key={i} className="panel skeleton-panel" />)}</div>
          : <>
            <div className="panel-head"><h2 data-testid="text-agro-field">{field.label}</h2><button className="chip" onClick={() => load(field)} data-testid="button-agro-refresh"><RefreshCw size={14} /> Actualizar</button></div>
            <div className="agro-grid">
              <article className={`panel stat ${stats.frost ? "tone-cold" : ""}`}><span className="stat-icon"><Snowflake size={17} /></span><h3>Heladas</h3>
                {stats.frost ? <p><b>Posible helada según modelo</b> desde {fmtTime(stats.frost.time, tz)} ({formatValue(stats.frost.temperature)}° a 2 m).</p>
                  : stats.low ? <p><b>Temperaturas bajas</b> ({formatValue(stats.low.temperature)}° a 2 m) hacia {fmtTime(stats.low.time, tz)}. Con 3° o menos en el aire puede haber escarcha en superficie, pero no está garantizado.</p>
                  : !stats.minHour ? <p>Sin temperaturas horarias suficientes para evaluar bajas temperaturas.</p> : <p>El modelo no muestra temperaturas de 3° o menos en los próximos días. Esto no garantiza ausencia de helada en superficie.</p>}
                {stats.minHour && <small>Mínima prevista: {formatValue(stats.minHour.temperature)}° ({fmtTime(stats.minHour.time, tz)})</small>}</article>
              <article className="panel stat"><span className="stat-icon"><Droplets size={17} /></span><h3>Lluvia prevista</h3>
                <dl><div><dt>Próximas 24 h</dt><dd>{rainLine(stats.p24)}</dd></div><div><dt>Próximas 72 h</dt><dd>{rainLine(stats.p72)}</dd></div><div><dt>7 días</dt><dd>{rainLine(stats.p7)}</dd></div></dl>
                <small>Suma de valores pronosticados. No es lluvia caída ni registro histórico.</small></article>
              <article className="panel stat"><span className="stat-icon"><AlertTriangle size={17} /></span><h3>Tormentas · señal de modelo</h3>
                {stats.thunder ? <p>El modelo indica posibilidad de tormenta desde {fmtTime(stats.thunder.time, tz)}.{stats.hailSignal ? ` También codifica posible granizo hacia ${fmtTime(stats.hailSignal.time, tz)}; la precisión local es limitada.` : ""}</p> : <p>No hay señal de tormenta en las horas disponibles del modelo. No significa que no pueda ocurrir.</p>}
                <small>No es detección ni alerta oficial. Revisá los avisos del SMN. Si escuchás truenos, buscá refugio inmediatamente; no esperes la app.</small></article>
              <article className="panel stat"><span className="stat-icon"><Wind size={17} /></span><h3>Viento</h3>
                <dl><div><dt>Ahora</dt><dd>{formatValue(weather.current.wind, " km/h")}</dd></div><div><dt>Ráfagas ahora</dt><dd>{formatValue(weather.current.gusts, " km/h")}</dd></div><div><dt>Máx. 24 h</dt><dd>{formatValue(stats.wind24, " km/h")}</dd></div><div><dt>Ráfaga máx. 24 h</dt><dd>{formatValue(stats.gust24, " km/h")}</dd></div></dl>
                <small>Temp. máx. 24 h {formatValue(stats.tempMax, "°")} · Humedad máx. {formatValue(stats.humMax, "%")}</small></article>
              <article className="panel stat"><span className="stat-icon"><Thermometer size={17} /></span><h3>Índice temperatura-humedad (ITH)</h3>
                {stats.ithNow == null && !stats.ithMax ? <p>Sin temperatura o humedad disponibles: no lo calculamos.</p> : <>
                  {stats.ithNow != null && <p className="ith-value" data-testid="text-ith-now">{formatValue(stats.ithNow)}<small> ahora</small></p>}
                  {stats.ithMax && <p>Máximo previsto 24 h: <b>{formatValue(stats.ithMax.v)}</b> ({fmtTime(stats.ithMax.h.time, tz)})</p>}
                  <div className="ith-bar" aria-hidden><i style={{ left: pct(stats.ithNow ?? stats.ithMax!.v) }} /></div>
                  <div className="ith-scale"><span>60</span><span>72</span><span>79</span><span>89</span><span>95</span></div>
                </>}
                <small>Fórmula general (1,8T+32) − (0,55 − 0,0055·HR)·(1,8T − 26). Los cortes 72, 79 y 89 se citan en literatura general; es una orientación continua, no un diagnóstico veterinario. No considera radiación solar, raza, sombra ni agua.</small></article>
            </div>
            <p className="fine-print">Pronóstico de modelo Open-Meteo para {field.latitude.toFixed(2)}, {field.longitude.toFixed(2)}, consultado {new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(new Date(weather.fetchedAt))}. No reemplaza los avisos oficiales del SMN ni el asesoramiento técnico.</p>
          </>}
      </div>
    </div>
  </section>;
}
