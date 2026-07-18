import type { Bundle } from "@epistemic-git/protocol";
import { buildGraph, ClaimGraph } from "./graph.js";
import { computeSupport, type SupportOptions } from "./support.js";

/**
 * The perspective diff, the killer feature.
 *
 * Given two overlays over the SAME evidence, decompose their disagreement about a target claim
 * into per-node contributions: how much of the conclusion gap each claim accounts for. We do this
 * by one-at-a-time swaps, recompute overlay B's conclusion while adopting overlay A's belief for a
 * single node, and measure how far the conclusion moves. The node whose swap moves it most is the
 * crux. This is "show the load-bearing evidence" made concrete and quantitative, and it never asks
 * a model for a verdict; it is pure arithmetic over the two stated belief sets.
 */

function statedBelief(bundle: Bundle, overlayId: string, claimId: string): number | undefined {
  const a = bundle.assessments.find(
    (x) => x.overlayId === overlayId && x.target.kind === "claim" && x.target.id === claimId,
);
  if (!a) return undefined;
  if (a.credence !== undefined) return a.credence;
  return { accept: 0.85, uncertain: 0.5, reject: 0.15, irrelevant: 0.0 }[a.stance];
}

export interface NodeContribution {
  claimId: string;
  statement: string;
  beliefA: number;
  beliefB: number;
  /** signed change in the conclusion when B adopts A's belief for this node. */
  contribution: number;
  /** contribution as a fraction of the total gap in [0,1]. */
  shareOfGap: number;
}

export interface PerspectiveDiff {
  target: string;
  overlayA: string;
  overlayB: string;
  supportA: number;
  supportB: number;
  gap: number;
  /** portion of the gap not explained by single-node swaps (nonlinear interactions). */
  residual: number;
  contributions: NodeContribution[];
  topCrux: NodeContribution | undefined;
  /**
   * "quantitative" only when both overlays supply explicit credences on every contributing node, i.e.
   * a defensible probabilistic model exists. Otherwise "qualitative": the decomposition ranks structural
   * leverage from stances, and the percentages are relative weights, not calibrated probabilities.
   */
  mode: "quantitative" | "qualitative";
}

export function perspectiveDiff(
  bundleOrGraph: Bundle | ClaimGraph,
  overlayA: string,
  overlayB: string,
  target: string,
  opts: Pick<SupportOptions, "respectCorrelation" | "distrustClaims" | "disableInferences"> = {},
): PerspectiveDiff {
  const graph = bundleOrGraph instanceof ClaimGraph ? bundleOrGraph : buildGraph(bundleOrGraph);
  const bundle = graph.bundle;

  const fieldA = computeSupport(graph, { ...opts, overlayId: overlayA });
  const fieldB = computeSupport(graph, { ...opts, overlayId: overlayB });
  const supportA = fieldA.support.get(target) ?? 0;
  const supportB = fieldB.support.get(target) ?? 0;
  const gap = supportA - supportB;

  // Candidate nodes: claims the two overlays believe differently.
  const contributions: NodeContribution[] = [];
  for (const claim of graph.claims.values()) {
    if (claim.id === target) continue;
    const bA = statedBelief(bundle, overlayA, claim.id);
    const bB = statedBelief(bundle, overlayB, claim.id);
    if (bA === undefined && bB === undefined) continue;
    const beliefA = bA ?? 0.5;
    const beliefB = bB ?? 0.5;
    if (Math.abs(beliefA - beliefB) < 1e-9) continue;

    // Recompute B's conclusion, but with this one node set to A's belief.
    const swapped = computeSupport(graph, {
      ...opts, overlayId: overlayB, beliefOverrides: new Map([[claim.id, beliefA]]),
    });
    const contribution = (swapped.support.get(target) ?? 0) - supportB;
    contributions.push({
      claimId: claim.id, statement: claim.statement, beliefA, beliefB,
      contribution, shareOfGap: Math.abs(gap) > 1e-9 ? contribution / gap : 0,
    });
  }

  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const explained = contributions.reduce((acc, c) => acc + c.contribution, 0);

  // Quantitative only if BOTH overlays give an explicit credence on every contributing node.
  const hasCredence = (overlay: string, claimId: string) =>
    bundle.assessments.find((x) => x.overlayId === overlay && x.target.kind === "claim" && x.target.id === claimId)?.credence !== undefined;
  const quantitative =
    contributions.length > 0 && contributions.every((c) => hasCredence(overlayA, c.claimId) && hasCredence(overlayB, c.claimId));

  return {
    target, overlayA, overlayB, supportA, supportB, gap,
    residual: gap - explained,
    contributions,
    topCrux: contributions[0],
    mode: quantitative ? "quantitative" : "qualitative",
  };
}

export interface CruxRanking {
  claimId: string;
  statement: string;
  beliefA: number;
  beliefB: number;
  disagreement: number;
  /** expected reduction in the conclusion gap if this node were resolved (≈ |contribution|). */
  valueOfInformation: number;
}

/**
 * Value of information: rank the contested nodes by how much resolving them would reduce the
 * disagreement about the target. This answers "what is the single most useful thing to settle
 * next?" (the crux to chase) rather than merely restating who believes what.
 */
export function valueOfInformation(
  bundleOrGraph: Bundle | ClaimGraph, overlayA: string, overlayB: string, target: string,
  opts: Pick<SupportOptions, "respectCorrelation"> = {},
): CruxRanking[] {
  const diff = perspectiveDiff(bundleOrGraph, overlayA, overlayB, target, opts);
  return diff.contributions
    .map((c) => ({
      claimId: c.claimId, statement: c.statement, beliefA: c.beliefA, beliefB: c.beliefB,
      disagreement: Math.abs(c.beliefA - c.beliefB),
      valueOfInformation: Math.abs(c.contribution),
    }))
    .sort((a, b) => b.valueOfInformation - a.valueOfInformation);
}
