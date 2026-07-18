import type {
  Attribution, Bundle, Challenge, ChallengeStatus, ChallengeType, Claim, Inference, Match, MatchType,
  Overlay, Passage, QuarantineReason, SharedOrigin, Source, Stance,
} from "@epistemic-git/protocol";

/** The primary conclusion of a bundle = its (first) derived claim; null for an empty bundle. */
export function primaryConclusion(bundle: Bundle): Claim | null {
  return bundle.claims.find((c) => c.derived) ?? bundle.claims[bundle.claims.length - 1] ?? null;
}

export function claimsById(bundle: Bundle): Map<string, Claim> {
  return new Map(bundle.claims.map((c) => [c.id, c]));
}
export function inferencesById(bundle: Bundle): Map<string, Inference> {
  return new Map(bundle.inferences.map((i) => [i.id, i]));
}
export function passagesById(bundle: Bundle): Map<string, Passage> {
  return new Map(bundle.passages.map((p) => [p.id, p]));
}
export function sourcesById(bundle: Bundle): Map<string, Source> {
  return new Map(bundle.sources.map((s) => [s.id, s]));
}
export function overlaysById(bundle: Bundle): Map<string, Overlay> {
  return new Map(bundle.overlays.map((o) => [o.id, o]));
}

export function challengesFor(bundle: Bundle, target: string): Challenge[] {
  return bundle.challenges.filter((c) => c.target.id === target);
}

/** Typed relations touching a claim, the same assertion in other words, or a contradiction. */
export function matchesFor(bundle: Bundle, claimId: string): Match[] {
  return bundle.matches.filter((m) => m.from === claimId || m.to === claimId);
}

/** One perspective's stated position on a claim (the "who disagrees, and how" read). */
export interface OverlayStance {
  overlay: Overlay;
  stance: Stance;
  credence?: number;
  rationale?: string;
}

/**
 * Every perspective that has taken an explicit position on this claim, with its stance. Powers the
 * "who contests it, and from which perspective" section, the fifth provenance question.
 */
export function stancesFor(bundle: Bundle, claimId: string): OverlayStance[] {
  const overlays = overlaysById(bundle);
  const out: OverlayStance[] = [];
  for (const a of bundle.assessments) {
    if (a.target.kind !== "claim" || a.target.id !== claimId) continue;
    const overlay = overlays.get(a.overlayId);
    if (!overlay) continue;
    out.push({
      overlay,
      stance: a.stance,
      ...(a.credence !== undefined ? { credence: a.credence } : {}),
      ...(a.rationale ? { rationale: a.rationale } : {}),
    });
  }
  return out;
}

/**
 * The source-grounded claims that (transitively) support `claimId` through the inference structure.
 * A derived conclusion has no quote of its own; its provenance is this chain down to premises that DO
 * carry verbatim passages. Breadth-first over inference premises, deduped, cycle-safe.
 */
export function groundingPremises(bundle: Bundle, claimId: string): Claim[] {
  const byId = new Map(bundle.claims.map((c) => [c.id, c]));
  const seen = new Set<string>([claimId]);
  const queue = [claimId];
  const grounded: Claim[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    for (const inf of bundle.inferences) {
      if (inf.conclusion !== id) continue;
      for (const pid of inf.premises) {
        if (seen.has(pid)) continue;
        seen.add(pid);
        const c = byId.get(pid);
        if (!c) continue;
        if (c.passages.length > 0) grounded.push(c);
        queue.push(pid); // keep walking up through any intermediate derived claims
      }
    }
  }
  return grounded;
}

export function attributionClass(a: Attribution): "src" | "llm" | "human" {
  return a.kind === "source" ? "src" : a.kind === "analyst-llm" ? "llm" : "human";
}
export function attributionLabel(a: Attribution): string {
  return a.kind === "source" ? "From source" : a.kind === "analyst-llm" ? "AI-proposed" : "Human";
}

// ─── Display maps ─────────────────────────────────────────────────────────────
// Protocol enums are Layer 3 identifiers; these are their Layer 1 labels. A raw
// enum value must never be the visible text of a UI element (LANGUAGE-AUDIT §3).

const CHALLENGE_TYPE_LABEL: Record<ChallengeType, string> = {
  "source-does-not-support": "Quote doesn't back the claim",
  "scope-drift": "Scope drift",
  "quantifier-drift": "Overstates how many",
  "omitted-qualification": "Drops a stated caveat",
  "correlated-evidence": "Double-counted evidence",
  "circular-citation": "Circular citation",
  "confounding": "Confounding",
  "selection-bias": "Selection bias",
  "construct-mismatch": "Measures something else",
  "temporal-supersession": "Superseded by later work",
  "missing-alternative": "Ignores an alternative explanation",
  "invalid-inference": "Reasoning doesn't follow",
  "rhetorical-not-evidential": "Rhetoric, not evidence",
  "missing-source": "Missing source",
};
export const challengeTypeLabel = (t: ChallengeType): string => CHALLENGE_TYPE_LABEL[t] ?? t;

const CHALLENGE_STATUS_LABEL: Record<ChallengeStatus, string> = {
  open: "open", accepted: "accepted", rejected: "rejected", mitigated: "addressed",
};
export const challengeStatusLabel = (s: ChallengeStatus): string => CHALLENGE_STATUS_LABEL[s] ?? s;

const EXCLUSION_REASON_LABEL: Record<QuarantineReason, string> = {
  "no-supporting-passage": "No supporting quote found",
  "passage-does-not-entail": "The quote doesn't say this",
  "unverifiable-source": "Source can't be verified",
  "duplicate": "Duplicate",
  "out-of-scope": "Outside this case's question",
  "injection-suspected": "Possible prompt injection, the text tried to instruct the AI",
};
export const exclusionReasonLabel = (r: QuarantineReason): string => EXCLUSION_REASON_LABEL[r] ?? r;

const MATCH_TYPE_LABEL: Record<MatchType, string> = {
  "equivalent": "Same claim",
  "possibly-equivalent": "Likely the same claim",
  "narrower": "More specific version",
  "broader": "More general version",
  "contradicts": "Contradicts",
  "compatible-different-scope": "Compatible, different scope",
};
export const matchTypeLabel = (t: MatchType): string => MATCH_TYPE_LABEL[t] ?? t;

const STANCE_LABEL: Record<Stance, string> = {
  accept: "Accepts", reject: "Rejects", uncertain: "Unsure", irrelevant: "Not relevant",
};
export const stanceLabel = (s: Stance): string => STANCE_LABEL[s] ?? s;

const SHARED_ORIGIN_LABEL: Record<SharedOrigin, string> = {
  dataset: "shared dataset", author: "shared authors", institution: "shared institution",
  funder: "shared funder", methodology: "shared methodology", instrument: "shared instrument",
  publication: "shared publication",
};
export const sharedOriginLabel = (o: SharedOrigin): string => SHARED_ORIGIN_LABEL[o] ?? o;

export function locatorText(p: Passage): string {
  const l = p.locator;
  switch (l.kind) {
    case "char": return `chars ${l.start}–${l.end}`;
    case "page": return l.endPage ? `pp. ${l.page}–${l.endPage}` : `p. ${l.page}`;
    case "timestamp": return `${fmtMs(l.startMs)}${l.endMs ? `–${fmtMs(l.endMs)}` : ""}`;
    case "section": return l.path;
  }
}
function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

/** Support 0→1 mapped onto a red → yellow → green ramp that matches the dashboard palette. */
export function supportColor(s: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [239, 68, 68]],    // #ef4444
    [0.5, [234, 179, 8]],  // #eab308
    [1, [34, 197, 94]],    // #22c55e
  ];
  const x = Math.max(0, Math.min(1, s));
  for (let i = 1; i < stops.length; i++) {
    const [x1, c1] = stops[i - 1]!;
    const [x2, c2] = stops[i]!;
    if (x <= x2) {
      const t = (x - x1) / (x2 - x1);
      const mix = c1.map((v, j) => Math.round(v + (c2[j]! - v) * t));
      return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
    }
  }
  return "rgb(34,197,94)";
}
export const truncate = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + "…" : s);
