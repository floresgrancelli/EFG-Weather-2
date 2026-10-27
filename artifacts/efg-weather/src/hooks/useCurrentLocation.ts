import { useCallback, useEffect, useRef, useState } from "react";
import type { Location } from "../lib/weather";
import { GPS_REFRESH_MS, loadLocationPreference, persistLocationPreference, savedPlace, validPlace } from "../lib/location-preference";
import type { LocationPreference } from "../lib/location-preference";
import { reverseGeocode } from "@workspace/api-client-react";

type Permission = PermissionState | "unknown" | "unavailable";
export function useCurrentLocation() {
  const [preference, setPreference] = useState<LocationPreference>(() => {
    try { return loadLocationPreference(localStorage); } catch { return loadLocationPreference(); }
  });
  const [location, setLocation] = useState<Location>(preference.lastManual);
  const [permission, setPermission] = useState<Permission>("unknown");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [showConsent, setShowConsent] = useState(false);
  const [fixedAt, setFixedAt] = useState<number | null>(null);
  const pref = useRef(preference), permissionRef = useRef<Permission>("unknown");
  const active = useRef(true), generation = useRef(0), inFlight = useRef(false);
  const reverseRequest = useRef<AbortController | null>(null);
  const lastLabel = useRef<{ key: string; name: string; region: string } | null>(null);
  const labelConsent = useRef(false);
  const watchdog = useRef<number | undefined>(undefined), lastAttempt = useRef(0), hiddenAt = useRef<number | null>(null);
  const commit = useCallback((p: LocationPreference) => { pref.current = p; setPreference(p); }, []);
  const stop = useCallback(() => { window.clearTimeout(watchdog.current); inFlight.current = false; setBusy(false); }, []);
  useEffect(() => { try { persistLocationPreference(localStorage, preference); } catch { /* Still usable without storage. */ } }, [preference]);

  const requestGps = useCallback((explicit = false) => {
    if (!active.current || inFlight.current || (!explicit && pref.current.mode !== "auto") || document.visibilityState === "hidden") return;
    // Separate opt-in: existing GPS approval is NOT permission for new providers.
    const identify = explicit && (labelConsent.current || window.confirm("¿Querés identificar la localidad? Enviaremos una zona aproximada (~100 m), sin tu identidad, a Georef y OpenStreetMap/Nominatim. Caché temporal de 10 minutos, sin historial. Cancelar permite usar GPS solo para el clima."));
    if (identify) labelConsent.current = true;
    if (explicit) commit({ ...pref.current, mode: "auto", prompted: true });
    reverseRequest.current?.abort();
    setShowConsent(false);
    if (!navigator.geolocation || !window.isSecureContext) {
      permissionRef.current = "unavailable"; setPermission("unavailable");
      setNotice("La ubicación no está disponible en este navegador o conexión. Podés seguir con una ciudad elegida.");
      return;
    }
    const id = ++generation.current;
    inFlight.current = true; lastAttempt.current = Date.now(); setBusy(true);
    setNotice("Buscando tu ubicación… Mientras tanto, conservamos la última localidad válida.");
    const fail = (code: number) => {
      if (!active.current || generation.current !== id) return;
      ++generation.current; stop();
      if (code === 1) {
        permissionRef.current = "denied"; setPermission("denied");
        commit({ ...pref.current, prompted: true, approved: false });
        setNotice("No tenemos permiso de ubicación. Podés elegir una ciudad o habilitarlo en los permisos del navegador y reintentar.");
      } else setNotice(code === 3 ? "La ubicación tardó demasiado. Conservamos la última localidad válida; podés reintentar cuando quieras." : "No pudimos obtener la ubicación. Conservamos la última localidad válida; elegí una ciudad o reintentá.");
    };
    watchdog.current = window.setTimeout(() => fail(3), 11000);
    try {
      navigator.geolocation.getCurrentPosition(position => {
        if (!active.current || generation.current !== id || pref.current.mode !== "auto") return;
        stop();
        if (document.visibilityState === "hidden") { ++generation.current; setNotice("Conservamos la última localidad válida. Podés actualizar tu ubicación al volver."); return; }
        const point: Location = { name: "Ubicación actual", region: "Ubicación del dispositivo", latitude: position.coords.latitude, longitude: position.coords.longitude, source: "gps" };
        if (!validPlace(point)) { fail(2); return; }
        const key = `${point.latitude.toFixed(3)},${point.longitude.toFixed(3)}`;
        const previous = lastLabel.current;
        if (previous?.key === key) { point.name = previous.name; point.region = previous.region; }
        permissionRef.current = "granted"; setPermission("granted"); setFixedAt(Date.now());
        commit({ ...pref.current, mode: "auto", prompted: true, approved: true });
        setLocation(point);
        setNotice("Ubicación obtenida. Consultamos el clima de ese punto sin guardar la posición precisa ni su historial.");
        if (identify) {
          const reverse = new AbortController();
          reverseRequest.current = reverse;
          const timeout = window.setTimeout(() => reverse.abort(), 12000);
          setNotice("GPS obtenido. Consultando el nombre de tu zona… El clima ya usa tus coordenadas.");
          void reverseGeocode({ latitude: point.latitude, longitude: point.longitude, consent: true }, { signal: reverse.signal }).then(label => {
            if (reverse.signal.aborted || !active.current || generation.current !== id || pref.current.mode !== "auto") return;
            if (label.level !== "unavailable") {
              lastLabel.current = { key, name: label.name, region: label.region };
              setLocation({ ...point, name: label.name, region: label.region });
              setNotice(`${label.level === "jurisdiction" ? "Jurisdicción confirmada; localidad no disponible" : "Localidad aproximada identificada"} · ${label.source}. Las coordenadas del pronóstico no cambiaron.`);
            } else setNotice("GPS válido. No pudimos confirmar la localidad; mantenemos Ubicación actual sin adivinar.");
          }).catch(() => {
            if (active.current && generation.current === id && pref.current.mode === "auto") setNotice("El clima usa tu GPS. No pudimos identificar la localidad; podés reintentar o elegir una ciudad.");
          }).finally(() => window.clearTimeout(timeout));
        }
      }, e => fail(e.code), { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
    } catch { fail(2); }
  }, [commit, stop]);

  const chooseManual = useCallback((next: Location) => {
    if (!validPlace(next)) return;
    ++generation.current; reverseRequest.current?.abort(); stop(); setShowConsent(false); setNotice(""); setFixedAt(null);
    const manual = savedPlace(next);
    commit({ ...pref.current, mode: "manual", lastManual: manual, prompted: true });
    setLocation(manual);
  }, [commit, stop]);
  const defer = useCallback(() => {
    ++generation.current; reverseRequest.current?.abort(); stop(); setShowConsent(false);
    commit({ ...pref.current, mode: "manual", prompted: true });
    setNotice("Sin problema. Podés elegir una ciudad y activar Ubicación actual cuando quieras.");
  }, [commit, stop]);

  useEffect(() => {
    active.current = true;
    let disposed = false;
    let status: PermissionStatus | undefined;
    const applyPermission = (state: Permission) => {
      if (!active.current || disposed) return;
      const previous = permissionRef.current;
      permissionRef.current = state; setPermission(state);
      if (pref.current.mode !== "auto") return;
      if (state === "granted") { if (previous !== "granted" || !lastAttempt.current) requestGps(); }
      else if (state === "denied") {
        ++generation.current; reverseRequest.current?.abort(); stop(); setShowConsent(false);
        commit({ ...pref.current, prompted: true, approved: false });
        setNotice("La ubicación está desactivada. Seguimos con la última localidad válida; podés elegir otra ciudad.");
      } else if (state === "unknown" && pref.current.approved) requestGps();
      else if (!pref.current.prompted || state === "prompt" && pref.current.approved) setShowConsent(true);
    };
    if (!navigator.geolocation || !window.isSecureContext) {
      permissionRef.current = "unavailable"; setPermission("unavailable");
      if (pref.current.mode === "auto") setNotice("Podés consultar todo el clima sin GPS: elegí una ciudad. La ubicación no está disponible en este navegador o conexión.");
    } else if (navigator.permissions?.query) {
      void navigator.permissions.query({ name: "geolocation" }).then(p => {
        if (!active.current || disposed) return;
        status = p; applyPermission(p.state);
        p.onchange = () => applyPermission(p.state);
      }).catch(() => applyPermission("unknown"));
    } else applyPermission("unknown");
    const resume = () => {
      if (document.visibilityState === "hidden") { hiddenAt.current = Date.now(); return; }
      const now = Date.now();
      if (pref.current.mode === "auto" && (permissionRef.current === "granted" || permissionRef.current === "unknown" && pref.current.approved) &&
        hiddenAt.current !== null && now - hiddenAt.current >= GPS_REFRESH_MS && now - lastAttempt.current >= GPS_REFRESH_MS) requestGps();
      hiddenAt.current = null;
    };
    const pageShow = (event: PageTransitionEvent) => {
      if (event.persisted && Date.now() - lastAttempt.current >= GPS_REFRESH_MS) {
        hiddenAt.current = Date.now() - GPS_REFRESH_MS; resume();
      }
    };
    document.addEventListener("visibilitychange", resume); window.addEventListener("pageshow", pageShow);
    return () => {
      disposed = true; active.current = false; ++generation.current; reverseRequest.current?.abort(); window.clearTimeout(watchdog.current); inFlight.current = false;
      if (status) status.onchange = null;
      document.removeEventListener("visibilitychange", resume); window.removeEventListener("pageshow", pageShow);
    };
  }, [commit, requestGps, stop]);
  return { location, mode: preference.mode, permission, busy, notice, showConsent, fixedAt, chooseManual, defer, useGps: () => requestGps(true) };
}
