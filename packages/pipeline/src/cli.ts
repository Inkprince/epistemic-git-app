import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BundleBuilder, type Bundle, toNanopubTrig, validateBundle, type SourceType } from "@epistemic-git/protocol";
import { readBundleFile, writeBundleFile } from "@epistemic-git/protocol/node";
import { computeSupport, merge } from "@epistemic-git/analysis";
import type { LlmClient } from "@epistemic-git/llm";
import { createLlmClientFromEnv } from "@epistemic-git/llm/node";
import { PROMPT_VERSION } from "./prompts.js";
import { extractInto } from "./stages/extract.js";
import { matchClaims } from "./stages/match.js";
import { inferArgument } from "./stages/infer.js";
import { auditBundle } from "./stages/audit.js";
import { deriveCorrelationGroups } from "./stages/correlate.js";
import { loadSourceInput } from "./fetch-source.js";
import type { ScraperName } from "./scrape.js";
import { discoverSources } from "./discover.js";

/** Shared scraper options derived from the CLI flags, threaded into any URL retrieval. */
function scrapeOptsFrom(flags: Record<string, string>, live: boolean) {
  return {
    live,
    ...(flags["scraper"] ? { scraper: flags["scraper"] as ScraperName } : {}),
    log: (m: string) => console.error(m),
  };
}

/**
 * egit CLI, pipeline stages over the command line.
 *   extract  source text            → claims + passages (+ quarantine)
 *   infer    an existing bundle      → argument structure (inferences + conclusion)
 *   build    extract then infer      → a full argument bundle from one source
 *
 * Cached mode (default) needs no API key and replays the committed cache; --live calls Cerebras on a miss.
 */

function parseArgs(argv: string[]): { cmd: string; flags: Record<string, string>; bools: Set<string>; positionals: string[] } {
  const [cmd = "", ...rest] = argv;
  const flags: Record<string, string> = {};
  const bools = new Set<string>();
  const positionals: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (!a.startsWith("--")) { positionals.push(a); continue; }
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) bools.add(key);
    else { flags[key] = next; i++; }
  }
  return { cmd, flags, bools, positionals };
}

function makeClient(live: boolean): LlmClient {
  return createLlmClientFromEnv({
    mode: live ? "live" : "cached",
    cacheDir: resolve(process.cwd(), "artifacts", ".cache"),
    promptVersion: PROMPT_VERSION,
  });
}

async function finish(bundle: Bundle, outPath: string) {
  const result = validateBundle(bundle);
  if (!result.ok) {
    console.error("Produced bundle FAILED validation:");
    for (const issue of result.issues.filter((i) => i.severity === "error")) console.error(`  ${issue.code}: ${issue.message}`);
    process.exit(1);
  }
  await writeBundleFile(outPath, bundle);
  // also emit a plain-JSON sibling so the browser explorer can import it directly
  const jsonPath = outPath.replace(/\.jsonl?$/, "") + ".json";
  await writeFile(jsonPath, JSON.stringify(bundle, null, 2) + "\n", "utf8");
  console.error(`Wrote ${outPath} (+ ${jsonPath.split(/[\\/]/).pop()})`);
}

async function runExtract(flags: Record<string, string>, live: boolean): Promise<{ bundle: Bundle; outPath: string }> {
  const inPath = flags["in"];
  const title = flags["title"];
  if (!inPath || !title) { console.error('extract/build require --in <textfile|url> and --title "<title>"'); process.exit(1); }
  const type = (flags["type"] ?? "other") as SourceType;
  const caseName = flags["case"] ?? "adhoc";
  const question = flags["question"] ?? `What does “${title}” establish?`;
  const outPath = flags["out"] ?? resolve(process.cwd(), "artifacts", `${caseName}.jsonl`);
  const { text, url } = await loadSourceInput(inPath, flags["url"], scrapeOptsFrom(flags, live));

  const builder = new BundleBuilder({ case: caseName, title, question, mode: live ? "live" : "cached" });
  const sourceId = builder.source({ type, title, ...(url ? { url } : {}) });
  const client = makeClient(live);
  console.error(`Extracting from "${title}" (${live ? "live" : "cached"}, ${client.model})…`);
  const stats = await extractInto(builder, client, { sourceId, sourceTitle: title, text });
  console.error(`  extracted ${stats.extracted} · grounded ${stats.grounded} · quarantined ${stats.quarantined}`);
  return { bundle: builder.build(), outPath };
}

async function main() {
  const { cmd, flags, bools, positionals } = parseArgs(process.argv.slice(2));
  const live = bools.has("live");
  const at = (i: number) => positionals[i] ?? "";

  if (cmd === "verify") {
    const inPath = at(0) || flags["in"];
    if (!inPath) { console.error("verify requires a bundle path: egit verify <bundle.jsonl>"); process.exit(1); }
    const b = await readBundleFile(resolve(process.cwd(), inPath));
    const r = validateBundle(b);
    for (const i of r.issues) console.error(`  [${i.severity}] ${i.code}: ${i.message}`);
    console.error(r.ok
      ? `OK, ${b.claims.length} claims · ${b.inferences.length} inferences · ${b.matches.length} matches · ${r.issues.length} warning(s)`
      : `INVALID, ${r.issues.filter((i) => i.severity === "error").length} error(s)`);
    process.exit(r.ok ? 0 : 1);
  }

  if (cmd === "export-nanopub") {
    const inPath = at(0) || flags["in"];
    if (!inPath) { console.error("export-nanopub requires a bundle path: egit export-nanopub <bundle.jsonl> [--out x.trig]"); process.exit(1); }
    const b = await readBundleFile(resolve(process.cwd(), inPath));
    const trig = toNanopubTrig(b);
    const out = flags["out"] ?? resolve(process.cwd(), inPath).replace(/\.jsonl?$/, "") + ".trig";
    await writeFile(out, trig, "utf8");
    console.error(`Wrote ${out}, ${b.claims.length + b.inferences.length} nanopublications`);
    return;
  }

  if (cmd === "add-source") {
    const inPath = flags["in"]; const srcPath = flags["source-in"]; const title = flags["title"];
    if (!inPath || !srcPath || !title) {
      console.error('add-source requires --in <bundle.jsonl> --source-in <textfile|url> --title "<title>" [--type <t>] [--url <u>] [--out <path>] [--live]');
      process.exit(1);
    }
    const existing = await readBundleFile(resolve(process.cwd(), inPath));
    const conclusion = existing.claims.find((c) => c.derived);
    const before = conclusion ? computeSupport(existing).support.get(conclusion.id) ?? null : null;

    const { text, url } = await loadSourceInput(srcPath, flags["url"], scrapeOptsFrom(flags, live));
    const client = makeClient(live);
    // Extract the new source into a mini-bundle sharing the case, then merge it in (non-destructive).
    const mini = new BundleBuilder({ case: existing.case, title: existing.title, question: existing.question, mode: live ? "live" : "cached" });
    const sid = mini.source({ type: (flags["type"] ?? "other") as SourceType, title, ...(url ? { url } : {}) });
    console.error(`Extracting new source "${title}" (${live ? "live" : "cached"})…`);
    const est = await extractInto(mini, client, { sourceId: sid, sourceTitle: title, text });

    let merged = merge(existing, mini.build()).bundle;
    console.error(`Re-matching across the expanded ledger…`);
    merged = (await matchClaims(merged, client)).bundle;
    merged = deriveCorrelationGroups(merged).bundle;
    const after = conclusion ? computeSupport(merged).support.get(conclusion.id) ?? null : null;

    console.error(`Update diff:`);
    console.error(`  + ${merged.claims.length - existing.claims.length} claims · ${merged.passages.length - existing.passages.length} passages · ${merged.matches.length - existing.matches.length} matches · ${merged.challenges.length - existing.challenges.length} challenges  (extraction: grounded ${est.grounded}, quarantined ${est.quarantined})`);
    if (conclusion && before != null && after != null) {
      const moved = Math.abs(after - before) > 1e-6;
      console.error(`  ${moved ? "!" : "="} conclusion support: ${(before * 100).toFixed(1)}% → ${(after * 100).toFixed(1)}%${moved ? "" : " (unchanged until re-inference, run `egit infer` to connect the new evidence)"}`);
    }
    await finish(merged, flags["out"] ?? resolve(process.cwd(), inPath));
    return;
  }

  if (cmd === "discover") {
    const query = flags["query"] ?? positionals.join(" ").trim();
    if (!query) { console.error('discover requires a query: egit discover --query "<topic>" [--limit n] [--live]'); process.exit(1); }
    const limit = Number(flags["limit"]) > 0 ? Number(flags["limit"]) : undefined;
    const result = await discoverSources(query, {
      live, ...(limit ? { limit } : {}), log: (m) => console.error(m),
    });
    if (result.candidates.length === 0) { console.error("No candidate sources found."); return; }
    console.error(`\nCandidate sources for “${result.query}” (proposals, nothing admitted; review, then add the ones you trust):\n`);
    for (const c of result.candidates) {
      console.error(`  ${String(c.rank).padStart(2)}. ${c.title}`);
      console.error(`      ${c.url}`);
      if (c.description) console.error(`      ${c.description.slice(0, 140)}${c.description.length > 140 ? "…" : ""}`);
    }
    console.error(`\nAdmit one explicitly, e.g.:\n  egit add-source --in artifacts/<case>.jsonl --source-in "${result.candidates[0]!.url}" --title "<title>" --live`);
    return;
  }

  if (cmd === "merge") {
    const [aPath, bPath] = [at(0), at(1)];
    if (!aPath || !bPath) { console.error("merge requires two bundles: egit merge <a.jsonl> <b.jsonl> [--out merged.jsonl]"); process.exit(1); }
    const a = await readBundleFile(resolve(process.cwd(), aPath));
    const b = await readBundleFile(resolve(process.cwd(), bPath));
    const { bundle, report } = merge(a, b);
    console.error(`Merge report:`);
    console.error(`  + added:     ${JSON.stringify(report.added)}`);
    console.error(`  ~ coalesced: ${JSON.stringify(report.coalesced)}`);
    console.error(`  ! conflicts: ${report.conflicts.length}${report.conflicts.length ? " (" + report.conflicts.map((c) => c.kind).join(", ") + ")" : ""}`);
    for (const c of report.conclusionsAffected) {
      console.error(`  ! conclusion moved: ${(c.supportBefore * 100).toFixed(1)}% → ${(c.supportAfter * 100).toFixed(1)}%  "${c.statement.slice(0, 48)}…"`);
    }
    await finish(bundle, flags["out"] ?? resolve(process.cwd(), "artifacts", `${bundle.case}-merged.jsonl`));
    return;
  }

  if (cmd === "extract") {
    const { bundle, outPath } = await runExtract(flags, live);
    await finish(bundle, outPath);
    return;
  }

  if (cmd === "build") {
    const { bundle: extracted, outPath } = await runExtract(flags, live);
    const client = makeClient(live);
    console.error(`Matching claims…`);
    const matched = await matchClaims(extracted, client);
    console.error(`  matches: proposed ${matched.stats.proposed} · added ${matched.stats.added} · dropped ${matched.stats.dropped}`);
    console.error(`Reconstructing argument structure over ${matched.bundle.claims.length} claims…`);
    const inferred = await inferArgument(matched.bundle, client);
    console.error(`  inferences: proposed ${inferred.stats.proposed} · added ${inferred.stats.added} · conclusion ${inferred.stats.conclusionAdded ? "yes" : "no"}`);
    console.error(`Auditing the argument…`);
    const audited = await auditBundle(inferred.bundle, client);
    console.error(`  challenges: proposed ${audited.stats.proposed} · added ${audited.stats.added} · dropped ${audited.stats.dropped}`);
    const correlated = deriveCorrelationGroups(audited.bundle);
    if (correlated.added) console.error(`  correlation groups derived: ${correlated.added}`);
    await finish(correlated.bundle, outPath);
    return;
  }

  if (cmd === "match") {
    const inPath = flags["in"];
    if (!inPath) { console.error("match requires --in <bundle.jsonl>"); process.exit(1); }
    const loaded = await readBundleFile(resolve(process.cwd(), inPath));
    const client = makeClient(live);
    console.error(`Matching ${loaded.claims.length} claims (${live ? "live" : "cached"}, ${client.model})…`);
    const { bundle, stats } = await matchClaims(loaded, client);
    console.error(`  matches: proposed ${stats.proposed} · added ${stats.added} · dropped ${stats.dropped}`);
    await finish(bundle, flags["out"] ?? resolve(process.cwd(), inPath));
    return;
  }

  if (cmd === "audit") {
    const inPath = flags["in"];
    if (!inPath) { console.error("audit requires --in <bundle.jsonl>"); process.exit(1); }
    const loaded = await readBundleFile(resolve(process.cwd(), inPath));
    const client = makeClient(live);
    console.error(`Auditing ${loaded.claims.length} claims / ${loaded.inferences.length} inferences (${live ? "live" : "cached"}, ${client.model})…`);
    const { bundle, stats } = await auditBundle(loaded, client);
    console.error(`  challenges: proposed ${stats.proposed} · added ${stats.added} · dropped ${stats.dropped}`);
    await finish(bundle, flags["out"] ?? resolve(process.cwd(), inPath));
    return;
  }

  if (cmd === "infer") {
    const inPath = flags["in"];
    if (!inPath) { console.error("infer requires --in <bundle.jsonl>"); process.exit(1); }
    const loaded = await readBundleFile(resolve(process.cwd(), inPath));
    const client = makeClient(live);
    console.error(`Reconstructing argument structure over ${loaded.claims.length} claims (${live ? "live" : "cached"}, ${client.model})…`);
    const { bundle, stats } = await inferArgument(loaded, client);
    console.error(`  inferences: proposed ${stats.proposed} · added ${stats.added} · conclusion ${stats.conclusionAdded ? "yes" : "no"}`);
    await finish(bundle, flags["out"] ?? resolve(process.cwd(), inPath));
    return;
  }

  console.error(`Usage:
  egit extract --in <textfile|url> --title "<title>" --type <paper|report|blog|news|…> [--case <c>] [--question "<q>"] [--url <u>] [--out <path>] [--live]
  egit build   <same flags as extract>            # extract → match → infer → audit → correlate
  egit match   --in <bundle.jsonl> [--out <path>] [--live]
  egit infer   --in <bundle.jsonl> [--out <path>] [--live]
  egit audit   --in <bundle.jsonl> [--out <path>] [--live]
  egit add-source --in <bundle.jsonl> --source-in <textfile|url> --title "<t>" [--type <t>] [--url <u>] [--out <path>] [--live]
  egit discover --query "<topic>" [--limit n] [--live]   # propose candidate sources (Firecrawl); admits nothing

  --in / --source-in accept a local file OR an http(s) URL (the URL is recorded as the source link unless
  --url overrides). --scraper native (default, no key) | firecrawl (renders JS/markdown; needs
  FIRECRAWL_API_KEY + --live) | auto. Retrieval fetches a source you name; discover proposes candidates
  for you to review, neither searches-and-decides for you, and nothing is admitted without an explicit add-source.
  egit verify        <bundle.jsonl>                # validate schema + provenance + id integrity
  egit export-nanopub <bundle.jsonl> [--out x.trig] # emit Nanopublication TriG
  egit merge   <a.jsonl> <b.jsonl> [--out merged.jsonl]   # content-addressed merge + report`);
  process.exit(cmd ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
