import { LocateFixed } from "lucide-react";
import "./location-consent.css";

export function LocationConsent({ onAccept, onLater }: { onAccept: () => void; onLater: () => void }) {
  return <section className="location-consent" aria-label="Permiso para mostrar el clima local" data-testid="location-consent">
    <LocateFixed size={22} aria-hidden="true" />
    <div><strong>El clima, donde estés.</strong><p>Con tu permiso, usamos la ubicación del navegador para consultar tu clima en Open-Meteo. Para identificar la localidad te pediremos otro permiso: Georef y OpenStreetMap reciben solo una zona aproximada. Sin historial ni seguimiento en segundo plano. También podés elegir una ciudad.</p>
      <div className="location-consent-actions"><button onClick={onAccept} data-testid="button-location-accept">Usar mi ubicación</button><button onClick={onLater} data-testid="button-location-later">Por ahora no</button></div>
    </div>
  </section>;
}
