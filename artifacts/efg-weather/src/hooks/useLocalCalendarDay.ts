import { useEffect, useState } from "react";
import { localCalendarDay, nextLocalDayDelay } from "../lib/fragrance-rotation";

/** One local-midnight timer, independent from weather fetching. Restore after sleep/clock changes. */
export function useLocalCalendarDay(timezone: string) {
  const [day, setDay] = useState(() => localCalendarDay(new Date(Date.now()), timezone));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      setDay(localCalendarDay(new Date(now), timezone));
      timer = setTimeout(update, nextLocalDayDelay(now, timezone) + 30);
    };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", update); window.removeEventListener("pageshow", update); };
  }, [timezone]);
  // Timezone changes must not briefly reuse the previous city's calendar.
  return day === localCalendarDay(new Date(Date.now()), timezone) ? day : localCalendarDay(new Date(Date.now()), timezone);
}
