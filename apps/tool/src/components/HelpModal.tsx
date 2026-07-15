import { XIcon } from "./icons.js";
import { Modal } from "./Modal.js";

const GLOSSARY: [string, string][] = [
  ["Claim", "An atomic statement extracted from a source, grounded in a verbatim quote. Claims are the nodes of the argument."],
  ["Passage", "The literal, byte-exact quote a claim is traced to, with its locator (character range / page / timestamp)."],
  ["Inference", "A reasoning arrow: premises → conclusion, with a warrant (why the link holds), a strength, and defeaters (what would break it)."],
  ["Support", "The conclusion's live score, recomputed in your browser from claim trust flowing through inferences, minus rebuttals — no AI involved."],
  ["Perspective (overlay)", "A late-binding trust layer: the evidence stays fixed while each viewpoint weighs it differently. Anyone can author one."],
  ["Assessment", "One perspective's stance on one claim or inference (accept / reject / uncertain / irrelevant, optionally weighted)."],
  ["Branch (scenario)", "A saved belief-state — perspective + distrust set + correlation toggle. You branch interpretations, not data; the URL carries it."],
  ["Distrust", "Zero out a claim and watch the conclusion recompute. The flagship demo: distrust Hawking radiation on the LHC case."],
  ["Challenge", "A typed adversarial objection (invalid-inference, scope-drift, correlated-evidence…) aimed at a specific node."],
  ["Relation (match)", "A typed link between claims across sources: equivalent, contradicts, refines…"],
  ["Correlation group", "Claims that share an origin and must not be double-counted as independent evidence."],
  ["Quarantine", "Claims the pipeline refused because their quote could not be located in the source bytes — parked with receipts, never silently admitted."],
  ["Merge", "Content-addressed union of two ledgers: identical nodes coalesce, new evidence lands, genuine disagreements are preserved as explicit conflicts."],
  ["Value of information", "How much of the disagreement between two perspectives would resolve if one crux claim were settled."],
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} ariaLabel="What am I looking at?" width={640}>
      <div className="head">
        <div className="t">What am I looking at?</div>
        <button className="close" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
      </div>
      <p className="subtle" style={{ margin: 0 }}>
        Epistemic Git ships the <strong>evidence behind a conclusion</strong>, not just the conclusion —
        every claim traced to a verbatim quote, every inference explicit, every objection recorded.
        You can distrust evidence, switch perspectives, branch interpretations, merge independent
        investigations, and watch the conclusion recompute live.
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
