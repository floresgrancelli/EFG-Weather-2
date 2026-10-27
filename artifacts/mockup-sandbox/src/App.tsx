import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, Bookmark, ChevronDown, ChevronLeft,
  ChevronRight, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun,
  Compass, Droplets, ExternalLink, Heart, LocateFixed, MapPin, Menu, Moon, Plus,
  RefreshCw, Search, Settings2, ShieldAlert, Sun, Sunrise, Sunset, Thermometer,
  Umbrella, Wind, X,
} from "lucide-react";
import {
  conditionLabel, defaultLocation, fetchWeather, formatValue, fragranceAdvice,
  makeTip, searchLocations,
} from "./lib/weather";
import type { Location, Weather } from "./lib/weather";
import "./efg-weather.css";

type Page = "Inicio" | "Radar y alertas" | "Agro" | "Comunidad" | "Más";
type Profile = "Masculino" | "Femenino" | "Sin preferencia";
type Theme = "light" | "dark";
const pages: { name: Page; icon: typeof Sun }[] = [
  { name: "Inicio", icon: Sun }, { name: "Radar y alertas", icon: Compass },
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
function conditionIcon(code: number | null, size = 20) {
  if (code === null) return <Cloud size={size} />;
  if (code === 0) return <Sun size={size} />;
  if (code === 1 || code === 2) return <CloudSun size={size} />;
  if (code === 3) return <Cloud size={size} />;
  if (code === 45 || code === 48) return <CloudFog size={size} />;
  if (code >= 95) return <CloudLightning size={size} />;
  if (code >= 80) return <CloudRain size={size} />;
  if (code >= 51) return <CloudDrizzle size={size} />;
  return <Cloud size={size} />;
}
function localDate(iso: string, timezone: string, options: Intl.DateTimeFormatOptions) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", { timeZone: timezone, ...options }).format(parsed);
}
function temperatureLabel(value: number | null | undefined) {
  return value == null ? formatValue(value) : `${formatValue(value)}°`;
}
function SkyRing({ temp, actual }: { temp: string; actual: string }) {
  return <div className="sky-ring" aria-label={`Sensación térmica ${temp}`}>
    <div className="ring-orbit orbit-a" /><div className="ring-orbit orbit-b" />
    <div className="ring-content">
      <span className="ring-kicker"><Thermometer size={14} /> Sensación térmica</span>
      <div className="ring-temp" data-testid="text-apparent-temperature">{temp}{temp !== "No disponible" && <sup>°C</sup>}</div>
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
  const [location, setLocation] = useState<Location>(() => readStorage("efg-location", defaultLocation));
  const [favorites, setFavorites] = useState<Location[]>(() => readStorage("efg-favorites", presetLocations.slice(0, 1)));
  const [profile, setProfile] = useState<Profile>(() => readStorage("efg-profile", "Sin preferencia"));
  const [theme, setTheme] = useState<Theme>(() => readStorage("efg-theme", "light"));
  const [page, setPage] = useState<Page>("Inicio");
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Location[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [gpsMessage, setGpsMessage] = useState("");
  const [perfumeOpen, setPerfumeOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    store("efg-theme", theme);
  }, [theme]);
  useEffect(() => store("efg-location", location), [location]);
  useEffect(() => store("efg-favorites", favorites), [favorites]);
  useEffect(() => store("efg-profile", profile), [profile]);

  const loadWeather = useCallback(async (target: Location) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setWeather(null);
    setLoading(true);
    setError("");
    try {
      const next = await fetchWeather(target, controller.signal);
      if (!controller.signal.aborted) setWeather(next);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos consultar el clima. Intentá de nuevo.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadWeather(location);
    return () => controllerRef.current?.abort();
  }, [location, loadWeather]);
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
  const current = weather?.current;
  const currentDay = weather?.daily[0];
  const currentHour = weather?.hourly.find(hour => hour.time.slice(0, 13) === current?.time.slice(0, 13));
  const upcomingHours = weather?.hourly.filter(hour => Date.parse(hour.time) >= Math.floor(Date.parse(weather.current.time) / 3600000) * 3600000).slice(0, 24) ?? [];
  const tip = weather ? makeTip(weather) : "";
  const advice = weather ? fragranceAdvice(weather, profile) : null;
  const displayDate = useMemo(() => new Intl.DateTimeFormat("es-AR", {
    timeZone: timezone, weekday: "long", day: "numeric", month: "long",
  }).format(new Date()), [timezone, weather?.fetchedAt]);
  const toggleFavorite = () => {
    const exists = favorites.some((item) => item.latitude === location.latitude && item.longitude === location.longitude);
    setFavorites(exists ? favorites.filter((item) => item.latitude !== location.latitude || item.longitude !== location.longitude) : [...favorites, location]);
  };
  const isFavorite = favorites.some((item) => item.latitude === location.latitude && item.longitude === location.longitude);
  const chooseLocation = (next: Location) => { setLocation(next); setSearchOpen(false); setQuery(""); setGpsMessage(""); };
  const requestLocation = () => {
    setGpsMessage("");
    if (!navigator.geolocation) { setGpsMessage("Este navegador no permite compartir tu ubicación."); return; }
    setGpsMessage("Buscando tu ubicación…");
    navigator.geolocation.getCurrentPosition(
      (position) => chooseLocation({ name: "Mi ubicación", region: "Ubicación actual", latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (geoError) => setGpsMessage(geoError.code === geoError.PERMISSION_DENIED ? "No tenemos permiso para acceder a tu ubicación. Podés elegir una ciudad de la lista." : "No pudimos determinar tu ubicación. Elegí una ciudad para continuar."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };
  const refresh = () => void loadWeather(location);
  const selectedLabel = location.region ? `${location.name}, ${location.region}` : location.name;

  return <div className="weather-app">
    <header className="topbar">
      <button className="brand" onClick={() => setPage("Inicio")} aria-label="EFG Weather, inicio" data-testid="button-home">
        <span className="brand-mark"><Sun size={22} strokeWidth={1.8} /></span>
        <span className="brand-name">EFG <b>Weather</b><small>BUENOS AIRES · ARGENTINA</small></span>
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
        {page === "Inicio" ? <>
          <section className="welcome-row">
            <div><p className="eyebrow">{displayDate}</p><h1>El día, <em>a tu manera.</em></h1></div>
            <div className="location-control">
              <button className="location-select" onClick={() => setSearchOpen(!searchOpen)} aria-expanded={searchOpen} data-testid="button-select-location"><MapPin size={17} /><span>{selectedLabel}</span><ChevronDown size={15} /></button>
              <button className={`favorite-button ${isFavorite ? "is-favorite" : ""}`} onClick={toggleFavorite} aria-label={isFavorite ? "Quitar de guardados" : "Guardar ubicación"} data-testid="button-toggle-favorite"><Bookmark size={17} fill={isFavorite ? "currentColor" : "none"} /></button>
              <button className="gps-button" onClick={requestLocation} aria-label="Usar mi ubicación" data-testid="button-geolocation"><LocateFixed size={17} /></button>
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
          {gpsMessage && <div className="gps-message" role="status"><LocateFixed size={15} />{gpsMessage}</div>}
          <section className={`hero-card ${current?.code !== null && current?.code !== undefined && current.code > 2 ? "hero-overcast" : ""}`} aria-label="Clima actual">
            <div className="hero-skywash" /><div className="hero-cloud-shape cloud-one" /><div className="hero-cloud-shape cloud-two" />
            <div className="hero-weather-top"><span className="live-label"><span /> AHORA MISMO</span><button className="refresh-button" onClick={refresh} disabled={loading} aria-label="Actualizar clima" data-testid="button-refresh-weather"><RefreshCw size={16} className={loading ? "spin" : ""} /> {loading ? "Actualizando" : "Actualizar"}</button></div>
            {error ? <div className="weather-error" role="alert"><AlertTriangle size={24} /><div><strong>El cielo no respondió.</strong><span>{error}</span></div><button onClick={refresh} className="retry-button" data-testid="button-retry-weather">Intentar de nuevo</button></div> : loading && !weather ? <div className="hero-loading"><div className="skeleton-circle" /><div className="loading-lines"><i /><i /><i /></div></div> : weather && current ? <>
              <div className="hero-main">
                <div className="hero-sky-copy"><p className="hero-location">{location.name}</p><div className="condition-line">{conditionIcon(current.code, 22)}<span>{conditionLabel(current.code)}</span></div><p className="hero-date">{localDate(current.time, timezone, { hour: "2-digit", minute: "2-digit" })} hs · <span>se siente así</span></p></div>
                <SkyRing temp={formatValue(current.apparent)} actual={formatValue(current.temperature)} />
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
                <button className="fragrance-trigger" onClick={() => setPerfumeOpen(!perfumeOpen)} aria-expanded={perfumeOpen} data-testid="button-fragrance-advice"><span className="fragrance-mark"><Sunset size={18} /></span><span className="fragrance-title"><small>RITUAL DEL DÍA</small><b>Una fragancia para hoy</b></span><ChevronDown size={17} className={perfumeOpen ? "chevron-open" : ""} /></button>
                <div className="profile-pills" role="group" aria-label="Preferencia de fragancia">{(["Masculino", "Femenino", "Sin preferencia"] as Profile[]).map((option) => <button key={option} className={profile === option ? "selected" : ""} onClick={() => setProfile(option)} data-testid={`profile-${option.toLowerCase().replaceAll(" ", "-")}`}>{option}</button>)}</div>
                {advice && <div className="fragrance-advice"><span className="fragrance-family">{advice.family}</span><strong>{advice.name}</strong><span className="fragrance-intensity">{advice.intensity}</span><h3>¿Por qué funciona con este clima?</h3><p>{advice.why}</p>{perfumeOpen && <div className="fragrance-details"><span><b>Salida</b>{advice.notes.salida}</span><span><b>Corazón</b>{advice.notes.corazon}</span><span><b>Fondo</b>{advice.notes.fondo}</span><small>Inspiración olfativa, no una recomendación médica ni publicidad de producto.</small>{advice.source.startsWith("http") ? <a href={advice.source} target="_blank" rel="noreferrer">Consultar notas de fragancia <ExternalLink size={12} /></a> : <small>{advice.source}</small>}</div>}</div>}
                <span className="editorial-disclosure">Sugerencia editorial independiente</span>
              </section>
            </aside>
          </div>
          <section className="sponsor-card"><div className="sponsor-content"><span className="sponsor-tag">PUBLICIDAD <i /> FARMACIA PALOPOLI</span><h2>Encontrá lo que estás<br className="desktop-break" /> necesitando</h2><p>Av. 844 600 · San Francisco Solano</p></div><div className="sponsor-actions"><a href="https://wa.me/5491126825231" target="_blank" rel="noreferrer" className="sponsor-primary" data-testid="link-sponsor-whatsapp">Escribir por WhatsApp <ExternalLink size={15} /></a><a href="https://www.google.com/maps/search/?api=1&query=Farmacia%20Palopoli%20Av.%20844%20600%20San%20Francisco%20Solano" target="_blank" rel="noreferrer" className="sponsor-secondary" data-testid="link-sponsor-maps">Cómo llegar <ChevronRight size={15} /></a></div><span className="sponsor-sun" /></section>
          <footer className="page-footer"><div><p>EFG Weather · El clima no solo se consulta. Se vive.</p><p>Fuente: Open-Meteo · Evaluación no comercial. Datos de modelos, no mediciones locales.</p>{weather && <p>Datos actuales: {localDate(weather.current.time, timezone, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · Consultado: {localDate(weather.fetchedAt, timezone, { hour: "2-digit", minute: "2-digit" })} · {timezone}</p>}</div><button onClick={() => setPage("Más")}>De dónde vienen los datos <ChevronRight size={13} /></button></footer>
        </> : <ModulePage page={page} setPage={setPage} onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")} />}
      </main>
    </div>
    {mobileMenu && <button className="mobile-scrim" onClick={() => setMobileMenu(false)} aria-label="Cerrar navegación" />}
    <nav className="mobile-bottom-nav" aria-label="Navegación móvil">{pages.map(({ name, icon: Icon }) => <button key={name} className={page === name ? "active" : ""} onClick={() => setPage(name)} data-testid={`mobile-nav-${name.toLowerCase().replaceAll(" ", "-")}`}><Icon size={19} /><span>{name === "Radar y alertas" ? "Radar" : name}</span></button>)}</nav>
  </div>;
}

function ModulePage({ page, setPage, onToggleTheme }: { page: Page; setPage: (page: Page) => void; onToggleTheme: () => void }) {
  const content: Record<Exclude<Page, "Inicio">, { eyebrow: string; title: string; body: string; status: string }> = {
    "Radar y alertas": { eyebrow: "RADAR Y ALERTAS", title: "El cielo, sin sorpresas.", body: "Esta sección todavía está en preparación. No mostramos alertas ni imágenes de radar hasta contar con una fuente oficial disponible.", status: "Alertas oficiales todavía no disponibles" },
    Agro: { eyebrow: "EFG AGRO", title: "El tiempo en el campo.", body: "Estamos preparando un espacio con información meteorológica pensada para acompañar las decisiones agropecuarias.", status: "Pronóstico agropecuario en preparación" },
    Comunidad: { eyebrow: "COMUNIDAD", title: "Un cielo compartido.", body: "Pronto vas a poder encontrar aquí herramientas para conversar y compartir experiencias sobre el tiempo.", status: "Funciones comunitarias en preparación" },
    Más: { eyebrow: "EFG WEATHER", title: "Transparencia, ante todo.", body: "El pronóstico se consulta en Open-Meteo, una plataforma de datos meteorológicos. EFG Weather no emite alertas oficiales ni reemplaza las indicaciones de las autoridades.", status: "Fuente meteorológica: Open-Meteo" },
  };
  if (page === "Inicio") return null;
  const item = content[page];
  return <section className="module-page">
    <p className="eyebrow">{item.eyebrow}</p><h1>{item.title}</h1><p className="module-intro">{item.body}</p>
    <div className="module-status"><span className="status-dot" /><div><b>{item.status}</b><span>Estamos trabajando para acercarte información clara y útil.</span></div></div>
    {page === "Radar y alertas" && <><div className="safety-note"><ShieldAlert size={20} /><p><b>Si escuchás truenos, buscá refugio inmediatamente.</b><br />No esperes una notificación de esta app para ponerte a resguardo. No hay detección de rayos ni granizo conectada.</p></div><div className="sources-block"><h2>Consultá las fuentes oficiales</h2><a href="https://www.smn.gob.ar/" target="_blank" rel="noreferrer">Servicio Meteorológico Nacional <ExternalLink size={15} /></a><a href="https://www.argentina.gob.ar/jefatura/innovacion-ciencia-y-tecnologia/ciencia/sinarame" target="_blank" rel="noreferrer">SINARAME <ExternalLink size={15} /></a></div></>}
    {page === "Más" && <>
      <div className="sources-block"><h2>Fuentes oficiales de Argentina</h2><p>Para alertas y avisos meteorológicos, consultá siempre los canales oficiales.</p><a href="https://www.smn.gob.ar/" target="_blank" rel="noreferrer">Servicio Meteorológico Nacional <ExternalLink size={15} /></a><a href="https://www.argentina.gob.ar/jefatura/innovacion-ciencia-y-tecnologia/ciencia/sinarame" target="_blank" rel="noreferrer">SINARAME <ExternalLink size={15} /></a></div>
      <div className="sources-block"><h2>Sobre los datos</h2><p>Open-Meteo integra modelos meteorológicos de acceso público. Los datos pueden tener demoras o diferencias respecto de las condiciones observadas.</p><a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">Documentación meteorológica <ExternalLink size={15} /></a><a href="https://open-meteo.com/en/terms" target="_blank" rel="noreferrer">Términos y uso no comercial <ExternalLink size={15} /></a></div>
      <div className="settings-panel"><div className="settings-title"><Settings2 size={18} /><h2>Preferencias</h2></div><div className="setting-line"><span>Apariencia</span><button className="setting-toggle" onClick={onToggleTheme}><Moon size={15} /> Cambiar tema</button></div><p>Los lugares guardados y tus preferencias se mantienen en este dispositivo.</p></div>
    </>}
    {page !== "Más" && <button className="back-home" onClick={() => setPage("Inicio")}><ChevronLeft size={16} /> Volver al clima de hoy</button>}
  </section>;
}

export default App;
