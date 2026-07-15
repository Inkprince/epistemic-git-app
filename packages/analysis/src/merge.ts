import type {
  Assessment, Bundle, Challenge, Claim, CorrelationGroup, Inference, Match, Overlay,
  Passage, QuarantinedClaim, Source,
} from "@epistemic-git/protocol";
import { computeSupport } from "./support.js";

/**
 * Content-addressed merge — the "Git" in Epistemic Git.
 *
 * Two independently produced bundles combine by taking the union of their nodes keyed on
 * content-addressed id. Identical ids coalesce (and their incidental fields — a claim's supporting
 * passages, a source's flags — are unioned, never overwritten). Where the SAME node id carries
 * genuinely different judgments (two overlays disagreeing about the same target), the difference is
 * surfaced as an explicit conflict rather than silently resolved. Nothing is ever lost.
 */

const uniq = (xs: string[]): string[] => [...new Set(xs)];

export interface MergeConflict {
  kind: "assessment" | "challenge-status";
  id: string;
  field: string;
  a: unknown;
  b: unknown;
}

export interface MergeReport {
  added: Record<string, number>;
  coalesced: Record<string, number>;
  conflicts: MergeConflict[];
  /** derived conclusions whose structural support changed once B's evidence was merged in. */
  conclusionsAffected: { claimId: string; statement: string; supportBefore: number; supportAfter: number }[];
}

export interface MergeResult {
  bundle: Bundle;
  report: MergeReport;
}

export function merge(a: Bundle, b: Bundle): MergeResult {
  const added: Record<string, number> = {};
  const coalesced: Record<string, number> = {};
  const conflicts: MergeConflict[] = [];

  const bump = (rec: Record<string, number>, key: string) => { rec[key] = (rec[key] ?? 0) + 1; };

  function mergeCollection<T extends { id: string }>(
    key: string, aItems: T[], bItems: T[], coalesce?: (x: T, y: T) => T,
  ): T[] {
    const out = new Map<string, T>();
    for (const item of aItems) out.set(item.id, item);
    for (const item of bItems) {
      const existing = out.get(item.id);
      if (!existing) { out.set(item.id, item); bump(added, key); }
      else { out.set(item.id, coalesce ? coalesce(existing, item) : existing); bump(coalesced, key); }
    }
    return [...out.values()];
  }

  const sources = mergeCollection<Source>("sources", a.sources, b.sources, (x, y) => {
    const reliability = mergeReliability(x.reliability, y.reliability);
    return {
      ...x,
      authors: uniq([...x.authors, ...y.authors]),
      adversarialFlags: uniq([...x.adversarialFlags, ...y.adversarialFlags]),
      relatedSources: dedupeRelated([...x.relatedSources, ...y.relatedSources]),
      ...(reliability ? { reliability } : {}),
    };
  });

  const passages = mergeCollection<Passage>("passages", a.passages, b.passages);

  const claims = mergeCollection<Claim>("claims", a.claims, b.claims, (x, y) => ({
    ...x,
    passages: uniq([...x.passages, ...y.passages]),
    assumptions: uniq([...x.assumptions, ...y.assumptions]),
    caveats: uniq([...x.caveats, ...y.caveats]),
    tags: uniq([...x.tags, ...y.tags]),
    derived: x.derived || y.derived,
  }));

  const inferences = mergeCollection<Inference>("inferences", a.inferences, b.inferences, (x, y) => ({
    ...x,
    assumptions: uniq([...x.assumptions, ...y.assumptions]),
    defeaters: uniq([...x.defeaters, ...y.defeaters]),
  }));

  const challenges = mergeCollection<Challenge>("challenges", a.challenges, b.challenges, (x, y) => {
    if (x.status !== y.status) {
      conflicts.push({ kind: "challenge-status", id: x.id, field: "status", a: x.status, b: y.status });
    }
    return x;
  });

  const correlationGroups = mergeCollection<CorrelationGroup>("correlationGroups", a.correlationGroups, b.correlationGroups);
  const matches = mergeCollection<Match>("matches", a.matches, b.matches);
  const overlays = mergeCollection<Overlay>("overlays", a.overlays, b.overlays);

  const assessments = mergeCollection<Assessment>("assessments", a.assessments, b.assessments, (x, y) => {
    if (x.stance !== y.stance || Math.abs((x.credence ?? -1) - (y.credence ?? -1)) > 1e-9) {
      conflicts.push({
        kind: "assessment", id: x.id, field: "stance/credence",
        a: { stance: x.stance, credence: x.credence },
        b: { stance: y.stance, credence: y.credence },
      });
    }
    return x; // keep A's value; the conflict record preserves B's for the UI
  });

  const quarantine = mergeCollection<QuarantinedClaim>("quarantine", a.quarantine, b.quarantine);

  const merged: Bundle = {
    ...a,
    sources, passages, claims, inferences, challenges,
    correlationGroups, matches, overlays, assessments, quarantine,
    ...(a.notes || b.notes ? { notes: [a.notes, b.notes].filter(Boolean).join(" — merged — ") } : {}),
  };

  // Which derived conclusions moved once B's evidence was folded in?
  const beforeField = computeSupport(a);
  const afterField = computeSupport(merged);
  const conclusionsAffected = merged.claims
    .filter((c) => c.derived)
    .map((c) => ({
      claimId: c.id, statement: c.statement,
      supportBefore: beforeField.support.get(c.id) ?? 0,
      supportAfter: afterField.support.get(c.id) ?? 0,
    }))
    .filter((x) => Math.abs(x.supportAfter - x.supportBefore) > 1e-6);

  return { bundle: merged, report: { added, coalesced, conflicts, conclusionsAffected } };
}

type Reliability = NonNullable<Source["reliability"]>;

function mergeReliability(x?: Reliability, y?: Reliability): Reliability | undefined {
  if (!x && !y) return undefined;
  const xr = x ?? { fundingConflicts: [] };
  const yr = y ?? { fundingConflicts: [] };
  const priorRetractions = xr.priorRetractions ?? yr.priorRetractions;
  const peerReviewStatus = xr.peerReviewStatus ?? yr.peerReviewStatus;
  const knownStance = xr.knownStance ?? yr.knownStance;
  return {
    fundingConflicts: uniq([...(xr.fundingConflicts ?? []), ...(yr.fundingConflicts ?? [])]),
    ...(priorRetractions !== undefined ? { priorRetractions } : {}),
    ...(peerReviewStatus !== undefined ? { peerReviewStatus } : {}),
    ...(knownStance !== undefined ? { knownStance } : {}),
  };
}

type RelatedSource = Source["relatedSources"][number];

function dedupeRelated(rs: RelatedSource[]): RelatedSource[] {
  const seen = new Set<string>();
  const out: RelatedSource[] = [];
  for (const r of rs) {
    const k = `${r.sourceId}:${r.relation}`;
    if (!seen.has(k)) { seen.add(k); out.push(r); }
  }
  return out;
}
