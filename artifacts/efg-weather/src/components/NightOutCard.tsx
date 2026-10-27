import { useState } from "react";
import { ChevronDown, Moon } from "lucide-react";
import type { Weather } from "../lib/weather";
import { formatValue } from "../lib/weather";
import { nightOut } from "../lib/extras";
import { useDailyFragrance } from "../hooks/useDailyFragrance";
import type { Fragrance, Profile } from "../lib/extras";

export function NightOutCard({ weather, catalog, profile, day, latitude }: { weather: Weather; catalog: Fragrance[]; profile: Profile; day: string; latitude: number }) {
  const [open, setOpen] = useState(false);
  const [setting, setSetting] = useState<"interior" | "exterior">("interior");
  const n = nightOut(weather, new Date(Date.now()));
  const mean = (values: (number | null)[]) => {
    const known = values.filter((v): v is number => v != null);
    return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
  };
  // Only forecast hours feed the night recommendation. Never substitute current conditions.
  const nightWeather = n.kind === "forecast" ? {
    ...weather,
    hourly: n.hours,
    current: {
      ...weather.current,
      temperature: mean(n.hours.map(h => h.temperature)),
      apparent: mean(n.hours.map(h => h.apparent)),
      humidity: mean(n.hours.map(h => h.humidity)),
      rain: mean(n.hours.map(h => h.rain)),
      wind: n.windMax, gusts: n.gustMax,
    },
  } : null;
  const fragrances = useDailyFragrance(catalog, nightWeather, profile, "noche", day, latitude, setting, "night-out");
  const issued = new Intl.DateTimeFormat("es-AR", { timeZone: weather.timezone, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(weather.fetchedAt));
  return <section className="night-card" data-testid="card-night-out">
    <div className="night-head"><span className="night-mark"><Moon size={17} /></span><div><p className="eyebrow">SALIDA NOCTURNA</p><h3>{n.kind === "forecast" ? n.label : "Noche de viernes y sábado"}</h3></div></div>
    {n.kind === "other" ? <p>El pronóstico para salir aparece el viernes, con las horas de 20 a 3. Próximo viernes: {n.nextLabel}.</p>
      : n.kind === "past" ? <p>La ventana de esta noche (20 a 3) ya pasó o no hay horas futuras en el pronóstico.</p>
      : <>
        <p className="night-range">{n.minT != null && n.maxT != null ? <>{formatValue(n.minT)}° a {formatValue(n.maxT)}°</> : "Temperatura no disponible"}</p>
        <ul className="night-list">
          <li><span>Humedad</span><b>{n.humMin != null ? `${formatValue(n.humMin)}–${formatValue(n.humMax)}%` : "Sin dato"}</b></li>
          <li><span>Lluvia, prob. máx.</span><b>{n.rainMax != null ? `${formatValue(n.rainMax)}%` : "Sin dato"}</b></li>
          <li><span>Viento máx.</span><b>{n.windMax != null ? `${formatValue(n.windMax, " km/h")}${n.gustMax != null ? ` · ráf. ${formatValue(n.gustMax)}` : ""}` : "Sin dato"}</b></li>
        </ul>
        <div className="chip-row" role="group" aria-label="Dónde vas a estar esta noche"><button className={`chip ${setting === "interior" ? "selected" : ""}`} onClick={() => setSetting("interior")}>Adentro</button><button className={`chip ${setting === "exterior" ? "selected" : ""}`} onClick={() => setSetting("exterior")}>Al aire libre</button></div>
        {fragrances?.top && <p data-testid="night-fragrance"><b>{fragrances.top.family}</b><br />Referencia: {fragrances.top.name}</p>}
        <p className="section-note" data-testid="night-rotation-status">Selección del {day.split("-").reverse().join("/")} según el pronóstico nocturno.</p>
        {fragrances?.limitation && <p role="status">{fragrances.limitation}</p>}
        <button className="night-more" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="button-night-more">¿Por qué funciona con este clima? <ChevronDown size={14} className={open ? "chevron-open" : ""} /></button>
        {open && <div className="night-detail"><p>{n.minT == null ? "Sin temperatura nocturna suficiente para orientar la ropa. " : n.minT < 14 ? "Llevá una capa para la vuelta. " : "Según el rango previsto, elegí capas que puedas ajustar. "}{n.rainMax != null && n.rainMax >= 40 ? "Hay señal de lluvia: sumá paraguas. " : ""}{setting === "interior" ? "En interiores, mantené una intensidad discreta y respetá a quienes te rodean. " : "Al aire libre, no compenses el viento aplicando más perfume. "}{n.humMax != null && n.humMax >= 75 ? "La humedad alta refuerza la sugerencia de usar poca cantidad. " : ""}</p>
          <p>{fragrances?.why}</p>
          {fragrances?.top && <p>{fragrances.top.notes.destacadas ? `Notas destacadas: ${fragrances.top.notes.destacadas}` : `Salida: ${fragrances.top.notes.salida}. Corazón: ${fragrances.top.notes.corazon}. Fondo: ${fragrances.top.notes.fondo}.`}<br /><small>{fragrances.top.sourceLabel}. Criterio editorial, no regla científica.</small></p>}
          <p>Basado en {n.hours.length} de {n.expected} horas pronosticadas de 20 a 3{n.missing.length ? `; faltan datos de ${n.missing.join(", ")}` : ""}. Pronóstico de Open-Meteo consultado el {issued}; puede cambiar.</p></div>}
      </>}
    <p className="night-sign">¡Perfúmese mucho!</p>
  </section>;
}
