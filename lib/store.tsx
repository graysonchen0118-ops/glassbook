"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Bet, Dispute, Ev, LogLine, Market, Result, SlipLine, Toast, Tone } from "./types";
import { build, DISPUTE_WINDOW, KEYS, ME, newSig, newTx, newWallet, outcomeOf } from "./mock/book";
import { pulse } from "./bus";
import { odds as fmtOdds, money } from "./format";
import { MIN, SEC } from "./rand";

export type EvState = "open" | "live" | "finished";

export function evState(e: Ev, now: number): EvState {
  if (e.endedAt && e.endedAt <= now) return "finished";
  if (e.startsAt <= now) return "live";
  return "open";
}

/** what the contract would pay out on one selection if it won, from the bets still locked */
export function liability(bets: Bet[], selectionId: string) {
  let s = 0;
  for (const b of bets) if (b.selectionId === selectionId && b.status === "locked") s += b.stake * b.odds;
  return s;
}

/** the largest stake the contract still accepts on a selection before the market hits its ceiling */
export function room(m: Market, selId: string, bets: Bet[]) {
  const sel = m.selections.find((x) => x.id === selId);
  if (!sel) return 0;
  return Math.max(0, Math.floor((m.ceiling - liability(bets, selId)) / sel.odds));
}

/** true once one outcome cannot take even the smallest stake */
export function marketFull(m: Market, bets: Bet[]) {
  return m.selections.some((s) => room(m, s.id, bets) < 5);
}

export function marketOwe(m: Market, bets: Bet[]) {
  return Math.max(0, ...m.selections.map((s) => liability(bets, s.id)));
}

interface Wallet {
  address: string | null;
  usdt: number;
  eth: number;
}

interface Data {
  ready: boolean;
  now: number;
  events: Ev[];
  markets: Market[];
  bets: Bet[];
  results: Result[];
  disputes: Dispute[];
  log: LogLine[];
  wallet: Wallet;
  slip: SlipLine[];
  globalPause: boolean;
  focus: string;
  rush: { marketId: string; selectionId: string; refused: number } | null;
}

interface Api extends Data {
  toasts: Toast[];
  toast: (tone: Tone, text: string) => void;
  connecting: boolean;
  connect: (reject?: boolean) => Promise<boolean>;
  disconnect: () => void;
  addToSlip: (marketId: string, selectionId: string) => void;
  removeFromSlip: (selectionId: string) => void;
  setStake: (selectionId: string, stake: string) => void;
  clearSlip: () => void;
  place: (onStep: (s: string) => void) => Promise<{ ok: number; errors: string[] }>;
  claim: (betId: string) => Promise<void>;
  claimAll: () => Promise<number>;
  serverSettle: (eventId: string) => Promise<string>;
  dispute: (eventId: string, reason: string, note: string) => Promise<void>;
  saveMarket: (m: { id?: string; eventId: string; kind: Market["kind"]; name: string; selections: { label: string; odds: number }[]; ceiling: number }) => Promise<string | null>;
  setPaused: (marketId: string, paused: boolean) => Promise<void>;
  removeMarket: (marketId: string) => Promise<string | null>;
  setGlobalPause: (on: boolean) => Promise<void>;
  setFocus: (marketId: string) => void;
  evById: (id: string) => Ev | undefined;
  mkById: (id: string) => Market | undefined;
}

const Ctx = createContext<Api | null>(null);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const EMPTY: Data = {
  ready: false,
  now: 0,
  events: [],
  markets: [],
  bets: [],
  results: [],
  disputes: [],
  log: [],
  wallet: { address: null, usdt: 1250, eth: 0.084 },
  slip: [],
  globalPause: false,
  focus: "",
  rush: null,
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [d, setD] = useState<Data>(EMPTY);
  const ref = useRef(d);
  ref.current = d;
  const set = useCallback((fn: (x: Data) => Data) => {
    setD((x) => {
      const n = fn(x);
      ref.current = n;
      return n;
    });
  }, []);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [connecting, setConnecting] = useState(false);
  const seq = useRef(1);
  const seen = useRef<Set<string>>(new Set());

  const toast = useCallback((tone: Tone, text: string) => {
    const id = seq.current++;
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4600);
  }, []);

  const addLog = (x: Data, kind: LogLine["kind"], text: string, at = Date.now()): LogLine[] => [{ id: `l${seq.current++}`, at, kind, text }, ...x.log].slice(0, 400);

  // first load: the book arrives after a short wait, like any API
  useEffect(() => {
    const t0 = Date.now();
    const b = build(t0);
    for (const e of b.events) if (e.startsAt <= t0) seen.current.add(e.id);
    const timer = setTimeout(() => {
      const featured = b.markets.find((m) => m.eventId === "ev01")!;
      set(() => ({ ...EMPTY, ...b, ready: true, now: Date.now(), focus: featured.id }));
    }, 700);
    return () => clearTimeout(timer);
  }, [set]);

  // the clock: kickoffs close the book, dispute windows run out
  useEffect(() => {
    if (!d.ready) return;
    const id = setInterval(() => {
      const now = Date.now();
      const x = ref.current;
      let next: Data = { ...x, now };
      for (const e of x.events) {
        if (e.startsAt <= now && !seen.current.has(e.id)) {
          seen.current.add(e.id);
          next = { ...next, log: addLog(next, "lock", `Book closed at kickoff: ${e.home} v ${e.away}`, e.startsAt) };
          const ids = new Set(next.markets.filter((m) => m.eventId === e.id).map((m) => m.id));
          const dropped = next.slip.filter((l) => ids.has(l.marketId));
          if (dropped.length) {
            next = { ...next, slip: next.slip.filter((l) => !ids.has(l.marketId)) };
            toast("info", `${e.home} v ${e.away} kicked off, so it left your slip. The contract no longer takes bets on it.`);
          }
          if (ids.has(next.focus)) {
            pulse({ kind: "lock" });
            if (!dropped.length) toast("info", `Kickoff. The contract closed the book on ${e.home} v ${e.away}.`);
          }
        }
      }
      let changed = false;
      const results = next.results.map((r) => {
        if (r.state === "window" && r.windowEnds <= now) {
          changed = true;
          return { ...r, state: "final" as const };
        }
        return r;
      });
      if (changed) {
        const finals = results.filter((r, i) => r.state === "final" && next.results[i].state !== "final");
        let bets = next.bets;
        for (const r of finals) {
          bets = bets.map((b) => (b.eventId === r.eventId && b.status === "locked" ? { ...b, status: r.outcome[b.marketId] === b.selectionId ? "won" : "lost" } : b));
          const e = next.events.find((v) => v.id === r.eventId)!;
          next = { ...next, log: addLog(next, "settle", `Window closed with no open dispute: ${e.home} ${r.score} ${e.away} is final, payouts released`) };
          const mine = bets.filter((b) => b.eventId === r.eventId && b.wallet === ME && b.status === "won");
          if (mine.length) toast("ok", `${e.home} v ${e.away} is final. Your winnings are ready to claim.`);
          pulse({ kind: "final" });
        }
        next = { ...next, results, bets };
      }
      set(() => next);
    }, 1000);
    return () => clearInterval(id);
  }, [d.ready, set, toast]);

  // the rest of the world keeps betting
  useEffect(() => {
    if (!d.ready) return;
    let alive = true;
    let n = 0;
    const loop = async () => {
      while (alive) {
        await sleep(6500 + Math.random() * 5000);
        if (!alive) return;
        const x = ref.current;
        if (x.globalPause) continue;
        const open = x.markets.filter((m) => !m.paused && !m.draft && (() => { const e = x.events.find((v) => v.id === m.eventId); return e && evState(e, Date.now()) === "open"; })());
        if (!open.length) continue;
        const preferFocus = Math.random() < 0.35 ? open.find((m) => m.id === x.focus) : undefined;
        const m = preferFocus ?? open[Math.floor(Math.random() * open.length)];
        const si = Math.floor(Math.random() * m.selections.length);
        const s = m.selections[si];
        const stake = Math.min(room(m, s.id, x.bets), 10 + Math.round(Math.random() * 40) * 5);
        if (stake < 5) continue;
        n++;
        const b: Bet = { id: `w${Date.now()}`, wallet: newWallet(Date.now() + n), eventId: m.eventId, marketId: m.id, selectionId: s.id, odds: s.odds, stake, placedAt: Date.now(), block: 6_930_000 + n * 3, tx: newTx(n), status: "locked" };
        set((y) => ({ ...y, bets: [...y.bets, b], log: addLog(y, "bet", `${stake} USDT on ${s.label} at ${fmtOdds(s.odds)}, block ${money(b.block)}`) }));
        pulse({ kind: "stake", lane: laneOf(m, si) });
      }
    };
    loop();
    return () => {
      alive = false;
    };
  }, [d.ready, set]);

  // a mistyped price draws bots in; the ceiling is what stops them
  useEffect(() => {
    if (!d.rush) return;
    const { marketId, selectionId } = d.rush;
    let k = 0;
    const id = setInterval(() => {
      const x = ref.current;
      const m = x.markets.find((v) => v.id === marketId);
      if (!m || !x.rush) return clearInterval(id);
      const si = m.selections.findIndex((s) => s.id === selectionId);
      const s = m.selections[si];
      k++;
      const want = 60 + ((k * 37) % 9) * 20;
      const left = room(m, s.id, x.bets);
      if (m.paused || x.globalPause || left < 5) {
        const refused = x.rush.refused + 1;
        set((y) => ({ ...y, rush: y.rush ? { ...y.rush, refused } : null, log: addLog(y, "refused", `Bot wallet ${newWallet(k).slice(0, 8)} refused: ${m.paused || y.globalPause ? "market paused" : "ceiling reached"} on ${s.label} at ${fmtOdds(s.odds)}`) }));
        pulse({ kind: "refused" });
        if (refused >= 4) {
          clearInterval(id);
          set((y) => ({ ...y, rush: null }));
          toast("ok", m.paused || x.globalPause ? `Paused in time. Nothing more went in on ${s.label}.` : `The ceiling held. ${s.label} at ${fmtOdds(s.odds)} stopped taking bets at ${money(m.ceiling)} USDT owed.`);
        }
        return;
      }
      const stake = Math.min(left, want);
      const b: Bet = { id: `r${Date.now()}${k}`, wallet: newWallet(9000 + k), eventId: m.eventId, marketId: m.id, selectionId: s.id, odds: s.odds, stake, placedAt: Date.now(), block: 6_940_000 + k, tx: newTx(9000 + k), status: "locked", bot: true };
      set((y) => ({ ...y, bets: [...y.bets, b], log: addLog(y, "bet", `Bot wallet ${b.wallet.slice(0, 8)}: ${stake} USDT on ${s.label} at ${fmtOdds(s.odds)}`) }));
      pulse({ kind: "stake", lane: laneOf(m, si), big: true });
    }, 420);
    return () => clearInterval(id);
  }, [d.rush, set, toast]);

  // keep the vault's coin columns in step with the market in focus
  useEffect(() => {
    if (!d.ready) return;
    const m = d.markets.find((v) => v.id === d.focus);
    if (!m) return;
    const lanes: [number, number, number] = [0, 0, 0];
    m.selections.forEach((s, i) => {
      lanes[laneOf(m, i)] = room(m, s.id, d.bets) < 5 ? 1 : Math.min(0.97, liability(d.bets, s.id) / m.ceiling);
    });
    const e = d.events.find((v) => v.id === m.eventId);
    pulse({ kind: "fill", lanes, open: !!e && evState(e, Date.now()) === "open" });
  }, [d.ready, d.focus, d.bets, d.markets, d.events]);

  useEffect(() => {
    pulse({ kind: "pause", on: d.globalPause || !!d.markets.find((m) => m.id === d.focus)?.paused });
  }, [d.globalPause, d.focus, d.markets]);

  const evById = useCallback((id: string) => ref.current.events.find((e) => e.id === id), []);
  const mkById = useCallback((id: string) => ref.current.markets.find((m) => m.id === id), []);

  const connect = useCallback(
    async (reject = false) => {
      setConnecting(true);
      await sleep(1100);
      setConnecting(false);
      if (reject) {
        toast("error", "Signature rejected in the wallet. Nothing was signed and nothing was sent.");
        return false;
      }
      set((x) => ({ ...x, wallet: { ...x.wallet, address: ME } }));
      toast("ok", "Signed in with your wallet. No password was created or stored.");
      return true;
    },
    [set, toast]
  );

  const disconnect = useCallback(() => {
    set((x) => ({ ...x, wallet: { ...x.wallet, address: null } }));
    toast("info", "Wallet disconnected.");
  }, [set, toast]);

  const refuseReason = (x: Data, marketId: string): string | null => {
    const m = x.markets.find((v) => v.id === marketId);
    if (!m) return "This market no longer exists.";
    const e = x.events.find((v) => v.id === m.eventId)!;
    const st = evState(e, Date.now());
    if (st !== "open") {
      const late = Math.max(1, Math.round((Date.now() - e.startsAt) / SEC));
      return late < 3600 ? `Refused by the contract: ${e.home} v ${e.away} kicked off ${late < 60 ? `${late} s` : `${Math.round(late / 60)} min`} ago, so the book is closed.` : `Refused by the contract: ${e.home} v ${e.away} has already started.`;
    }
    if (x.globalPause) return "Betting is paused across the book right now.";
    if (m.paused) return `${m.name} on ${e.home} v ${e.away} is paused.`;
    if (m.draft) return "This market is not open yet.";
    return null;
  };

  const addToSlip = useCallback(
    (marketId: string, selectionId: string) => {
      const x = ref.current;
      const why = refuseReason(x, marketId);
      if (why) {
        toast("error", why);
        pulse({ kind: "refused" });
        set((y) => ({ ...y, log: addLog(y, "refused", why) }));
        return;
      }
      set((y) => {
        const has = y.slip.find((l) => l.selectionId === selectionId);
        if (has) return { ...y, slip: y.slip.filter((l) => l.selectionId !== selectionId) };
        const others = y.slip.filter((l) => l.marketId !== marketId);
        return { ...y, slip: [...others, { marketId, selectionId, stake: "" }], focus: marketId };
      });
    },
    [set, toast]
  );

  const removeFromSlip = useCallback((selectionId: string) => set((x) => ({ ...x, slip: x.slip.filter((l) => l.selectionId !== selectionId) })), [set]);
  const setStake = useCallback((selectionId: string, stake: string) => set((x) => ({ ...x, slip: x.slip.map((l) => (l.selectionId === selectionId ? { ...l, stake } : l)) })), [set]);
  const clearSlip = useCallback(() => set((x) => ({ ...x, slip: [] })), [set]);

  const place = useCallback(
    async (onStep: (s: string) => void) => {
      const errors: string[] = [];
      let x = ref.current;
      const lines = x.slip.filter((l) => Number(l.stake) > 0);
      const total = lines.reduce((s, l) => s + Number(l.stake), 0);
      if (!lines.length) return { ok: 0, errors: ["Add a stake to at least one selection."] };
      if (total > x.wallet.usdt) return { ok: 0, errors: [`Your balance is ${money(x.wallet.usdt, 2)} USDT, the slip needs ${money(total, 2)}.`] };
      for (const l of lines) {
        const m = x.markets.find((v) => v.id === l.marketId)!;
        const s = m.selections.find((v) => v.id === l.selectionId)!;
        const left = room(m, s.id, x.bets);
        if (Number(l.stake) > left) errors.push(`${s.label}: this market can take ${money(left)} USDT more before it hits its ${money(m.ceiling)} USDT ceiling.`);
      }
      if (errors.length) return { ok: 0, errors };
      onStep("Waiting for your signature in the wallet");
      await sleep(1200);
      onStep("Sending the stake to the contract");
      await sleep(1300);
      x = ref.current;
      let ok = 0;
      const placed: Bet[] = [];
      for (const l of lines) {
        const why = refuseReason(x, l.marketId);
        const m = x.markets.find((v) => v.id === l.marketId)!;
        const si = m.selections.findIndex((v) => v.id === l.selectionId);
        const s = m.selections[si];
        if (why) {
          errors.push(why);
          continue;
        }
        ok++;
        const b: Bet = { id: `m${Date.now()}${ok}`, wallet: ME, eventId: m.eventId, marketId: m.id, selectionId: s.id, odds: s.odds, stake: Number(l.stake), placedAt: Date.now(), block: 6_950_000 + Math.floor(Math.random() * 900), tx: newTx(Date.now() + ok), status: "locked" };
        placed.push(b);
        setTimeout(() => pulse({ kind: "stake", lane: laneOf(m, si), big: true }), ok * 260);
      }
      const spent = placed.reduce((s, b) => s + b.stake, 0);
      set((y) => {
        let log = y.log;
        for (const b of placed) {
          const m = y.markets.find((v) => v.id === b.marketId)!;
          const s = m.selections.find((v) => v.id === b.selectionId)!;
          log = [{ id: `l${seq.current++}`, at: Date.now(), kind: "bet" as const, text: `${b.stake} USDT on ${s.label} at ${fmtOdds(b.odds)}, block ${money(b.block)}` }, ...log];
        }
        const keep = y.slip.filter((l) => !placed.find((b) => b.selectionId === l.selectionId) && !lines.find((z) => z.selectionId === l.selectionId));
        return { ...y, bets: [...y.bets, ...placed], wallet: { ...y.wallet, usdt: Math.round((y.wallet.usdt - spent) * 100) / 100, eth: Math.max(0, y.wallet.eth - 0.0004 * placed.length) }, slip: keep, log, focus: placed[0]?.marketId ?? y.focus };
      });
      return { ok, errors };
    },
    [set]
  );

  const claim = useCallback(
    async (betId: string) => {
      await sleep(1100);
      set((x) => {
        const b = x.bets.find((v) => v.id === betId);
        if (!b || b.status !== "won") return x;
        const pay = Math.round(b.stake * b.odds * 100) / 100;
        return { ...x, bets: x.bets.map((v) => (v.id === betId ? { ...v, status: "claimed" } : v)), wallet: { ...x.wallet, usdt: Math.round((x.wallet.usdt + pay) * 100) / 100 }, log: addLog(x, "claim", `Payout of ${money(pay, 2)} USDT released to ${ME.slice(0, 8)}`) };
      });
      pulse({ kind: "payout" });
      toast("ok", "Paid to your wallet by the contract.");
    },
    [set, toast]
  );

  const claimAll = useCallback(async () => {
    const won = ref.current.bets.filter((b) => b.wallet === ME && b.status === "won");
    if (!won.length) return 0;
    await sleep(1400);
    const pay = won.reduce((s, b) => s + b.stake * b.odds, 0);
    set((x) => ({ ...x, bets: x.bets.map((v) => (won.find((w) => w.id === v.id) ? { ...v, status: "claimed" } : v)), wallet: { ...x.wallet, usdt: Math.round((x.wallet.usdt + pay) * 100) / 100 }, log: addLog(x, "claim", `Payout of ${money(pay, 2)} USDT released to ${ME.slice(0, 8)}`) }));
    pulse({ kind: "payout" });
    toast("ok", `${money(pay, 2)} USDT paid to your wallet by the contract.`);
    return pay;
  }, [set, toast]);

  const serverSettle = useCallback(
    async (eventId: string) => {
      await sleep(1300);
      const e = ref.current.events.find((v) => v.id === eventId);
      const msg = `Refused by the contract: ${KEYS.server.slice(0, 8)}…${KEYS.server.slice(-4)} is the site's server key, not a result signer. ${e ? `${e.home} v ${e.away}` : "This event"} only settles from the feed's signature.`;
      set((x) => ({ ...x, log: addLog(x, "refused", msg) }));
      pulse({ kind: "refused" });
      return msg;
    },
    [set]
  );

  const dispute = useCallback(
    async (eventId: string, reason: string, note: string) => {
      const id = `d${Date.now()}`;
      await sleep(900);
      set((x) => ({
        ...x,
        disputes: [{ id, eventId, wallet: x.wallet.address ?? ME, reason, note, at: Date.now(), state: "review" }, ...x.disputes],
        results: x.results.map((r) => (r.eventId === eventId ? { ...r, state: "disputed" } : r)),
        log: addLog(x, "dispute", `Dispute raised on ${x.events.find((v) => v.id === eventId)?.home ?? "event"}: ${reason}. Window frozen while a second source is read.`),
      }));
      toast("info", "Dispute recorded. The window is frozen while a second source is read.");
      // the review: a second, independent source is read
      setTimeout(() => {
        const x = ref.current;
        const r = x.results.find((v) => v.eventId === eventId);
        const e = x.events.find((v) => v.id === eventId);
        if (!r || !e) return;
        if (r.second !== r.score) {
          const outcome = outcomeOf(e, x.markets, r.second);
          set((y) => ({
            ...y,
            disputes: y.disputes.map((v) => (v.id === id ? { ...v, state: "upheld", answer: `Second source reads ${r.second}. The feed re-signed the corrected score.` } : v)),
            results: y.results.map((v) => (v.eventId === eventId ? { ...v, score: r.second, outcome, sig: newSig(Date.now()), signedAt: Date.now(), windowEnds: Date.now() + 2 * MIN, state: "window", corrected: true } : v)),
            events: y.events.map((v) => (v.id === eventId ? { ...v, score: r.second } : v)),
            log: addLog(y, "settle", `Dispute upheld: ${e.home} ${r.second} ${e.away} re-signed by the feed, new window open`),
          }));
          pulse({ kind: "sign" });
          toast("ok", `Dispute upheld. The second source reads ${r.second}, and the feed re-signed it before anything was paid.`);
        } else {
          set((y) => ({
            ...y,
            disputes: y.disputes.map((v) => (v.id === id ? { ...v, state: "rejected", answer: `Second source agrees on ${r.score}. The result stands.` } : v)),
            results: y.results.map((v) => (v.eventId === eventId ? { ...v, state: "window", windowEnds: Math.max(v.windowEnds, Date.now() + 1 * MIN) } : v)),
            log: addLog(y, "dispute", `Dispute rejected on ${e.home} v ${e.away}: second source agrees on ${r.score}`),
          }));
          toast("info", `Dispute rejected. The second source agrees on ${r.score}.`);
        }
      }, 6500);
    },
    [set, toast]
  );

  const saveMarket = useCallback<Api["saveMarket"]>(
    async (m) => {
      await sleep(1000);
      const x = ref.current;
      const e = x.events.find((v) => v.id === m.eventId);
      if (!e) return "Pick an event.";
      if (evState(e, Date.now()) !== "open") return "That event has started. Markets can only change before kickoff.";
      if (m.selections.some((s) => !(s.odds >= 1.01))) return "Every price has to be at least 1.01.";
      if (!(m.ceiling >= 100)) return "Set a ceiling of at least 100 USDT.";
      if (m.id) {
        const old = x.markets.find((v) => v.id === m.id)!;
        let jump: { marketId: string; selectionId: string; refused: number } | null = null;
        const selections = old.selections.map((s, i) => {
          const o = m.selections[i]?.odds ?? s.odds;
          if (o >= s.odds * 3 && !jump) jump = { marketId: old.id, selectionId: s.id, refused: 0 };
          return { ...s, odds: Math.round(o * 100) / 100 };
        });
        set((y) => ({
          ...y,
          markets: y.markets.map((v) => (v.id === m.id ? { ...v, selections, ceiling: m.ceiling, name: m.name || v.name } : v)),
          focus: m.id!,
          log: addLog(y, old.ceiling !== m.ceiling ? "ceiling" : "odds", `${old.ceiling !== m.ceiling ? `Ceiling set to ${money(m.ceiling)} USDT` : "Odds updated"} on ${e.home} v ${e.away}, ${old.name}: ${selections.map((s) => fmtOdds(s.odds)).join(" / ")}`),
          rush: jump ?? y.rush,
        }));
        return null;
      }
      const id = `${e.id}-${m.kind}-${Date.now().toString(36)}`;
      const keys = m.selections.length === 3 ? ["h", "d", "a"] : ["h", "a"];
      const nm: Market = { id, eventId: e.id, kind: m.kind, name: m.name, selections: m.selections.map((s, i) => ({ id: `${id}-${keys[i] ?? i}`, label: s.label, odds: Math.round(s.odds * 100) / 100 })), ceiling: m.ceiling, paused: false, draft: false, createdAt: Date.now() };
      set((y) => ({ ...y, markets: [...y.markets, nm], focus: id, log: addLog(y, "market", `New market: ${nm.name} on ${e.home} v ${e.away}, ceiling ${money(nm.ceiling)} USDT`) }));
      return null;
    },
    [set]
  );

  const setPaused = useCallback(
    async (marketId: string, paused: boolean) => {
      await sleep(700);
      set((x) => {
        const m = x.markets.find((v) => v.id === marketId)!;
        const e = x.events.find((v) => v.id === m.eventId)!;
        return { ...x, markets: x.markets.map((v) => (v.id === marketId ? { ...v, paused } : v)), focus: marketId, log: addLog(x, paused ? "pause" : "resume", `${paused ? "Paused" : "Resumed"}: ${m.name} on ${e.home} v ${e.away}`) };
      });
    },
    [set]
  );

  const removeMarket = useCallback(
    async (marketId: string) => {
      await sleep(800);
      const x = ref.current;
      const open = x.bets.filter((b) => b.marketId === marketId && b.status === "locked").length;
      if (open) return `${open} bets are still locked in this market. Pause it instead, the contract has to pay or refund them first.`;
      set((y) => {
        const m = y.markets.find((v) => v.id === marketId)!;
        const e = y.events.find((v) => v.id === m.eventId)!;
        return { ...y, markets: y.markets.filter((v) => v.id !== marketId), slip: y.slip.filter((l) => l.marketId !== marketId), log: addLog(y, "market", `Removed: ${m.name} on ${e.home} v ${e.away}`) };
      });
      return null;
    },
    [set]
  );

  const setGlobalPause = useCallback(
    async (on: boolean) => {
      await sleep(800);
      set((x) => ({ ...x, globalPause: on, log: addLog(x, on ? "pause" : "resume", on ? "House wallet paused every market" : "House wallet resumed betting") }));
      toast(on ? "info" : "ok", on ? "Every market is paused. Bets already locked stay locked and still settle." : "Betting is open again.");
    },
    [set, toast]
  );

  const setFocus = useCallback((marketId: string) => set((x) => (x.focus === marketId ? x : { ...x, focus: marketId })), [set]);

  const api = useMemo<Api>(
    () => ({ ...d, toasts, toast, connecting, connect, disconnect, addToSlip, removeFromSlip, setStake, clearSlip, place, claim, claimAll, serverSettle, dispute, saveMarket, setPaused, removeMarket, setGlobalPause, setFocus, evById, mkById }),
    [d, toasts, toast, connecting, connect, disconnect, addToSlip, removeFromSlip, setStake, clearSlip, place, claim, claimAll, serverSettle, dispute, saveMarket, setPaused, removeMarket, setGlobalPause, setFocus, evById, mkById]
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** three coin columns in the vault: home, draw, away (two-way markets use the outer two) */
export function laneOf(m: Market, i: number) {
  if (m.selections.length === 3) return i;
  return i === 0 ? 0 : 2;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}

export { ME, KEYS, DISPUTE_WINDOW };
