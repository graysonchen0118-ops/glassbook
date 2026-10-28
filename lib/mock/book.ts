// The whole book, built from the moment the page opens, so kickoffs and dispute windows
// really run out while someone is looking at them. Seeded, so every visit tells the same story.
import { address, DAY, hex, HOUR, MIN, pick, SEC, seeded } from "../rand";
import type { Bet, Dispute, Ev, LogLine, Market, MarketKind, Result, Selection, Sport } from "../types";
import { BASKETBALL, FIGHT, FOOTBALL, HOCKEY, TENNIS, venueOf } from "./teams";

export const ME = "0x7a3f91c0d2e44b18a96f0e5b2c7d83a1f4e9c21e";
export const KEYS = {
  feed: "0x51c8d2a07f3e9b46c11d58a2e09b7c3f6d4a019e",
  feed2: "0x0e4b9a7c2d61f83a5b90c4e7d12f6a8b3c5e7d22",
  server: "0x9b02f6c48e1a7d35b2c90e6f4a18d73c5b2e44d1",
  house: "0xd4e71b9c03a6f82e5d47b1c09e3a6f2d8b5c0a3b",
};
export const DISPUTE_WINDOW = 30 * MIN;
export const BANKROLL = 180_000;

const r = seeded(20261028);

function price(ps: number[], margin = 1.065) {
  return ps.map((p) => Math.max(1.03, Math.round((1 / (p * margin)) * 100) / 100));
}

const between = (a: number, b: number) => a + r() * (b - a);

function marketsFor(ev: Ev, now: number): Market[] {
  const mk = (kind: MarketKind, name: string, sel: [string, string, number][], ceiling: number): Market => ({
    id: `${ev.id}-${kind}`,
    eventId: ev.id,
    kind,
    name,
    selections: sel.map(([k, label, o]) => ({ id: `${ev.id}-${kind}-${k}`, label, odds: o })),
    ceiling,
    paused: false,
    draft: false,
    createdAt: now - between(2, 9) * DAY,
  });
  const out: Market[] = [];
  if (ev.sport === "football") {
    const ph = between(0.26, 0.58);
    const pd = between(0.22, 0.3);
    const pa = Math.max(0.12, 1 - ph - pd);
    const [oh, od, oa] = price([ph, pd, pa]);
    out.push(mk("1x2", "Match result", [["h", ev.home, oh], ["d", "Draw", od], ["a", ev.away, oa]], 5000));
    const po = between(0.44, 0.6);
    const [oo, ou] = price([po, 1 - po]);
    out.push(mk("ou", "Total goals 2.5", [["o", "Over 2.5", oo], ["u", "Under 2.5", ou]], 2500));
    const py = between(0.44, 0.6);
    const [oy, on] = price([py, 1 - py]);
    out.push(mk("btts", "Both teams score", [["y", "Yes", oy], ["n", "No", on]], 2500));
  } else if (ev.sport === "basketball") {
    const ph = between(0.35, 0.65);
    const [oh, oa] = price([ph, 1 - ph]);
    out.push(mk("ml", "Moneyline", [["h", ev.home, oh], ["a", ev.away, oa]], 5000));
    const line = Math.round(between(205, 228)) + 0.5;
    out.push(mk("total", `Total points ${line}`, [["o", `Over ${line}`, 1.88], ["u", `Under ${line}`, 1.88]], 2500));
  } else if (ev.sport === "tennis") {
    const ph = between(0.3, 0.7);
    const [oh, oa] = price([ph, 1 - ph]);
    out.push(mk("winner", "Match winner", [["h", ev.home, oh], ["a", ev.away, oa]], 4000));
    const line = pick(r, [21.5, 22.5, 23.5]);
    out.push(mk("games", `Total games ${line}`, [["o", `Over ${line}`, 1.86], ["u", `Under ${line}`, 1.9]], 2000));
  } else if (ev.sport === "hockey") {
    const ph = between(0.4, 0.6);
    const [oh, oa] = price([ph, 1 - ph]);
    out.push(mk("ml", "Moneyline, overtime included", [["h", ev.home, oh], ["a", ev.away, oa]], 4000));
    out.push(mk("total", "Total goals 5.5", [["o", "Over 5.5", 1.95], ["u", "Under 5.5", 1.82]], 2000));
  } else {
    const ph = between(0.3, 0.7);
    const [oh, oa] = price([ph, 1 - ph]);
    out.push(mk("winner", "Fight winner", [["h", ev.home, oh], ["a", ev.away, oa]], 4000));
    const py = between(0.35, 0.55);
    const [oy, on] = price([py, 1 - py]);
    out.push(mk("distance", "Goes the distance", [["y", "Yes", oy], ["n", "No", on]], 2000));
  }
  return out;
}

/** which selection wins each market, read from the final score */
export function outcomeOf(ev: Ev, markets: Market[], score: string): Record<string, string> {
  const o: Record<string, string> = {};
  const ms = markets.filter((m) => m.eventId === ev.id);
  const nums = (score.match(/\d+/g) ?? []).map(Number);
  for (const m of ms) {
    const id = (k: string) => `${m.id}-${k}`;
    if (ev.sport === "football") {
      const [h, a] = nums;
      if (m.kind === "1x2") o[m.id] = id(h > a ? "h" : h === a ? "d" : "a");
      if (m.kind === "ou") o[m.id] = id(h + a > 2.5 ? "o" : "u");
      if (m.kind === "btts") o[m.id] = id(h > 0 && a > 0 ? "y" : "n");
    } else if (ev.sport === "basketball" || ev.sport === "hockey") {
      const [h, a] = nums;
      if (m.kind === "ml") o[m.id] = id(h > a ? "h" : "a");
      if (m.kind === "total") {
        const line = Number(m.name.match(/[\d.]+$/)?.[0] ?? 0);
        o[m.id] = id(h + a > line ? "o" : "u");
      }
    } else if (ev.sport === "tennis") {
      let sh = 0;
      let sa = 0;
      let games = 0;
      for (let i = 0; i + 1 < nums.length; i += 2) {
        games += nums[i] + nums[i + 1];
        if (nums[i] > nums[i + 1]) sh++;
        else sa++;
      }
      if (m.kind === "winner") o[m.id] = id(sh > sa ? "h" : "a");
      if (m.kind === "games") {
        const line = Number(m.name.match(/[\d.]+$/)?.[0] ?? 0);
        o[m.id] = id(games > line ? "o" : "u");
      }
    } else {
      const homeWon = score.startsWith(ev.home);
      if (m.kind === "winner") o[m.id] = id(homeWon ? "h" : "a");
      if (m.kind === "distance") o[m.id] = id(/decision/.test(score) ? "y" : "n");
    }
  }
  return o;
}

const PHOTO: Record<Sport, string[]> = {
  football: ["stadium_night_1", "football_action_1", "stadium_night_2", "football_action_2", "fans_1", "stadium_night_3", "football_action_3", "stadium_night_4"],
  basketball: ["basketball_1", "basketball_2"],
  tennis: ["tennis_1", "tennis_2", "tennis_3"],
  hockey: ["ice_hockey_1"],
  fight: ["fight_1", "fight_2"],
};

export interface Book {
  events: Ev[];
  markets: Market[];
  bets: Bet[];
  results: Result[];
  disputes: Dispute[];
  log: LogLine[];
}

let blockNo = 6_918_400;
const tx = () => `0x${hex(r, 64)}`;

export function build(now: number): Book {
  blockNo = 6_918_400;
  const events: Ev[] = [];
  let n = 0;
  const ev = (sport: Sport, league: string, home: string, away: string, startsAt: number, extra: Partial<Ev> = {}): Ev => {
    n++;
    const e: Ev = {
      id: `ev${String(n).padStart(2, "0")}`,
      sport,
      league,
      home,
      away,
      startsAt,
      venue: venueOf(sport, home),
      photo: PHOTO[sport][n % PHOTO[sport].length],
      ...extra,
    };
    events.push(e);
    return e;
  };
  const [pn, cl, al] = FOOTBALL;

  // the next two kickoffs happen while the page is open
  const featured = ev("football", pn.league, "Ashby Town", "Northgate United", now + 2 * MIN + 30 * SEC);
  ev("football", cl.league, "Porto Vale", "Deportivo Brisa", now + 7 * MIN);
  ev("basketball", BASKETBALL.league, "Bayside Breakers", "Ironvale Miners", now + 22 * MIN);
  ev("tennis", TENNIS.league, "L. Marchetti", "D. Okafor", now + 41 * MIN);
  const derby = ev("football", pn.league, "Kingsport Rovers", "Calder City", now + 1 * HOUR + 55 * MIN);

  // the rest of the week
  const pairs: [Sport, string, string, string][] = [
    ["football", pn.league, "Redcliffe Albion", "Westmoor Wanderers"],
    ["football", pn.league, "Millbrook FC", "Harbour Athletic"],
    ["football", pn.league, "Calder City", "Ashby Town"],
    ["football", pn.league, "Northgate United", "Kingsport Rovers"],
    ["football", cl.league, "Atlético Marisol", "Real Costa Azul"],
    ["football", cl.league, "Unión Playa Honda", "Sporting Ribeira"],
    ["football", cl.league, "Deportivo Brisa", "Atlético Marisol"],
    ["football", al.league, "Union Sankt Felden", "Olympique Maresse"],
    ["football", al.league, "FC Bergtal", "Grauberg 04"],
    ["football", al.league, "Inter Lago", "Alpenstadt FC"],
    ["basketball", BASKETBALL.league, "Capital Comets", "Riverport Kings"],
    ["basketball", BASKETBALL.league, "Delta Herons", "Bayside Breakers"],
    ["basketball", BASKETBALL.league, "Ironvale Miners", "Summit Owls"],
    ["tennis", TENNIS.league, "M. Duarte", "A. Petrova"],
    ["tennis", TENNIS.league, "J. Whitcombe", "R. Santoro"],
    ["tennis", TENNIS.league, "K. Haraguchi", "L. Marchetti"],
    ["hockey", HOCKEY.league, "Granite Bay Moose", "Copper Ridge Owls"],
    ["hockey", HOCKEY.league, "Pine Hollow Bears", "Silverton Wolves"],
    ["hockey", HOCKEY.league, "Frostburg Lynx", "Granite Bay Moose"],
    ["fight", FIGHT.league, "T. Kade", "R. Ilunga"],
    ["fight", FIGHT.league, "M. Varga", "D. Achebe"],
    ["fight", FIGHT.league, "J. Moreau", "S. Brandt"],
  ];
  pairs.forEach(([s, l, h, a], i) => {
    const base = now + 2 * HOUR + i * 3.1 * HOUR + Math.round(between(0, 50)) * MIN;
    const rounded = Math.round(base / (15 * MIN)) * 15 * MIN;
    ev(s, l, h, a, rounded);
  });

  // already under way: the contract shut these at kickoff
  const live1 = ev("football", al.league, "Grauberg 04", "Inter Lago", now - 34 * MIN);
  const live2 = ev("hockey", HOCKEY.league, "Northlake Pike", "Frostburg Lynx", now - 18 * MIN);
  ev("tennis", TENNIS.league, "S. Lindqvist", "K. Haraguchi", now - 52 * MIN);
  ev("football", cl.league, "Sporting Ribeira", "Atlético Marisol", now - 71 * MIN);

  // finished, with signed results
  type F = [Sport, string, string, string, string, number];
  const fin: F[] = [
    ["football", pn.league, "Harbour Athletic", "Millbrook FC", "2-1", 6],
    ["basketball", BASKETBALL.league, "Summit Owls", "Delta Herons", "98-104", 14],
    ["football", al.league, "Alpenstadt FC", "FC Bergtal", "1-1", 21],
    ["football", cl.league, "Real Costa Azul", "Unión Playa Honda", "3-0", 9],
    ["football", pn.league, "Westmoor Wanderers", "Northgate United", "0-2", 3 * 60 + 10],
    ["tennis", TENNIS.league, "A. Petrova", "J. Whitcombe", "6-3 4-6 6-2", 5 * 60],
    ["hockey", HOCKEY.league, "Silverton Wolves", "Northlake Pike", "4-3", 22 * 60],
    ["football", cl.league, "Porto Vale", "Sporting Ribeira", "1-0", 26 * 60],
    ["fight", FIGHT.league, "D. Achebe", "J. Moreau", "D. Achebe by decision", 29 * 60],
    ["tennis", TENNIS.league, "R. Santoro", "M. Duarte", "postponed", 46 * 60],
    ["basketball", BASKETBALL.league, "Riverport Kings", "Capital Comets", "117-109", 50 * 60],
    ["football", al.league, "Olympique Maresse", "Union Sankt Felden", "2-2", 70 * 60],
  ];
  const finished = fin.map(([s, l, h, a, score, endedMin]) => {
    const ended = now - endedMin * MIN;
    const dur = s === "football" ? 112 : s === "basketball" ? 140 : s === "tennis" ? 130 : s === "hockey" ? 150 : 60;
    return ev(s, l, h, a, ended - dur * MIN, { endedAt: ended, score: score === "postponed" ? undefined : score, void: score === "postponed" });
  });

  const markets = events.flatMap((e) => marketsFor(e, now));
  // a clear favourite, the kind of price that gets mistyped
  const fav = markets.find((m) => m.id === "ev06-1x2");
  if (fav) [1.5, 4.1, 6.2].forEach((o, i) => (fav.selections[i].odds = o));
  const byEvent = (id: string) => markets.filter((m) => m.eventId === id);

  // results: the four most recent are still inside their dispute window
  const results: Result[] = [];
  const windows = [26, 18, 9, 21];
  finished.forEach((e, i) => {
    if (e.void || !e.score) return;
    const recent = i < 4;
    const signedAt = e.endedAt! + (recent ? 2 * MIN : 3 * MIN);
    const score = e.score;
    // one first message counted a goal that was ruled out afterwards
    const second = e.home === "Real Costa Azul" ? "2-0" : score;
    results.push({
      eventId: e.id,
      score,
      outcome: outcomeOf(e, markets, score),
      signer: KEYS.feed,
      sig: `0x${hex(r, 130)}`,
      signedAt,
      windowEnds: recent ? now + windows[i] * MIN : signedAt + DISPUTE_WINDOW,
      state: recent ? "window" : "final",
      second,
    });
  });

  // bets from other wallets, so every market carries real weight
  const wallets = Array.from({ length: 140 }, () => address(r));
  const bets: Bet[] = [];
  let bn = 0;
  const owed = new Map<string, number>();
  const bet = (m: Market, sel: Selection, wallet: string, stakeIn: number, placedAt: number, status: Bet["status"] = "locked", bot = false): Bet | null => {
    let stake = stakeIn;
    if (status === "locked") {
      const room = Math.floor((m.ceiling - (owed.get(sel.id) ?? 0)) / sel.odds / 5) * 5;
      if (room < 5) return null;
      stake = Math.min(stake, room);
      owed.set(sel.id, (owed.get(sel.id) ?? 0) + stake * sel.odds);
    }
    bn++;
    blockNo += 1 + Math.floor(r() * 3);
    const b: Bet = { id: `b${String(bn).padStart(4, "0")}`, wallet, eventId: m.eventId, marketId: m.id, selectionId: sel.id, odds: sel.odds, stake, placedAt, block: blockNo, tx: tx(), status, bot };
    bets.push(b);
    return b;
  };
  const sorted = [...events].sort((a, b) => a.startsAt - b.startsAt);
  for (const e of sorted) {
    const res = results.find((x) => x.eventId === e.id);
    for (const m of byEvent(e.id)) {
      const count = m.kind === "1x2" || m.kind === "ml" || m.kind === "winner" ? 6 + Math.floor(r() * 9) : 2 + Math.floor(r() * 5);
      for (let i = 0; i < count; i++) {
        const sel = pick(r, m.selections);
        const stake = Math.round(between(10, m.ceiling >= 4000 ? 300 : 140) / 5) * 5;
        const placedAt = Math.min(e.startsAt - 3 * MIN, now - 2 * MIN) - Math.floor(r() * 36 * HOUR);
        let status: Bet["status"] = "locked";
        if (e.void) status = "void";
        else if (res && res.state === "final") status = res.outcome[m.id] === sel.id ? (r() < 0.8 ? "claimed" : "won") : "lost";
        bet(m, sel, pick(r, wallets), stake, placedAt, status);
      }
    }
  }
  // the derby is busy: the home side sits close to its ceiling
  const derbyMain = byEvent(derby.id)[0];
  const home = derbyMain.selections[0];
  while ((owed.get(home.id) ?? 0) < derbyMain.ceiling * 0.84) {
    if (!bet(derbyMain, home, pick(r, wallets), 60 + Math.round(r() * 8) * 5, now - between(1, 30) * HOUR)) break;
  }

  // this wallet's own history
  const sel = (e: Ev, kind: number, k: number) => byEvent(e.id)[kind].selections[k];
  const mkt = (e: Ev, kind: number) => byEvent(e.id)[kind];
  const mine: [Ev, number, number, number, number, Bet["status"]][] = [
    [featured, 0, 0, 40, 25, "locked"],
    [derby, 0, 1, 25, 70, "locked"],
    [events[2], 0, 0, 60, 40, "locked"],
    [events[3], 1, 1, 20, 55, "locked"],
    [live1, 1, 0, 30, 90, "locked"],
    [live2, 0, 1, 20, 50, "locked"],
    [finished[0], 0, 0, 50, 200, "locked"],
    [finished[1], 0, 0, 35, 260, "locked"],
    [finished[3], 1, 1, 45, 230, "locked"],
    [finished[4], 0, 2, 30, 7 * 60, "won"],
    [finished[5], 0, 0, 55, 9 * 60, "won"],
    [finished[6], 0, 0, 20, 27 * 60, "claimed"],
    [finished[7], 1, 1, 40, 30 * 60, "lost"],
    [finished[8], 1, 1, 25, 33 * 60, "lost"],
    [finished[9], 0, 1, 30, 48 * 60, "void"],
    [finished[10], 0, 0, 70, 52 * 60, "claimed"],
    [finished[11], 2, 0, 15, 74 * 60, "won"],
  ];
  for (const [e, k, s, stake, minsAgo, st] of mine) {
    const m = mkt(e, k);
    let status = st;
    // keep the history consistent with the signed result
    const res = results.find((x) => x.eventId === e.id);
    if (res && res.state === "final" && st !== "void") {
      const won = res.outcome[m.id] === sel(e, k, s).id;
      status = won ? (st === "claimed" ? "claimed" : "won") : "lost";
    }
    bet(m, sel(e, k, s), ME, stake, Math.min(now - minsAgo * MIN, e.startsAt - 4 * MIN), status);
  }

  const disputes: Dispute[] = [
    { id: "d01", eventId: finished[7].id, wallet: wallets[3], reason: "Wrong score", note: "Feed showed 1-0 but the stream had a late equaliser.", at: finished[7].endedAt! + 9 * MIN, state: "rejected", answer: "Second source agrees on 1-0. The late goal was offside." },
    { id: "d02", eventId: finished[4].id, wallet: wallets[17], reason: "Result signed too early", note: "Signed before the referee's report was published.", at: finished[4].endedAt! + 6 * MIN, state: "rejected", answer: "Second source agrees on 0-2. Signature time is after the final whistle." },
  ];

  const log: LogLine[] = [];
  let ln = 0;
  const line = (at: number, kind: LogLine["kind"], text: string) => log.push({ id: `l${++ln}`, at, kind, text });
  for (const e of finished.slice(0, 4)) line(e.endedAt! + 2 * MIN, "settle", `Feed signed ${e.home} ${e.score} ${e.away}, dispute window open`);
  line(live1.startsAt, "lock", `Book closed at kickoff: ${live1.home} v ${live1.away}`);
  line(live2.startsAt, "lock", `Book closed at kickoff: ${live2.home} v ${live2.away}`);
  line(now - 47 * MIN, "refused", `Bet refused on ${live1.home} v ${live1.away}: event already started`);
  line(now - 3 * HOUR, "ceiling", `Ceiling raised to 5,000 USDT on ${derby.home} v ${derby.away}, match result`);
  line(now - 5 * HOUR, "odds", `Odds updated on ${derby.home} v ${derby.away}, match result`);
  for (const b of bets.filter((x) => x.placedAt > now - 90 * MIN && x.wallet !== ME).slice(-10)) {
    const m = markets.find((x) => x.id === b.marketId)!;
    const s = m.selections.find((x) => x.id === b.selectionId)!;
    line(b.placedAt, "bet", `${b.stake} USDT on ${s.label} at ${b.odds.toFixed(2)}, block ${b.block.toLocaleString("en-US")}`);
  }
  log.sort((a, b) => b.at - a.at);

  return { events, markets, bets, results, disputes, log };
}

export function newWallet(seed: number) {
  return address(seeded(seed));
}

export function newTx(seed: number) {
  return `0x${hex(seeded(seed), 64)}`;
}

export function newSig(seed: number) {
  return `0x${hex(seeded(seed), 130)}`;
}
