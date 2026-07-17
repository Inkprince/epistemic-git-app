import type { KeyboardEvent, ReactNode } from "react";
import { CheckIcon, ExternalLinkIcon } from "./icons.js";

/** Make a clickable non-button element keyboard-operable (Enter/Space) and focusable. */
export const pressable = (fn: () => void) => ({
  role: "button" as const,
  tabIndex: 0,
  onKeyDown: (e: KeyboardEvent) => {
    // Only when the row itself is focused — inner controls (checkboxes, links) keep their own keys.
    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      fn();
    }
  },
});

export type BadgeTone = "green" | "purple" | "amber" | "pink" | "neutral" | "yellow";

export function Badge({ tone, dot, children }: { tone: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`badge ${tone}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function Pill({ tone, children }: { tone: "green" | "pink" | "amber" | "neutral"; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function IconTile({ children, sm }: { children: ReactNode; sm?: boolean }) {
  return <span className={`icon-tile${sm ? " sm" : ""}`}>{children}</span>;
}

/** Initials avatar — deterministic neutral-dark tile, per the spec's avatar slots. */
export function Avatar({ label, size = 34, tile, title }: { label: string; size?: number; tile?: boolean; title?: string }) {
  const initials = label
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const style: Record<string, number> = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) };
  if (tile) style["borderRadius"] = Math.round(size * 0.3);
  return (
    <span className={`avatar${tile ? " tile" : ""}`} title={title ?? label} style={style}>
      {initials || "?"}
    </span>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="section-label">{children}</h3>;
}

/**
 * A source rendered by name. When the source carries a `url`, the name links out to the
 * original document (new tab); otherwise it is plain text. Follow the provenance, don't just read it.
 */
export function SourceLink({ title, url, className }: { title?: string; url?: string; className?: string }) {
  const label = title ?? "Unknown source";
  if (!url) return <span className={className}>{label}</span>;
  return (
    <a
      className={`source-link${className ? ` ${className}` : ""}`}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open source: ${url}`}
      onClick={(e) => e.stopPropagation()}
    >
      {label}
      <ExternalLinkIcon size={12} />
    </a>
  );
}

/** The spec's task-card completion mark: green check circle / open circle / tinted variants. */
export function MarkCircle({ kind }: { kind: "green" | "pink" | "open" | "neutral" }) {
  return (
    <span className={`mark-circle ${kind}`}>
      {kind === "green" && <CheckIcon size={13} />}
      {kind === "pink" && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
    </span>
  );
}

/** Icon + label/value info row (spec's "Deal Info" rows). */
export function InfoRow({ icon, k, v }: { icon: ReactNode; k: string; v: ReactNode }) {
  return (
    <div className="info-row">
      <span className="icon-tile sm">{icon}</span>
      <div className="kv">
        <div className="k">{k}</div>
        <div className="v">{v}</div>
      </div>
    </div>
  );
}
