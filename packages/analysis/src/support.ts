import type { Bundle, Strength } from "@epistemic-git/protocol";
import { buildGraph, ClaimGraph } from "./graph.js";

/**
 * Weighted support propagation, the deterministic assessment semantics.
 *
 * Every number here is a pure function of (bundle structure, one overlay's stated beliefs). No
 * LLM, no randomness. A claim's support in [0,1] is computed as:
 *
 *   1. base       = if it has positive supporting inferences, the (correlation-aware) combination
 *                   of those; otherwise the overlay's stated belief in the claim (a leaf).
 *   2. undercut   = base is multiplied down by any undercutting inferences.
 *   3. attack      = the result is multiplied down by any rebutting/contradicting inferences.
 *
 * The model is intentionally simple and its assumptions are named (see the essay): conjunctive
 * premises combine multiplicatively; independent sibling supports combine by noisy-OR; supports
 * whose evidence shares a correlation group are treated as dependent (combined by max) so shared
 * evidence is not double-counted.
 */

const STRENGTH_FACTOR: Record<Strength, number> = {
  strong: 0.9, moderate: 0.65, weak: 0.4, speculative: 0.2,
};

const STANCE_BELIEF = { accept: 0.85, uncertain: 0.5, reject: 0.15, irrelevant: 0.0 } as const;
const DEFAULT_BELIEF = 0.5; // an unassessed claim is maximally uncertain under that overlay
const DEFAULT_INFERENCE_TRUST = 1.0;
const EPSILON = 1e-9;

export interface SupportOptions {
  /** which perspective's beliefs to use; if omitted, all leaves take DEFAULT_BELIEF. */
  overlayId?: string;
  /** claim ids forced to zero support ("distrust this" powers the drop-Hawking recompute). */
  distrustClaims?: ReadonlySet<string>;
  /** inference ids to disable (remove that argument step). */
  disableInferences?: ReadonlySet<string>;
  /** when true, sibling supports drawing on correlated evidence are not double-counted. */
  respectCorrelation?: boolean;
  /** force a leaf claim's belief to a specific value (used by perspective-diff to swap one node). */
  beliefOverrides?: ReadonlyMap<string, number>;
}

export interface SupportField {
  /** claim id → support in [0,1]. */
  support: ReadonlyMap<string, number>;
  overlayId: string | undefined;
}

/** Belief an overlay places in a claim, before structural propagation. */
function statedBelief(bundle: Bundle, overlayId: string | undefined, claimId: string): number {
  if (!overlayId) return DEFAULT_BELIEF;
  const a = bundle.assessments.find(
    (x) => x.overlayId === overlayId && x.target.kind === "claim" && x.target.id === claimId,
);
  if (!a) return DEFAULT_BELIEF;
  if (a.credence !== undefined) return a.credence;
  return STANCE_BELIEF[a.stance];
}

function inferenceTrust(bundle: Bundle, overlayId: string | undefined, inferenceId: string): number {
  if (!overlayId) return DEFAULT_INFERENCE_TRUST;
  const a = bundle.assessments.find(
    (x) => x.overlayId === overlayId && x.target.kind === "inference" && x.target.id === inferenceId,
);
  if (!a) return DEFAULT_INFERENCE_TRUST;
  if (a.credence !== undefined) return a.credence;
  return a.stance === "accept" ? 1.0 : a.stance === "uncertain" ? 0.6 : a.stance === "reject" ? 0.2 : 0.0;
}

const noisyOr = (values: number[]): number => 1 - values.reduce((acc, v) => acc * (1 - v), 1);

/** Which correlation group (if any) a claim belongs to, for double-counting control. */
function correlationIndex(bundle: Bundle): Map<string, string> {
  const idx = new Map<string, string>();
  for (const g of bundle.correlationGroups) {
    if (g.memberKind !== "claim") continue;
    for (const m of g.members) idx.set(m, g.id);
  }
  return idx;
}

export function computeSupport(bundleOrGraph: Bundle | ClaimGraph, opts: SupportOptions = {}): SupportField {
  const graph = bundleOrGraph instanceof ClaimGraph ? bundleOrGraph : buildGraph(bundleOrGraph);
  const bundle = graph.bundle;
  const corr = opts.respectCorrelation ? correlationIndex(bundle) : new Map<string, string>();

  const memo = new Map<string, number>();
  const inProgress = new Set<string>();

  const conj = (premises: readonly string[]): number =>
    premises.reduce((acc, p) => acc * supportOf(p), 1);

  /** The correlation group a support-inference "draws on" = the groups of its premise claims. */
  const groupsOf = (premises: readonly string[]): Set<string> => {
    const s = new Set<string>();
    for (const p of premises) { const g = corr.get(p); if (g) s.add(g); }
    return s;
  };

  function supportOf(claimId: string): number {
    if (opts.distrustClaims?.has(claimId)) return 0;
    const cached = memo.get(claimId);
    if (cached !== undefined) return cached;
    if (inProgress.has(claimId)) return DEFAULT_BELIEF; // cycle guard (findCycles reports these)
    inProgress.add(claimId);

    const disabled = opts.disableInferences ?? new Set<string>();
    const posInfs = (graph.supports.get(claimId) ?? []).filter((i) => !disabled.has(i.id));

    // 1. base support
    let base: number;
    if (posInfs.length === 0) {
      base = opts.beliefOverrides?.get(claimId) ?? statedBelief(bundle, opts.overlayId, claimId);
    } else {
      const contributions = posInfs.map((inf) => ({
        value: STRENGTH_FACTOR[inf.strength] * inferenceTrust(bundle, opts.overlayId, inf.id) * conj(inf.premises),
        groups: groupsOf(inf.premises),
      }));
      base = combineSupports(contributions);
    }

    // 2. undercuts reduce the base belief
    let val = base;
    for (const inf of (graph.undercuts.get(claimId) ?? []).filter((i) => !disabled.has(i.id))) {
      const u = STRENGTH_FACTOR[inf.strength] * inferenceTrust(bundle, opts.overlayId, inf.id) * conj(inf.premises);
      val *= 1 - u;
    }

    // 3. attacks reduce the result
    const attacks = (graph.attacks.get(claimId) ?? [])
      .filter((i) => !disabled.has(i.id))
      .map((inf) => STRENGTH_FACTOR[inf.strength] * inferenceTrust(bundle, opts.overlayId, inf.id) * conj(inf.premises));
    if (attacks.length) val *= 1 - noisyOr(attacks);

    val = Math.max(0, Math.min(1, val));
    inProgress.delete(claimId);
    memo.set(claimId, val);
    return val;
  }

  /**
   * Combine sibling positive supports. Independent supports use noisy-OR. Supports that share a
   * correlation group are dependent, within each shared-group cluster we take the max (no
   * double-counting), then noisy-OR across the (now independent) clusters and singletons.
   */
  function combineSupports(items: { value: number; groups: Set<string> }[]): number {
    if (opts.respectCorrelation) {
      const clusters = new Map<string, number>(); // group id → max value in that group
      const independent: number[] = [];
      for (const it of items) {
        if (it.groups.size === 0) { independent.push(it.value); continue; }
        for (const g of it.groups) clusters.set(g, Math.max(clusters.get(g) ?? 0, it.value));
      }
      return noisyOr([...independent, ...clusters.values()]);
    }
    return noisyOr(items.map((i) => i.value));
  }

  for (const id of graph.claims.keys()) supportOf(id);
  return { support: memo, overlayId: opts.overlayId };
}

export interface SupportPath {
  inferenceId: string;
  type: string;
  strength: Strength;
  /** this inference's contribution to the conclusion in [0,1] under the given options. */
  contribution: number;
  premises: string[];
  /** true when the contribution survives the current distrust/disable set. */
  active: boolean;
  warrant: string;
}

export interface SupportExplanation {
  claimId: string;
  support: number;
  positive: SupportPath[];
  attacks: SupportPath[];
  undercuts: SupportPath[];
}

/**
 * Explain a claim's support: each supporting/attacking/undercutting inference and its contribution,
 * flagged active or not. This is what the UI renders for "does safety survive without Hawking?" 
 * the surviving support paths are exactly those still `active` after the premise is distrusted.
 */
export function explainSupport(
  bundleOrGraph: Bundle | ClaimGraph, claimId: string, opts: SupportOptions = {},
): SupportExplanation {
  const graph = bundleOrGraph instanceof ClaimGraph ? bundleOrGraph : buildGraph(bundleOrGraph);
  const bundle = graph.bundle;
  const field = computeSupport(graph, opts);
  const disabled = opts.disableInferences ?? new Set<string>();
  const support = (id: string) => (opts.distrustClaims?.has(id) ? 0 : field.support.get(id) ?? 0);
  const conj = (premises: readonly string[]) => premises.reduce((acc, p) => acc * support(p), 1);

  const toPath = (inf: { id: string; type: string; strength: Strength; premises: string[]; warrant: string }): SupportPath => {
    const contribution = STRENGTH_FACTOR[inf.strength] * inferenceTrust(bundle, opts.overlayId, inf.id) * conj(inf.premises);
    return {
      inferenceId: inf.id, type: inf.type, strength: inf.strength, premises: inf.premises,
      warrant: inf.warrant, contribution, active: !disabled.has(inf.id) && contribution > EPSILON,
    };
  };

  return {
    claimId,
    support: support(claimId),
    positive: (graph.supports.get(claimId) ?? []).map(toPath),
    attacks: (graph.attacks.get(claimId) ?? []).map(toPath),
    undercuts: (graph.undercuts.get(claimId) ?? []).map(toPath),
  };
}
