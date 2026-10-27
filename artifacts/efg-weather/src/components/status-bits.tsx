import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), intervalMs); return () => window.clearInterval(id); }, [intervalMs]);
  return now;
}

export function minutesAgo(iso: string | number, now: number) {
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return "momento desconocido";
  const m = Math.max(0, Math.floor((now - t) / 60000));
  if (m < 1) return "hace menos de 1 min";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return `hace ${h} h ${m % 60} min`;
}

export function UpdatedAgo({ fetchedAt }: { fetchedAt: string }) {
  const now = useNow(30000);
  return <span data-testid="text-fetched-age">Consultado {minutesAgo(fetchedAt, now)} · refresco cada 20 min mientras la app está visible y al volver si corresponde</span>;
}

export function OfflineBanner() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (online) return null;
  return <div className="offline-banner" role="status" data-testid="status-offline"><WifiOff size={16} /><span><b>Sin conexión.</b> Lo que ves puede estar desactualizado y no representa el tiempo de ahora.</span></div>;
}
