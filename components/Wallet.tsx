"use client";

import { useState } from "react";
import { KeyRound, ShieldCheck, Smartphone, Wallet as WalletIc } from "lucide-react";
import { useStore } from "@/lib/store";
import { short } from "@/lib/format";
import { Modal, Spinner } from "./ui";

const KINDS = [
  { id: "browser", name: "Browser wallet", note: "Extension in this browser", icon: <WalletIc size={20} /> },
  { id: "phone", name: "Phone wallet", note: "Scan a code with your phone", icon: <Smartphone size={20} /> },
  { id: "hardware", name: "Hardware wallet", note: "Plugged in over USB", icon: <KeyRound size={20} /> },
];

export function ConnectModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: () => void }) {
  const { connect, connecting } = useStore();
  const [kind, setKind] = useState<string | null>(null);
  const go = async (reject: boolean) => {
    const ok = await connect(reject);
    if (ok) {
      setKind(null);
      onClose();
      onDone?.();
    }
  };
  return (
    <Modal open={open} title={kind ? "Sign to sign in" : "Connect a wallet"} onClose={() => { setKind(null); onClose(); }} width={480}>
      {!kind ? (
        <div className="wallet-list">
          {KINDS.map((k) => (
            <button key={k.id} className="wallet-opt" onClick={() => setKind(k.id)}>
              <span className="wallet-ic">{k.icon}</span>
              <span>
                <strong>{k.name}</strong>
                <small>{k.note}</small>
              </span>
            </button>
          ))}
          <p className="muted small">
            <ShieldCheck size={14} /> You sign one message to prove the wallet is yours. There is no password, so there is nothing on our server to leak.
          </p>
        </div>
      ) : (
        <div className="sign-box">
          <div className="sign-msg">
            <span className="muted small">Message to sign</span>
            <pre>{`Sign in to Glassbook\nWallet: ${short("0x7a3f91c0d2e44b18a96f0e5b2c7d83a1f4e9c21e")}\nNetwork: testnet\nNonce: 8f21c04a`}</pre>
          </div>
          <p className="muted small">Signing costs nothing and moves no funds.</p>
          <div className="row gap">
            <button className="btn btn-ghost" disabled={connecting} onClick={() => go(true)}>
              Reject
            </button>
            <button className="btn btn-primary grow" disabled={connecting} onClick={() => go(false)}>
              {connecting ? <><Spinner /> Waiting for the wallet</> : "Sign message"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
