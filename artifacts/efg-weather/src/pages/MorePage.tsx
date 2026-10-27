import { useEffect, useState } from "react";
import { Download, ExternalLink, Moon, Settings2, Smartphone, Trash2 } from "lucide-react";
import { canPromptInstall, isStandalone, onInstallChange, promptInstall } from "../lib/pwa";

const STATUS: { name: string; state: "ok" | "pending"; note: string }[] = [
  { name: "Pronóstico y consejo del día", state: "ok", note: "Open-Meteo, datos de modelo" },
  { name: "Ubicación GPS", state: "ok", note: "Localidad aproximada bajo consulta voluntaria; jurisdicción o nombre no disponible si la fuente no alcanza" },
  { name: "EFG Agro", state: "ok", note: "Campos guardados en este dispositivo" },
  { name: "Reportes de la comunidad", state: "ok", note: "Anónimos, no verificados" },
  { name: "Encuesta de perfumes", state: "ok", note: "Opcional, con totales protegidos" },
  { name: "Club EFG", state: "pending", note: "En preparación. Sin cuentas ni contadores todavía" },
  { name: "Notificaciones", state: "pending", note: "No disponibles; no enviamos avisos" },
  { name: "Alertas oficiales integradas", state: "pending", note: "Consultalas directo en el SMN" },
  { name: "Apps en tiendas", state: "pending", note: "No publicadas; podés instalar la web" },
];

export function MorePage({ onToggleTheme, theme, locationMode, onUseCurrentLocation, onChooseCity }: { onToggleTheme: () => void; theme: string; locationMode: "auto" | "manual"; onUseCurrentLocation: () => void; onChooseCity: () => void }) {
  const [canInstall, setCanInstall] = useState(canPromptInstall());
  const [installed, setInstalled] = useState(isStandalone());
  const [msg, setMsg] = useState("");
  useEffect(() => onInstallChange(() => { setCanInstall(canPromptInstall()); setInstalled(isStandalone()); }), []);
  const install = async () => { const r = await promptInstall(); setMsg(r === "accepted" ? "Listo, quedó instalada." : r === "dismissed" ? "Sin problema, podés hacerlo después." : "Tu navegador no ofrece la instalación directa."); };
  const clearLocal = () => {
    if (!window.confirm("¿Borrar lugares, campos y preferencias de este dispositivo?")) return;
    ["efg-location", "efg-location-preference", "efg-favorites", "efg-profile", "efg-agro-fields", "efg-agro-selected", "efg-fragrance-setting"].forEach(k => { try { localStorage.removeItem(k); } catch { /* */ } });
    window.location.reload();
  };

  return <section className="module-page">
    <p className="eyebrow">EFG WEATHER</p>
    <h1>Transparencia, ante todo.</h1>
    <p className="module-intro">Qué funciona hoy, qué está en preparación y de dónde vienen los datos. EFG Weather no emite alertas oficiales ni reemplaza a las autoridades.</p>

    <div className="sources-block status-list"><h2>Estado de cada función</h2>
      <ul>{STATUS.map(s => <li key={s.name} data-testid={`status-${s.name.toLowerCase().replaceAll(" ", "-")}`}><span className={`status-pill ${s.state}`}>{s.state === "ok" ? "Funciona" : "En preparación"}</span><b>{s.name}</b><small>{s.note}</small></li>)}</ul></div>

    <section className="sources-block" data-testid="pro-model-comparison"><h2>EFG Weather Pro <span className="status-pill pending">Próximamente</span></h2>
      <p>Comparar ECMWF, GFS y otros modelos internacionales: ver diferencias y nivel de acuerdo para una misma localidad, variable y horario, sin complicar Inicio.</p>
      <details className="radar-source-details"><summary>Cómo queremos hacer la comparación</summary>
        <p>Función todavía no habilitada: no conectamos modelos adicionales ni mostramos un acuerdo calculado. Primero habrá que validar fuentes, derechos, unidades, horarios y calidad. El acuerdo entre modelos no garantiza acierto.</p>
        <p>No promediaremos imágenes ni ecos de radar. Tampoco supondremos que una media simple de pronósticos es más precisa: cualquier indicador combinado requerirá ponderación, validación y una explicación de sus límites.</p>
        <p>El pronóstico actual no se reemplazará sin evaluación. Sin pagos, suscripciones ni desbloqueos activados.</p>
      </details>
    </section>

    <div className="sources-block"><h2><Smartphone size={17} /> Llevala en tu pantalla de inicio</h2>
      {installed ? <p>Ya la estás usando instalada.</p> : <>
        <p><b>iPhone (Safari):</b> tocá Compartir y elegí “Agregar a pantalla de inicio”.<br /><b>Android (Chrome):</b> menú de tres puntos, “Instalar app” o “Agregar a pantalla principal”.</p>
        {canInstall && <button className="primary-btn" onClick={() => void install()} data-testid="button-install-pwa"><Download size={15} /> Instalar EFG Weather</button>}
      </>}
      {msg && <p className="hint-line" role="status">{msg}</p>}
      <p className="hint-line">{import.meta.env.PROD ? "Después de una primera carga online, se conserva la estructura de la app para abrirla sin conexión." : "Esta vista de desarrollo no activa caché offline para evitar versiones viejas; el modo offline de la estructura está preparado para la compilación de producción."} El clima y la comunidad necesitan internet. Nunca guardamos el pronóstico para mostrarlo como actual.</p>
    </div>

    <div className="sources-block"><h2>Fuentes oficiales de Argentina</h2><p>Para alertas y avisos meteorológicos, consultá siempre los canales oficiales.</p>
      <a href="https://www.smn.gob.ar/alertas" target="_blank" rel="noreferrer">SMN · Alertas <ExternalLink size={15} /></a>
      <p>Si escuchás truenos, buscá refugio inmediatamente; no esperes la app.</p></div>
    <div className="sources-block"><h2>Trenes Argentinos</h2><p>Estado en directo pendiente de una fuente autorizada. No consultamos ni deducimos demoras o suspensiones.</p><a href="https://www.argentina.gob.ar/transporte/trenes-argentinos" target="_blank" rel="noreferrer">Consultar Trenes Argentinos y sus canales oficiales <ExternalLink size={15} /></a></div>
    <div className="sources-block"><h2>Sobre los datos</h2><p>Open-Meteo integra modelos meteorológicos públicos; pueden diferir de lo observado. No mostramos radar ni detecciones de rayos o granizo. Las sugerencias de fragancias son editoriales e independientes del sponsor.</p>
      <p role="note"><b>Licencia comercial pendiente:</b> la API gratuita Open-Meteo es para evaluación no comercial. La presencia de publicidad requiere regularizar el uso comercial antes del lanzamiento; no se contrató un plan ni se declara resuelta esta autorización.</p>
      <a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">Documentación de Open-Meteo <ExternalLink size={15} /></a>
      <a href="https://open-meteo.com/en/terms" target="_blank" rel="noreferrer">Términos de uso no comercial <ExternalLink size={15} /></a>
      <p>Localidad GPS: Georef oficial para jurisdicción y © OpenStreetMap contributors (ODbL) para nombre aproximado. Consultas solo por acción y permiso separado; máximo global de una por segundo a Nominatim, caché 10 minutos, sin dirección ni historial. No disponible como servicio de búsqueda o uso masivo.</p>
      <a href="https://www.argentina.gob.ar/georef" target="_blank" rel="noreferrer">Georef · documentación <ExternalLink size={15} /></a>
      <a href="https://operations.osmfoundation.org/policies/nominatim/" target="_blank" rel="noreferrer">Condiciones de Nominatim <ExternalLink size={15} /></a>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap <ExternalLink size={15} /></a></div>

    <div className="settings-panel"><div className="settings-title"><Settings2 size={18} /><h2>Preferencias</h2></div>
      <div className="setting-line"><span>Ubicación: {locationMode === "auto" ? "automática con permiso" : "elección manual"}</span><button className="setting-toggle" onClick={onUseCurrentLocation} data-testid="button-settings-location">Usar mi ubicación</button></div>
      <div className="setting-line"><span>Elegir sin GPS</span><button className="setting-toggle" onClick={onChooseCity}>Buscar ciudad</button></div>
      <div className="setting-line"><span>Apariencia ({theme === "dark" ? "oscura" : "clara"})</span><button className="setting-toggle" onClick={onToggleTheme} data-testid="button-settings-theme"><Moon size={15} /> Cambiar tema</button></div>
      <div className="setting-line"><span>Notificaciones</span><span className="status-pill pending">No disponibles</span></div>
      <div className="setting-line"><span>Datos de este dispositivo</span><button className="setting-toggle" onClick={clearLocal} data-testid="button-clear-local"><Trash2 size={15} /> Borrar</button></div>
      <p>Lugares, campos y preferencias se guardan solo en este dispositivo.</p></div>
  </section>;
}
