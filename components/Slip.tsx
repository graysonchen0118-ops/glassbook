"use client";

import { useState } from "react";
import { CircleAlert, Lock, Ticket, Trash2, X } from "lucide-react";
import { room, useStore } from "@/lib/store";
import { money, odds as fmtOdds } from "@/lib/format";
import { ConnectModal } from "./Wallet";
import { Empty, Spinner } from "./ui";

export function Slip({ onDone }: { onDone?: () => void }) {
  const s = useStore();
  const [step, setStep] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [ask, setAsk] = useState(false);

  const lines = s.slip.map((l) => {
    const m = s.markets.find((v) => v.id === l.marketId)!;
    const e = s.events.find((v) => v.id === m?.eventId);
    const sel = m?.selections.find((v) => v.id === l.selectionId);
    return { l, m, e, sel };
  }).filter((x) => x.m && x.e && x.sel);

  const total = lines.reduce((a, x) => a + (Number(x.l.stake) || 0), 0);
  const ret = lines.reduce((a, x) => a + (Number(x.l.stake) || 0) * x.sel!.odds, 0);

  const go = async () => {
    setErrors([]);
    if (!s.wallet.address) {
      setAsk(true);
      return;
    }
    setStep("Checking the slip");
    const r = await s.place((t) => setStep(t));
    setStep(null);
    setErrors(r.errors);
    if (r.ok) {
      s.toast("ok", `${r.ok === 1 ? "Bet" : `${r.ok} bets`} locked in the contract.`);
      if (!r.errors.length) onDone?.();
    }
  };

  if (!lines.length)
    return (
      <div className="slip">
        <Empty icon={<Ticket size={22} />} title="Your slip is empty" text="Tap a price to add it. Each stake goes into the contract the moment you sign." />
      </div>
    );

  return (
    <div className="slip">
      <div className="slip-list">
        {lines.map(({ l, m, e, sel }) => {
          const max = room(m!, sel!.id, s.bets);
          const st = Number(l.stake) || 0;
          return (
            <div key={l.selectionId} className="slip-line">
              <div className="slip-top">
                <div>
                  <strong>{sel!.label}</strong>
                  <span className="muted small">
                    {m!.name}, {e!.home} v {e!.away}
                  </span>
                </div>
                <span className="odds-tag">{fmtOdds(sel!.odds)}</span>
                <button className="icon-btn" aria-label={`Remove ${sel!.label}`} onClick={() => s.removeFromSlip(l.selectionId)}>
                  <X size={16} />
                </button>
              </div>
              <div className="slip-stake">
                <label>
                  <span className="muted small">Stake</span>
                  <span className="input-unit">
                    <input inputMode="decimal" type="number" min={0} step={5} placeholder="0" value={l.stake} onChange={(ev) => s.setStake(l.selectionId, ev.target.value)} aria-label={`Stake on ${sel!.label}`} />
                    <em>USDT</em>
                  </span>
                </label>
                <div className="quick">
                  {[10, 25, 50].map((q) => (
                    <button key={q} className="chip" onClick={() => s.setStake(l.selectionId, String(q))}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
              <div className="slip-meta">
                <span>
                  Returns <b>{money(st * sel!.odds, 2)}</b>
                </span>
                <span className={st > max ? "bad" : "muted"} title="The most this market takes on this side before it reaches its ceiling">
                  Room before ceiling {money(max)} USDT
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="slip-foot">
        {errors.length > 0 && (
          <div className="alert alert-error" role="alert">
            <CircleAlert size={16} />
            <div>
              {errors.map((x) => (
                <p key={x}>{x}</p>
              ))}
            </div>
          </div>
        )}
        <div className="slip-sum">
          <span>Total stake</span>
          <b>{money(total, 2)} USDT</b>
        </div>
        <div className="slip-sum">
          <span>Possible return</span>
          <b className="accent">{money(ret, 2)} USDT</b>
        </div>
        <div className="row gap">
          <button className="btn btn-ghost" onClick={s.clearSlip} disabled={!!step} aria-label="Clear slip">
            <Trash2 size={16} />
          </button>
          <button className="btn btn-primary grow" onClick={go} disabled={!!step || total <= 0}>
            {step ? (
              <>
                <Spinner /> {step}
              </>
            ) : s.wallet.address ? (
              <>
                <Lock size={16} /> Lock {money(total, 2)} USDT in the contract
              </>
            ) : (
              "Connect wallet to place"
            )}
          </button>
        </div>
        <p className="muted tiny">Bets close on chain at kickoff. A locked stake can only leave the contract as a payout or a refund.</p>
      </div>
      <ConnectModal open={ask} onClose={() => setAsk(false)} />
    </div>
  );
}
