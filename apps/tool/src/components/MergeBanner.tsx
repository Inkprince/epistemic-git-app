import type { MergeReport } from "@epistemic-git/analysis";
import { pct } from "../domain.js";
import { ZapIcon } from "./icons.js";
import { MarkCircle } from "./primitives.js";

const sumCounts = (rec: Record<string, number>): number => Object.values(rec).reduce((a, b) => a + b, 0);

/** Post-merge report banner, styled like the spec's task-history card. */
export function MergedBanner({ report, onRevert }: { report: MergeReport; onRevert: () => void }) {
  return (
    <div className="banner">
      <MarkCircle kind="green" />
      <span className="txt">
        Merged. <strong>+{sumCounts(report.added)}</strong> new nodes · <strong>{report.conflicts.length}</strong> conflict(s) preserved
        {report.conclusionsAffected.map((c) => (
          <span key={c.claimId}> · conclusion <strong>{pct(c.supportBefore)} → {pct(c.supportAfter)}</strong></span>
        ))}
      </span>
      <button className="btn-outline btn-sm" onClick={onRevert}>Revert</button>
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
