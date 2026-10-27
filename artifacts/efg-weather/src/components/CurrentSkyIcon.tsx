import { currentSky } from "../lib/current-sky";
import "./home-context.css";

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function Sun({ cx = 32, cy = 32, r = 9 }: { cx?: number; cy?: number; r?: number }) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return <line key={i} x1={cx + Math.cos(a) * (r + 5)} y1={cy + Math.sin(a) * (r + 5)} x2={cx + Math.cos(a) * (r + 9)} y2={cy + Math.sin(a) * (r + 9)} />;
  });
  return <g className="sky-sun" {...S}><circle cx={cx} cy={cy} r={r + 2.5} opacity=".28" strokeWidth={1} /><circle cx={cx} cy={cy} r={r} fill="currentColor" fillOpacity=".22" />{rays}</g>;
}
function Moon({ dx = 0, dy = 0 }: { dx?: number; dy?: number }) {
  return <g className="sky-moon" transform={`translate(${dx} ${dy})`} {...S}><path d="M38 18a14 14 0 1 0 9 22 11 11 0 0 1-9-22z" fill="currentColor" fillOpacity=".2" /><circle cx="46" cy="18" r=".9" fill="currentColor" /><circle cx="50" cy="27" r=".7" fill="currentColor" /></g>;
}
function Cloud({ dark = false }: { dark?: boolean }) {
  return <path className={dark ? "sky-cloud sky-cloud--dark" : "sky-cloud"} {...S} fill="currentColor" fillOpacity={dark ? 0.3 : 0.16} d="M20 46h26a9 9 0 0 0 0-18 13 13 0 0 0-25-2 10 10 0 0 0-1 20z" />;
}

export function CurrentSkyIcon({ code, isDay }: { code: number | null; isDay: number | null }) {
  const { kind, phase, label } = currentSky(code, isDay);
  const phaseLabel = phase === "day" ? ", de día" : phase === "night" ? ", de noche" : "";
  let art;
  switch (kind) {
    case "clear":
      art = phase === "day" ? <Sun r={11} /> : phase === "night" ? <Moon /> : <g {...S}><circle cx="32" cy="32" r="12" fill="currentColor" fillOpacity=".15" /><circle cx="32" cy="32" r="18" opacity=".3" strokeWidth={1} /></g>;
      break;
    case "partly-cloudy":
      art = <>{phase === "day" ? <Sun cx={24} cy={22} r={7} /> : phase === "night" ? <Moon dx={-10} dy={-6} /> : null}<g transform="translate(4 4)"><Cloud /></g></>;
      break;
    case "cloudy":
      art = <><g transform="translate(-6 -8) scale(.85)" opacity=".55"><Cloud /></g><g transform="translate(2 2)"><Cloud /></g></>;
      break;
    case "fog":
      art = <><g transform="translate(0 -6)"><Cloud /></g><g {...S} className="sky-fog"><line x1="14" y1="48" x2="44" y2="48" /><line x1="22" y1="54" x2="52" y2="54" /></g></>;
      break;
    case "drizzle":
      art = <><g transform="translate(0 -8)"><Cloud /></g><g {...S} className="sky-drops" strokeWidth={1.6}>{[22, 31, 40].map((x) => <line key={x} x1={x} y1="46" x2={x - 1} y2="49" />)}{[26, 35].map((x) => <line key={x} x1={x} y1="53" x2={x - 1} y2="56" />)}</g></>;
      break;
    case "rain":
      art = <><g transform="translate(0 -8)"><Cloud /></g><g {...S} className="sky-drops">{[22, 30, 38, 46].map((x) => <line key={x} x1={x} y1="45" x2={x - 3} y2="55" />)}</g></>;
      break;
    case "thunderstorm":
      art = <><g transform="translate(0 -9)"><Cloud dark /></g><path className="sky-bolt" d="M34 39l-6 10h6l-4 9 10-12h-6l4-7z" fill="currentColor" stroke="currentColor" strokeWidth={1} strokeLinejoin="round" /><g {...S} className="sky-drops" strokeWidth={1.8}><line x1="21" y1="44" x2="19" y2="51" /><line x1="45" y1="44" x2="43" y2="51" /></g></>;
      break;
    case "snow":
      art = <><g transform="translate(0 -8)"><Cloud /></g><g className="sky-snow" {...S} strokeWidth={1.5}>{[[21, 49], [33, 54], [45, 48]].map(([x, y]) => <g key={`${x}${y}`}><line x1={x - 3} y1={y} x2={x + 3} y2={y} /><line x1={x - 1.5} y1={y - 2.6} x2={x + 1.5} y2={y + 2.6} /><line x1={x - 1.5} y1={y + 2.6} x2={x + 1.5} y2={y - 2.6} /></g>)}</g></>;
      break;
    default:
      art = <g {...S} opacity=".75"><circle cx="32" cy="32" r="15" strokeDasharray="3 4" /><line x1="26" y1="32" x2="38" y2="32" /></g>;
  }
  return <div className="current-sky-icon" data-testid="current-sky-icon" data-condition={kind} data-phase={phase} role="img" aria-label={kind === "unknown" ? label : `Cielo actual según Open-Meteo: ${label}${phaseLabel}`}>
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">{art}</svg>
  </div>;
}
