"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Lock, Search, ShieldCheck, Ticket, Timer, Vault } from "lucide-react";
import { evState, liability, ME, useStore } from "@/lib/store";
import type { Sport } from "@/lib/types";
import { money, until } from "@/lib/format";
import { SPORT_LABEL } from "@/lib/mock/teams";
import { EventRow, OddsButton } from "@/components/EventRow";
import { Slip } from "@/components/Slip";
import { Drawer, Empty, Pager, Photo, Skel } from "@/components/ui";
import { board } from "@/lib/bus";

const SPORTS: { id: Sport | "all"; photo: string }[] = [
  { id: "all", photo: "stadium_night_2" },
  { id: "football", photo: "football_action_1" },
  { id: "basketball", photo: "basketball_1" },
  { id: "tennis", photo: "tennis_1" },
  { id: "hockey", photo: "ice_hockey_1" },
  { id: "fight", photo: "fight_1" },
];

const PER = 8;

export default function BookPage() {
  const s = useStore();
  const [sport, setSport] = useState<Sport | "all">("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"kickoff" | "staked">("kickoff");
  const [started, setStarted] = useState(false);
  const [page, setPage] = useState(1);
  const [slipOpen, setSlipOpen] = useState(false);

  const featured = s.events.find((e) => e.id === "ev01");
  const fm = s.markets.find((m) => m.eventId === "ev01");
  const fLocked = featured ? evState(featured, s.now) !== "open" : false;

  useEffect(() => {
    if (!featured) return;
    const st = evState(featured, s.now);
    board({ top: `${featured.home.split(" ")[0].toUpperCase()}  v  ${featured.away.split(" ")[0].toUpperCase()}`, mid: st === "open" ? until(featured.startsAt, s.now).replace("in ", "") : "0 - 0", low: st === "open" ? "BOOK OPEN" : "BOOK CLOSED" });
  }, [featured, s.now]);

  const staked = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of s.bets) if (b.status === "locked") m.set(b.eventId, (m.get(b.eventId) ?? 0) + b.stake);
    return m;
  }, [s.bets]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return s.events
      .filter((e) => !e.endedAt || e.endedAt > s.now)
      .filter((e) => (started ? true : evState(e, s.now) === "open"))
      .filter((e) => sport === "all" || e.sport === sport)
      .filter((e) => !needle || `${e.home} ${e.away} ${e.league}`.toLowerCase().includes(needle))
      .sort((a, b) => (sort === "kickoff" ? a.startsAt - b.startsAt : (staked.get(b.id) ?? 0) - (staked.get(a.id) ?? 0)));
  }, [s.events, s.now, q, sport, sort, started, staked]);

  useEffect(() => setPage(1), [q, sport, sort, started]);
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const shown = list.slice((page - 1) * PER, page * PER);

  const lockedNow = s.bets.filter((b) => b.status === "locked").reduce((a, b) => a + b.stake, 0);
  const signedWeek = s.results.length;
  const openMarkets = s.markets.filter((m) => {
    const e = s.events.find((v) => v.id === m.eventId);
    return e && evState(e, s.now) === "open" && !m.paused;
  }).length;
  const mine = s.wallet.address ? s.bets.filter((b) => b.wallet === ME && b.status === "locked").length : 0;

  return (
    <div className="page book">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <Vault size={15} /> Testnet season, test funds only
          </span>
          <h1>Every stake sits where you can see it.</h1>
          <p className="lead">Your stake goes straight into the betting contract. A result only counts once the sports feed signs it, and every result waits through a dispute window before anything is paid.</p>
          <div className="row gap wrap">
            <a href="#book" className="btn btn-primary">
              <Ticket size={17} /> Browse the book
            </a>
            <Link href="/results" className="btn btn-ghost">
              <ShieldCheck size={17} /> How results settle
            </Link>
          </div>
        </div>
        <div className="hero-card">
          {!s.ready || !featured || !fm ? (
            <div className="next-kick">
              <Skel h={14} w={120} />
              <Skel h={28} w="80%" />
              <Skel h={56} />
            </div>
          ) : (
            <div className={`next-kick ${fLocked ? "is-locked" : ""}`}>
              <span className="eyebrow small">
                {fLocked ? <Lock size={14} /> : <Timer size={14} />} {fLocked ? "Kicked off, book closed" : "Next kickoff"}
              </span>
              <h2>
                {featured.home} <i>v</i> {featured.away}
              </h2>
              <div className="count">
                {fLocked ? (
                  <span className="count-locked">
                    <Lock size={18} /> The contract refuses every bet after {new Date(featured.startsAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                ) : (
                  <>
                    <b>{until(featured.startsAt, s.now).replace("in ", "")}</b>
                    <span className="muted small">until the book closes on chain</span>
                  </>
                )}
              </div>
              <div className="odds-row n3">
                {fm.selections.map((_, i) => (
                  <OddsButton key={i} m={fm} i={i} locked={fLocked} />
                ))}
              </div>
              <span className="muted tiny">
                {featured.league}, {featured.venue}. {money(fm.selections.reduce((a, x) => a + liability(s.bets, x.id), 0))} USDT of returns already locked on this market.
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="stats">
        {[
          { k: "Stakes locked in the contract", v: s.ready ? `${money(lockedNow)} USDT` : null },
          { k: "Results signed by the feed", v: s.ready ? String(signedWeek) : null },
          { k: "Dispute window on every result", v: "30 min" },
          { k: "Markets taking bets", v: s.ready ? String(openMarkets) : null },
        ].map((x, i) => (
          <div key={x.k} className="stat" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="muted small">{x.k}</span>
            {x.v ? <b>{x.v}</b> : <Skel h={24} w={90} />}
          </div>
        ))}
      </section>

      <section className="sports" aria-label="Sports">
        {SPORTS.map((x) => (
          <button key={x.id} className={`sport ${sport === x.id ? "on" : ""}`} onClick={() => setSport(x.id)} aria-pressed={sport === x.id}>
            <Photo k={x.photo} w={320} h={200} alt={x.id === "all" ? "Stadium under floodlights" : SPORT_LABEL[x.id]} />
            <span>{x.id === "all" ? "All sports" : SPORT_LABEL[x.id]}</span>
          </button>
        ))}
      </section>

      <section className="book-grid" id="book">
        <div className="book-list">
          <div className="toolbar">
            <label className="search">
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a team, player or league" aria-label="Search events" />
            </label>
            <select value={sort} onChange={(e) => setSort(e.target.value as "kickoff" | "staked")} aria-label="Sort events">
              <option value="kickoff">Kickoff, soonest first</option>
              <option value="staked">Most staked</option>
            </select>
            <label className="check">
              <input type="checkbox" checked={started} onChange={(e) => setStarted(e.target.checked)} /> Show started
            </label>
          </div>
          {!s.ready ? (
            <div className="ev-list">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="ev skel-card">
                  <Skel h={72} w={72} r={14} />
                  <div className="grow">
                    <Skel h={12} w="40%" />
                    <Skel h={20} w="70%" />
                  </div>
                  <Skel h={44} w={180} r={12} />
                </div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <Empty icon={<Search size={22} />} title="Nothing matches" text="Try another team, or show events that have already started." action={<button className="btn btn-ghost btn-sm" onClick={() => { setQ(""); setSport("all"); }}>Clear filters</button>} />
          ) : (
            <div className="ev-list">
              {shown.map((e, i) => (
                <EventRow key={e.id} e={e} delay={i * 45} />
              ))}
            </div>
          )}
          {s.ready && <Pager page={page} pages={pages} onPage={setPage} total={list.length} label="events" />}
        </div>
        <aside className="slip-col">
          <div className="slip-card">
            <header>
              <h3>
                <Ticket size={18} /> Bet slip
              </h3>
              {mine > 0 && (
                <Link href="/bets" className="small">
                  {mine} open <ArrowRight size={13} />
                </Link>
              )}
            </header>
            <Slip />
          </div>
        </aside>
      </section>

      <section className="how">
        <h2>Three rules the contract keeps, whoever runs the site</h2>
        <div className="how-grid">
          {[
            { photo: "phone_watch_1", t: "The book shuts at kickoff", p: "Someone in the stands sees a goal seconds before any feed does. The contract checks the start time itself and refuses every later bet, so nobody buys a score that is already known." },
            { photo: "floodlights_1", t: "Only the feed's signature settles", p: "Our own server cannot report a winner. The result has to carry the sports feed's signature, and the contract checks it before it will pay a single bet." },
            { photo: "fans_2", t: "Thirty minutes to object", p: "Every signed result sits in a dispute window. If a goal is ruled out after the first message, a second source is read and the score is re-signed before a cent moves." },
          ].map((x) => (
            <article key={x.t} className="how-card">
              <Photo k={x.photo} w={640} h={360} alt={x.t} />
              <div>
                <h3>{x.t}</h3>
                <p>{x.p}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <button className="slip-fab only-narrow" onClick={() => setSlipOpen(true)}>
        <Ticket size={18} /> Bet slip {s.slip.length > 0 && <em>{s.slip.length}</em>}
      </button>
      <Drawer open={slipOpen} title="Bet slip" onClose={() => setSlipOpen(false)}>
        <Slip onDone={() => setSlipOpen(false)} />
      </Drawer>
    </div>
  );
}
