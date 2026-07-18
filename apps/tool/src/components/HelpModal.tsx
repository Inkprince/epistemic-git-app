import { XIcon } from "./icons.js";
import { Modal } from "./Modal.js";

// Ordered to match the concept dependency map (LANGUAGE-AUDIT §9): each entry only
// leans on terms defined above it.
const GLOSSARY: [string, string][] = [
  ["Claim", "A single statement pulled from a source and backed by an exact quote. Claims are the building blocks of the argument."],
  ["Quote", "The exact excerpt a claim is traced to, down to the character, with where it lives (character range, page, or timestamp)."],
  ["Reasoning step", "One step of reasoning: premises → conclusion. Each one says why the step holds, how strong it is, and what would break it."],
  ["Support", "How strongly the evidence you trust backs a claim, computed live in your browser from the argument, structural arithmetic, not a real-world probability, and no AI in the loop."],
  ["Distrust", "Turn off a claim and watch the conclusion recompute. Try it: distrust Hawking radiation on the LHC case."],
  ["Perspective", "One reading of the same evidence. The claims stay fixed, a perspective just sets which ones it accepts. Anyone can add one."],
  ["Stance", "A perspective's position on a single claim: accepts, rejects, unsure, or not relevant, optionally with a stated confidence."],
  ["Crux", "The single disagreement between two perspectives that moves the conclusion most, the thing most worth settling first."],
  ["Scenario", "A saved what-if: which perspective is applied and which evidence is set aside. The case never changes (you save readings, not edits) and the link carries it."],
  ["Challenge", "A specific objection (reasoning that doesn't follow, scope drift, double-counted evidence) aimed at one claim or reasoning step."],
  ["Related claims", "Links between claims across sources: same claim, likely the same, more specific, contradicts, and so on."],
  ["Shared-origin evidence", "Claims whose evidence comes from the same place (dataset, authors, funder), so it counts as one line of evidence, not several."],
  ["Excluded", "Claims refused because their quote couldn't be found in the source text, parked in plain sight with the reason, never let in quietly."],
  ["History", "Every import, merge, build, and save this case has been through, pick two moments to see exactly what changed."],
  ["Merge", "Combine two cases: identical claims join up, new evidence is added, and real disagreements are kept as conflicts, nothing is overwritten or lost."],
  ["What settling a crux buys", "How much of the disagreement between two perspectives would clear up if a single crux claim were settled."],
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
        conclusion, every claim traced to an exact quote, every reasoning step spelled out, every
        objection on the record. Distrust evidence, switch perspectives, save scenarios, merge
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
