import { assessmentId, overlayId as computeOverlayId } from "@epistemic-git/protocol";
import type { Assessment, Bundle, Overlay } from "@epistemic-git/protocol";
import { useState } from "react";
import { saveAuthoredOverlay } from "../../cases/authored.js";
import { truncate } from "../../domain.js";
import { CheckIcon, XIcon } from "../icons.js";
import { Modal } from "../Modal.js";

type Verdict = "skip" | "accept" | "uncertain" | "reject";
const VERDICTS: { v: Verdict; label: string }[] = [
  { v: "skip", label: "—" },
  { v: "accept", label: "Trust" },
  { v: "uncertain", label: "Unsure" },
  { v: "reject", label: "Reject" },
];

/**
 * Author a real perspective in the browser: a content-addressed Overlay plus one Assessment per
 * claim you take a stance on. Ids use the same sha256 as the pipeline, so authored perspectives
 * survive full validation and export → import round-trips on any machine.
 */
export function PerspectiveEditor({
  caseId, bundle, onClose, onSaved,
}: {
  caseId: string;
  bundle: Bundle;
  onClose: () => void;
  onSaved: (overlayId: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [analyst, setAnalyst] = useState("");
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [error, setError] = useState<string | null>(null);

  const claims = bundle.claims.filter((c) => !c.derived);
  const stanceCount = Object.values(verdicts).filter((v) => v !== "skip").length;

  function save() {
    const cleanLabel = label.trim();
    const cleanAnalyst = analyst.trim() || "anonymous";
    if (!cleanLabel) { setError("Give the perspective a name."); return; }
    if (stanceCount === 0) { setError("Take a stance on at least one claim."); return; }
    if (bundle.overlays.some((o) => o.label.trim().toLowerCase() === cleanLabel.toLowerCase())) {
      setError("A perspective with that name already exists on this ledger.");
      return;
    }
    const analystRef = { kind: "human" as const, ref: cleanAnalyst };
    const ovl: Overlay = {
      id: computeOverlayId({ label: cleanLabel, analyst: analystRef }),
      label: cleanLabel,
      ...(description.trim() ? { description: description.trim() } : {}),
      analyst: analystRef,
    };
    const assessments: Assessment[] = claims
      .filter((c) => (verdicts[c.id] ?? "skip") !== "skip")
      .map((c) => {
        const target = { kind: "claim" as const, id: c.id };
        return {
          id: assessmentId({ overlayId: ovl.id, target }),
          overlayId: ovl.id,
          target,
          stance: verdicts[c.id] as Exclude<Verdict, "skip">,
        };
      });
    saveAuthoredOverlay(caseId, ovl, assessments);
    onSaved(ovl.id);
    onClose();
  }

  return (
    <Modal onClose={onClose} ariaLabel="Create a perspective" width={680}>
        <div className="head">
          <div className="t">Create a perspective</div>
          <button className="close" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
        </div>
        <p className="subtle" style={{ margin: 0 }}>
          A perspective is your take on the evidence. The claims stay fixed; you just mark which ones
          you trust. It computes live Support and travels with the ledger when you export.
        </p>
        <div className="run-panel" style={{ marginTop: 14 }}>
          <input placeholder="Perspective name (e.g. “Skeptical methodologist”)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
          <input placeholder="One-line description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={160} />
          <input placeholder="Your name (attribution; optional)" value={analyst} onChange={(e) => setAnalyst(e.target.value)} maxLength={60} />
        </div>
        <div style={{ margin: "16px 0 6px" }} className="section-label">Stances — {stanceCount} of {claims.length} claims</div>
        <div className="pe-claims scrl">
          {claims.map((c) => (
            <div className="pe-row" key={c.id}>
              <span className="pe-statement" title={c.statement}>{truncate(c.statement, 110)}</span>
              <div className="seg pe-seg" role="group" aria-label={`Stance on: ${truncate(c.statement, 40)}`}>
                {VERDICTS.map(({ v, label: vl }) => (
                  <button
                    key={v}
                    className={(verdicts[c.id] ?? "skip") === v ? "active" : ""}
                    onClick={() => setVerdicts((prev) => ({ ...prev, [c.id]: v }))}
                  >
                    {vl}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={save}>
            <CheckIcon size={15} /> Save perspective
          </button>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
        </div>
        {error && <p className="note" style={{ color: "var(--pink)" }}>{error}</p>}
    </Modal>
  );
}
