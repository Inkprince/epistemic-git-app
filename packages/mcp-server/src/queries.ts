import type { Bundle } from "@epistemic-git/protocol";
import { computeSupport, explainSupport, perspectiveDiff, valueOfInformation } from "@epistemic-git/analysis";

/**
 * Read-only, deterministic queries over a bundle. Every function is a pure transform (bundle + args)
 * → plain serializable object, no LLM, no mutation. The MCP server is a thin wrapper over these, so
 * a downstream model interrogating the ledger gets structured, provenance-backed answers it can verify,
 * never a fresh opinion.
 */

function conclusionOf(bundle: Bundle) {
  return bundle.claims.find((c) => c.derived) ?? bundle.claims[bundle.claims.length - 1];
}

export function overview(bundle: Bundle) {
  const c = conclusionOf(bundle);
  return {
    case: bundle.case,
    question: bundle.question,
    conclusion: c ? { id: c.id, statement: c.statement } : null,
    counts: {
      sources: bundle.sources.length, claims: bundle.claims.length, inferences: bundle.inferences.length,
      matches: bundle.matches.length, challenges: bundle.challenges.length, quarantine: bundle.quarantine.length,
    },
    overlays: bundle.overlays.map((o) => ({ id: o.id, label: o.label })),
  };
}

export function getClaim(bundle: Bundle, id: string) {
  const claim = bundle.claims.find((c) => c.id === id);
  if (!claim) return { error: `no claim ${id}` };
  const support = computeSupport(bundle).support.get(id) ?? null;
  return {
    ...claim,
    neutralSupport: support,
    challenges: bundle.challenges.filter((c) => c.target.kind === "claim" && c.target.id === id)
      .map((c) => ({ type: c.challengeType, rationale: c.rationale, status: c.status })),
  };
}

export function traceProvenance(bundle: Bundle, claimId: string) {
  const claim = bundle.claims.find((c) => c.id === claimId);
  if (!claim) return { error: `no claim ${claimId}` };
  const passages = claim.passages.map((pid) => {
    const p = bundle.passages.find((x) => x.id === pid);
    const src = p ? bundle.sources.find((s) => s.id === p.sourceId) : undefined;
    return p ? { verbatimText: p.verbatimText, locator: p.locator, source: src?.title, url: src?.url } : { error: `missing passage ${pid}` };
  });
  return { claim: claim.statement, attribution: claim.attribution, derived: claim.derived, passages };
}

export function listChallenges(bundle: Bundle) {
  return bundle.challenges.map((c) => ({
    type: c.challengeType, target: c.target, rationale: c.rationale, status: c.status,
  }));
}

export function listMatches(bundle: Bundle) {
  const stmt = (id: string) => bundle.claims.find((c) => c.id === id)?.statement ?? id;
  return bundle.matches.map((m) => ({ type: m.type, from: stmt(m.from), to: stmt(m.to), rationale: m.rationale }));
}

export function support(bundle: Bundle, args: { overlayId?: string | undefined; distrust?: string[] | undefined }) {
  const c = conclusionOf(bundle);
  const field = computeSupport(bundle, {
    ...(args.overlayId ? { overlayId: args.overlayId } : {}),
    ...(args.distrust?.length ? { distrustClaims: new Set(args.distrust) } : {}),
    respectCorrelation: true,
  });
  const expl = c ? explainSupport(bundle, c.id, {
    ...(args.overlayId ? { overlayId: args.overlayId } : {}),
    ...(args.distrust?.length ? { distrustClaims: new Set(args.distrust) } : {}),
    respectCorrelation: true,
  }) : null;
  return {
    conclusion: c ? { id: c.id, statement: c.statement, support: field.support.get(c.id) ?? 0 } : null,
    supportingLines: expl?.positive.map((p) => ({ inference: p.inferenceId, contribution: p.contribution, active: p.active, warrant: p.warrant })) ?? [],
    attacks: expl?.attacks.map((p) => ({ inference: p.inferenceId, contribution: p.contribution })) ?? [],
  };
}

export function perspectiveDiffQuery(bundle: Bundle, args: { overlayA: string; overlayB: string; target?: string | undefined }) {
  const target = args.target ?? conclusionOf(bundle)?.id;
  if (!target) return { error: "no target claim" };
  const d = perspectiveDiff(bundle, args.overlayA, args.overlayB, target, { respectCorrelation: true });
  return {
    target, mode: d.mode, supportA: d.supportA, supportB: d.supportB, gap: d.gap, residual: d.residual,
    contributions: d.contributions.slice(0, 8).map((c) => ({ statement: c.statement, beliefA: c.beliefA, beliefB: c.beliefB, shareOfGap: c.shareOfGap })),
    topCrux: d.topCrux ? { statement: d.topCrux.statement, shareOfGap: d.topCrux.shareOfGap } : null,
  };
}

export function listCruxes(bundle: Bundle, args: { overlayA: string; overlayB: string; target?: string | undefined }) {
  const target = args.target ?? conclusionOf(bundle)?.id;
  if (!target) return { error: "no target claim" };
  return valueOfInformation(bundle, args.overlayA, args.overlayB, target, { respectCorrelation: true })
    .slice(0, 8)
    .map((c) => ({ statement: c.statement, disagreement: c.disagreement, valueOfInformation: c.valueOfInformation }));
}
