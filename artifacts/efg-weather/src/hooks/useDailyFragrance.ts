import { useEffect, useMemo, useRef } from "react";
import type { Fragrance, Profile, Setting } from "../lib/extras";
import type { Weather } from "../lib/weather";
import { pickFragrances, recordDailyChoice, ROTATION_STORAGE, validDailyChoices, type DailyChoice } from "../lib/fragrance-rotation";

function readChoices() {
  try {
    const raw = localStorage.getItem(ROTATION_STORAGE);
    return raw && raw.length < 40000 ? validDailyChoices(JSON.parse(raw)) : [];
  } catch { return []; }
}
export function useDailyFragrance(catalog: Fragrance[], weather: Weather | null, profile: Profile, setting: Setting, day: string, latitude: number, placement?: "interior" | "exterior", slot: "day" | "night-out" = "day") {
  const memory = useRef<DailyChoice[]>([]);
  // Calendar day, not weather refresh, invalidates the memo at midnight.
  const picked = useMemo(() => weather && catalog.length ? pickFragrances(catalog, weather, profile, setting,
    { latitude, placement, slot, records: [...memory.current, ...readChoices()] }) : null,
  [catalog, weather, profile, setting, day, latitude, placement, slot]);
  const key = picked?.key, date = picked?.day, id = picked?.top?.id;
  useEffect(() => {
    if (!key || !date || !id) return;
    const next = recordDailyChoice([...memory.current, ...readChoices()], { key, day: date, id });
    memory.current = next;
    try {
      const encoded = JSON.stringify(next);
      if (localStorage.getItem(ROTATION_STORAGE) !== encoded) localStorage.setItem(ROTATION_STORAGE, encoded);
    } catch { /* Pure calendar rotation and in-memory stability still work without storage. */ }
  }, [key, date, id]);
  return picked;
}
