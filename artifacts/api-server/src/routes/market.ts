import { Router } from "express";

const router=Router();
type Quote={ asOf:string; fetchedAt:string; source:string; rates:{ARS:number;USD:number;BRL:number};stale?:boolean };
let cached:Quote|null=null;let lastAttempt=0;let inFlight:Promise<Quote>|null=null;
const sourceUrl="https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones";
async function requestQuote():Promise<Quote>{
  const response=await fetch(sourceUrl,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(9000)});
  if(!response.ok)throw new Error("BCRA no disponible");
  const data=await response.json() as {results?:{fecha?:string;detalle?:Array<{codigoMoneda:string;tipoCotizacion:number}>}};
  const date=data.results?.fecha??"", entries=data.results?.detalle??[];
  const read=(code:string)=>Number(entries.find(x=>x.codigoMoneda===code)?.tipoCotizacion);
  const usd=read("USD"),brl=read("BRL");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(usd)||usd<=0||!Number.isFinite(brl)||brl<=0)throw new Error("Formato BCRA inválido");
  return {asOf:date,fetchedAt:new Date().toISOString(),source:"BCRA estadísticas cambiarias",rates:{ARS:1,USD:usd,BRL:brl}};
}
router.get("/market/fx",async(_req,res)=>{
  // Límite global de una consulta al BCRA por proceso cada cinco minutos.
  const now=Date.now();
  if(cached&&now-lastAttempt<300000){res.set("Cache-Control","public, max-age=60").json(cached);return}
  if(!inFlight){lastAttempt=now;inFlight=requestQuote().then(value=>{cached=value;return value}).finally(()=>{inFlight=null})}
  try{const result=await inFlight;res.set("Cache-Control","public, max-age=60").json(result)}catch{
    if(cached){res.set("Cache-Control","no-store").json({...cached,stale:true});return}
    res.set("Cache-Control","no-store").status(503).json({error:"No hay cotizaciones verificadas disponibles."});
  }
});
export default router;
