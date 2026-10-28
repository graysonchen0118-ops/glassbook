"use client";

import { useEffect } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { photo } from "@/lib/photos";

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.tone === "ok" ? <CheckCircle2 size={18} /> : t.tone === "error" ? <TriangleAlert size={18} /> : <Info size={18} />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

export function Photo({ k, w, h, alt, className, eager }: { k: string; w: number; h: number; alt: string; className?: string; eager?: boolean }) {
  return <img src={photo(k, w, h)} width={w} height={h} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" className={`photo ${className ?? ""}`} />;
}

/** inline skeleton, a span so it is safe inside text */
export function Skel({ h = 14, w = "100%", r = 8 }: { h?: number; w?: number | string; r?: number }) {
  return <span className="skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? "on" : ""}`} onClick={onChange} disabled={disabled}>
      <span />
    </button>
  );
}

export function Modal({ open, title, onClose, children, width = 560, foot }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; width?: number; foot?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-layer" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {foot && <footer className="modal-foot">{foot}</footer>}
      </div>
    </div>
  );
}

export function Drawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  return (
    <>
      <div className={`drawer-scrim ${open ? "show" : ""}`} onClick={onClose} />
      <div className="drawer-clip">
      <aside className={`drawer ${open ? "open" : ""}`} role="dialog" aria-modal="true" aria-label={title} aria-hidden={!open}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="drawer-body">{open && children}</div>
      </aside>
      </div>
    </>
  );
}

export function Empty({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-ic">{icon}</span>
      <strong>{title}</strong>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function Pager({ page, pages, onPage, total, label }: { page: number; pages: number; onPage: (n: number) => void; total: number; label: string }) {
  if (pages <= 1) return <div className="pager muted small">{total.toLocaleString("en-US")} {label}</div>;
  return (
    <div className="pager">
      <span className="muted small">
        Page {page} of {pages}, {total.toLocaleString("en-US")} {label}
      </span>
      <div className="pager-btns">
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function Hash({ v, n = 6 }: { v: string; n?: number }) {
  return (
    <code className="hash" title={v}>
      {v.slice(0, n + 2)}…{v.slice(-4)}
    </code>
  );
}
