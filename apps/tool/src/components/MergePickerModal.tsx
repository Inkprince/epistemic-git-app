import { normalizeText } from "@epistemic-git/protocol";
import type { Bundle } from "@epistemic-git/protocol";
import { useState } from "react";
import { useCases } from "../cases/store.js";
import { MergeIcon, XIcon } from "./icons.js";
import { Modal } from "./Modal.js";
import { Avatar, Badge } from "./primitives.js";

interface MergeSource {
  key: string;
  label: string;
  bundle: Bundle;
  origin: "suggested" | "committed" | "imported" | "built";
}

/**
 * Pick ANY loaded bundle to merge into the current case, a shipped companion bundle
 * (the flagship demo), another committed case, or a user import. Merging with a bundle
 * that answers a different question is allowed (the union is still sound) but warned about,
 * since conclusion support numbers may not be comparable.
 */
export function MergePickerModal({
  currentCaseId, currentBundle, onClose, onPick,
}: {
  currentCaseId: string;
  currentBundle: Bundle;
  onClose: () => void;
  onPick: (bundle: Bundle, label: string) => void;
}) {
  const { cases } = useCases();
  const current = cases[currentCaseId];
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);

  const sources: MergeSource[] = [
    ...(current?.mergePairs ?? []).map((p) => ({
      key: `pair:${p.id}`, label: p.label, bundle: p.bundle, origin: "suggested" as const,
    })),
    ...Object.values(cases)
      .filter((c) => c.id !== currentCaseId)
      .map((c) => ({ key: `case:${c.id}`, label: c.label, bundle: c.bundle, origin: c.origin })),
  ];

  const sameQuestion = (b: Bundle) => normalizeText(b.question) === normalizeText(currentBundle.question);

  return (
    <Modal onClose={onClose} ariaLabel="Merge another case into this one">
        <div className="head">
          <div className="t">Merge into “{current?.label ?? currentCaseId}”</div>
          <button className="close" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
        </div>
        <p className="subtle" style={{ margin: 0 }}>
          Merging combines two cases: identical claims join up, new evidence is added, and real
          disagreements are kept as conflicts, nothing is overwritten or lost.
        </p>
        <div className="merge-list">
          {sources.length === 0 && (
            <p className="note">Nothing to merge yet, import a case first (sidebar → Import case).</p>
)}
          {sources.map((s) => {
            const matches = sameQuestion(s.bundle);
            const needsConfirm = !matches && confirmedKey !== s.key;
            return (
              <div key={s.key} className="merge-row">
                <Avatar label={s.label} size={34} tile />
                <div className="mr-main">
                  <div className="mr-title">{s.label}</div>
                  <div className="mr-sub">
                    {s.bundle.claims.length} claims · {s.bundle.inferences.length} reasoning steps
                    {!matches && <span style={{ color: "var(--amber)" }}> · different question</span>}
                  </div>
                  {!matches && (
                    <label className="toggle-row" style={{ paddingBottom: 0 }}>
                      <input
                        type="checkbox"
                        checked={confirmedKey === s.key}
                        onChange={(e) => setConfirmedKey(e.target.checked ? s.key : null)}
                      />
                      <span style={{ fontSize: 12.5 }}>
                        This case asks “{s.bundle.question.length > 70 ? s.bundle.question.slice(0, 69) + "…" : s.bundle.question}” 
                        merge anyway (the claims still combine, but the conclusions may not be comparable).
                      </span>
                    </label>
)}
                </div>
                <div className="mr-side">
                  <Badge tone={s.origin === "suggested" ? "amber" : s.origin === "built" ? "green" : s.origin === "imported" ? "purple" : "neutral"}>
                    {s.origin === "committed" ? "saved" : s.origin === "imported" ? "local" : s.origin === "built" ? "built" : "suggested"}
                  </Badge>
                  <button
                    className="btn-outline btn-sm"
                    disabled={needsConfirm}
                    title={needsConfirm ? "Confirm the different-question checkbox first" : `Merge ${s.label}`}
                    onClick={() => { onPick(s.bundle, s.label); onClose(); }}
                  >
                    <MergeIcon size={15} /> Merge
                  </button>
                </div>
              </div>
);
          })}
        </div>
    </Modal>
);
}
