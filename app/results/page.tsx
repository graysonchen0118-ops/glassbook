"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, CircleAlert, Clock3, FileSignature, Flag, Gavel, KeyRound, Landmark, Search, Server, ShieldCheck, ShieldX } from "lucide-react";
import { KEYS, ME, useStore } from "@/lib/store";
import type { Result } from "@/lib/types";
import { ago, clock, mmss, money, short } from "@/lib/format";
import { SPORT_LABEL } from "@/lib/mock/teams";
import { ConnectModal } from "@/components/Wallet";
import { Drawer, Empty, Hash, Modal, Photo, Skel, Spinner } from "@/components/ui";
import { board } from "@/lib/bus";

type F = "all" | "window" | "disputed" | "final";
const FILTERS: { id: F; label: string }[] = [
  { id: "all", label: "All results" },
  { id: "window", label: "Dispute window open" },
  { id: "disputed", label: "Disputed" },
  { id: "final", label: "Final" },
];
const REASONS = ["Wrong score", "Goal ruled out after the first message", "Result signed too early", "Wrong player or team"];

export default function ResultsPage() {
  const s = useStore();
  const [f, setF] = useState<F>("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [disp, setDisp] = useState<string | null>(null);
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [ask, setAsk] = useState(false);
  const [target, setTarget] = useState("");
  const [trying, setTrying] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const evOf = (r: Result) => s.events.find((e) => e.id === r.eventId)!;
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...s.results]
      .filter((r) => f === "all" || r.state === f)
      .filter((r) => {
        const e = s.events.find((v) => v.id === r.eventId);
        return !needle || (e && `${e.home} ${e.away} ${e.league}`.toLowerCase().includes(needle));
      })
      .sort((a, b) => b.signedAt - a.signedAt);
  }, [s.results, s.events, f, q]);

  const open = s.results.filter((r) => r.state !== "final");
  useEffect(() => {
    if (!target && open.length) setTarget(open[0].eventId);
  }, [open, target]);

  const latest = [...s.results].sort((a, b) => b.signedAt - a.signedAt)[0];
  useEffect(() => {
    if (!latest) return;
    const e = s.events.find((v) => v.id === latest.eventId);
    if (!e) return;
    board({ top: `${e.home.split(" ")[0].toUpperCase()}  v  ${e.away.split(" ")[0].toUpperCase()}`, mid: latest.score.replace("-", " - "), low: latest.state === "final" ? "FINAL" : "SIGNED BY FEED" });
  }, [latest, s.events]);

  const trySettle = async () => {
    setTrying(true);
    setRefusal(null);
    const msg = await s.serverSettle(target);
    setRefusal(msg);
    setTrying(false);
  };

  const sendDispute = async () => {
    if (!disp) return;
    setSending(true);
    await s.dispute(disp, reason, note.trim());
    setSending(false);
    setDisp(null);
    setNote("");
  };

  const openDispute = (eventId: string) => {
    if (!s.wallet.address) {
      setAsk(true);
      return;
    }
    setDisp(eventId);
  };

  const dr = detail ? s.results.find((r) => r.eventId === detail) : undefined;
  const de = dr ? evOf(dr) : undefined;
  const myStake = (eventId: string) => s.bets.filter((b) => b.eventId === eventId && b.wallet === ME && s.wallet.address).length;

  return (
    <div className="page">
      <section className="banner banner-3d">
        <div className="banner-copy">
          <span className="eyebrow">
            <ShieldCheck size={15} /> Results
          </span>
          <h1>A result settles from one signature, never from our server</h1>
          <p className="lead small-lead">The sports feed signs the final score. The contract checks that signature, then holds every payout for thirty minutes so anyone with a stake can object.</p>
        </div>
      </section>

      <section className="keys">
        <h2>Who can settle a bet</h2>
        <div className="key-grid">
          <article className="key key-ok">
            <span className="key-ic"><FileSignature size={20} /></span>
            <h3>Sports data feed</h3>
            <p>Signs the final score. The only key the contract accepts a result from.</p>
            <span className="muted tiny">Key <Hash v={KEYS.feed} /></span>
            <span className="pill pill-ok"><BadgeCheck size={13} /> Can sign results</span>
          </article>
          <article className="key key-no">
            <span className="key-ic"><Server size={20} /></span>
            <h3>Glassbook server</h3>
            <p>Shows the odds and reads the chain. If it were ever stolen, it still could not tell the contract who won.</p>
            <span className="muted tiny">Key <Hash v={KEYS.server} /></span>
            <span className="pill pill-bad"><ShieldX size={13} /> Cannot settle</span>
          </article>
          <article className="key key-warn">
            <span className="key-ic"><Landmark size={20} /></span>
            <h3>House wallet</h3>
            <p>Can pause new bets and set each market&apos;s ceiling. It cannot move a stake or pay anyone.</p>
            <span className="muted tiny">Key <Hash v={KEYS.house} /></span>
            <span className="pill pill-warn"><KeyRound size={13} /> Pause only</span>
          </article>
        </div>
        <div className="try">
          <Photo k="floodlights_2" w={240} h={240} alt="Stadium floodlights glowing through fog" className="try-ph" />
          <div>
            <strong>Try it: ask the contract to settle from the server key</strong>
            <p className="muted small">This is what a stolen server key would attempt. Pick an event that is still settling.</p>
          </div>
          <div className="row gap wrap">
            <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Event to settle" disabled={!s.ready || !open.length}>
              {open.map((r) => {
                const e = evOf(r);
                return (
                  <option key={r.eventId} value={r.eventId}>
                    {e.home} v {e.away}
                  </option>
                );
              })}
            </select>
            <button className="btn btn-danger" onClick={trySettle} disabled={trying || !target}>
              {trying ? <><Spinner /> Sending to the contract</> : <><Server size={16} /> Settle from the server</>}
            </button>
          </div>
          {refusal && (
            <div className="alert alert-error" role="alert">
              <ShieldX size={18} />
              <p>{refusal}</p>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="tabs" role="tablist">
          {FILTERS.map((x) => (
            <button key={x.id} role="tab" aria-selected={f === x.id} className={`tab ${f === x.id ? "on" : ""}`} onClick={() => setF(x.id)}>
              {x.label} <span className="tab-n">{x.id === "all" ? s.results.length : s.results.filter((r) => r.state === x.id).length}</span>
            </button>
          ))}
        </div>
        <div className="toolbar">
          <label className="search">
            <Search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search results" aria-label="Search results" />
          </label>
        </div>
        {!s.ready ? (
          <div className="res-list">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="res skel-card">
                <Skel h={18} w="40%" />
                <Skel h={14} w="60%" />
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <Empty icon={<Gavel size={22} />} title="No results here" text="Nothing in this state right now." />
        ) : (
          <div className="res-list">
            {list.map((r, i) => {
              const e = evOf(r);
              const left = r.windowEnds - s.now;
              const mine = myStake(r.eventId);
              return (
                <article key={r.eventId} className={`res res-${r.state}`} style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="res-main">
                    <span className="muted tiny">
                      {SPORT_LABEL[e.sport]}, {e.league}
                      {mine > 0 && <span className="chip chip-mine">Your stake</span>}
                    </span>
                    <h3>
                      {e.home} <span className="score">{r.score}</span> {e.away}
                      {r.corrected && <span className="pill pill-warn">Corrected</span>}
                    </h3>
                    <span className="muted tiny">
                      Signed by the feed {ago(r.signedAt, s.now)} · <Hash v={r.sig} n={6} />
                    </span>
                  </div>
                  <div className="res-state">
                    {r.state === "window" && (
                      <>
                        <span className="window">
                          <Clock3 size={15} /> <b>{mmss(left)}</b>
                        </span>
                        <span className="muted tiny">left to object</span>
                      </>
                    )}
                    {r.state === "disputed" && (
                      <span className="pill pill-warn">
                        <Spinner size={12} /> Reading a second source
                      </span>
                    )}
                    {r.state === "final" && (
                      <span className="pill pill-ok">
                        <BadgeCheck size={13} /> Final, paid out
                      </span>
                    )}
                  </div>
                  <div className="res-act">
                    {r.state === "window" && (
                      <button className="btn btn-ghost btn-sm" onClick={() => openDispute(r.eventId)}>
                        <Flag size={15} /> Raise a dispute
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setDetail(r.eventId)}>
                      Timeline
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="panel-title">
          <Gavel size={18} /> Recent disputes
        </h2>
        {!s.ready ? (
          <Skel h={60} />
        ) : (
          <div className="disp-list">
            {s.disputes.map((d) => {
              const e = s.events.find((v) => v.id === d.eventId)!;
              return (
                <div key={d.id} className="disp">
                  <span className={`pill pill-${d.state === "upheld" ? "ok" : d.state === "rejected" ? "muted" : "warn"}`}>{d.state === "review" ? "Under review" : d.state === "upheld" ? "Upheld" : "Rejected"}</span>
                  <div>
                    <strong>
                      {e.home} v {e.away}: {d.reason}
                    </strong>
                    {d.note && <p className="muted small">&ldquo;{d.note}&rdquo;</p>}
                    {d.answer && <p className="small">{d.answer}</p>}
                  </div>
                  <span className="muted tiny">
                    {short(d.wallet)}, {ago(d.at, s.now)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Modal
        open={!!disp}
        title="Raise a dispute"
        onClose={() => setDisp(null)}
        foot={
          <>
            <button className="btn btn-ghost" onClick={() => setDisp(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={sendDispute} disabled={sending}>
              {sending ? <><Spinner /> Recording</> : <><Flag size={16} /> Send dispute</>}
            </button>
          </>
        }
      >
        {disp && (() => {
          const r = s.results.find((x) => x.eventId === disp)!;
          const e = s.events.find((v) => v.id === disp)!;
          return (
            <div className="form">
              <p>
                <strong>
                  {e.home} {r.score} {e.away}
                </strong>
                <br />
                <span className="muted small">The window freezes while a second, independent source is read. Nothing is paid until it is settled.</span>
              </p>
              <label>
                <span>What is wrong</span>
                <select value={reason} onChange={(ev) => setReason(ev.target.value)}>
                  {REASONS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Note, optional</span>
                <textarea rows={3} value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="For example: the third goal was ruled out for offside" />
              </label>
            </div>
          );
        })()}
      </Modal>

      <Drawer open={!!detail} title="Result timeline" onClose={() => setDetail(null)}>
        {dr && de && (
          <div className="timeline">
            <h3>
              {de.home} {dr.score} {de.away}
            </h3>
            <ol>
              <li className="done">
                <span>Final whistle</span>
                <small>{clock(de.endedAt!)}, {de.venue}</small>
              </li>
              <li className="done">
                <span>Feed signed {dr.score}</span>
                <small>
                  {clock(dr.signedAt)} by <Hash v={dr.signer} />
                </small>
              </li>
              <li className={dr.state === "window" ? "now" : dr.state === "disputed" ? "now warn" : "done"}>
                <span>{dr.state === "disputed" ? "Dispute open, window frozen" : "Dispute window, 30 minutes"}</span>
                <small>{dr.state === "window" ? `${mmss(dr.windowEnds - s.now)} left` : dr.state === "disputed" ? "Second source being read" : `Closed at ${clock(dr.windowEnds)}`}</small>
              </li>
              <li className={dr.state === "final" ? "done" : ""}>
                <span>Final, payouts released</span>
                <small>{dr.state === "final" ? `${s.bets.filter((b) => b.eventId === dr.eventId && (b.status === "won" || b.status === "claimed")).length} winning bets can be claimed` : "Waits for the window"}</small>
              </li>
            </ol>
            <div className="muted small">
              <CircleAlert size={14} /> Locked on this event: {money(s.bets.filter((b) => b.eventId === dr.eventId).reduce((a, b) => a + b.stake, 0))} USDT across {s.bets.filter((b) => b.eventId === dr.eventId).length} bets.
            </div>
            {s.disputes.filter((d) => d.eventId === dr.eventId).map((d) => (
              <div key={d.id} className="disp">
                <span className={`pill pill-${d.state === "upheld" ? "ok" : d.state === "rejected" ? "muted" : "warn"}`}>{d.state === "review" ? "Under review" : d.state === "upheld" ? "Upheld" : "Rejected"}</span>
                <div>
                  <strong>{d.reason}</strong>
                  {d.answer && <p className="small">{d.answer}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
      <ConnectModal open={ask} onClose={() => setAsk(false)} />
    </div>
  );
}
