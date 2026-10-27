import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, Bookmark, ChevronDown, ChevronLeft,
  ChevronRight, CircleHelp, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun,
  Compass, Droplets, ExternalLink, Heart, LocateFixed, MapPin, Menu, Moon, Plus,
  RefreshCw, Search, Sun, Sunrise, Sunset, Thermometer,
  Umbrella, Wind, X,
} from "lucide-react";
import {
  conditionLabel, fetchWeather, formatValue,
  makeTip, searchLocations,
} from "./lib/weather";
import type { Location, Weather } from "./lib/weather";
import "./efg-weather.css";
import "./modules.css";
import { loadCatalog } from "./lib/extras";
import type { Fragrance, Setting } from "./lib/extras";
import { OfflineBanner, UpdatedAgo } from "./components/status-bits";
import { NightOutCard } from "./components/NightOutCard";
import { useWeatherRefresh } from "./hooks/useWeatherRefresh";
import { useLocalCalendarDay } from "./hooks/useLocalCalendarDay";
import { useDailyFragrance } from "./hooks/useDailyFragrance";
import { AgroPage } from "./pages/AgroPage";
import { CommunityPage } from "./pages/CommunityPage";
import { MorePage } from "./pages/MorePage";
import { CurrentSkyIcon } from "./components/CurrentSkyIcon";
import { PalopoliSponsor } from "./components/PalopoliSponsor";
import { currentSky } from "./lib/current-sky";
import { useCurrentLocation } from "./hooks/useCurrentLocation";
import { approximatePlace, locationKey, savedPlace, validPlace } from "./lib/location-preference";
import { LocationConsent } from "./components/LocationConsent";

type Page = "Inicio" | "Agro" | "Comunidad" | "Más";
type Profile = "Masculino" | "Femenino" | "Sin preferencia";
type Theme = "light" | "dark";
const pages: { name: Page; icon: typeof Sun }[] = [
  { name: "Inicio", icon: Sun },
  { name: "Agro", icon: Sunrise }, { name: "Comunidad", icon: Heart }, { name: "Más", icon: Menu },
];
const presetLocations: Location[] = [
  { name: "Caseros", region: "Buenos Aires", latitude: -34.6037, longitude: -58.5638 },
  { name: "CABA", region: "Ciudad Autónoma de Buenos Aires", latitude: -34.6037, longitude: -58.3816 },
  { name: "San Isidro", region: "Buenos Aires", latitude: -34.4708, longitude: -58.5286 },
];
function readStorage<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function store(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage can be unavailable in private browsing. */ }
}
function conditionIcon(code: number | null, size = 20, isDay: number | null = 1) {
  switch (currentSky(code, isDay).kind) {
    case "clear": return isDay === 0 ? <Moon size={size} /> : isDay === 1 ? <Sun size={size} /> : <CircleHelp size={size} />;
    case "partly-cloudy": return isDay === 0 ? <CloudMoon size={size} /> : isDay === 1 ? <CloudSun size={size} /> : <Cloud size={size} />;
    case "cloudy": return <Cloud size={size} />;
    case "fog": return <CloudFog size={size} />;
    case "drizzle": return <CloudDrizzle size={size} />;
    case "rain": return <CloudRain size={size} />;
    case "snow": return <CloudSnow size={size} />;
    case "thunderstorm": return <CloudLightning size={size} />;
    default: return <CircleHelp size={size} />;
  }
}
function localDate(iso: string, timezone: string, options: Intl.DateTimeFormatOptions) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", { timeZone: timezone, ...options }).format(parsed);
}
function temperatureLabel(value: number | null | undefined) {
  return value == null ? formatValue(value) : `${formatValue(value)}°`;
}
function SkyRing({ temp, actual, code, isDay }: { temp: string; actual: string; code: number | null; isDay: number | null }) {
  return <div className="sky-ring sky-ring--weather" role="group" aria-label={`Sensación térmica ${temp}${temp !== "No disponible" ? " grados Celsius" : ""}`}>
    <div className="ring-orbit orbit-a" /><div className="ring-orbit orbit-b" />
    <div className="ring-content">
      <CurrentSkyIcon code={code} isDay={isDay} />
      <span className="ring-kicker"><Thermometer size={14} /> Sensación térmica</span>
      <div className={`ring-temp${temp === "No disponible" ? " ring-temp--missing" : ""}`} data-testid="text-apparent-temperature">{temp}{temp !== "No disponible" && <sup>°C</sup>}</div>
      <span className="ring-actual">Temperatura real <b>{actual === "No disponible" ? actual : `${actual} °C`}</b></span>
    </div>
  </div>;
}
function Metric({ icon, title, value, detail }: { icon: ReactNode; title: string; value: string; detail: string }) {
  return <div className="metric">
    <div className="metric-icon">{icon}</div><div className="metric-copy"><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>
  </div>;
}
function App() {
  const geo = useCurrentLocation();
  const { location } = geo;
  const [favorites, setFavorites] = useState<Location[]>(() => {
    const items = readStorage<unknown>("efg-favorites", presetLocations.slice(0, 1));
    return Array.isArray(items) ? items.filter(validPlace).map(savedPlace) : presetLocations.slice(0, 1);
  });
  const [profile, setProfile] = useState<Profile>(() => readStorage("efg-profile", "Sin preferencia"));
  const [theme, setTheme] = useState<Theme>(() => readStorage("efg-theme", "light"));
  const [page, setPage] = useState<Page>("Inicio");
  const [weatherState, setWeatherState] = useState<{ key: string; data: Weather | null; loading: boolean; error: string }>({ key: "", data: null, loading: true, error: "" });
  const matchesLocation = weatherState.key === locationKey(location);
  const weather = matchesLocation ? weatherState.data : null;
  const loading = !matchesLocation || weatherState.loading;
  const error = matchesLocation && !weatherState.data ? weatherState.error : "";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Location[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [perfumeOpen, setPerfumeOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const [catalog, setCatalog] = useState<Fragrance[]>([]);
  const [setting, setSetting] = useState<Setting>(() => readStorage<Setting>("efg-fragrance-setting", ""));
  useEffect(() => { loadCatalog().then(setCatalog).catch(() => setCatalog([])); }, []);
  useEffect(() => store("efg-fragrance-setting", setting), [setting]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    store("efg-theme", theme);
  }, [theme]);
  useEffect(() => store("efg-favorites", favorites), [favorites]);
  useEffect(() => store("efg-profile", profile), [profile]);

  const loadWeather = useCallback(async (target: Location, background = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const key = locationKey(target);
    setWeatherState(previous => ({ key, data: background && previous.key === key ? previous.data : null, loading: true, error: "" }));
    try {
      const next = await fetchWeather(target, controller.signal);
      if (!controller.signal.aborted) setWeatherState({ key, data: next, loading: false, error: "" });
    } catch (cause) {
      if (!controller.signal.aborted) setWeatherState(previous => ({ key, data: background && previous.key === key ? previous.data : null, loading: false, error: cause instanceof Error ? cause.message : "No pudimos consultar el clima. Intentá de nuevo." }));
    }
  }, []);
  useEffect(() => {
    void loadWeather(location);
    return () => controllerRef.current?.abort();
  }, [location.latitude, location.longitude, loadWeather]);
  const freshness = useWeatherRefresh(location, weather, loading, loadWeather);
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setSearching(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchLocations(query.trim(), controller.signal)); }
      catch { if (!controller.signal.aborted) setResults([]); }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 260);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  const timezone = weather?.timezone || "America/Argentina/Buenos_Aires";
  const fragranceDay = useLocalCalendarDay(timezone);
  const picked = useDailyFragrance(catalog, weather, profile, setting, fragranceDay, location.latitude);
  const current = weather?.current;
  const currentDay = weather?.daily[0];
  const currentHour = weather?.hourly.find(hour => hour.time.slice(0, 13) === current?.time.slice(0, 13));
  const upcomingHours = weather?.hourly.filter(hour => Date.parse(hour.time) >= Math.floor(Date.parse(weather.current.time) / 3600000) * 3600000).slice(0, 24) ?? [];
  const tip = weather ? makeTip(weather, fragranceDay) : "";
  const advice = picked?.top ? {
    family: picked.top.family, name: picked.top.name, why: picked.why, intensity: picked.top.intensity,
    notes: { salida: picked.top.notes.salida ?? "", corazon: picked.top.notes.corazon ?? "", fondo: picked.top.notes.fondo ?? "" },
    destacadas: picked.top.notes.destacadas, source: picked.top.sourceUrl ?? picked.top.sourceLabel, sourceLabel: picked.top.sourceLabel,
    alternatives: picked.alternatives.map(f => f.name),
  } : null;
  const displayDate = useMemo(() => new Intl.DateTimeFormat("es-AR", {
    timeZone: timezone, weekday: "long", day: "numeric", month: "long",
  }).format(new Date(freshness.now)), [timezone, freshness.now]);
  const toggleFavorite = () => {
    const saved = savedPlace(location);
    const exists = favorites.some((item) => locationKey(item) === locationKey(saved));
    setFavorites(exists ? favorites.filter((item) => locationKey(item) !== locationKey(saved)) : [...favorites, saved]);
  };
  const isFavorite = favorites.some((item) => locationKey(item) === locationKey(savedPlace(location)));
  const chooseLocation = (next: Location) => { geo.chooseManual(next); setSearchOpen(false); setQuery(""); };
  const requestLocation = geo.useGps;
  const refresh = () => void loadWeather(location);
  const selectedLabel = location.region ? `${location.name}, ${location.region}` : location.name;
  // Public city centres are not device fixes: retain their original coordinates/identity.
  const publicLocation = useMemo(() => location.source === "gps" ? approximatePlace(location) : location, [location]);

  return <div className="weather-app">
    <header className="topbar">
      <button className="brand" onClick={() => setPage("Inicio")} aria-label="EFG Weather, inicio" data-testid="button-home">
        <span className="brand-mark"><Sun size={22} strokeWidth={1.8} /></span>
        <span className="brand-name">EFG <b>Weather</b><small data-testid="header-location">{selectedLabel}</small></span>
      </button>
      <div className="top-actions">
        <button className="icon-button theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={theme === "light" ? "Activar tema oscuro" : "Activar tema claro"} data-testid="button-toggle-theme">
          {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
        </button>
        <button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Abrir navegación" data-testid="button-mobile-menu">{mobileMenu ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </header>
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "is-open" : ""}`}>
        <p className="nav-label">TU ESPACIO</p>
        <nav className="main-nav" aria-label="Navegación principal">
          {pages.map(({ name, icon: Icon }) => <button key={name} className={`nav-item ${page === name ? "active" : ""}`} onClick={() => { setPage(name); setMobileMenu(false); }} data-testid={`nav-${name.toLowerCase().replaceAll(" ", "-")}`}>
            <Icon size={18} strokeWidth={1.8} /><span>{name}</span>{name === "Inicio" && <span className="nav-live" />}
          </button>)}
        </nav>
        <div className="sidebar-divider" />
        <div className="saved-heading"><span className="nav-label">TUS LUGARES</span><button className="tiny-action" onClick={() => setSearchOpen(true)} aria-label="Agregar lugar" data-testid="button-add-location"><Plus size={16} /></button></div>
        <div className="saved-list">
          {favorites.map((fav) => <button key={`${fav.latitude}-${fav.longitude}`} className={`saved-place ${fav.latitude === location.latitude && fav.longitude === location.longitude ? "selected" : ""}`} onClick={() => chooseLocation(fav)} data-testid={`location-favorite-${fav.name.toLowerCase().replaceAll(" ", "-")}`}>
            <MapPin size={15} /><span>{fav.name}</span>{fav.latitude === location.latitude && fav.longitude === location.longitude && <span className="place-dot" />}
          </button>)}
          {favorites.length === 0 && <p className="sidebar-empty">Guardá un lugar con el marcador.</p>}
        </div>
        <div className="sidebar-foot"><span className="sky-mini"><Sun size={15} /></span><span>Un cielo, mil maneras<br />de vivir el día.</span></div>
      </aside>

      <main className="main-content">
        <OfflineBanner />
        {page === "Inicio" ? <>
          <section className="welcome-row">
            <div><p className="eyebrow">{displayDate}</p><h1>El día, <em>a tu manera.</em></h1></div>
            <div className="location-control">
              <button className="location-select" onClick={() => setSearchOpen(!searchOpen)} aria-expanded={searchOpen} data-testid="button-select-location"><MapPin size={17} /><span>{selectedLabel}</span><ChevronDown size={15} /></button>
              <button className={`favorite-button ${isFavorite ? "is-favorite" : ""}`} onClick={toggleFavorite} aria-label={isFavorite ? "Quitar de guardados" : "Guardar ubicación"} data-testid="button-toggle-favorite"><Bookmark size={17} fill={isFavorite ? "currentColor" : "none"} /></button>
              <button className="gps-button" onClick={requestLocation} disabled={geo.busy} aria-label="Usar mi ubicación" data-testid="button-geolocation"><LocateFixed size={17} /></button>
              {searchOpen && <div className="location-popover">
                <div className="search-input-wrap"><Search size={17} /><input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar ciudad en Argentina" aria-label="Buscar ciudad" data-testid="input-location-search" /><button onClick={() => { setSearchOpen(false); setQuery(""); }} aria-label="Cerrar búsqueda"><X size={16} /></button></div>
                <div className="search-results">
                  {query.trim().length >= 2 ? searching ? <p className="search-hint">Buscando lugares…</p> : results.length ? results.map((item) => <button key={`${item.name}-${item.latitude}`} onClick={() => chooseLocation(item)} className="search-result" data-testid={`search-result-${item.name.toLowerCase().replaceAll(" ", "-")}`}><MapPin size={15} /><span><b>{item.name}</b><small>{item.region}</small></span></button>) : <p className="search-hint">No encontramos ciudades. Probá con otro nombre.</p> : <>
                    <span className="search-label">LOCALIDADES SUGERIDAS · SIN USAR GPS</span>
                    {presetLocations.map((item) => <button key={item.name} onClick={() => chooseLocation(item)} className="search-result"><MapPin size={15} /><span><b>{item.name}</b><small>{item.region}</small></span></button>)}
                  </>}
                </div>
              </div>}
            </div>
          </section>
          {geo.showConsent && <LocationConsent onAccept={requestLocation} onLater={geo.defer} />}
          <div className="location-mode-row">
            <span data-testid="text-location-source">{location.source === "gps" ? `${geo.permission === "denied" ? "Última posición válida" : "GPS · Ubicación actual"}${geo.fixedAt ? ` · ${new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(geo.fixedAt)}` : ""}` : location.source === "default" ? "Ubicación inicial · no es tu GPS" : "Localidad elegida manualmente"}</span>
            <button className={`location-mode-button${geo.mode === "auto" && location.source === "gps" ? " is-active" : ""}`} onClick={requestLocation} disabled={geo.busy} data-testid="button-use-current-location"><LocateFixed size={14} />{geo.busy ? "Buscando…" : "Ubicación actual"}</button>
          </div>
          {geo.notice && <div className="gps-message" role="status" aria-live="polite" data-testid="location-status"><LocateFixed size={15} />{geo.notice}</div>}
          <details className="location-privacy"><summary>Tu ubicación y tu privacidad</summary><p>El GPS preciso solo se usa en memoria para consultar Open-Meteo. Con otro permiso, al tocar “Usar mi ubicación” identificamos tu zona con Georef y OpenStreetMap/Nominatim usando coordenadas aproximadas (~100 m). No enviamos identidad ni dirección. Caché geográfica temporal de 10 minutos, sin historial. Los refrescos automáticos de GPS no llaman al geocodificador. Si no hay un nombre confirmado mostramos “Ubicación actual”. Los reportes requieren otro consentimiento y siempre respetamos la selección manual.</p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a></details>
          {freshness.stale && <p role="status" className="gps-message" data-testid="weather-stale">Datos de hace más de 30 minutos o con horario de origen antiguo. {loading ? "Actualizando…" : "Podés reintentar con Actualizar."}</p>}
          {weatherState.error && weather && <p role="alert" className="gps-message">No pudimos renovar el clima. Conservamos el último dato con su hora original: {weatherState.error}</p>}
          <section className={`hero-card ${current?.code !== null && current?.code !== undefined && current.code > 2 ? "hero-overcast" : ""}`} aria-label="Clima actual">
            <div className="hero-skywash" /><div className="hero-cloud-shape cloud-one" /><div className="hero-cloud-shape cloud-two" />
            <div className="hero-weather-top"><span className="live-label"><span /> AHORA MISMO</span><button className="refresh-button" onClick={refresh} disabled={loading} aria-label="Actualizar clima" data-testid="button-refresh-weather"><RefreshCw size={16} className={loading ? "spin" : ""} /> {loading ? "Actualizando" : "Actualizar"}</button></div>
            {error ? <div className="weather-error" role="alert"><AlertTriangle size={24} /><div><strong>El cielo no respondió.</strong><span>{error}</span></div><button onClick={refresh} className="retry-button" data-testid="button-retry-weather">Intentar de nuevo</button></div> : loading && !weather ? <div className="hero-loading"><div className="skeleton-circle" /><div className="loading-lines"><i /><i /><i /></div></div> : weather && current ? <>
              <div className="hero-main">
                <div className="hero-sky-copy"><p className="hero-location">{location.name}</p><div className="condition-line">{conditionIcon(current.code, 22, current.isDay)}<span>{conditionLabel(current.code)}</span></div><p className="hero-date">{localDate(current.time, timezone, { hour: "2-digit", minute: "2-digit" })} hs · <span>se siente así</span></p></div>
                <SkyRing temp={formatValue(current.apparent)} actual={formatValue(current.temperature)} code={current.code} isDay={current.isDay} />
              </div>
              <div className="hero-bottom">
                <div className="hi-lo"><span><ArrowUp size={14} /> {temperatureLabel(currentDay?.max)}</span><span><ArrowDown size={14} /> {temperatureLabel(currentDay?.min)}</span><small>máx. / mín.</small></div>
                <p className="motto">El clima no solo se consulta.<br /><em>Se vive.</em></p>
              </div>
            </> : null}
          </section>

          <section className="metrics-strip" aria-label="Datos del tiempo">
            <Metric icon={<Droplets size={17} />} title="Humedad" value={formatValue(current?.humidity ?? null, "%")} detail="en el aire" />
            <Metric icon={<Wind size={17} />} title="Viento" value={formatValue(current?.wind ?? null, " km/h")} detail={current?.gusts !== null && current?.gusts !== undefined ? `Ráfagas ${formatValue(current.gusts, " km/h")}` : "velocidad actual"} />
            <Metric icon={<Umbrella size={17} />} title="Lluvia" value={formatValue(current?.rain ?? null, " mm")} detail={currentHour?.rainProbability != null ? `${formatValue(currentHour.rainProbability)}% previsto esta hora` : "probabilidad horaria no disponible"} />
            <Metric icon={<Sun size={17} />} title="Índice UV" value={formatValue(currentHour?.uv)} detail="pronóstico de esta hora" />
          </section>

          <div className="content-columns">
            <div className="forecast-column">
              <section className="section-card hourly-card">
                <div className="section-heading"><div><p className="eyebrow">LO QUE VIENE</p><h2>Próximas horas</h2></div><span className="section-note">24 horas</span></div>
                {loading && !weather ? <div className="hour-skeleton">{[0,1,2,3,4,5].map((i) => <i key={i} />)}</div> : <div className="hourly-scroll">
                  {upcomingHours.map((hour, index) => <div className={`hour-item ${index === 0 ? "hour-now" : ""}`} key={hour.time} data-testid={`forecast-hour-${index}`}>
                    <span className="hour-time">{localDate(hour.time, timezone, { hour: "2-digit", minute: "2-digit" })}</span><span className="hour-icon">{conditionIcon(hour.code, 19)}</span><strong>{temperatureLabel(hour.temperature)}</strong><small className="rain-chance"><Droplets size={11} />{hour.rainProbability != null ? `${formatValue(hour.rainProbability)}%` : "Sin dato"}</small>
                  </div>)}
                  {!weather?.hourly.length && <p className="forecast-empty">Todavía no hay datos horarios para mostrar.</p>}
                </div>}
              </section>
              <section className="section-card daily-card">
                <div className="section-heading"><div><p className="eyebrow">MIRÁ UN POCO MÁS</p><h2>Los próximos días</h2></div><span className="section-note">7 días</span></div>
                {loading && !weather ? <div className="daily-skeleton">{[0,1,2,3,4].map((i) => <i key={i} />)}</div> : <div className="daily-list">
                  {weather?.daily.slice(0, 7).map((day, index) => <div className="daily-row" key={day.date} data-testid={`forecast-day-${index}`}>
                    <span className="daily-name">{index === 0 ? "Hoy" : localDate(day.date, timezone, { weekday: "short" })}</span><span className="daily-condition">{conditionIcon(day.code, 18)}<small>{conditionLabel(day.code)}</small></span><span className="daily-rain">{day.rainProbability !== null && day.rainProbability >= 20 && <><Droplets size={12} />{formatValue(day.rainProbability)}%</>}</span><span className="daily-range"><b>{temperatureLabel(day.max)}</b><i><span style={{ left: `${day.min !== null && day.max !== null ? Math.min(100, Math.max(0, (day.min + 5) * 2)) : 20}%`, width: `${day.min !== null && day.max !== null ? Math.min(65, Math.max(16, (day.max - day.min) * 2.8)) : 35}%` }} /></i><span>{temperatureLabel(day.min)}</span></span>
                  </div>)}
                  {!weather?.daily.length && <p className="forecast-empty">Todavía no hay datos de pronóstico.</p>}
                </div>}
              </section>
            </div>
            <aside className="insight-column">
              <section className="tip-card"><span className="tip-spark"><Sunrise size={18} /></span><p className="eyebrow">UN CONSEJO PARA HOY</p>{loading && !weather ? <div className="tip-skeleton"><i /><i /><i /></div> : <><p className="tip-text">{tip || "Estamos leyendo el cielo para acercarte un consejo."}</p><div className="tip-footer"><span>Una mirada más cercana al día</span><ArrowDown size={15} /></div></>}</section>
              <section className="clothing-card"><div className="clothing-head"><span className="clothing-symbol">{conditionIcon(current?.code ?? null, 19)}</span><div><p className="eyebrow">PARA SALIR</p><h3>Vestite para el día</h3></div></div>{current ? <p>{current.apparent !== null && current.apparent < 12 ? "Una capa abrigada te va a acompañar mejor." : current.apparent !== null && current.apparent >= 26 ? "Elegí prendas livianas y buscá la sombra en las horas de más sol." : "Una capa liviana alcanza para moverte con comodidad."} {current.rain !== null && current.rain > 0 ? "Sumá algo para cubrirte de la lluvia." : ""}</p> : <p>Cuando tengamos el pronóstico, te contamos cómo salir.</p>}<span className="clothing-note">Orientación basada en condiciones actuales.</span></section>
              <section className="fragrance-card">
                <p className="section-note" data-testid="fragrance-rotation-status">Selección del {fragranceDay.split("-").reverse().join("/")}{picked && picked.candidateCount >= 2 ? " · cambia cada día entre opciones compatibles" : ""}</p>
                {picked?.limitation && <p role="status">{picked.limitation}</p>}
                {!advice && <p role="status">{catalog.length ? "No hay una referencia adecuada con los datos disponibles." : "El catálogo de fragancias todavía no está disponible."}</p>}
                <button className="fragrance-trigger" onClick={() => setPerfumeOpen(!perfumeOpen)} aria-expanded={perfumeOpen} data-testid="button-fragrance-advice"><span className="fragrance-mark"><Sunset size={18} /></span><span className="fragrance-title"><small>RITUAL DEL DÍA</small><b>Una fragancia para hoy</b></span><ChevronDown size={17} className={perfumeOpen ? "chevron-open" : ""} /></button>
                <div className="profile-pills" role="group" aria-label="Preferencia de fragancia">{(["Masculino", "Femenino", "Sin preferencia"] as Profile[]).map((option) => <button key={option} className={profile === option ? "selected" : ""} onClick={() => setProfile(option)} data-testid={`profile-${option.toLowerCase().replaceAll(" ", "-")}`}>{option}</button>)}</div>
                <div className="profile-pills setting-pills" role="group" aria-label="Ocasión opcional">{([["", "Cualquier momento"], ["interior", "Interior"], ["exterior", "Exterior"], ["noche", "Noche"]] as [Setting, string][]).map(([id, label]) => <button key={id || "any"} className={setting === id ? "selected" : ""} onClick={() => setSetting(id)} data-testid={`setting-${id || "cualquiera"}`}>{label}</button>)}</div>
                {advice && <div className="fragrance-advice"><span className="fragrance-family">{advice.family}</span><strong>{advice.name}</strong><span className="fragrance-intensity">{advice.intensity}</span><h3>¿Por qué funciona con este clima?</h3><p>{advice.why}</p>{perfumeOpen && <div className="fragrance-details">{advice.destacadas ? <span className="notes-wide"><b>Notas destacadas</b>{advice.destacadas}</span> : <><span><b>Salida</b>{advice.notes.salida}</span><span><b>Corazón</b>{advice.notes.corazon}</span><span><b>Fondo</b>{advice.notes.fondo}</span></>}{advice.alternatives.length > 0 && <small>También van bien hoy: {advice.alternatives.join(" · ")}</small>}{advice.sourceLabel && <small>{advice.sourceLabel}. No verificado de forma independiente con el fabricante salvo enlace oficial.</small>}<small>Inspiración olfativa, no una recomendación médica ni publicidad de producto.</small>{advice.source.startsWith("http") ? <a href={advice.source} target="_blank" rel="noreferrer">Consultar notas de fragancia <ExternalLink size={12} /></a> : <small>{advice.source}</small>}</div>}</div>}
                <span className="editorial-disclosure">Sugerencia editorial independiente</span>
              </section>
              <p className="section-note">Guardamos la elección solo en este dispositivo, sin coordenadas. Si cambia mucho el clima, la adaptamos.</p>
              {weather && <NightOutCard weather={weather} catalog={catalog} profile={profile} day={fragranceDay} latitude={location.latitude} />}
            </aside>
          </div>
          <PalopoliSponsor />
          <footer className="page-footer"><div><p>EFG Weather · El clima no solo se consulta. Se vive.</p><p>Fuente: Open-Meteo · Evaluación no comercial. Datos de modelos, no mediciones locales.</p>{weather && <p>Datos actuales: {localDate(weather.current.time, timezone, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · Consultado: {localDate(weather.fetchedAt, timezone, { hour: "2-digit", minute: "2-digit" })} · {timezone}</p>}{weather && <p><UpdatedAgo fetchedAt={weather.fetchedAt} /></p>}</div><button onClick={() => setPage("Más")}>De dónde vienen los datos <ChevronRight size={13} /></button></footer>
        </> : page === "Agro" ? <AgroPage />
          : page === "Comunidad" ? <CommunityPage location={publicLocation} favorites={favorites} onChooseLocation={chooseLocation} onUseCurrentLocation={requestLocation} gpsBusy={geo.busy} gpsNotice={geo.notice} />
          : <MorePage theme={theme} onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")} locationMode={geo.mode} onUseCurrentLocation={() => { setPage("Inicio"); requestLocation(); }} onChooseCity={() => { setPage("Inicio"); setSearchOpen(true); }} />}
        {page !== "Inicio" && page !== "Más" && <button className="back-home" onClick={() => setPage("Inicio")}><ChevronLeft size={16} /> Volver al clima de hoy</button>}
      </main>
    </div>
    {mobileMenu && <button className="mobile-scrim" onClick={() => setMobileMenu(false)} aria-label="Cerrar navegación" />}
    <nav className="mobile-bottom-nav" aria-label="Navegación móvil">{pages.map(({ name, icon: Icon }) => <button key={name} className={page === name ? "active" : ""} onClick={() => setPage(name)} data-testid={`mobile-nav-${name.toLowerCase().replaceAll(" ", "-")}`}><Icon size={19} /><span>{name}</span></button>)}</nav>
  </div>;
}

export default App;
