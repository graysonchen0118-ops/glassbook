// The page talks to the 3D stadium through window events, so the scene never re-renders React.
export type View = "book" | "bets" | "results" | "house";
export type Pulse =
  | { kind: "stake"; lane: number; big?: boolean }
  | { kind: "refused" }
  | { kind: "lock" }
  | { kind: "sign" }
  | { kind: "final" }
  | { kind: "payout" }
  | { kind: "ceiling"; lane: number }
  | { kind: "pause"; on: boolean }
  | { kind: "fill"; lanes: [number, number, number]; open: boolean };

export function pulse(p: Pulse) {
  if (typeof window === "undefined") return;
  if (p.kind === "fill") {
    (window as unknown as { __gbFill?: number[] }).__gbFill = p.lanes;
    (window as unknown as { __gbOpen?: boolean }).__gbOpen = p.open;
  }
  if (p.kind === "pause") (window as unknown as { __gbPause?: boolean }).__gbPause = p.on;
  window.dispatchEvent(new CustomEvent("gb:pulse", { detail: p }));
}

export function view(v: View) {
  if (typeof window === "undefined") return;
  (window as unknown as { __gbView?: View }).__gbView = v;
  window.dispatchEvent(new CustomEvent("gb:view", { detail: v }));
}

export function currentView(): View {
  if (typeof window === "undefined") return "book";
  return (window as unknown as { __gbView?: View }).__gbView ?? "book";
}

export function currentFill(): number[] {
  if (typeof window === "undefined") return [0, 0, 0];
  return (window as unknown as { __gbFill?: number[] }).__gbFill ?? [0, 0, 0];
}

export function currentPause(): boolean {
  if (typeof window === "undefined") return false;
  return (window as unknown as { __gbPause?: boolean }).__gbPause ?? false;
}

/** the featured match on the scoreboard */
export function board(text: { top: string; mid: string; low: string }) {
  if (typeof window === "undefined") return;
  (window as unknown as { __gbBoard?: typeof text }).__gbBoard = text;
  window.dispatchEvent(new CustomEvent("gb:board", { detail: text }));
}
export function currentBoard() {
  if (typeof window === "undefined") return null;
  return (window as unknown as { __gbBoard?: { top: string; mid: string; low: string } }).__gbBoard ?? null;
}

export function currentOpen(): boolean {
  if (typeof window === "undefined") return true;
  return (window as unknown as { __gbOpen?: boolean }).__gbOpen ?? true;
}
