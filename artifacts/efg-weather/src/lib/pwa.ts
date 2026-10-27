type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallEvent;
    listeners.forEach(fn => fn());
  });
  window.addEventListener("appinstalled", () => { deferred = null; listeners.forEach(fn => fn()); });
}

export function canPromptInstall() { return deferred !== null; }
export function onInstallChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export async function promptInstall() {
  if (!deferred) return "unavailable";
  const event = deferred; deferred = null;
  await event.prompt();
  const choice = await event.userChoice;
  listeners.forEach(fn => fn());
  return choice.outcome;
}
export function isStandalone() {
  return typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

/** Solo en producción: en desarrollo no se registra para no interferir con Vite HMR. */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => { /* sin SW la app sigue funcionando */ });
  });
}
