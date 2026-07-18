import { explainSupport } from "@epistemic-git/analysis";
import type { SupportPath } from "@epistemic-git/analysis";
import type { Attribution, Bundle, Inference, Passage, Stance } from "@epistemic-git/protocol";
import { useMemo, useState } from "react";
import { saveAuthoredChallenges, saveAuthoredNarrative } from "../../cases/authored.js";
import {
  attributionClass, attributionLabel, challengeStatusLabel, challengeTypeLabel, challengesFor,
  groundingPremises, locatorText, matchTypeLabel, matchesFor, pct, stanceLabel, stancesFor,
  supportColor, truncate,
} from "../../domain.js";
import { Badge, SectionLabel, SourceLink, pressable } from "../primitives.js";
import type { BadgeTone } from "../primitives.js";
import { CiteModal } from "./CiteModal.js";
import { ClaimHistory } from "./ClaimHistory.js";
import type { Look } from "./types.js";

const ATTRIBUTION_TONE: Record<ReturnType<typeof attributionClass>, BadgeTone> = {
  src: "neutral",
  llm: "purple",
  human: "amber",
};

const STANCE_TONE: Record<Stance, BadgeTone> = {
  accept: "green",
  uncertain: "amber",
  reject: "pink",
  irrelevant: "neutral",
};

function AttributionBadge({ a }: { a: Attribution }) {
  return <Badge tone={ATTRIBUTION_TONE[attributionClass(a)]}>{attributionLabel(a)}</Badge>;
}

interface InspectProps {
  caseId: string;
  selectedId: string;
  support: ReadonlyMap<string, number>;
  look: Look;
  bundle: Bundle;
  overlayId: string | undefined;
  distrust: string[];
  respectCorrelation: boolean;
  onSelect: (id: string) => void;
  onToggleDistrust: (id: string) => void;
  /** Bump the app's local-additions version so a red-teamed challenge re-composes into the bundle. */
  onLocalChange: () => void;
}

/**
 * The provenance card, one claim answered through the five provenance questions: where it came
 * from, why it holds now, what it relates to, how belief in it has moved, and who contests it.
 * Everything here is deterministic analysis over the ledger.
 */
export function InspectPanel(props: InspectProps) {
  const { caseId, selectedId, support, look, bundle, overlayId, distrust, respectCorrelation, onSelect, onToggleDistrust, onLocalChange } = props;
  const claim = look.claims.get(selectedId);
  const [citing, setCiting] = useState(false);
  const [redteaming, setRedteaming] = useState(false);
  const [rtMsg, setRtMsg] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [narMsg, setNarMsg] = useState<string | null>(null);
  const devTools = Boolean(import.meta.env?.DEV);

  async function summarize(claimId: string) {
    setSummarizing(true);
    setNarMsg(null);
    try {
      const r = await fetch("/api/narrate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ bundle, claimId, overlayId, respectCorrelation }),
      });
      const j = (await r.json()) as { ok?: boolean; narrative?: unknown; error?: string };
      if (!r.ok || !j.ok || !j.narrative) { setNarMsg(j.error ?? `HTTP ${r.status}`); return; }
      saveAuthoredNarrative(caseId, j.narrative as import("@epistemic-git/protocol").Narrative);
      onLocalChange();
    } catch (e) {
      setNarMsg(String(e));
    } finally {
      setSummarizing(false);
    }
  }

  // "Find weaknesses (AI)" the pipeline's focused audit (red-team) on one claim.
  async function redteam(claimId: string) {
    setRedteaming(true);
    setRtMsg(null);
    try {
      const r = await fetch("/api/redteam", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ bundle, claimId }),
      });
      const j = (await r.json()) as { ok?: boolean; challenges?: unknown[]; error?: string };
      if (!r.ok || !j.ok) { setRtMsg(j.error ?? `HTTP ${r.status}`); return; }
      const found = (j.challenges ?? []) as import("@epistemic-git/protocol").Challenge[];
      if (found.length) {
        saveAuthoredChallenges(caseId, found);
        onLocalChange();
        setRtMsg(`+${found.length} AI challenge${found.length === 1 ? "" : "s"} added below`);
      } else {
        setRtMsg("The AI found nothing sharp to add to this claim.");
      }
    } catch (e) {
      setRtMsg(String(e));
    } finally {
      setRedteaming(false);
    }
  }

  const explanation = useMemo(
    () => (claim
      ? explainSupport(bundle, claim.id, {
          ...(overlayId ? { overlayId } : {}),
          respectCorrelation,
          distrustClaims: new Set(distrust),
        })
      : null),
    [bundle, claim, overlayId, respectCorrelation, distrust],
);

  if (!claim) {
    const inf = look.inferences.get(selectedId);
    if (inf) return <InferenceDetail inf={inf} support={support} look={look} bundle={bundle} onSelect={onSelect} />;
    return <div className="drawer-empty">Select a claim or reasoning step (from the evidence list, the argument map, or any card) and its full provenance appears here.</div>;
  }

  const passages = claim.passages.map((p) => look.passages.get(p)).filter(Boolean) as Passage[];
  const challenges = challengesFor(bundle, claim.id);
  const matches = matchesFor(bundle, claim.id);
  const stances = stancesFor(bundle, claim.id);
  const narrative = (bundle.narratives ?? []).find((n) => n.target.kind === "claim" && n.target.id === claim.id);
  const s = support.get(claim.id);
  const distrusted = distrust.includes(claim.id);
  // A derived conclusion has no quote of its own, trace it down to the grounded premises it rests on.
  const premises = passages.length === 0 ? groundingPremises(bundle, claim.id) : [];

  return (
    <div>
      <div className="inspect-title">{claim.statement}</div>
      <div className="badge-row">
        <AttributionBadge a={claim.attribution} />
        <span className="chip">{claim.claimType}</span>
        {claim.derived && <span className="chip">inferred conclusion, no direct quote</span>}
        {s !== undefined && (
          <Badge tone="green" dot><span style={{ color: supportColor(s) }}>support {pct(s)}</span></Badge>
)}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 12 }}>
          <button className="linklike" onClick={() => setCiting(true)} title="Get an APA citation plus the full provenance trace for this claim">
            Cite ⧉
          </button>
          <button
            className="linklike"
            onClick={() => onToggleDistrust(claim.id)}
            title="Set this claim's support to zero and watch everything downstream recompute"
          >
            {distrusted ? "↺ Trust again" : "Distrust ✕"}
          </button>
        </span>
      </div>
      {citing && (
        <CiteModal
          bundle={bundle} claimId={claim.id} overlayId={overlayId}
          respectCorrelation={respectCorrelation} onClose={() => setCiting(false)}
        />
)}

      {claim.structure && (
        <div style={{ marginTop: 10, marginBottom: 4 }}>
          {Object.entries(claim.structure).filter(([, v]) => v).map(([k, v]) => (
            <div className="meta-row" key={k}><span className="k">{k}</span><span>{String(v)}</span></div>
))}
        </div>
)}

      {/* Q1, where did it originate? */}
      <SectionLabel>Where it came from</SectionLabel>
      {passages.length === 0 && (
        <>
          <p className="subtle">
            Inferred conclusion, it rests on reasoning, not a direct quote.
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

      {/* Q2, what evidence currently supports it? */}
      {explanation && (explanation.positive.length + explanation.attacks.length + explanation.undercuts.length > 0) && (
        <>
          <SectionLabel>Why it holds now</SectionLabel>
          <PathList kind="supports" paths={explanation.positive} look={look} onSelect={onSelect} />
          <PathList kind="weakens" paths={explanation.undercuts} look={look} onSelect={onSelect} />
          <PathList kind="attacks" paths={explanation.attacks} look={look} onSelect={onSelect} />
        </>
)}
      {explanation && explanation.positive.length + explanation.attacks.length + explanation.undercuts.length === 0 && passages.length > 0 && (
        <p className="note" style={{ marginTop: 0 }}>
          Directly evidenced, nothing in the argument reinforces or attacks it. Its support is
          your stated trust in it under the current perspective.
        </p>
)}

      {/* AI summary, narrates the deterministic decomposition above; never scores. */}
      {(narrative || devTools) && (
        <>
          <SectionLabel>AI summary</SectionLabel>
          {narrative ? (
            <>
              <div className="badge-row" style={{ marginBottom: 4 }}>
                <Badge tone="purple">AI-authored</Badge>
                <span className="subtle">grounded in {narrative.groundedIn.length} claim{narrative.groundedIn.length === 1 ? "" : "s"} · a challengeable node</span>
              </div>
              <p className="note" style={{ marginTop: 0 }}>{narrative.text}</p>
            </>
) : (
            <p className="subtle" style={{ marginTop: 0 }}>No AI summary yet, generate a plain-English account of the support breakdown above.</p>
)}
          {devTools && (
            <div style={{ marginBottom: 6 }}>
              <button className="btn-outline btn-sm" disabled={summarizing} onClick={() => summarize(claim.id)}
                title="Have the AI narrate the support breakdown above, stored as an attributed, grounded, challengeable node">
                {summarizing ? "Summarizing…" : narrative ? "↻ Regenerate (AI)" : "✎ Summarize this claim (AI)"}
              </button>
              {narMsg && <span className="subtle" style={{ marginLeft: 8 }}>{narMsg}</span>}
            </div>
)}
        </>
)}

      {/* Q5, related claims across sources (typed, not flattened). */}
      {matches.length > 0 && (
        <>
          <SectionLabel>Related claims</SectionLabel>
          {matches.map((m) => {
            const otherId = m.from === claim.id ? m.to : m.from;
            const other = look.claims.get(otherId);
            return (
              <div key={m.id} style={{ marginBottom: 10 }}>
                <div className="quote clickable" {...pressable(() => onSelect(otherId))} onClick={() => onSelect(otherId)}>
                  <Badge tone={m.type === "contradicts" ? "pink" : "neutral"}>{matchTypeLabel(m.type)}</Badge>{" "}
                  {truncate(other?.statement ?? otherId, 120)}
                </div>
                {m.rationale && <div className="subtle">{m.rationale}</div>}
              </div>
);
          })}
        </>
)}

      {/* Q3+Q4, how has belief here moved, and why? */}
      <SectionLabel>How belief here has moved</SectionLabel>
      <ClaimHistory caseId={caseId} claimId={claim.id} overlayId={overlayId} respectCorrelation={respectCorrelation} />

      {/* Q5, who contests it, and from which perspective? */}
      <SectionLabel>Who contests it</SectionLabel>
      {devTools && (
        <div style={{ marginBottom: 8 }}>
          <button className="btn-outline btn-sm" disabled={redteaming} onClick={() => redteam(claim.id)}
            title="Ask the model to raise typed, specific objections against this claim, stored as open, attributed, challengeable nodes">
            {redteaming ? "Checking…" : "Find weaknesses (AI)"}
          </button>
          {rtMsg && <span className="subtle" style={{ marginLeft: 8 }}>{rtMsg}</span>}
        </div>
)}
      {stances.length === 0 && challenges.length === 0 && (
        <p className="subtle" style={{ marginTop: 0 }}>No recorded objections or opposing stances on this claim yet.</p>
)}
      {stances.map((st) => (
        <div key={st.overlay.id} style={{ marginBottom: 8 }}>
          <div className="badge-row" style={{ marginBottom: 2 }}>
            <Badge tone={STANCE_TONE[st.stance]}>{stanceLabel(st.stance)}</Badge>
            <span className="chip">{st.overlay.label}</span>
            {st.credence !== undefined && <span className="subtle mono">stated confidence {pct(st.credence)}</span>}
          </div>
          {st.rationale && <div className="subtle">{st.rationale}</div>}
        </div>
))}
      {challenges.map((c) => (
        <div key={c.id} style={{ marginBottom: 10 }}>
          <div className="badge-row" style={{ marginBottom: 4 }}>
            <Badge tone="pink">{challengeTypeLabel(c.challengeType)}</Badge>
            <span className="chip">{challengeStatusLabel(c.status)}</span>
            <AttributionBadge a={c.raisedBy} />
          </div>
          <div className="subtle">{c.rationale}</div>
        </div>
))}

      {claim.caveats.length > 0 && <p className="note">Caveat: {claim.caveats.join(" ")}</p>}
    </div>
);
}

const PATH_META: Record<"supports" | "weakens" | "attacks", { tone: BadgeTone; verb: string }> = {
  supports: { tone: "green", verb: "supports" },
  weakens: { tone: "amber", verb: "undercuts" },
  attacks: { tone: "pink", verb: "attacks" },
};

/** Renders one polarity group of the support decomposition, each inference, its warrant, its weight. */
function PathList({
  kind, paths, look, onSelect,
}: {
  kind: "supports" | "weakens" | "attacks";
  paths: SupportPath[];
  look: Look;
  onSelect: (id: string) => void;
}) {
  if (paths.length === 0) return null;
  const meta = PATH_META[kind];
  return (
    <>
      {paths.map((p) => {
        const inf = look.inferences.get(p.inferenceId);
        return (
          <div
            key={p.inferenceId}
            className="quote clickable"
            style={{ marginBottom: 8, opacity: p.active ? 1 : 0.5 }}
            onClick={() => onSelect(p.inferenceId)}
            {...pressable(() => onSelect(p.inferenceId))}
            title={inf?.warrant}
          >
            <div className="badge-row" style={{ marginBottom: 2 }}>
              <Badge tone={meta.tone}>{meta.verb}</Badge>
              <span className="chip">{p.strength}</span>
              <span className="subtle mono">
                {p.active ? `contribution ${pct(p.contribution)}` : "switched off, a premise is distrusted"}
              </span>
            </div>
            <div className="subtle">{truncate(p.warrant, 160)}</div>
          </div>
);
      })}
    </>
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
      <div className="inspect-title">Reasoning step, {inf.type}</div>
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
                <Badge tone="pink">{challengeTypeLabel(c.challengeType)}</Badge>
                <span className="chip">{challengeStatusLabel(c.status)}</span>
              </div>
              <div className="subtle">{c.rationale}</div>
            </div>
))}
        </div>
)}
    </div>
);
}
