import { useEffect, useRef, useState } from "react";
import type { Location, Weather } from "../lib/weather";
import { refreshDue, staleWeather } from "../lib/weather-freshness";

/** Visible only. One request per 20 minutes, including failed automatic attempts. */
export function useWeatherRefresh(location: Location, weather: Weather | null, loading: boolean, load: (p: Location, background?: boolean) => Promise<void>) {
  const current = useRef({ location, weather, loading });
  current.current = { location, weather, loading };
  const lastAttempt = useRef(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const check = () => {
      const time = Date.now();
      setNow(time);
      const state = current.current;
      if (document.visibilityState !== "visible" || navigator.onLine === false || state.loading) return;
      if (refreshDue(state.weather?.fetchedAt, lastAttempt.current, time)) {
        lastAttempt.current = time;
        void load(state.location, true);
      }
    };
    const timer = window.setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("pageshow", check);
    window.addEventListener("online", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("online", check);
    };
  }, [load]);
  return { now, stale: staleWeather(weather?.fetchedAt, weather?.current.time, now) };
}
