import type { ReactNode } from "react";
import { CheckIcon } from "./icons.js";

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
