import type { MergeConflict, MergeReport } from "@epistemic-git/analysis";
import type { Bundle } from "@epistemic-git/protocol";
import { useMemo, useState } from "react";
import { pct, truncate } from "../domain.js";
import { ChevronDown, ChevronUp, ZapIcon } from "./icons.js";
import { Badge, MarkCircle } from "./primitives.js";

const sumCounts = (rec: Record<string, number>): number => Object.values(rec).reduce((a, b) => a + b, 0);

/**
 * Post-merge report banner. Conflicts are never auto-resolved — A's value is kept in the merged
 * bundle and B's is preserved in the report; this panel makes both sides visible.
 */
export function MergedBanner({
  report, bundle, onRevert, onSelect,
}: {
  report: MergeReport;
  bundle: Bundle;
  onRevert: () => void;
  onSelect?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const n = report.conflicts.length;
  return (
    <div className="banner" style={{ flexWrap: "wrap" }}>
      <MarkCircle kind="green" />
      <span className="txt">
        Merged. <strong>+{sumCounts(report.added)}</strong> added · <strong>{sumCounts(report.coalesced)}</strong> already shared ·{" "}
        <strong>{n}</strong> conflict{n === 1 ? "" : "s"} kept
        {report.conclusionsAffected.map((c) => (
          <span key={c.claimId}> · conclusion <strong>{pct(c.supportBefore)} → {pct(c.supportAfter)}</strong></span>
        ))}
      </span>
      {n > 0 && (
        <button className="chip-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {open ? "Hide" : "View"} conflicts
        </button>
      )}
      <button className="btn-outline btn-sm" onClick={onRevert}>Revert</button>
      {open && n > 0 && <ConflictPanel conflicts={report.conflicts} bundle={bundle} {...(onSelect ? { onSelect } : {})} />}
    </div>
  );
}

function ConflictPanel({ conflicts, bundle, onSelect }: { conflicts: MergeConflict[]; bundle: Bundle; onSelect?: (id: string) => void }) {
  const context = useMemo(() => {
    const challenges = new Map(bundle.challenges.map((c) => [c.id, c]));
    const assessments = new Map(bundle.assessments.map((a) => [a.id, a]));
    const claims = new Map(bundle.claims.map((c) => [c.id, c]));
    const inferences = new Map(bundle.inferences.map((i) => [i.id, i]));
    const overlays = new Map(bundle.overlays.map((o) => [o.id, o]));
    return { challenges, assessments, claims, inferences, overlays };
  }, [bundle]);

  const describe = (c: MergeConflict): { title: string; targetId?: string } => {
    if (c.kind === "challenge-status") {
      const ch = context.challenges.get(c.id);
      return {
        title: ch ? `Challenge status disagrees: “${truncate(ch.rationale, 110)}”` : `Challenge ${c.id} status disagrees`,
        ...(ch && (ch.target.kind === "claim" || ch.target.kind === "inference") ? { targetId: ch.target.id } : {}),
      };
    }
    const asm = context.assessments.get(c.id);
    const target = asm ? context.claims.get(asm.target.id) ?? context.inferences.get(asm.target.id) : undefined;
    const overlay = asm ? context.overlays.get(asm.overlayId) : undefined;
    const targetText = target
      ? "statement" in target ? target.statement : `inference: ${truncate(target.warrant, 80)}`
      : asm?.target.id ?? c.id;
    return {
      title: `${overlay ? `“${overlay.label}” ` : ""}assessment disagrees on: ${truncate(targetText, 100)}`,
      ...(asm ? { targetId: asm.target.id } : {}),
    };
  };

  const fmt = (v: unknown): string => {
    if (v && typeof v === "object") {
      const { stance, credence } = v as { stance?: string; credence?: number };
      return [stance, credence !== undefined ? `credence ${pct(credence)}` : undefined].filter(Boolean).join(", ") || JSON.stringify(v);
    }
    return String(v);
  };

  return (
    <div className="conflict-panel">
      {conflicts.map((c, i) => {
        const d = describe(c);
        return (
          <div className="conflict-row" key={`${c.id}-${i}`}>
            <span className="tl-circle" style={{ width: 26, height: 26, background: "var(--purple-bg)" }}>
              <ZapIcon size={13} color="#7c3aed" />
            </span>
            <div className="cr-main">
              <div className="cr-title">{d.title}</div>
              <div className="cr-ab">
                <span className="side-a" title="Kept in the merged bundle">A (kept): {fmt(c.a)}</span>
                <span className="side-b" title="Preserved in the merge report — nothing lost">B (preserved): {fmt(c.b)}</span>
                <Badge tone="neutral">{c.kind}</Badge>
                {d.targetId && onSelect && (
                  <button className="chip-btn" style={{ padding: "4px 10px" }} onClick={() => onSelect(d.targetId!)}>
                    Inspect node →
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Shown while viewing a bundle produced by the local pipeline run. */
export function LiveRunBanner({ backLabel, onBack }: { backLabel: string; onBack: () => void }) {
  return (
    <div className="banner">
      <span className="tl-circle" style={{ width: 26, height: 26, background: "var(--yellow)" }}><ZapIcon size={14} /></span>
      <span className="txt">Viewing <strong>your live pipeline run</strong> — generated from pasted source text.</span>
      <button className="btn-outline btn-sm" onClick={onBack}>Back to {backLabel}</button>
    </div>
  );
}
