import type { Bundle } from "@epistemic-git/protocol";
import type { CruxRanking, PerspectiveDiff } from "@epistemic-git/analysis";
import { overlaysById, pct, truncate } from "../../domain.js";
import { pressable } from "../primitives.js";
import { shortLabel } from "./LeftPanel.js";

export function PerspectivesTab({
  bundle, overlayId, diffBId, onDiffB, diff, voi, onSelect,
}: {
  bundle: Bundle;
  overlayId: string;
  diffBId: string;
  onDiffB: (id: string) => void;
  diff: PerspectiveDiff;
  voi: CruxRanking[];
  onSelect: (id: string) => void;
}) {
  const overlaysMap = overlaysById(bundle);
  return (
    <>
      <div className="content-head">
        <div className="t">Where do the perspectives disagree?</div>
      </div>
      <div className="diff-head">
        <span className="chip">{shortLabel(overlaysMap.get(overlayId)?.label ?? "A")}</span>
        <span className="subtle">vs</span>
        <select className="select-outline" value={diffBId} onChange={(e) => onDiffB(e.target.value)} aria-label="Comparison perspective">
          {bundle.overlays.filter((o) => o.id !== overlayId).map((o) => (
            <option key={o.id} value={o.id}>{shortLabel(o.label)}</option>
))}
        </select>
        <span className="gap-stat">gap {pct(Math.abs(diff.gap))}</span>
      </div>
      <div className="subtle" style={{ marginBottom: 10 }}>
        {pct(diff.supportA)} vs {pct(diff.supportB)}, broken down by claim{" "}
        <span
          className="chip"
          title={diff.mode === "quantitative"
            ? "Both perspectives gave explicit confidence numbers, so these are calibrated probabilities."
            : "No numbers were given, these are rough relative weights, not calibrated odds."}
        >
          {diff.mode === "quantitative" ? "with stated numbers" : "rough weights (no numbers given)"}
        </span>
      </div>

      {diff.contributions.slice(0, 6).map((c) => {
        const nameA = shortLabel(overlaysMap.get(overlayId)?.label ?? "A");
        const nameB = shortLabel(overlaysMap.get(diffBId)?.label ?? "B");
        return (
          <div className="contrib-row" key={c.claimId} onClick={() => onSelect(c.claimId)} {...pressable(() => onSelect(c.claimId))} aria-label={`Inspect: ${truncate(c.statement, 50)}`}>
            <div className="top">
              <span className="st">{truncate(c.statement, 72)}</span>
              <span className="pct">{pct(Math.abs(c.shareOfGap))} of the gap</span>
            </div>
            <div className="dualbar">
              <span className="a" style={{ width: `${c.beliefA * 50}%` }} title={`${nameA}: ${pct(c.beliefA)}`} />
              <span className="b" style={{ width: `${c.beliefB * 50}%` }} title={`${nameB}: ${pct(c.beliefB)}`} />
            </div>
          </div>
);
      })}

      {diff.topCrux && (
        <div className="crux-card">
          <div className="lbl">Top crux, settle this to close the most disagreement</div>
          <div className="st">{diff.topCrux.statement}</div>
          <div className="voi">settling it would close ≈ {pct(voi[0]?.valueOfInformation ?? 0)} of the gap</div>
        </div>
)}
    </>
);
}
