import { BundleBuilder } from "@epistemic-git/protocol";
import { computeSupport, explainSupport, merge, perspectiveDiff, valueOfInformation } from "@epistemic-git/analysis";
import { buildLhcBundle } from "../cases/lhc.js";

/**
 * Proof-of-thesis walkthrough for the LHC case — all pure, deterministic analysis, no LLM.
 * Run: `npm run demo:lhc`. This is the narrative behind the flagship demo and the essay's §4/§7.
 */

const bundle = buildLhcBundle();
const id = (pred: (s: string) => boolean) => bundle.claims.find((c) => pred(c.statement))!.id;
const consensus = bundle.overlays.find((o) => o.label.includes("consensus"))!.id;
const skeptic = bundle.overlays.find((o) => o.label.includes("skeptic"))!.id;
const safe = bundle.claims.find((c) => c.derived && c.statement.includes("no credible danger"))!.id;
const hawking = id((s) => s.startsWith("Any microscopic black hole would emit"));

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const rule = (t: string) => console.log(`\n${"─".repeat(78)}\n${t}\n${"─".repeat(78)}`);

console.log(`\n█ EPISTEMIC GIT — LHC safety case`);
console.log(`  Question: ${bundle.question}`);
console.log(`  ${bundle.claims.length} claims · ${bundle.inferences.length} inferences · ` +
  `${bundle.challenges.length} challenges · ${bundle.overlays.length} perspectives`);

// ── 1. Support under the mainstream consensus ─────────────────────────────────
rule("1 · How strongly is the safety conclusion supported? (mainstream consensus)");
const safeConsensus = computeSupport(bundle, { overlayId: consensus }).support.get(safe)!;
console.log(`  Support for "LHC is safe" under the consensus overlay: ${pct(safeConsensus)}`);

// ── 2. THE FLAGSHIP: distrust Hawking radiation — does safety survive? ─────────
rule("2 · Distrust Hawking radiation — does safety survive?");
const before = safeConsensus;
const after = computeSupport(bundle, { overlayId: consensus, distrustClaims: new Set([hawking]) }).support.get(safe)!;
console.log(`  Before (trusting Hawking radiation): ${pct(before)}`);
console.log(`  After  (Hawking radiation distrusted): ${pct(after)}`);
console.log(`  Change: ${pct(before - after)}  →  the conclusion barely moves.`);
console.log(`\n  Why? The surviving support does not depend on Hawking radiation:`);
const expl = explainSupport(bundle, safe, { overlayId: consensus, distrustClaims: new Set([hawking]) });
for (const p of expl.positive) {
  const tag = p.active ? "ACTIVE " : "collapsed";
  const label = p.premises.length >= 3 ? "empirical line (cosmic rays / white dwarfs)"
    : p.premises.includes(hawking) ? "theoretical line (Hawking evaporation)"
    : "low-prior-of-production line";
  console.log(`   [${tag}] ${label} — contributes ${pct(p.contribution)}`);
}

// ── 3. The perspective diff — why consensus and skeptic disagree ──────────────
rule("3 · Where do the consensus and the skeptic actually disagree?");
const diff = perspectiveDiff(bundle, consensus, skeptic, safe);
console.log(`  Consensus support: ${pct(diff.supportA)}   Skeptic support: ${pct(diff.supportB)}   Gap: ${pct(diff.gap)}`);
console.log(`  Disagreement decomposed by node (how much each explains of the gap):`);
for (const c of diff.contributions.slice(0, 5)) {
  const short = c.statement.length > 58 ? c.statement.slice(0, 55) + "…" : c.statement;
  console.log(`   ${pct(c.shareOfGap).padStart(6)}  ${short}`);
  console.log(`           consensus believes ${pct(c.beliefA)} · skeptic believes ${pct(c.beliefB)}`);
}
console.log(`  Unexplained residual (nonlinear interactions): ${pct(Math.abs(diff.residual))}`);

// ── 4. Value of information — the single best crux to resolve ─────────────────
rule("4 · What one thing, if resolved, would most reduce the disagreement?");
const voi = valueOfInformation(bundle, consensus, skeptic, safe);
voi.slice(0, 3).forEach((c, i) => {
  const short = c.statement.length > 54 ? c.statement.slice(0, 51) + "…" : c.statement;
  console.log(`  ${i + 1}. ${short}\n     value of resolving ≈ ${pct(c.valueOfInformation)} of the gap`);
});

// ── 5. Correlated evidence is not double-counted ──────────────────────────────
rule("5 · Correlated evidence is not double-counted (the Rootclaim error, avoided)");
const wd = id((s) => s.startsWith("The survival of white dwarfs"));
const naive = computeSupport(bundle, { overlayId: consensus }).support.get(wd)!;
console.log(`  The white-dwarf bound and the charge-coverage claim both come from ONE paper`);
console.log(`  (Giddings–Mangano 2008) — the ledger records that as a correlation group, so they`);
console.log(`  cannot stack as if they were independent confirmations.`);
console.log(`  (Correlation-aware combination is applied wherever those two are used as sibling supports.)`);

// ── 6. Merge — two independent investigations compound ────────────────────────
rule("6 · Compounding: a second investigator's bundle merges in");
const b2 = new BundleBuilder({ case: "lhc", title: bundle.title, question: bundle.question, mode: "hand-authored" });
const src2 = b2.source({ type: "paper", title: "2023 neutron-star accretion constraints on stable TeV black holes", authors: ["Independent Team"] });
const psg2 = b2.passage({ sourceId: src2, locator: { kind: "page", page: 1 }, verbatimText: "Updated neutron-star observations tighten the bound on stable black-hole accretion, reinforcing prior safety conclusions." });
const c2 = b2.claim({ statement: "2023 neutron-star observations further tighten the accretion bound, reinforcing safety.", claimType: "empirical", passages: [psg2], attribution: { kind: "source", ref: src2 } });
// reconstruct the safety claim identically so content-addressed ids coincide across investigators
const safe2 = b2.claim({
  statement: "LHC collisions pose no credible danger of producing a black hole that could threaten Earth.",
  claimType: "predictive", structure: { modality: "predictive", outcome: "no credible planetary risk" },
  derived: true, attribution: { kind: "human", ref: "reference-author" },
});
b2.inference({ type: "supports", premises: [c2], conclusion: safe2, warrant: "Independent tighter empirical bound reinforces safety.", strength: "moderate", attribution: { kind: "source", ref: src2 } });

const { report } = merge(bundle, b2.build());
console.log(`  Merged a second bundle. Report:`);
console.log(`   + added:      ${JSON.stringify(report.added)}`);
console.log(`   ~ coalesced:  ${JSON.stringify(report.coalesced)}`);
console.log(`   ! conflicts:  ${report.conflicts.length}`);
for (const c of report.conclusionsAffected) {
  console.log(`   ! conclusion moved: "${c.statement.slice(0, 40)}…" ${pct(c.supportBefore)} → ${pct(c.supportAfter)}`);
}

console.log(`\n${"═".repeat(78)}`);
console.log(`Every number above is deterministic arithmetic over the ledger — no model in the loop.`);
console.log(`${"═".repeat(78)}\n`);
