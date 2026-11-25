import React, { useState } from "react";
import { copyText } from "../lib/util";

/* ------------------------------- icons ---------------------------------- */

const PATHS: Record<string, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.4" />
      <rect x="14" y="3" width="7" height="7" rx="1.4" />
      <rect x="3" y="14" width="7" height="7" rx="1.4" />
      <rect x="14" y="14" width="7" height="7" rx="1.4" />
    </>
  ),
  identity: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </>
  ),
  hair: (
    <>
      <path d="M5 20c0-6 2.4-10 7-10s7 4 7 10" />
      <path d="M8 20c0-4.4 1.2-7 4-7s4 2.6 4 7" />
      <path d="M4 8c1.6-3 4.4-5 8-5s6.4 2 8 5" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8V6a2 2 0 0 1 2-2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M8 12h8" />
    </>
  ),
  rotate: (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </>
  ),
  cube: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="m4 7.5 8 4.5 8-4.5" />
      <path d="M12 12v9" />
    </>
  ),
  voice: (
    <>
      <path d="M3 12h2" />
      <path d="M7 8v8" />
      <path d="M11 5v14" />
      <path d="M15 9v6" />
      <path d="M19 11v2" />
      <path d="M21 12h1" />
    </>
  ),
  mountain: (
    <>
      <path d="m3 19 6-10 4 6 2-3 6 7z" />
      <circle cx="17" cy="6" r="2" />
    </>
  ),
  gallery: (
    <>
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="M7 3h12a2 2 0 0 1 2 2v12" />
    </>
  ),
  export: (
    <>
      <path d="M12 4v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <path d="M4 17h4" />
      <path d="M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  check: <path d="m4 12.5 5 5L20 6" />,
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.6v.8" />
    </>
  ),
  warn: (
    <>
      <path d="M12 4 3 20h18z" />
      <path d="M12 10v5" />
      <path d="M12 17.6v.8" />
    </>
  ),
  document: (
    <>
      <path d="M6 3h8l5 5v13H6z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h7" />
      <path d="M9 17h7" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  waveform: (
    <>
      <path d="M2 12h2l2-5 2 10 2-13 2 16 2-8 2 5 2-2h2" />
    </>
  ),
};

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={className ? undefined : { flex: "none" }}
    >
      {PATHS[name] ?? PATHS.info}
    </svg>
  );
}

/* ------------------------------- primitives ------------------------------ */

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

export function PageHead({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-head fade-in">
      <div className="copy">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="page-title">{title}</h1>
        {description && <div className="page-desc">{description}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  eyebrow,
  subtitle,
  actions,
  children,
  className = "",
  flush = false,
}: {
  title?: React.ReactNode;
  eyebrow?: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={`card ${flush ? "flush" : ""} ${className}`}>
      {(title || actions || eyebrow) && (
        <header className="card-head" style={flush ? { padding: "20px 22px 0" } : undefined}>
          <div className="titles">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            {title && <h2 className="h2">{title}</h2>}
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          {actions && <div className="actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone = "", children }: { tone?: "" | "approved" | "pending" | "rejected" | "master" | "draft"; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Chip({
  tone = "",
  children,
  title,
}: {
  tone?: "" | "gold" | "ok" | "warn" | "danger" | "plum";
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span className={`chip ${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

export function Progress({ value, max = 100, thin = false }: { value: number; max?: number; thin?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`progress ${thin ? "thin" : ""}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Notice({
  tone = "",
  title,
  children,
  icon,
}: {
  tone?: "" | "info" | "warn" | "danger" | "ok";
  title?: string;
  children?: React.ReactNode;
  icon?: string;
}) {
  return (
    <div className={`notice ${tone}`}>
      <Icon name={icon ?? (tone === "danger" ? "warn" : tone === "warn" ? "warn" : tone === "ok" ? "check" : "info")} size={16} />
      <div className="body">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, body, action, icon = "gallery" }: { title: string; body?: React.ReactNode; action?: React.ReactNode; icon?: string }) {
  return (
    <div className="empty">
      <div className="mark">
        <Icon name={icon} size={18} />
      </div>
      <div className="title">{title}</div>
      {body && <div className="small" style={{ maxWidth: 430 }}>{body}</div>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.key}
          role="tab"
          aria-selected={value === item.key}
          className={`tab ${value === item.key ? "active" : ""}`}
          onClick={() => onChange(item.key)}
          type="button"
        >
          {item.label}
          {typeof item.count === "number" && <span style={{ opacity: 0.6, marginLeft: 6 }}>{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2 className="h2">{title}</h2>
          <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={onClose} aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function CopyButton({ text, label = "Copy", className = "btn ghost sm" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const ok = await copyText(text);
        setCopied(ok);
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      <Icon name={copied ? "check" : "document"} size={13} />
      {copied ? "Copied" : label}
    </button>
  );
}

export function Spinner({ light = false }: { light?: boolean }) {
  return <span className={`spinner ${light ? "light" : ""}`} aria-hidden="true" />;
}

export function CompareStage({
  leftSrc,
  rightSrc,
  leftLabel,
  rightLabel,
  split,
}: {
  leftSrc: string | null;
  rightSrc: string | null;
  leftLabel: string;
  rightLabel: string;
  split: number;
}) {
  return (
    <div className="compare-stage">
      {leftSrc ? <img src={leftSrc} alt={leftLabel} /> : <div className="placeholder"><span className="small">No approved reference yet</span></div>}
      {rightSrc ? (
        <>
          <img className="overlay-img" src={rightSrc} alt={rightLabel} style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />
          <div className="divider" style={{ left: `${split}%` }} />
        </>
      ) : (
        <div className="placeholder" style={{ background: "rgba(23,21,15,0.06)" }}>
          <span className="small">Select a candidate to compare</span>
        </div>
      )}
      <span className="tag left">{leftLabel}</span>
      <span className="tag right">{rightLabel}</span>
    </div>
  );
}

export function KV({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="kv">
      {items.map((item) => (
        <React.Fragment key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
