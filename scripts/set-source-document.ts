import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateBundle, serializeBundle, type Bundle } from "@epistemic-git/protocol";
import { scrapeUrl } from "@epistemic-git/pipeline";

/**
 * Set `bundle.sourceDocument` (the primary/first source's raw document) on already-committed bundles
 * so their cases can show the original text the app and AI decomposed. sourceDocument is a
 * non-identity meta field, so this changes no content-addressed id (the script asserts `bundle.id` is
 * unchanged and re-validates). Covid's primary document is a committed .txt; eggs' is re-fetched from
 * the content-addressed scrape cache. Re-running the author scripts is deliberately avoided, since
 * that would regenerate authored text and undo the committed de-dash work.
 *
 * Run: node --env-file=.env --import tsx scripts/set-source-document.ts
 */

const repoRoot = resolve(process.cwd());
const cacheDir = resolve(repoRoot, "artifacts", ".cache");

// Covid's first source is committed verbatim as a .txt; match its bundle source by URL.
const COVID_PRIMARY_URL = "https://arxiv.org/abs/2403.05859";
const COVID_PRIMARY_FILE = "artifacts/sources/covid/debarre-worobey-centrality.txt";

async function textForUrl(url: string): Promise<string> {
  if (url === COVID_PRIMARY_URL) return readFileSync(resolve(repoRoot, COVID_PRIMARY_FILE), "utf8");
  const scraped = await scrapeUrl(url, { live: true, env: process.env, cacheDir, log: (m) => console.error("  " + m) });
  return scraped.text;
}

async function setPrimary(rel: string): Promise<void> {
  const path = resolve(repoRoot, rel);
  const bundle = JSON.parse(readFileSync(path, "utf8")) as Bundle;
  const idBefore = bundle.id;
  const primary = bundle.sources[0];
  if (!primary) { console.error(`${rel}: no sources, skipped`); return; }
  const text = await textForUrl(primary.url ?? "");
  if (!text || text.trim().length === 0) { console.error(`${rel}: no raw text for primary source, skipped`); return; }
  bundle.sourceDocument = {
    text: text.slice(0, 500_000),
    ...(primary.title ? { title: primary.title } : {}),
    ...(primary.url ? { url: primary.url } : {}),
  };
  if (bundle.id !== idBefore) { console.error(`${rel}: FATAL, bundle id changed`); process.exit(1); }
  const check = validateBundle(bundle);
  if (!check.ok) {
    console.error(`${rel}: FAILED validation`);
    for (const i of check.issues.filter((x) => x.severity === "error")) console.error(`  ${i.code}: ${i.message}`);
    process.exit(1);
  }
  writeFileSync(path, JSON.stringify(bundle, null, 2) + "\n", "utf8");
  writeFileSync(path.replace(/\.json$/, ".jsonl"), serializeBundle(bundle), "utf8");
  console.error(`${rel}: primary document set (${bundle.sourceDocument.text.length} chars from "${primary.title?.slice(0, 48)}")`);
}

const files = process.argv.slice(2);
if (!files.length) { console.error("usage: set-source-document.ts <bundle.json> ..."); process.exit(1); }
for (const f of files) await setPrimary(f);
