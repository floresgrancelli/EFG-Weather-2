import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import "./home-widgets.css";

const LOCAL_TZ = "America/Argentina/Buenos_Aires";
const arrival = Date.parse("2026-11-08T16:30:00-03:00");
const departure = Date.parse("2026-11-11T14:00:00-03:00");
type Holiday = { at: string; name: string; reason: string; kind?: string };
/** Fechas nacionales y días no laborables contrastados con BCRA; 2027, solo fechas fijas conocidas. */
const holidays: Holiday[] = [
  {at:"2026-11-23",name:"Día de la Soberanía Nacional",reason:"Recuerda la defensa de la soberanía argentina en la Vuelta de Obligado (1845)."},
  {at:"2026-12-07",name:"Día no laborable con fines turísticos",reason:"Día no laborable turístico; no es un feriado nacional para todos los trabajadores.",kind:"Día no laborable"},
  {at:"2026-12-08",name:"Día de la Inmaculada Concepción de María",reason:"Celebración religiosa y feriado nacional."},
  {at:"2026-12-25",name:"Navidad",reason:"Celebración de Navidad y feriado nacional."},
  {at:"2027-01-01",name:"Año Nuevo",reason:"Primer día del nuevo año."},
  {at:"2027-03-24",name:"Día Nacional de la Memoria por la Verdad y la Justicia",reason:"Conmemoración de las víctimas de la última dictadura."},
  {at:"2027-04-02",name:"Día del Veterano y de los Caídos en la Guerra de Malvinas",reason:"Homenaje a veteranos y caídos en Malvinas."},
  {at:"2027-05-01",name:"Día del Trabajador",reason:"Reconocimiento de los derechos de las personas trabajadoras."},
  {at:"2027-05-25",name:"Día de la Revolución de Mayo",reason:"Conmemora la Revolución de Mayo de 1810."},
  {at:"2027-06-20",name:"Paso a la Inmortalidad del General Manuel Belgrano",reason:"Homenaje al creador de la bandera nacional."},
  {at:"2027-07-09",name:"Día de la Independencia",reason:"Conmemora la declaración de independencia de 1816."},
  {at:"2027-12-08",name:"Día de la Inmaculada Concepción de María",reason:"Feriado nacional de tradición religiosa."},
  {at:"2027-12-25",name:"Navidad",reason:"Feriado nacional por Navidad."},
];
export function nextCelebration(now: number) {
  if (now < arrival) return {target:arrival,title:"Llega el Papa León XIV a la Argentina",detail:"8 de noviembre · 16:30 h · Aeroparque",kind:"Acontecimiento especial",source:"https://press.vatican.va/content/salastampa/es/bollettino/pubblico/2026/09/21/210926d.html",ongoing:false};
  if (now < departure) return {target:departure,title:"Visita del Papa León XIV en curso",detail:"Del 8 al 11 de noviembre · salida prevista el 11 a las 14:00",kind:"Acontecimiento especial",source:"https://press.vatican.va/content/salastampa/es/bollettino/pubblico/2026/09/21/210926d.html",ongoing:true};
  const next=holidays.find(h=>Date.parse(`${h.at}T00:00:00-03:00`)>now);
  return next ? {target:Date.parse(`${next.at}T00:00:00-03:00`),title:next.name,detail:next.reason,kind:next.kind ?? "Próximo feriado",source:"https://www.bcra.gob.ar/consulta-feriados-bancarios-2026/",ongoing:false} : null;
}
function parts(milliseconds: number) {
  const t=Math.max(0,Math.floor(milliseconds/1000));
  return [{label:"DÍAS",value:Math.floor(t/86400)},{label:"HORAS",value:Math.floor(t%86400/3600)},{label:"MIN",value:Math.floor(t%3600/60)},{label:"SEG",value:t%60}];
}
export function EventCountdown() {
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{
    const update=()=>setNow(Date.now()); let interval:number|undefined;
    const visibility=()=>{ if(interval!==undefined)window.clearInterval(interval); interval=undefined;update();if(!document.hidden)interval=window.setInterval(update,1000); };
    visibility();document.addEventListener("visibilitychange",visibility);window.addEventListener("focus",update);
    return ()=>{if(interval!==undefined)window.clearInterval(interval);document.removeEventListener("visibilitychange",visibility);window.removeEventListener("focus",update)};
  },[]);
  const ev=nextCelebration(now);
  if(!ev)return null;
  const readable=new Intl.DateTimeFormat("es-AR",{timeZone:LOCAL_TZ,day:"numeric",month:"long",year:"numeric"}).format(ev.target);
  return <section className="efg-event" aria-label="Cuenta regresiva para acontecimiento o feriado" data-testid="event-countdown">
    <div className="efg-widget-heading"><CalendarClock size={17}/><span>{ev.kind.toUpperCase()}</span></div>
    <h2>{ev.title}</h2><p>{ev.detail}</p>
    <div className="efg-event-time" role="timer" aria-label={`${ev.ongoing ? "Finaliza" : "Faltan"} ${parts(ev.target-now).map(p=>`${p.value} ${p.label.toLowerCase()}`).join(", ")}`}>
      {parts(ev.target-now).map(part=><div key={part.label}><b>{String(part.value).padStart(2,"0")}</b><small>{part.label}</small></div>)}
    </div>
    <div className="efg-widget-foot">{ev.ongoing?"Finaliza":"Comienza"} el {readable} · <a href={ev.source} target="_blank" rel="noreferrer">Fuente oficial</a></div>
  </section>;
}
