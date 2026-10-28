"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Ban, CirclePause, CirclePlay, Gauge, Landmark, Lock, Pencil, Plus, Search, ShieldAlert, Trash2 } from "lucide-react";
import { evState, liability, marketFull, marketOwe, useStore } from "@/lib/store";
import type { LogKind, Market } from "@/lib/types";
import { ago, money, odds as fmtOdds, until } from "@/lib/format";
import { BANKROLL } from "@/lib/mock/book";
import { Empty, Modal, Pager, Skel, Spinner, Switch } from "@/components/ui";

type F = "all" | "open" | "near" | "paused" | "started";
const FILTERS: { id: F; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Taking bets" },
  { id: "near", label: "Near ceiling" },
  { id: "paused", label: "Paused" },
  { id: "started", label: "Started" },
];
const PER = 10;

interface Draft {
  id?: string;
  eventId: string;
  kind: Market["kind"];
  name: string;
  labels: string[];
  odds: string[];
  ceiling: string;
}

const LOG_LABEL: Record<LogKind, string> = { bet: "Bet", refused: "Refused", pause: "Paused", resume: "Resumed", odds: "Odds", ceiling: "Ceiling", settle: "Result", dispute: "Dispute", market: "Market", claim: "Payout", lock: "Kickoff" };

export default function HousePage() {
  const s = useStore();
  const [f, setF] = useState<F>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"owed" | "kickoff" | "new">("owed");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [logF, setLogF] = useState<"all" | LogKind>("all");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return s.markets
      .map((m) => {
        const e = s.events.find((v) => v.id === m.eventId)!;
        const st = evState(e, s.now);
        const owe = marketOwe(m, s.bets);
        const full = marketFull(m, s.bets);
        return { m, e, st, owe, full, ratio: full ? 1 : owe / m.ceiling };
      })
      .filter((r) => r.st !== "finished")
      .filter((r) => (f === "all" ? true : f === "open" ? r.st === "open" && !r.m.paused : f === "near" ? r.ratio >= 0.8 : f === "paused" ? r.m.paused : r.st === "live"))
      .filter((r) => !needle || `${r.e.home} ${r.e.away} ${r.m.name} ${r.e.league}`.toLowerCase().includes(needle))
      .sort((a, b) => (sort === "owed" ? b.ratio - a.ratio : sort === "kickoff" ? a.e.startsAt - b.e.startsAt : b.m.createdAt - a.m.createdAt));
  }, [s.markets, s.events, s.bets, s.now, f, q, sort]);
  useEffect(() => setPage(1), [f, q, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const shown = rows.slice((page - 1) * PER, page * PER);

  const locked = s.bets.filter((b) => b.status === "locked").reduce((a, b) => a + b.stake, 0);
  const worst = rows.reduce((a, r) => (r.owe > a.owe ? r : a), { owe: 0 } as { owe: number; m?: Market });
  const near = s.markets.filter((m) => {
    const e = s.events.find((v) => v.id === m.eventId);
    return e && evState(e, s.now) !== "finished" && marketOwe(m, s.bets) / m.ceiling >= 0.8;
  }).length;
  const paused = s.markets.filter((m) => m.paused).length;

  const openEvents = s.events.filter((e) => evState(e, s.now) === "open").sort((a, b) => a.startsAt - b.startsAt);

  const edit = (m: Market) => {
    setErr(null);
    s.setFocus(m.id);
    setDraft({ id: m.id, eventId: m.eventId, kind: m.kind, name: m.name, labels: m.selections.map((x) => x.label), odds: m.selections.map((x) => fmtOdds(x.odds)), ceiling: String(m.ceiling) });
  };
  const create = () => {
    setErr(null);
    const e = openEvents[0];
    setDraft({ eventId: e?.id ?? "", kind: "1x2", name: "First half result", labels: [e?.home ?? "Home", "Draw", e?.away ?? "Away"], odds: ["2.90", "2.10", "3.60"], ceiling: "1500" });
  };
  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setErr(null);
    const res = await s.saveMarket({ id: draft.id, eventId: draft.eventId, kind: draft.labels.length === 3 ? "1x2" : "winner", name: draft.name.trim() || "New market", selections: draft.labels.map((l, i) => ({ label: l.trim() || `Option ${i + 1}`, odds: Number(draft.odds[i]) })), ceiling: Number(draft.ceiling) });
    setSaving(false);
    if (res) setErr(res);
    else {
      s.toast("ok", draft.id ? "Market updated on chain." : "Market opened on chain.");
      setDraft(null);
    }
  };
  const toggle = async (m: Market) => {
    setBusy(m.id);
    await s.setPaused(m.id, !m.paused);
    setBusy(null);
  };
  const del = async (m: Market) => {
    setBusy(`del-${m.id}`);
    const res = await s.removeMarket(m.id);
    setBusy(null);
    s.toast(res ? "error" : "ok", res ?? "Market removed.");
  };
  const [gp, setGp] = useState(false);
  const global = async () => {
    setGp(true);
    await s.setGlobalPause(!s.globalPause);
    setGp(false);
  };

  const logs = s.log.filter((l) => logF === "all" || l.kind === logF).slice(0, 14);
  const rush = s.rush ? s.markets.find((m) => m.id === s.rush!.marketId) : null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="eyebrow">
            <Landmark size={15} /> House
          </span>
          <h1>What the house owes, market by market</h1>
          <p className="lead small-lead">Every market carries a ceiling: the most the contract will ever owe on one outcome. A mistyped price can only cost up to that line, however fast the bots are.</p>
        </div>
        <button className="btn btn-primary" onClick={create} disabled={!s.ready}>
          <Plus size={17} /> New market
        </button>
      </header>

      <section className="kpis">
        {[
          { k: "Stakes locked now", v: `${money(locked)} USDT`, i: <Lock size={18} /> },
          { k: "House bankroll in the contract", v: `${money(BANKROLL)} USDT`, i: <Landmark size={18} /> },
          { k: "Markets at 80% of ceiling or more", v: String(near), i: <Gauge size={18} /> },
          { k: "Markets paused", v: String(paused), i: <CirclePause size={18} /> },
        ].map((x, i) => (
          <div key={x.k} className="kpi" style={{ animationDelay: `${i * 60}ms` }}>
            <span className="kpi-ic">{x.i}</span>
            <span className="muted small">{x.k}</span>
            {s.ready ? <b>{x.v}</b> : <Skel h={24} w={110} />}
          </div>
        ))}
      </section>

      <section className={`gpause ${s.globalPause ? "on" : ""}`}>
        <span className="key-ic">
          <ShieldAlert size={20} />
        </span>
        <div className="grow">
          <strong>{s.globalPause ? "Every market is paused" : "Pause every market"}</strong>
          <p className="muted small">The house wallet can stop new bets in one move. Stakes already locked stay locked and still settle from the feed.</p>
        </div>
        {gp ? <Spinner /> : <Switch on={s.globalPause} onChange={global} label="Pause every market" disabled={!s.ready} />}
      </section>

      {rush && (
        <div className="alert alert-warn rush" role="status">
          <AlertTriangle size={18} />
          <p>
            Bots are piling into <b>{rush.selections.find((x) => x.id === s.rush!.selectionId)?.label}</b> at {fmtOdds(rush.selections.find((x) => x.id === s.rush!.selectionId)?.odds ?? 0)}. Owed {money(liability(s.bets, s.rush!.selectionId))} of {money(rush.ceiling)} USDT.
          </p>
          <button className="btn btn-ghost btn-sm" onClick={() => toggle(rush)} disabled={busy === rush.id}>
            <CirclePause size={15} /> Pause it
          </button>
        </div>
      )}

      <div className="house-grid">
        <section className="panel">
          <div className="tabs" role="tablist">
            {FILTERS.map((x) => (
              <button key={x.id} role="tab" aria-selected={f === x.id} className={`tab ${f === x.id ? "on" : ""}`} onClick={() => setF(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
          <div className="toolbar">
            <label className="search">
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search markets" aria-label="Search markets" />
            </label>
            <select value={sort} onChange={(e) => setSort(e.target.value as "owed" | "kickoff" | "new")} aria-label="Sort markets">
              <option value="owed">Closest to ceiling</option>
              <option value="kickoff">Kickoff, soonest</option>
              <option value="new">Newest market</option>
            </select>
          </div>
          {!s.ready ? (
            <div className="mk-list">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="mk skel-card">
                  <Skel h={16} w="45%" />
                  <Skel h={8} />
                </div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <Empty icon={<Search size={22} />} title="No markets here" text="Nothing matches this filter right now." />
          ) : (
            <div className="mk-list">
              {shown.map(({ m, e, st, owe, ratio, full }, i) => (
                <article key={m.id} className={`mk ${s.focus === m.id ? "focus" : ""} ${m.paused ? "is-paused" : ""}`} style={{ animationDelay: `${i * 35}ms` }} onPointerEnter={() => s.setFocus(m.id)}>
                  <div className="mk-head">
                    <div>
                      <strong>
                        {e.home} v {e.away}
                      </strong>
                      <span className="muted tiny">
                        {m.name} · {st === "open" ? until(e.startsAt, s.now) : "started, book closed"}
                      </span>
                    </div>
                    <div className="mk-prices">
                      {m.selections.map((x) => (
                        <span key={x.id} className={`odds-tag ${s.rush?.selectionId === x.id ? "hot" : ""}`} title={x.label}>
                          {fmtOdds(x.odds)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="owe">
                    <div className="bar" aria-label={`Owed ${money(owe)} of ${money(m.ceiling)} USDT`}>
                      <span style={{ width: `${Math.min(100, ratio * 100)}%` }} className={full ? "full" : ratio >= 0.8 ? "near" : ""} />
                    </div>
                    <span className="small">
                      <b>{money(owe)}</b> <span className="muted">of {money(m.ceiling)} USDT</span>
                    </span>
                  </div>
                  <div className="mk-act">
                    {m.paused && <span className="pill pill-warn">Paused</span>}
                    {st !== "open" && <span className="pill pill-muted"><Lock size={12} /> Closed</span>}
                    <button className="btn btn-ghost btn-sm" onClick={() => edit(m)} disabled={st !== "open"} aria-label={`Edit ${m.name} on ${e.home} v ${e.away}`}>
                      <Pencil size={14} /> Edit
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggle(m)} disabled={busy === m.id || st !== "open"}>
                      {busy === m.id ? <Spinner size={13} /> : m.paused ? <CirclePlay size={14} /> : <CirclePause size={14} />} {m.paused ? "Resume" : "Pause"}
                    </button>
                    <button className="icon-btn" onClick={() => del(m)} disabled={busy === `del-${m.id}`} aria-label={`Delete ${m.name} on ${e.home} v ${e.away}`}>
                      {busy === `del-${m.id}` ? <Spinner size={13} /> : <Trash2 size={15} />}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {s.ready && <Pager page={page} pages={pages} onPage={setPage} total={rows.length} label="markets" />}
        </section>

        <aside className="panel log-panel">
          <h2 className="panel-title">
            <Activity size={18} /> On chain, live
          </h2>
          <select value={logF} onChange={(e) => setLogF(e.target.value as "all" | LogKind)} aria-label="Filter activity">
            <option value="all">Everything</option>
            <option value="bet">Bets</option>
            <option value="refused">Refused</option>
            <option value="settle">Results</option>
            <option value="lock">Kickoffs</option>
            <option value="odds">Odds and ceilings</option>
          </select>
          <ol className="log">
            {!s.ready
              ? Array.from({ length: 6 }, (_, i) => (
                  <li key={i}>
                    <Skel h={12} />
                  </li>
                ))
              : logs.map((l) => (
                  <li key={l.id} className={`log-${l.kind}`}>
                    <span className="log-k">{l.kind === "refused" ? <Ban size={12} /> : null}{LOG_LABEL[l.kind]}</span>
                    <span className="log-t">{l.text}</span>
                    <span className="muted tiny">{ago(l.at, s.now)}</span>
                  </li>
                ))}
          </ol>
          {worst.m && (
            <p className="muted tiny">
              Most owed right now: {money(worst.owe)} USDT on one outcome, against a ceiling of {money(worst.m.ceiling)}.
            </p>
          )}
        </aside>
      </div>

      <Modal
        open={!!draft}
        title={draft?.id ? "Edit market" : "New market"}
        onClose={() => setDraft(null)}
        foot={
          <>
            <button className="btn btn-ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <><Spinner /> Writing to the contract</> : draft?.id ? "Save changes" : "Open market"}
            </button>
          </>
        }
      >
        {draft && (
          <div className="form">
            {!draft.id && (
              <label>
                <span>Event</span>
                <select value={draft.eventId} onChange={(e) => { const ev = s.events.find((v) => v.id === e.target.value); setDraft({ ...draft, eventId: e.target.value, labels: draft.labels.length === 3 ? [ev?.home ?? "", "Draw", ev?.away ?? ""] : [ev?.home ?? "", ev?.away ?? ""] }); }}>
                  {openEvents.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.home} v {ev.away}, {until(ev.startsAt, s.now)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!draft.id && (
              <div className="row gap wrap">
                <label className="grow">
                  <span>Market name</span>
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </label>
                <label>
                  <span>Outcomes</span>
                  <select value={draft.labels.length} onChange={(e) => { const ev = s.events.find((v) => v.id === draft.eventId); const three = e.target.value === "3"; setDraft({ ...draft, labels: three ? [ev?.home ?? "", "Draw", ev?.away ?? ""] : [ev?.home ?? "", ev?.away ?? ""], odds: three ? ["2.90", "2.10", "3.60"] : ["1.90", "1.90"] }); }}>
                    <option value="3">Three way</option>
                    <option value="2">Two way</option>
                  </select>
                </label>
              </div>
            )}
            {draft.id && <p className="muted small">{draft.name}</p>}
            <div className="sel-grid">
              {draft.labels.map((l, i) => (
                <div key={i} className="sel-row">
                  <input value={l} onChange={(e) => setDraft({ ...draft, labels: draft.labels.map((x, k) => (k === i ? e.target.value : x)) })} aria-label={`Outcome ${i + 1}`} disabled={!!draft.id} />
                  <input className="num" inputMode="decimal" value={draft.odds[i]} onChange={(e) => setDraft({ ...draft, odds: draft.odds.map((x, k) => (k === i ? e.target.value : x)) })} aria-label={`Price for ${l}`} />
                </div>
              ))}
            </div>
            <label>
              <span>Ceiling, the most this market may owe on one outcome</span>
              <span className="input-unit">
                <input inputMode="numeric" value={draft.ceiling} onChange={(e) => setDraft({ ...draft, ceiling: e.target.value })} aria-label="Ceiling in USDT" />
                <em>USDT</em>
              </span>
            </label>
            <p className="muted tiny">Typing 15.00 where you meant 1.50 is exactly the slip the ceiling is there for. Whatever the bots do, this market can never owe more than the number above.</p>
            {err && (
              <div className="alert alert-error" role="alert">
                <AlertTriangle size={16} />
                <p>{err}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
