"use client";

import { useState } from "react";
import { ChevronDown, Lock, PauseCircle, Timer } from "lucide-react";
import type { Ev, Market } from "@/lib/types";
import { evState, useStore } from "@/lib/store";
import { odds as fmtOdds, until } from "@/lib/format";
import { SPORT_LABEL } from "@/lib/mock/teams";
import { Photo } from "./ui";

export function OddsButton({ m, i, locked }: { m: Market; i: number; locked: boolean }) {
  const s = useStore();
  const sel = m.selections[i];
  const on = s.slip.some((l) => l.selectionId === sel.id);
  return (
    <button className={`odd ${on ? "on" : ""} ${locked ? "locked" : ""} ${m.paused ? "paused" : ""}`} onClick={() => s.addToSlip(m.id, sel.id)} aria-pressed={on} aria-label={`${sel.label} at ${fmtOdds(sel.odds)}`}>
      <span className="odd-l">{m.selections.length === 3 && i === 1 ? "X" : m.kind === "1x2" || m.kind === "ml" || m.kind === "winner" ? (i === 0 ? "1" : "2") : sel.label}</span>
      <b key={sel.odds}>{locked ? <Lock size={13} /> : fmtOdds(sel.odds)}</b>
    </button>
  );
}

export function EventRow({ e, delay = 0 }: { e: Ev; delay?: number }) {
  const s = useStore();
  const [more, setMore] = useState(false);
  const ms = s.markets.filter((m) => m.eventId === e.id && !m.draft);
  const st = evState(e, s.now);
  const locked = st !== "open";
  const main = ms[0];
  const rest = ms.slice(1);
  const soon = !locked && e.startsAt - s.now < 10 * 60_000;
  return (
    <article className={`ev ${locked ? "ev-locked" : ""}`} style={{ animationDelay: `${delay}ms` }} onPointerEnter={() => main && s.setFocus(main.id)}>
      <Photo k={e.photo} w={160} h={160} alt={`${SPORT_LABEL[e.sport]} at ${e.venue}`} className="ev-ph" />
      <div className="ev-main">
        <div className="ev-meta">
          <span>{SPORT_LABEL[e.sport]}</span>
          <span className="dot" />
          <span>{e.league}</span>
          {locked ? (
            <span className="chip chip-lock">
              <Lock size={12} /> Book closed at kickoff
            </span>
          ) : (
            <span className={`chip ${soon ? "chip-soon" : ""}`}>
              <Timer size={12} /> {until(e.startsAt, s.now)}
            </span>
          )}
          {(s.globalPause || main?.paused) && !locked && (
            <span className="chip chip-warn">
              <PauseCircle size={12} /> Paused
            </span>
          )}
        </div>
        <h3 className="ev-title">
          <span>{e.home}</span> <i>v</i> <span>{e.away}</span>
        </h3>
        <span className="muted tiny">{e.venue}</span>
      </div>
      {main && (
        <div className="ev-odds">
          <span className="muted tiny">{main.name}</span>
          <div className={`odds-row n${main.selections.length}`}>
            {main.selections.map((_, i) => (
              <OddsButton key={i} m={main} i={i} locked={locked} />
            ))}
          </div>
        </div>
      )}
      {rest.length > 0 && (
        <button className="ev-more" onClick={() => setMore((v) => !v)} aria-expanded={more}>
          {more ? "Fewer markets" : `${rest.length} more`} <ChevronDown size={14} className={more ? "flip" : ""} />
        </button>
      )}
      {more && (
        <div className="ev-rest">
          {rest.map((m) => (
            <div key={m.id} className="ev-rest-row" onPointerEnter={() => s.setFocus(m.id)}>
              <span>{m.name}</span>
              <div className={`odds-row n${m.selections.length}`}>
                {m.selections.map((_, i) => (
                  <OddsButton key={i} m={m} i={i} locked={locked} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
