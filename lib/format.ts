import { DAY, HOUR, MIN } from "./rand";

export const usdt = (n: number, d = 2) => `${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })} USDT`;
export const money = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const odds = (n: number) => n.toFixed(2);
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const pct = (n: number) => `${Math.round(n * 100)}%`;

export function clock(ms: number) {
  const d = new Date(ms);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function day(ms: number, now: number) {
  const d = new Date(ms);
  const n = new Date(now);
  const same = d.toDateString() === n.toDateString();
  const tmr = new Date(now + DAY).toDateString() === d.toDateString();
  const yst = new Date(now - DAY).toDateString() === d.toDateString();
  if (same) return "Today";
  if (tmr) return "Tomorrow";
  if (yst) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** "in 2m 40s", "in 3h 10m", "Sat 18:30" */
export function until(ms: number, now: number) {
  const left = ms - now;
  if (left <= 0) return "now";
  if (left < HOUR) {
    const m = Math.floor(left / MIN);
    const s = Math.floor((left % MIN) / 1000);
    return m > 0 ? `in ${m}m ${String(s).padStart(2, "0")}s` : `in ${s}s`;
  }
  if (left < 12 * HOUR) {
    const h = Math.floor(left / HOUR);
    const m = Math.floor((left % HOUR) / MIN);
    return `in ${h}h ${m}m`;
  }
  return `${day(ms, now)} ${clock(ms)}`;
}

/** countdown for a dispute window, "18:40" */
export function mmss(ms: number) {
  const left = Math.max(0, ms);
  const m = Math.floor(left / MIN);
  const s = Math.floor((left % MIN) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ago(ms: number, now: number) {
  const d = now - ms;
  if (d < MIN) return "just now";
  if (d < HOUR) return `${Math.floor(d / MIN)} min ago`;
  if (d < DAY) return `${Math.floor(d / HOUR)} h ago`;
  return `${day(ms, now)} ${clock(ms)}`;
}
