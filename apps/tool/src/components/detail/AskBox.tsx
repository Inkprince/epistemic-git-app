import { useState } from "react";
import type { Bundle } from "@epistemic-git/protocol";
import { answerCase, type AskAnswer, type AskContext, type AskKind } from "../../ask.js";
import { SearchIcon, XIcon } from "../icons.js";
import { SourceLink } from "../primitives.js";

/** Friendly labels for the answer kind — the router's internal tags stay unchanged. */
const KIND_LABEL: Record<AskKind, string> = {
  overview: "overview",
  support: "confidence",
  crux: "crux",
  provenance: "where it came from",
  challenges: "challenges",
  independence: "double-counting",
  relations: "relations",
  missing: "what's missing",
  refused: "outside this case",
};

const SUGGESTIONS = [
  "What's the crux?",
  "How strong is the conclusion?",
  "What's the weakest point?",
  "Is any evidence double-counted?",
  "What's missing?",
];

/**
 * Grounded "ask this case" box. Every answer is produced by the deterministic router in ask.ts —
 * no model is consulted — so it can cite provenance and refuse, but never confabulate.
 */
export function AskBox({
  bundle, ctx, onSelect,
}: {
  bundle: Bundle;
  ctx: AskContext;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);

  const run = (question: string) => {
    const text = question.trim();
    if (!text) return;
    setQ(text);
    setAnswer(answerCase(text, bundle, ctx));
  };

  return (
    <div className="askbox">
      <form
        className="askbox-bar"
        onSubmit={(e) => { e.preventDefault(); run(q); }}
      >
        <SearchIcon size={17} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask this case — answered from the case, never guessed…"
          aria-label="Ask this case a question"
        />
        {answer && (
          <button type="button" className="askbox-clear" aria-label="Clear answer" onClick={() => { setAnswer(null); setQ(""); }}>
            <XIcon size={14} />
          </button>
        )}
        <button type="submit" className="chip-btn askbox-go">Ask</button>
      </form>

      {!answer && (
        <div className="askbox-suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="askbox-chip" onClick={() => run(s)}>{s}</button>
          ))}
        </div>
      )}

      {answer && (
        <div className={`askbox-answer${answer.grounded ? "" : " refused"}`}>
          <div className="askbox-kind">
            {answer.grounded ? KIND_LABEL[answer.kind] : "outside this case"}
            {answer.grounded && <span className="askbox-badge" title="Answered straight from this case's evidence — no AI model consulted">from the case, not a guess</span>}
          </div>
          <p className="askbox-headline">{answer.headline}</p>
          {answer.points.length > 0 && (
            <ul className="askbox-points">
              {answer.points.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
          {answer.citations.length > 0 && (
            <div className="askbox-cites">
              {answer.citations.map((c, i) => (
                <div key={i} className="askbox-cite">
                  {c.quote && <div className="quote">“{c.quote}”</div>}
                  <div className="askbox-cite-meta">
                    {c.nodeId
                      ? <button className="linklike" onClick={() => onSelect(c.nodeId!)}>{c.label} →</button>
                      : <SourceLink title={c.source ?? c.label} url={c.url} />}
                  </div>
                </div>
              ))}
            </div>
          )}
          {answer.focusId && answer.citations.every((c) => c.nodeId !== answer.focusId) && (
            <button className="linklike" onClick={() => onSelect(answer.focusId!)}>Inspect this in the argument →</button>
          )}
          {answer.note && <p className="askbox-note">{answer.note}</p>}
        </div>
      )}
    </div>
  );
}
