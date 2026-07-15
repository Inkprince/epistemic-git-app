import { contentId, normalizeText } from "./canonical.js";
import type {
  Attribution, ChallengeType, ClaimStructure, ClaimType, InferenceType,
  Locator, MatchType, QuarantineReason, SharedOrigin, SourceType, TargetRef,
} from "./schema.js";

/**
 * Content-addressed id derivation.
 *
 * Each function hashes ONLY the fields that define what the object is — normalized text,
 * sorted set-valued fields — and excludes attribution, timestamps, evidence links, and any
 * other annotation that two independent investigators might legitimately differ on. Result:
 * the same underlying assertion gets the same id everywhere, so bundles merge cleanly.
 */

const sorted = (xs: readonly string[]): string[] => [...xs].map(normalizeText).sort();

export function sourceId(s: {
  type: SourceType; title: string; url?: string | undefined; authors?: readonly string[] | undefined;
}): string {
  return contentId("src", {
    type: s.type,
    title: normalizeText(s.title),
    url: s.url ? s.url.trim() : "",
    authors: sorted(s.authors ?? []),
  });
}

export function passageId(p: { sourceId: string; locator: Locator; verbatimText: string }): string {
  return contentId("psg", {
    sourceId: p.sourceId,
    locator: p.locator,
    text: normalizeText(p.verbatimText),
  });
}

export function claimId(c: {
  statement: string; claimType: ClaimType; structure?: ClaimStructure | undefined;
}): string {
  // Identity = what is asserted, not what supports it. Two claims with the same statement +
  // structure are the same claim even if grounded in different passages (merge unions the evidence).
  const st = c.structure ?? {};
  return contentId("cl", {
    statement: normalizeText(c.statement),
    claimType: c.claimType,
    structure: {
      population: st.population ? normalizeText(st.population) : "",
      intervention: st.intervention ? normalizeText(st.intervention) : "",
      comparator: st.comparator ? normalizeText(st.comparator) : "",
      outcome: st.outcome ? normalizeText(st.outcome) : "",
      timeframe: st.timeframe ? normalizeText(st.timeframe) : "",
      modality: st.modality ?? "",
      quantifiers: st.quantifiers ? normalizeText(st.quantifiers) : "",
      magnitude: st.magnitude ? normalizeText(st.magnitude) : "",
    },
  });
}

export function inferenceId(i: {
  type: InferenceType; premises: readonly string[]; conclusion: string; warrant: string;
}): string {
  return contentId("inf", {
    type: i.type,
    premises: sorted(i.premises),
    conclusion: i.conclusion,
    warrant: normalizeText(i.warrant),
  });
}

export function challengeId(c: {
  challengeType: ChallengeType; target: TargetRef; rationale: string;
}): string {
  return contentId("chl", {
    challengeType: c.challengeType,
    target: c.target,
    rationale: normalizeText(c.rationale),
  });
}

export function correlationGroupId(g: {
  memberKind: "claim" | "source"; members: readonly string[]; sharedOrigin: SharedOrigin;
}): string {
  return contentId("grp", {
    memberKind: g.memberKind,
    members: sorted(g.members),
    sharedOrigin: g.sharedOrigin,
  });
}

const SYMMETRIC_MATCHES = new Set<MatchType>([
  "equivalent", "possibly-equivalent", "contradicts", "compatible-different-scope",
]);

export function matchId(m: { type: MatchType; from: string; to: string }): string {
  // Symmetric relations get a direction-independent id (sorted pair); narrower/broader stay directional.
  const [a, b] = SYMMETRIC_MATCHES.has(m.type) ? [m.from, m.to].sort() : [m.from, m.to];
  return contentId("mt", { type: m.type, from: a, to: b });
}

export function overlayId(o: { label: string; analyst: Attribution }): string {
  return contentId("ovl", {
    label: normalizeText(o.label),
    analyst: { kind: o.analyst.kind, ref: o.analyst.ref ?? "" },
  });
}

export function assessmentId(a: { overlayId: string; target: TargetRef }): string {
  // One overlay holds at most one assessment per target.
  return contentId("asm", { overlayId: a.overlayId, target: a.target });
}

export function quarantineId(q: { statement: string; reason: QuarantineReason }): string {
  return contentId("qr", { statement: normalizeText(q.statement), reason: q.reason });
}

export function bundleId(b: { case: string; question: string }): string {
  return contentId("bnd", { case: normalizeText(b.case), question: normalizeText(b.question) });
}
