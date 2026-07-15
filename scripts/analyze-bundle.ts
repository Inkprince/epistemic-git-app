import { validateBundle } from "@epistemic-git/protocol";
import { readBundleFile } from "@epistemic-git/protocol/node";
import { computeSupport, explainSupport } from "@epistemic-git/analysis";

/** Load any bundle file and print a quick deterministic-analysis summary. */
const path = process.argv[2];
if (!path) { console.error("usage: tsx scripts/analyze-bundle.ts <bundle.jsonl>"); process.exit(1); }

const bundle = await readBundleFile(path);
const check = validateBundle(bundle);
console.log(`valid: ${check.ok} | claims: ${bundle.claims.length} | inferences: ${bundle.inferences.length} | quarantine: ${bundle.quarantine.length}`);

const conclusion = bundle.claims.find((c) => c.derived);
if (!conclusion) { console.log("no derived conclusion"); process.exit(0); }

const field = computeSupport(bundle);
const e = explainSupport(bundle, conclusion.id);
console.log(`conclusion: ${JSON.stringify(conclusion.statement)}`);
console.log(`neutral-prior support: ${((field.support.get(conclusion.id) ?? 0) * 100).toFixed(1)}%`);
console.log(`  supporting lines: ${e.positive.length} | attacks: ${e.attacks.length} | undercuts: ${e.undercuts.length}`);
