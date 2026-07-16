import { XIcon } from "./icons.js";
import { Modal } from "./Modal.js";

const GLOSSARY: [string, string][] = [
  ["Claim", "A single statement pulled from a source and backed by an exact quote. Claims are the building blocks of the argument."],
  ["Passage", "The exact quote a claim is traced to, down to the character — with where it lives (character range, page, or timestamp)."],
  ["Inference", "One reasoning step: premises → conclusion. It carries a warrant (why the step holds), a strength, and defeaters (what would break it)."],
  ["Support", "The conclusion's live score. Your browser recomputes it from how much each claim is trusted, flowing through the inferences, minus rebuttals — no AI in the loop."],
  ["Perspective", "One person's take on the evidence. The claims stay fixed — a perspective just sets which ones it trusts. Anyone can add one."],
  ["Assessment", "A perspective's stance on a single claim or inference: accept, reject, uncertain, or irrelevant (optionally weighted)."],
  ["Branch", "A saved belief-state: a perspective, a distrust set, and the correlation toggle. You branch interpretations, not data — and the link carries it."],
  ["Distrust", "Turn off a claim and watch the conclusion recompute. The flagship demo: distrust Hawking radiation on the LHC case."],
  ["Challenge", "A specific objection — invalid inference, scope drift, correlated evidence — aimed at one node in the argument."],
  ["Relation (match)", "A link between claims across sources: equivalent, contradicts, refines, and so on."],
  ["Correlation group", "Claims that share an origin, so they can't be counted as independent evidence."],
  ["Quarantine", "Claims the pipeline refused because it couldn't find their quote in the source text — parked here with the receipts, never let in quietly."],
  ["Merge", "Combine two ledgers: identical claims join up, new evidence is added, and real disagreements are kept as conflicts — nothing is overwritten or lost."],
  ["Value of information", "How much of the disagreement between two perspectives would clear up if a single crux claim were settled."],
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} ariaLabel="What am I looking at?" width={640}>
      <div className="head">
        <div className="t">What am I looking at?</div>
        <button className="close" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
      </div>
      <p className="subtle" style={{ margin: 0 }}>
        Epistemic Git shows you the <strong>evidence behind a conclusion</strong>, not just the
        conclusion — every claim traced to an exact quote, every reasoning step spelled out, every
        objection on the record. Distrust evidence, switch perspectives, branch interpretations, merge
        independent investigations, and watch the conclusion recompute live.
      </p>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10, maxHeight: "52vh", overflowY: "auto", paddingRight: 6 }} className="scrl">
        {GLOSSARY.map(([term, def]) => (
          <div key={term} style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
            <span style={{ flex: "0 0 148px", fontWeight: 700, fontSize: 13.5 }}>{term}</span>
            <span className="subtle" style={{ fontSize: 13.5, lineHeight: 1.5 }}>{def}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
