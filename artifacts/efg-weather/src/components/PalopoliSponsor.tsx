import { ChevronRight, ExternalLink } from "lucide-react";
import "./home-context.css";

const MAPS = "https://www.google.com/maps/search/?api=1&query=Farmacia%20Palopoli%20Av.%20844%20600%20San%20Francisco%20Solano";

export function PalopoliSponsor() {
  return <section className="palopoli-sponsor" aria-label="Publicidad: Farmacia Palopoli" data-testid="card-sponsor-palopoli">
    <span className="palopoli-label">Publicidad</span>
    <div className="palopoli-logo">
      <img src={`${import.meta.env.BASE_URL}branding/farmacia-palopoli.jpg`} alt="Logo de Farmacia Palopoli" width={174} height={200} loading="lazy" />
    </div>
    <h2 className="palopoli-name">Farmacia Palopoli</h2>
    <p className="palopoli-slogan">Encontrá lo que estás necesitando</p>
    <p className="palopoli-address">Av. 844 600 · San Francisco Solano</p>
    <div className="palopoli-actions">
      <a href="https://wa.me/5491126825231" target="_blank" rel="noreferrer" className="palopoli-primary" data-testid="link-sponsor-whatsapp">Escribir por WhatsApp <ExternalLink size={15} /></a>
      <a href={MAPS} target="_blank" rel="noreferrer" className="palopoli-secondary" data-testid="link-sponsor-maps">Cómo llegar <ChevronRight size={15} /></a>
    </div>
  </section>;
}
