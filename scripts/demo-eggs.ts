import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBundle } from "@epistemic-git/protocol";
import { computeSupport, perspectiveDiff, valueOfInformation } from "@epistemic-git/analysis";

/**
 * Eggs demo, the crux machinery on an everyday, messy nutrition question (the third case).
 * Two opposed readers attach different beliefs to one pipeline-built ledger; the deterministic diff
 * localizes their disagreement about "moderate eggs do not raise cardiovascular risk" and names the
 * crux, reported qualitatively, because manufacturing a dietary-risk probability would be false
 * precision. No model in the loop.
 */

const here = dirname(fileURLToPath(import.meta.url));
const b = parseBundle(readFileSync(resolve(here, "../artifacts/eggs.jsonl"), "utf8"));
const safe = b.overlays.find((o) => o.label.includes("safe"))!.id;
const risk = b.overlays.find((o) => o.label.includes("raise-risk"))!.id;
const concl = b.claims.find((c) => c.derived)!.id;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const line = "─".repeat(78);

console.log(`\n█ EPISTEMIC GIT, eggs & cardiovascular health (question decomposition + crux)`);
console.log(`  Question: ${b.question}`);
console.log(`  ${b.claims.length} claims · ${b.inferences.length} inferences · ${b.overlays.length} perspectives`);

console.log(`\n${line}\n1 · Two opposed readers over one ledger, how supported is "moderate eggs are safe"?\n${line}`);
const sSafe = computeSupport(b, { overlayId: safe, respectCorrelation: true }).support.get(concl)!;
const sRisk = computeSupport(b, { overlayId: risk, respectCorrelation: true }).support.get(concl)!;
console.log(`  Eggs-safe-in-moderation reading: ${pct(sSafe)}`);
console.log(`  Eggs-raise-risk reading:         ${pct(sRisk)}`);
console.log(`  Gap: ${pct(Math.abs(sSafe - sRisk))}`);

console.log(`\n${line}\n2 · Where the disagreement lives (deterministic decomposition)\n${line}`);
const diff = perspectiveDiff(b, safe, risk, concl, { respectCorrelation: true });
console.log(`  Mode: ${diff.mode}  (qualitative, no dietary-risk probability is manufactured)`);
for (const c of diff.contributions.slice(0, 4)) {
  if (Math.abs(c.shareOfGap) < 0.005) continue;
  console.log(`  ${pct(c.shareOfGap).padStart(7)}  ${c.statement.slice(0, 58)}`);
}

console.log(`\n${line}\n3 · The crux to settle next\n${line}`);
const voi = valueOfInformation(b, safe, risk, concl, { respectCorrelation: true });
for (const [i, c] of voi.slice(0, 2).entries()) {
  if (c.valueOfInformation < 0.005) continue;
  console.log(`  ${i + 1}. ${c.statement.slice(0, 60)}\n     value of resolving ≈ ${pct(c.valueOfInformation)} of the gap`);
}
console.log(`\n${line}\nThe crux is how much weight the all-cause-mortality association carries, surfaced structurally,`);
console.log(`not decided for you. "Eggs instead of what?" stays a first-class field. No model in the loop.\n${line}\n`);
