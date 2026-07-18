import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBundle } from "@epistemic-git/protocol";
import { computeSupport, perspectiveDiff, valueOfInformation } from "@epistemic-git/analysis";

/**
 * COVID demo, the centerpiece on a LIVE, contested case (companion to demo-lhc.ts).
 *
 * The LHC demo shows the crux machinery on a settled question. This shows the SAME deterministic,
 * LLM-free machinery on a bitter, unsettled one: two opposed readers attach different beliefs to one
 * shared, pipeline-built ledger, and we decompose exactly where their disagreement about "the Huanan
 * market was the early epicentre" lives, without announcing any origin probability. Every number below
 * is arithmetic over the committed bundle; no model is in the loop.
 */

const here = dirname(fileURLToPath(import.meta.url));
const bundle = parseBundle(readFileSync(resolve(here, "../artifacts/covid.jsonl"), "utf8"));

const central = bundle.overlays.find((o) => o.label.includes("Market-central"))!.id;
const skeptic = bundle.overlays.find((o) => o.label.includes("Ascertainment"))!.id;
const concl = bundle.claims.find((c) => c.derived && c.statement.includes("early epicentre"))!.id;

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const line = "─".repeat(78);

console.log(`\n█ EPISTEMIC GIT, COVID-19 origins (Huanan-market clustering crux)`);
console.log(`  Question: ${bundle.question}`);
console.log(`  ${bundle.claims.length} claims · ${bundle.inferences.length} inferences · ${bundle.matches.length} matches · ${bundle.overlays.length} perspectives`);

console.log(`\n${line}\n1 · Two opposed readers, one shared ledger, how supported is "market = epicentre"?\n${line}`);
const sC = computeSupport(bundle, { overlayId: central, respectCorrelation: true }).support.get(concl)!;
const sS = computeSupport(bundle, { overlayId: skeptic, respectCorrelation: true }).support.get(concl)!;
console.log(`  Market-central reading:     ${pct(sC)}`);
console.log(`  Ascertainment-bias reading: ${pct(sS)}`);
console.log(`  Gap: ${pct(Math.abs(sC - sS))}`);

console.log(`\n${line}\n2 · Where does the disagreement actually live? (deterministic decomposition)\n${line}`);
const diff = perspectiveDiff(bundle, central, skeptic, concl, { respectCorrelation: true });
console.log(`  Mode: ${diff.mode}  (qualitative on purpose, no origin probability is manufactured)`);
for (const c of diff.contributions.slice(0, 5)) {
  if (Math.abs(c.shareOfGap) < 0.005) continue;
  console.log(`  ${pct(c.shareOfGap).padStart(6)}  ${c.statement.slice(0, 62)}`);
}
console.log(`  Unexplained residual (nonlinear interactions): ${pct(diff.residual)}`);

console.log(`\n${line}\n3 · What one thing, if resolved, would most reduce the disagreement?\n${line}`);
for (const [i, c] of valueOfInformation(bundle, central, skeptic, concl, { respectCorrelation: true }).slice(0, 3).entries()) {
  if (c.valueOfInformation < 0.005) continue;
  console.log(`  ${i + 1}. ${c.statement.slice(0, 60)}\n     value of resolving ≈ ${pct(c.valueOfInformation)} of the gap`);
}

console.log(`\n${line}`);
console.log(`Every number is deterministic arithmetic over the committed ledger, no model in the loop.`);
console.log(`The bundle deliberately announces NO origin probability; it localizes the crux, not a verdict.`);
console.log(`${line}\n`);
