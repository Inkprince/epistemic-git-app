import { BundleBuilder } from "@epistemic-git/protocol";
import { describe, expect, it } from "vitest";
import { buildLhcBundle } from "../../../cases/lhc.js";
import { computeSupport, detectCorrelation, explainSupport, merge, perspectiveDiff, valueOfInformation } from "../src/index.js";

/**
 * A minimal argument: conclusion C is supported independently by two leaf claims L1 and L2.
 * Two overlays (A, B) differ only in how much they believe L1.
 */
function twoSupportBundle() {
  const b = new BundleBuilder({ case: "syn", title: "syn", question: "Does C hold?" });
  const human = { kind: "human" as const, ref: "author" };
  const l1 = b.claim({ statement: "Leaf one.", claimType: "empirical", derived: true, attribution: human });
  const l2 = b.claim({ statement: "Leaf two.", claimType: "empirical", derived: true, attribution: human });
  const c = b.claim({ statement: "Conclusion C.", claimType: "predictive", derived: true, attribution: human });
  b.inference({ type: "supports", premises: [l1], conclusion: c, warrant: "L1 ⇒ C", strength: "strong", attribution: human });
  b.inference({ type: "supports", premises: [l2], conclusion: c, warrant: "L2 ⇒ C", strength: "strong", attribution: human });

  const A = b.overlay({ label: "A", analyst: human });
  const B = b.overlay({ label: "B", analyst: human });
  const cT = (id: string) => ({ kind: "claim" as const, id });
  b.assess({ overlayId: A, target: cT(l1), stance: "accept", credence: 0.9 });
  b.assess({ overlayId: A, target: cT(l2), stance: "accept", credence: 0.9 });
  b.assess({ overlayId: B, target: cT(l1), stance: "reject", credence: 0.2 });
  b.assess({ overlayId: B, target: cT(l2), stance: "accept", credence: 0.9 });
  return { bundle: b.build(), ids: { l1, l2, c, A, B } };
}

describe("support propagation", () => {
  it("combines two independent supports by noisy-OR (stronger than either alone)", () => {
    const { bundle, ids } = twoSupportBundle();
    const f = computeSupport(bundle, { overlayId: ids.A });
    const s = f.support.get(ids.c)!;
    // each leaf contributes 0.9 * strength(0.9) = 0.81; noisy-OR(0.81, 0.81) ≈ 0.964
    expect(s).toBeGreaterThan(0.9);
    expect(s).toBeLessThan(1);
  });

  it("drop-node recompute: disabling one support leaves the other carrying the conclusion", () => {
    const { bundle, ids } = twoSupportBundle();
    const graph = bundle;
    const full = computeSupport(graph, { overlayId: ids.A }).support.get(ids.c)!;
    const infL1 = bundle.inferences.find((i) => i.premises.includes(ids.l1))!;
    const dropped = computeSupport(graph, { overlayId: ids.A, disableInferences: new Set([infL1.id]) }).support.get(ids.c)!;
    expect(dropped).toBeLessThan(full);
    expect(dropped).toBeGreaterThan(0.75); // the surviving support still carries it
  });
});

describe("perspective diff (disagreement decomposition)", () => {
  it("attributes the conclusion gap to the single node the overlays disagree on", () => {
    const { bundle, ids } = twoSupportBundle();
    const diff = perspectiveDiff(bundle, ids.A, ids.B, ids.c);
    expect(diff.gap).toBeGreaterThan(0);
    expect(diff.topCrux?.claimId).toBe(ids.l1); // L1 is the only disagreement → the crux
    // the single-node swap explains essentially the whole gap
    expect(Math.abs(diff.residual)).toBeLessThan(0.05);
  });
});

describe("value of information", () => {
  it("ranks the contested node as the most valuable to resolve", () => {
    const { bundle, ids } = twoSupportBundle();
    const voi = valueOfInformation(bundle, ids.A, ids.B, ids.c);
    expect(voi[0]?.claimId).toBe(ids.l1);
    expect(voi[0]?.valueOfInformation).toBeGreaterThan(0);
  });
});

describe("correlation-aware combination (anti double-counting)", () => {
  it("does not let correlated evidence stack like independent evidence", () => {
    const b = new BundleBuilder({ case: "corr", title: "corr", question: "Does C hold?" });
    const human = { kind: "human" as const, ref: "author" };
    const l1 = b.claim({ statement: "Finding from dataset D (angle 1).", claimType: "empirical", derived: true, attribution: human });
    const l2 = b.claim({ statement: "Finding from dataset D (angle 2).", claimType: "empirical", derived: true, attribution: human });
    const c = b.claim({ statement: "Conclusion C.", claimType: "predictive", derived: true, attribution: human });
    b.inference({ type: "supports", premises: [l1], conclusion: c, warrant: "w1", strength: "strong", attribution: human });
    b.inference({ type: "supports", premises: [l2], conclusion: c, warrant: "w2", strength: "strong", attribution: human });
    b.correlationGroup({ memberKind: "claim", members: [l1, l2], sharedOrigin: "dataset", rationale: "same dataset D" });
    const O = b.overlay({ label: "O", analyst: human });
    b.assess({ overlayId: O, target: { kind: "claim", id: l1 }, stance: "accept", credence: 0.9 });
    b.assess({ overlayId: O, target: { kind: "claim", id: l2 }, stance: "accept", credence: 0.9 });
    const bundle = b.build();

    const naive = computeSupport(bundle, { overlayId: O }).support.get(c)!;
    const aware = computeSupport(bundle, { overlayId: O, respectCorrelation: true }).support.get(c)!;
    expect(aware).toBeLessThan(naive); // correlated supports must not stack like independent ones
  });
});

describe("detectCorrelation (independence detector)", () => {
  it("groups source-grounded claims from two papers by the same authors", () => {
    const b = new BundleBuilder({ case: "corr", title: "corr", question: "?" });
    const s1 = b.source({ type: "paper", title: "Paper one", authors: ["A. Smith", "B. Jones"] });
    const s2 = b.source({ type: "paper", title: "Paper two", authors: ["B. Jones", "C. Lee"] }); // shares B. Jones
    const s3 = b.source({ type: "paper", title: "Independent paper", authors: ["Z. Independent"] });
    const psg1 = b.passage({ sourceId: s1, locator: { kind: "page", page: 1 }, verbatimText: "finding one" });
    const psg2 = b.passage({ sourceId: s2, locator: { kind: "page", page: 1 }, verbatimText: "finding two" });
    const psg3 = b.passage({ sourceId: s3, locator: { kind: "page", page: 1 }, verbatimText: "finding three" });
    b.claim({ statement: "Claim from paper one.", claimType: "empirical", passages: [psg1], attribution: { kind: "source", ref: s1 } });
    b.claim({ statement: "Claim from paper two.", claimType: "empirical", passages: [psg2], attribution: { kind: "source", ref: s2 } });
    b.claim({ statement: "Claim from the independent paper.", claimType: "empirical", passages: [psg3], attribution: { kind: "source", ref: s3 } });

    const groups = detectCorrelation(b.build());
    expect(groups.length).toBe(1); // only the two shared-author papers
    expect(groups[0]!.sharedOrigin).toBe("author");
    expect(groups[0]!.members.length).toBe(2);
  });
});

describe("merge (content-addressed compounding)", () => {
  it("unions nodes and preserves conflicting assessments explicitly", () => {
    const human = { kind: "human" as const, ref: "author" };
    const mk = (extraStatement: string, credence: number) => {
      const b = new BundleBuilder({ case: "m", title: "m", question: "Does C hold?" });
      const shared = b.claim({ statement: "Shared claim.", claimType: "empirical", derived: true, attribution: human });
      b.claim({ statement: extraStatement, claimType: "empirical", derived: true, attribution: human });
      const O = b.overlay({ label: "O", analyst: human });
      b.assess({ overlayId: O, target: { kind: "claim", id: shared }, stance: "accept", credence });
      return b.build();
    };
    const a = mk("Only in A.", 0.9);
    const bb = mk("Only in B.", 0.4); // same overlay + same target, different credence → conflict

    const { bundle, report } = merge(a, bb);
    expect(bundle.claims.length).toBe(3); // shared + A-only + B-only
    expect(report.added.claims).toBe(1); // B contributed one new claim
    expect(report.conflicts.some((c) => c.kind === "assessment")).toBe(true);
  });
});

describe("LHC integration — the flagship interaction", () => {
  const bundle = buildLhcBundle();
  const consensus = bundle.overlays.find((o) => o.label.includes("consensus"))!.id;
  const skeptic = bundle.overlays.find((o) => o.label.includes("skeptic"))!.id;
  const safe = bundle.claims.find((c) => c.derived && c.statement.includes("no credible danger"))!.id;
  const hawking = bundle.claims.find((c) => c.statement.startsWith("Any microscopic black hole would emit"))!.id;

  it("safety is well-supported for the consensus overlay", () => {
    const s = computeSupport(bundle, { overlayId: consensus }).support.get(safe)!;
    expect(s).toBeGreaterThan(0.85);
  });

  it("DROP HAWKING RADIATION: consensus safety survives via the empirical line", () => {
    const before = computeSupport(bundle, { overlayId: consensus }).support.get(safe)!;
    const after = computeSupport(bundle, { overlayId: consensus, distrustClaims: new Set([hawking]) }).support.get(safe)!;
    // safety barely moves — the cosmic-ray / white-dwarf line does not depend on Hawking radiation
    expect(after).toBeGreaterThan(0.8);
    expect(before - after).toBeLessThan(0.15);

    // and the surviving support path is the empirical one (Line B), not the Hawking one (Line A)
    const expl = explainSupport(bundle, safe, { overlayId: consensus, distrustClaims: new Set([hawking]) });
    const activeEmpirical = expl.positive.find((p) => p.premises.length >= 3 && p.active);
    expect(activeEmpirical).toBeDefined();
  });

  it("consensus and skeptic genuinely disagree, and the crux is nameable", () => {
    const diff = perspectiveDiff(bundle, consensus, skeptic, safe);
    expect(diff.gap).toBeGreaterThan(0.1);
    expect(diff.topCrux).toBeDefined();
    // the top crux should be one of the load-bearing contested nodes (Hawking or the empirical bound)
    expect(diff.contributions.length).toBeGreaterThan(0);
  });
});
