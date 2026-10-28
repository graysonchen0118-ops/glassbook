"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, CircleDollarSign, Clock3, Lock, ReceiptText, Search, Wallet } from "lucide-react";
import { evState, ME, useStore } from "@/lib/store";
import type { Bet } from "@/lib/types";
import { ago, mmss, money, odds as fmtOdds } from "@/lib/format";
import { ConnectModal } from "@/components/Wallet";
import { Empty, Hash, Pager, Skel, Spinner } from "@/components/ui";

type Tab = "all" | "open" | "settling" | "claim" | "settled";
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "settling", label: "Settling" },
  { id: "claim", label: "Ready to claim" },
  { id: "settled", label: "Settled" },
];
const PER = 8;

export default function BetsPage() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"new" | "return">("new");
  const [page, setPage] = useState(1);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const mine = useMemo(() => s.bets.filter((b) => b.wallet === ME), [s.bets]);
  const phase = (b: Bet): Tab => {
    if (b.status === "won") return "claim";
    if (b.status !== "locked") return "settled";
    const r = s.results.find((x) => x.eventId === b.eventId);
    return r ? "settling" : "open";
  };
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: mine.length, open: 0, settling: 0, claim: 0, settled: 0 };
    for (const b of mine) c[phase(b)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, s.results]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return mine
      .filter((b) => tab === "all" || phase(b) === tab)
      .filter((b) => {
        if (!needle) return true;
        const e = s.events.find((v) => v.id === b.eventId);
        return e ? `${e.home} ${e.away} ${e.league}`.toLowerCase().includes(needle) : false;
      })
      .sort((a, b) => (sort === "new" ? b.placedAt - a.placedAt : b.stake * b.odds - a.stake * a.odds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, tab, q, sort, s.events, s.results]);
  useEffect(() => setPage(1), [tab, q, sort]);
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const shown = list.slice((page - 1) * PER, page * PER);

  const openStake = mine.filter((b) => b.status === "locked").reduce((a, b) => a + b.stake, 0);
  const claimable = mine.filter((b) => b.status === "won").reduce((a, b) => a + b.stake * b.odds, 0);

  if (s.ready && !s.wallet.address)
    return (
      <div className="page narrow-page">
        <div className="panel">
          <Empty icon={<Wallet size={22} />} title="Connect your wallet to see your bets" text="Your bets live in the contract under your wallet address. Sign one message and they show up here." action={<button className="btn btn-primary" onClick={() => setAsk(true)}><Wallet size={16} /> Connect wallet</button>} />
        </div>
        <ConnectModal open={ask} onClose={() => setAsk(false)} />
      </div>
    );

  const claimOne = async (id: string) => {
    setBusy(id);
    await s.claim(id);
    setBusy(null);
  };
  const claimAll = async () => {
    setBusy("all");
    await s.claimAll();
    setBusy(null);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">
            <ReceiptText size={15} /> My bets
          </span>
          <h1>Your stakes, straight from the contract</h1>
          <p className="lead small-lead">Open stakes stay locked until the feed signs the result and its dispute window closes. Winnings are then yours to claim, paid by the contract to this wallet.</p>
        </div>
      </header>

      <section className="kpis">
        {[
          { k: "Open stakes", v: `${money(openStake, 2)} USDT`, i: <Lock size={18} /> },
          { k: "Waiting for a final result", v: String(counts.settling), i: <Clock3 size={18} /> },
          { k: "Ready to claim", v: `${money(claimable, 2)} USDT`, i: <CircleDollarSign size={18} />, act: counts.claim > 0 },
          { k: "Settled bets", v: String(counts.settled), i: <BadgeCheck size={18} /> },
        ].map((x, i) => (
          <div key={x.k} className="kpi" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="kpi-ic">{x.i}</span>
            <span className="muted small">{x.k}</span>
            {s.ready ? <b>{x.v}</b> : <Skel h={24} w={110} />}
            {x.act && (
              <button className="btn btn-primary btn-sm" onClick={claimAll} disabled={busy === "all"}>
                {busy === "all" ? <><Spinner /> Claiming</> : "Claim all"}
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>
              {t.label} <span className="tab-n">{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <div className="toolbar">
          <label className="search">
            <Search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your bets" aria-label="Search your bets" />
          </label>
          <select value={sort} onChange={(e) => setSort(e.target.value as "new" | "return")} aria-label="Sort bets">
            <option value="new">Newest first</option>
            <option value="return">Biggest return</option>
          </select>
        </div>
        {!s.ready ? (
          <div className="bet-list">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="bet skel-card">
                <Skel h={18} w="50%" />
                <Skel h={14} w="30%" />
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <Empty icon={<ReceiptText size={22} />} title="No bets here" text={tab === "claim" ? "Nothing waiting to be claimed right now." : "Place a bet from the book and it shows up here the moment it is locked."} action={<Link href="/" className="btn btn-ghost btn-sm">Open the book</Link>} />
        ) : (
          <div className="bet-list">
            {shown.map((b, i) => {
              const e = s.events.find((v) => v.id === b.eventId)!;
              const m = s.markets.find((v) => v.id === b.marketId);
              const sel = m?.selections.find((v) => v.id === b.selectionId);
              const r = s.results.find((x) => x.eventId === b.eventId);
              const ph = phase(b);
              const st = evState(e, s.now);
              const label =
                b.status === "won" ? "Won, ready to claim" : b.status === "claimed" ? "Paid to wallet" : b.status === "lost" ? "Lost" : b.status === "void" ? "Void, stake refunded" : r ? (r.state === "disputed" ? "Result disputed, window frozen" : `Settling, final in ${mmss(r.windowEnds - s.now)}`) : st === "live" ? "In play, locked" : "Locked until kickoff";
              const tone = b.status === "won" || b.status === "claimed" ? "ok" : b.status === "lost" ? "bad" : b.status === "void" ? "muted" : r ? "warn" : "info";
              return (
                <article key={b.id} className="bet" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="bet-main">
                    <span className="muted tiny">
                      {e.league}, {ago(b.placedAt, s.now)}
                    </span>
                    <h3>
                      {sel?.label ?? "Selection"} <span className="odds-tag">{fmtOdds(b.odds)}</span>
                    </h3>
                    <span className="muted small">
                      {m?.name}, {e.home} v {e.away}
                      {r && ` · ${r.score}`}
                    </span>
                  </div>
                  <div className="bet-nums">
                    <span>
                      <span className="muted tiny">Stake</span>
                      <b>{money(b.stake, 2)}</b>
                    </span>
                    <span>
                      <span className="muted tiny">{b.status === "lost" ? "Return" : "Returns"}</span>
                      <b>{b.status === "lost" ? "0.00" : b.status === "void" ? money(b.stake, 2) : money(b.stake * b.odds, 2)}</b>
                    </span>
                  </div>
                  <div className="bet-side">
                    <span className={`pill pill-${tone}`}>{label}</span>
                    <span className="muted tiny">
                      Block {money(b.block)} · <Hash v={b.tx} n={4} />
                    </span>
                    {ph === "claim" && (
                      <button className="btn btn-primary btn-sm" onClick={() => claimOne(b.id)} disabled={busy === b.id}>
                        {busy === b.id ? <><Spinner /> Claiming</> : `Claim ${money(b.stake * b.odds, 2)}`}
                      </button>
                    )}
                    {ph === "settling" && (
                      <Link href="/results" className="btn btn-ghost btn-sm">
                        See the result
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {s.ready && <Pager page={page} pages={pages} onPage={setPage} total={list.length} label="bets" />}
      </section>
    </div>
  );
}
