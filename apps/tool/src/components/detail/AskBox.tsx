import { useState } from "react";
import type { Bundle } from "@epistemic-git/protocol";
import { answerCase, type AskAnswer, type AskContext, type AskKind } from "../../ask.js";
import { SearchIcon, XIcon, ZapIcon } from "../icons.js";
import { SourceLink } from "../primitives.js";

/** Friendly labels for the answer kind, the router's internal tags stay unchanged. */
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
 * Grounded "ask this case" box. Every answer is produced by the deterministic router in ask.ts, 
 * no model is consulted, so it can cite provenance and refuse, but never confabulate.
 *
 * Also hosts the case's one-line "Try this" onboarding hint (with an optional one-click preset),
 * so the case teaches itself from a single surface on every tab; the hint yields to an answer.
 */
export function AskBox({
  bundle, ctx, onSelect, tryThis, presetLabel, presetActive, onPreset,
}: {
  bundle: Bundle;
  ctx: AskContext;
  onSelect: (id: string) => void;
  tryThis?: string | undefined;
  presetLabel?: string | undefined;
  presetActive?: boolean | undefined;
  onPreset?: (() => void) | undefined;
}) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [asked, setAsked] = useState("");
  const [prose, setProse] = useState<string | null>(null);
  const [proseBusy, setProseBusy] = useState(false);
  const [proseErr, setProseErr] = useState<string | null>(null);
  const devTools = Boolean(import.meta.env?.DEV);

  const run = (question: string) => {
    const text = question.trim();
    if (!text) return;
    setQ(text);
    setAsked(text);
    setAnswer(answerCase(text, bundle, ctx));
    setProse(null);
    setProseErr(null);
  };

  async function explainInProse() {
    if (!answer) return;
    setProseBusy(true);
    setProseErr(null);
    try {
      const r = await fetch("/api/answer", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: asked, answer }),
      });
      const j = (await r.json()) as { ok?: boolean; text?: string; error?: string };
      if (!r.ok || !j.ok || !j.text) { setProseErr(j.error ?? `HTTP ${r.status}`); return; }
      setProse(j.text);
    } catch (e) {
      setProseErr(String(e));
    } finally {
      setProseBusy(false);
    }
  }

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
          placeholder="Ask this case, answered from the case, never guessed…"
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

      {!answer && tryThis && (
        <div className="try-hint">
          <span className="tl-circle"><ZapIcon size={17} /></span>
          <span className="txt">{tryThis}</span>
          {presetLabel && onPreset && (
            <button className="btn-outline btn-sm" onClick={onPreset}>
              {presetActive ? "↩ Trust again" : presetLabel}
            </button>
)}
        </div>
)}

      {answer && (
        <div className={`askbox-answer${answer.grounded ? "" : " refused"}`}>
          <div className="askbox-kind">
            {answer.grounded ? KIND_LABEL[answer.kind] : "outside this case"}
            {answer.grounded && <span className="askbox-badge" title="Answered straight from this case's evidence, no AI model consulted">from the case, not a guess</span>}
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

          {answer.grounded && devTools && (
            <div style={{ marginTop: 10, borderTop: "1px solid var(--hairline, #ededed)", paddingTop: 8 }}>
              {prose ? (
                <>
                  <div className="askbox-kind">
                    AI prose
                    <span className="askbox-badge" title="Rewritten by a model from ONLY the grounded answer + citations above (it cannot exceed them">AI rewrite) bounded by the citations above</span>
                  </div>
                  <p className="askbox-headline" style={{ fontWeight: 400 }}>{prose}</p>
                </>
) : (
                <button type="button" className="chip-btn" disabled={proseBusy} onClick={explainInProse}
                  title="Rewrite the grounded answer above as plain prose, strictly bounded by its citations, no new facts">
                  {proseBusy ? "Writing…" : "✎ Explain with AI"}
                </button>
)}
              {proseErr && <p className="askbox-note" style={{ color: "var(--pink)" }}>{proseErr}</p>}
            </div>
)}
        </div>
)}
    </div>
);
}
