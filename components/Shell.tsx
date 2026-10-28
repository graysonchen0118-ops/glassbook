"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Landmark, LogOut, Menu, ReceiptText, ShieldCheck, Ticket, Vault, Wallet, X } from "lucide-react";
import { useStore, ME } from "@/lib/store";
import { view, type View } from "@/lib/bus";
import { money, short } from "@/lib/format";
import { Toasts } from "./ui";
import { ConnectModal } from "./Wallet";

const Backdrop = dynamic(() => import("./three/Backdrop"), {
  ssr: false,
  loading: () => <div className="backdrop-ph" aria-hidden="true" />,
});

const NAV: { href: string; label: string; v: View; icon: React.ReactNode }[] = [
  { href: "/", label: "Book", v: "book", icon: <Ticket size={17} /> },
  { href: "/bets", label: "My bets", v: "bets", icon: <ReceiptText size={17} /> },
  { href: "/results", label: "Results", v: "results", icon: <ShieldCheck size={17} /> },
  { href: "/house", label: "House", v: "house", icon: <Landmark size={17} /> },
];

function WalletChip() {
  const { wallet, disconnect, ready } = useStore();
  const [open, setOpen] = useState(false);
  if (!wallet.address)
    return (
      <>
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)} disabled={!ready}>
          <Wallet size={16} /> Connect wallet
        </button>
        <ConnectModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  return (
    <div className="wallet-chip">
      <span className="wallet-bal">
        <b key={wallet.usdt} className="tick">{money(wallet.usdt, 2)}</b> USDT
      </span>
      <span className="wallet-addr" title={ME}>{short(wallet.address)}</span>
      <button className="icon-btn" onClick={disconnect} aria-label="Disconnect wallet" title="Disconnect">
        <LogOut size={16} />
      </button>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { bets, wallet } = useStore();
  const [open, setOpen] = useState(false);

  const current = useMemo<View>(() => {
    if (path.startsWith("/bets")) return "bets";
    if (path.startsWith("/results")) return "results";
    if (path.startsWith("/house")) return "house";
    return "book";
  }, [path]);

  useEffect(() => {
    document.documentElement.dataset.view = current;
    view(current);
    setOpen(false);
    window.scrollTo({ top: 0 });
  }, [current, path]);

  useEffect(() => {
    const on = () => document.documentElement.style.setProperty("--scroll", String(Math.round(window.scrollY)));
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const claimable = wallet.address ? bets.filter((b) => b.wallet === ME && b.status === "won").length : 0;

  const links = NAV.map((n) => (
    <Link key={n.href} href={n.href} className={current === n.v ? "active" : ""} aria-current={current === n.v ? "page" : undefined}>
      {n.icon}
      <span>{n.label}</span>
      {n.v === "bets" && claimable > 0 && <em className="nav-n">{claimable}</em>}
    </Link>
  ));

  return (
    <div className="app">
      <Backdrop />
      <header className="topnav">
        <button className="icon-btn only-mobile" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <Link href="/" className="brand" aria-label="Glassbook home">
          <span className="brand-mark">
            <Vault size={18} strokeWidth={2.3} />
          </span>
          <span>Glassbook</span>
        </Link>
        <nav className="nav" aria-label="Main">
          {links}
        </nav>
        <div className="top-right">
          <span className="net-chip" title="Test funds only">
            <span className="live-dot" /> Testnet
          </span>
          <WalletChip />
        </div>
      </header>

      <div className={`scrim ${open ? "show" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`mnav ${open ? "open" : ""}`} aria-label="Menu" aria-hidden={!open}>
        <div className="brand">
          <span className="brand-mark">
            <Vault size={18} strokeWidth={2.3} />
          </span>
          <span>Glassbook</span>
          <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        {links}
        <span className="net-chip">
          <span className="live-dot" /> Testnet, test funds only
        </span>
      </aside>

      <main className="content">{children}</main>
      <footer className="foot">
        <span>
          <strong>Glassbook</strong>, the sportsbook that keeps its cash box in glass
        </span>
        <nav aria-label="Footer">
          <Link href="/">Book</Link>
          <Link href="/results">How results settle</Link>
          <Link href="/house">House</Link>
        </nav>
        <span>18+ only. Bet what you can afford to lose. © 2026 Glassbook. Photos from Unsplash.</span>
      </footer>
      <Toasts />
    </div>
  );
}
