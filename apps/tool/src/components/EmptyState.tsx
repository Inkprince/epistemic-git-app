import type { ReactNode } from "react";

/** Friendly per-tab explainer shown when a collection is empty, no dead tabs, no mystery. */
export function EmptyState({
  icon, title, body, cta,
}: {
  icon: ReactNode;
  title: string;
  body: ReactNode;
  cta?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="es-icon">{icon}</span>
      <div className="es-title">{title}</div>
      <div className="es-body">{body}</div>
      {cta && <div className="es-cta">{cta}</div>}
    </div>
);
}
