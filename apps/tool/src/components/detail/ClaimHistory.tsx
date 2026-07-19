import { computeSupport, diffBundles } from "@epistemic-git/analysis";
import type { BundleDiff } from "@epistemic-git/analysis";
import type { Bundle } from "@epistemic-git/protocol";
import { useEffect, useState } from "react";
import { eventsFor, snapshotGet } from "../../cases/history.js";
import type { HistoryEvent } from "../../cases/history.js";
import { pct, supportColor } from "../../domain.js";

/**
 * Question 4, "why did belief in this claim change?" A claim-scoped read over the per-case history:
 * for each recorded mutation whose snapshot we still hold, recompute THIS claim's support before and
 * after and, when it moved, name the cause from the content-addressed diff. Every number is
 * deterministic `computeSupport` arithmetic; no model is consulted. Answers the FLF "track how the
 * structure evolves over time" desideratum at the granularity of a single claim.
 */

interface Step {
  event: HistoryEvent;
  before: number | null; // null when the claim first entered the case at this event
  after: number;
  cause: string;
}

/** Layer-1 labels for the event kinds (raw kinds are storage identifiers). */
const EVENT_LABEL: Record<HistoryEvent["kind"], string> = {
  "imported": "imported", "merged": "merged", "pipeline-run": "built (AI)", "committed": "saved as case",
  "suggested": "suggested",
};

export function ClaimHistory({
  caseId, claimId, overlayId, respectCorrelation,
}: {
  caseId: string;
  claimId: string;
  overlayId: string | undefined;
  respectCorrelation: boolean;
}) {
  const [steps, setSteps] = useState<Step[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const opts = { ...(overlayId ? { overlayId } : {}), respectCorrelation };
      const supportOf = (b: Bundle) => computeSupport(b, opts).support.get(claimId);
      const out: Step[] = [];
      for (const e of eventsFor(caseId)) { // newest first
        const after = await snapshotGet(e.digest);
        if (!after) continue;
        const afterSup = supportOf(after);
        if (afterSup === undefined) continue; // claim didn't exist in this snapshot yet
        const parent = e.parents[0] ? await snapshotGet(e.parents[0]) : undefined;
        const beforeSup = parent ? supportOf(parent) : undefined;
        if (beforeSup !== undefined && Math.abs(beforeSup - afterSup) < 1e-4) continue; // unchanged here
        out.push({
          event: e,
          before: beforeSup ?? null,
          after: afterSup,
          cause: parent ? describeCause(parent, after, diffBundles(parent, after), claimId, e)
                        : `Claim entered the case (${EVENT_LABEL[e.kind]}).`,
        });
      }
      if (!cancelled) setSteps(out);
    })();
    return () => { cancelled = true; };
  }, [caseId, claimId, overlayId, respectCorrelation]);

  if (steps === null) return <p className="subtle">Reading history…</p>;
  if (steps.length === 0) {
    return (
      <p className="subtle">
        No recorded change to this claim's support in this browser yet. Importing, merging, or
        building on this case records a step here and explains what moved.
      </p>
);
  }

  return (
    <div className="claim-history">
      {steps.map((s) => (
        <div key={s.event.id} className="claim-history-step" style={{ marginBottom: 10 }}>
          <div className="badge-row" style={{ marginBottom: 2, alignItems: "center" }}>
            <span className="chip">{EVENT_LABEL[s.event.kind]}</span>
            {s.before === null ? (
              <span className="mono" style={{ color: supportColor(s.after) }}>new · {pct(s.after)}</span>
) : (
              <span className="mono">
                <span style={{ color: supportColor(s.before) }}>{pct(s.before)}</span>
                {" → "}
                <span style={{ color: supportColor(s.after) }}>{pct(s.after)}</span>
                {"  "}
                <span style={{ color: s.after >= s.before ? "var(--green-text)" : "var(--pink)" }}>
                  ({s.after >= s.before ? "+" : ""}{pct(s.after - s.before)})
                </span>
              </span>
)}
            <span className="subtle" style={{ marginLeft: "auto", fontSize: 11 }}>{fmtDate(s.event.at)}</span>
          </div>
          <div className="subtle">{s.cause}</div>
        </div>
))}
    </div>
);
}

/** Name what, among this event's added/removed nodes, actually bears on `claimId`. */
function describeCause(before: Bundle, after: Bundle, diff: BundleDiff, claimId: string, e: HistoryEvent): string {
  const infTouches = (b: Bundle, id: string) => {
    const inf = b.inferences.find((i) => i.id === id);
    return !!inf && (inf.conclusion === claimId || inf.premises.includes(claimId));
  };
  const chTargets = (b: Bundle, id: string) => b.challenges.find((c) => c.id === id)?.target.id === claimId;
  const asmtTargets = (b: Bundle, id: string) => {
    const a = b.assessments.find((x) => x.id === id);
    return a?.target.kind === "claim" && a.target.id === claimId;
  };

  const parts: string[] = [];
  const n = (arr: string[] | undefined, pred: (id: string) => boolean) => (arr ?? []).filter(pred).length;

  const addInf = n(diff.added.inferences, (id) => infTouches(after, id));
  const remInf = n(diff.removed.inferences, (id) => infTouches(before, id));
  const addCh = n(diff.added.challenges, (id) => chTargets(after, id));
  const remCh = n(diff.removed.challenges, (id) => chTargets(before, id));
  const addAsmt = n(diff.added.assessments, (id) => asmtTargets(after, id));

  if (addInf) parts.push(`${addInf} reasoning step${plural(addInf)} added on this claim`);
  if (remInf) parts.push(`${remInf} reasoning step${plural(remInf)} removed`);
  if (addCh) parts.push(`${addCh} challenge${plural(addCh)} raised against it`);
  if (remCh) parts.push(`${remCh} challenge${plural(remCh)} resolved`);
  if (addAsmt) parts.push(`a perspective set its stance on it`);

  if (parts.length) return capitalize(parts.join(", ")) + `. (${EVENT_LABEL[e.kind]})`;
  // Support moved but nothing landed directly on this claim, it propagated from its premises.
  return `Its support shifted from upstream evidence (${diff.totalAdded} node${plural(diff.totalAdded)} added, ${diff.totalRemoved} removed).`;
}

const plural = (n: number) => (n === 1 ? "" : "s");
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
