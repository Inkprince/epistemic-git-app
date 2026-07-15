import { readBundleFile } from "@epistemic-git/protocol/node";
import { merge } from "@epistemic-git/analysis";

/** Merge two bundle files and print the report. Usage: tsx scripts/merge-report.ts <a.jsonl> <b.jsonl> */
const [aPath, bPath] = process.argv.slice(2);
if (!aPath || !bPath) { console.error("usage: tsx scripts/merge-report.ts <a.jsonl> <b.jsonl>"); process.exit(1); }

const a = await readBundleFile(aPath);
const b = await readBundleFile(bPath);
const { report } = merge(a, b);

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
console.log("added:      ", JSON.stringify(report.added));
console.log("coalesced:  ", JSON.stringify(report.coalesced));
console.log("conflicts:  ", report.conflicts.length, report.conflicts.map((c) => `${c.kind}(${c.field})`).join(", "));
for (const c of report.conclusionsAffected) {
  console.log(`conclusion moved: ${pct(c.supportBefore)} → ${pct(c.supportAfter)}  "${c.statement.slice(0, 50)}…"`);
}
