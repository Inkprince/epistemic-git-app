import type { Attribution, Bundle, Inference, Passage } from "@epistemic-git/protocol";
import { attributionClass, attributionLabel, challengesFor, groundingPremises, locatorText, pct, truncate } from "../../domain.js";
import { Badge, SectionLabel, SourceLink, pressable } from "../primitives.js";
import type { BadgeTone } from "../primitives.js";
import type { Look } from "./types.js";

const ATTRIBUTION_TONE: Record<ReturnType<typeof attributionClass>, BadgeTone> = {
  src: "neutral",
  llm: "purple",
  human: "amber",
};

function AttributionBadge({ a }: { a: Attribution }) {
  return <Badge tone={ATTRIBUTION_TONE[attributionClass(a)]}>{attributionLabel(a)}</Badge>;
}

/** Provenance inspector — a selected claim or inference traced to its verbatim passages. */
export function InspectPanel({
  selectedId, support, look, bundle, onSelect,
}: {
  selectedId: string;
  support: ReadonlyMap<string, number>;
  look: Look;
  bundle: Bundle;
  onSelect: (id: string) => void;
}) {
  const claim = look.claims.get(selectedId);
  if (!claim) {
    const inf = look.inferences.get(selectedId);
    if (inf) return <InferenceDetail inf={inf} support={support} look={look} bundle={bundle} onSelect={onSelect} />;
    return <div className="drawer-empty">Select a claim or inference — from the evidence list, the argument map, or any card — to see where it came from here.</div>;
  }

  const passages = claim.passages.map((p) => look.passages.get(p)).filter(Boolean) as Passage[];
  const challenges = challengesFor(bundle, claim.id);
  const s = support.get(claim.id);
  // A derived conclusion has no quote of its own — trace it down to the grounded premises it rests on.
  const premises = passages.length === 0 ? groundingPremises(bundle, claim.id) : [];

  return (
    <div>
      <div className="inspect-title">{claim.statement}</div>
      <div className="badge-row">
        <AttributionBadge a={claim.attribution} />
        <span className="chip">{claim.claimType}</span>
        {claim.derived && <span className="chip">derived conclusion</span>}
        {s !== undefined && <Badge tone="green">support {pct(s)}</Badge>}
      </div>

      {claim.structure && (
        <div style={{ marginBottom: 14 }}>
          {Object.entries(claim.structure).filter(([, v]) => v).map(([k, v]) => (
            <div className="meta-row" key={k}><span className="k">{k}</span><span>{String(v)}</span></div>
          ))}
        </div>
      )}

      <SectionLabel>Traced to {passages.length} passage{passages.length === 1 ? "" : "s"}</SectionLabel>
      {passages.length === 0 && (
        <>
          <p className="subtle">
            Derived conclusion — it rests on an inference, not a direct quote.
            {premises.length > 0
              ? ` It traces down to the ${premises.length} quote-backed claim${premises.length === 1 ? "" : "s"} below.`
              : ""}
          </p>
          {premises.map((pc) => {
            const p = look.passages.get(pc.passages[0]!);
            const src = p ? look.sources.get(p.sourceId) : undefined;
            return (
              <div key={pc.id} style={{ marginBottom: 14 }}>
                <div className="quote clickable" {...pressable(() => onSelect(pc.id))} onClick={() => onSelect(pc.id)}>
                  “{p?.verbatimText ?? pc.statement}”
                </div>
                <div className="subtle">
                  <SourceLink title={src?.title} url={src?.url} />
                  {p && <> · <span className="mono">{locatorText(p)}</span></>}
                  {" · "}<button className="linklike" onClick={() => onSelect(pc.id)}>see premise →</button>
                </div>
              </div>
            );
          })}
        </>
      )}
      {passages.map((p) => {
        const src = look.sources.get(p.sourceId);
        return (
          <div key={p.id} style={{ marginBottom: 14 }}>
            <div className="quote">“{p.verbatimText}”</div>
            <div className="subtle">
              <SourceLink title={src?.title} url={src?.url} /> · <span className="mono">{locatorText(p)}</span>
              {src?.reliability?.peerReviewStatus && <> · {src.reliability.peerReviewStatus}</>}
            </div>
            {src?.adversarialFlags?.length ? (
              <div className="subtle" style={{ color: "var(--pink)", marginTop: 2 }}>flags: {src.adversarialFlags.join(", ")}</div>
            ) : null}
          </div>
        );
      })}

      {challenges.length > 0 && (
        <>
          <SectionLabel>Challenges</SectionLabel>
          {challenges.map((c) => (
            <div key={c.id} style={{ marginBottom: 10 }}>
              <div className="badge-row" style={{ marginBottom: 4 }}>
                <Badge tone="pink">{c.challengeType}</Badge>
                <span className="chip">{c.status}</span>
              </div>
              <div className="subtle">{c.rationale}</div>
            </div>
          ))}
        </>
      )}
      {claim.caveats.length > 0 && <p className="note">Caveat: {claim.caveats.join(" ")}</p>}
    </div>
  );
}

function InferenceDetail({
  inf, support, look, bundle, onSelect,
}: {
  inf: Inference;
  support: ReadonlyMap<string, number>;
  look: Look;
  bundle: Bundle;
  onSelect: (id: string) => void;
}) {
  const conclusion = look.claims.get(inf.conclusion);
  const challenges = challengesFor(bundle, inf.id);
  const claimLink = (id: string) => (
    <div className="quote clickable" onClick={() => onSelect(id)} {...pressable(() => onSelect(id))}>
      {truncate(look.claims.get(id)?.statement ?? id, 120)}
      <span className="subtle mono"> · support {pct(support.get(id) ?? 0)}</span>
    </div>
  );
  return (
    <div>
      <div className="inspect-title">Inference — {inf.type}</div>
      <div className="badge-row">
        <AttributionBadge a={inf.attribution} />
        <span className="chip">strength: {inf.strength}</span>
      </div>
      <p className="note" style={{ marginTop: 0 }}><strong>Why this holds.</strong> {inf.warrant}</p>

      <SectionLabel>Premises</SectionLabel>
      {inf.premises.map((p) => <div key={p}>{claimLink(p)}</div>)}
      <div style={{ marginTop: 14 }}>
        <SectionLabel>Conclusion</SectionLabel>
        {conclusion ? claimLink(inf.conclusion) : <p className="subtle">{inf.conclusion}</p>}
      </div>

      {inf.defeaters.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>What would break this</SectionLabel>
          <ul style={{ margin: "4px 0", paddingLeft: 18 }}>{inf.defeaters.map((d, i) => <li key={i} className="subtle">{d}</li>)}</ul>
        </div>
      )}
      {challenges.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>Challenges</SectionLabel>
          {challenges.map((c) => (
            <div key={c.id} style={{ marginBottom: 10 }}>
              <div className="badge-row" style={{ marginBottom: 4 }}>
                <Badge tone="pink">{c.challengeType}</Badge>
                <span className="chip">{c.status}</span>
              </div>
              <div className="subtle">{c.rationale}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
