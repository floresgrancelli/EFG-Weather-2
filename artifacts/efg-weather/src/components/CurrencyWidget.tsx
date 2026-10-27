import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, ChevronDown, RefreshCw } from "lucide-react";
import "./home-widgets.css";

type Currency = "ARS" | "USD" | "BRL";
type Fx = {asOf:string; fetchedAt:string; source:string; rates:{ARS:number;USD:number;BRL:number};stale?:boolean};
const amountFormat = new Intl.NumberFormat("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2});
function parseAmount(raw:string){ const text=raw.trim().replace(/\s/g,""); if(!text)return NaN;
  const comma=text.lastIndexOf(","), dot=text.lastIndexOf(".");
  // Argentinian input: 1.234,56 / 1.000; also accept 1234.56.
  const normalized=comma>=0
    ? comma>dot ? text.replace(/\./g,"").replace(",", ".") : text.replace(/,/g, "")
    : /^\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, "") : text;
  if(!/^\d+(\.\d+)?$/.test(normalized))return NaN;
  const number=Number(normalized);return number>=0 && Number.isFinite(number) && number<=1e12?number:NaN;
}
function displayAmount(n:number){return Number.isFinite(n)?amountFormat.format(n):"—"}
export function CurrencyWidget(){
  const [rates,setRates]=useState<Fx|null>(null);const [error,setError]=useState("");
  const [expanded,setExpanded]=useState(false),[origin,setOrigin]=useState<Currency>("ARS"),[dest,setDest]=useState<Currency>("USD"),[amount,setAmount]=useState("100000");
  const refresh=useCallback(async()=>{if(document.hidden)return;try{const response=await fetch("/api/market/fx",{cache:"no-store"});if(!response.ok)throw new Error("Sin cotización disponible");const payload=await response.json() as Fx;if(!payload.rates?.USD||!payload.rates?.BRL)throw new Error("Cotización incompleta");setRates(payload);setError("")}catch{setError("No pudimos actualizar las cotizaciones.")}},[]);
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{void refresh()},300000);const visible=()=>{if(!document.hidden)void refresh()};document.addEventListener("visibilitychange",visible);return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",visible)}},[refresh]);
  const input=parseAmount(amount);const result=rates&&Number.isFinite(input)?input*rates.rates[origin]/rates.rates[dest]:NaN;
  return <section className="efg-currency" aria-label="Cotizaciones y conversor" data-testid="currency-widget">
    <div className="efg-currency-head"><div><span className="efg-widget-heading"><ArrowLeftRight size={16}/> MONEDAS · ARS / USD / BRL</span><strong>Cotizaciones de referencia</strong></div><button type="button" className="efg-currency-expand" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded} aria-label={expanded?"Cerrar conversor":"Abrir conversor"}><span>{expanded?"Cerrar":"Convertir"}</span><ChevronDown size={16}/></button></div>
    <div className="efg-currency-prices"><div><span>🇺🇸 Dólar · USD</span><b>{rates?`$ ${displayAmount(rates.rates.USD)}`:"—"} <small>ARS</small></b></div><div><span>🇧🇷 Real · BRL</span><b>{rates?`$ ${displayAmount(rates.rates.BRL)}`:"—"} <small>ARS</small></b></div></div>
    <p className="efg-currency-source">{rates?`BCRA · fecha de cotización ${rates.asOf} · consulta ${new Intl.DateTimeFormat("es-AR",{timeZone:"America/Argentina/Buenos_Aires",hour:"2-digit",minute:"2-digit"}).format(new Date(rates.fetchedAt))} h${rates.stale?" (último dato disponible)":""}. No es precio de compra/venta.`:error||"Consultando fuente oficial…"} <button type="button" onClick={()=>void refresh()} aria-label="Actualizar cotizaciones"><RefreshCw size={13}/></button></p>
    {expanded&&<div className="efg-currency-converter"><div className="efg-convert-controls"><label>Importe<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} aria-label="Importe a convertir" /></label><label>Desde<select value={origin} onChange={e=>setOrigin(e.target.value as Currency)}>{(["ARS","USD","BRL"] as Currency[]).map(c=><option key={c}>{c}</option>)}</select></label><button className="efg-swap" type="button" onClick={()=>{setOrigin(dest);setDest(origin)}} aria-label="Invertir monedas"><ArrowLeftRight size={17}/></button><label>Hacia<select value={dest} onChange={e=>setDest(e.target.value as Currency)}>{(["ARS","USD","BRL"] as Currency[]).map(c=><option key={c}>{c}</option>)}</select></label></div><p className="efg-conversion-result" aria-live="polite">{Number.isFinite(result)?`${displayAmount(result)} ${dest}`:"Cotización o importe no disponible"}</p><p className="efg-conversion-note">Equivalencia orientativa; no incluye comisiones ni spreads. <a href="https://www.bcra.gob.ar/apis-banco-central/" target="_blank" rel="noreferrer">Fuente BCRA</a>.</p></div>}
  </section>
}
