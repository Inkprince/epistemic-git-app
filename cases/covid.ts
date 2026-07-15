import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BundleBuilder, validateBundle, serializeBundle } from "@epistemic-git/protocol";
import { writeBundleFile } from "@epistemic-git/protocol/node";
import { createLlmClientFromEnv } from "@epistemic-git/llm/node";
import { auditBundle, deriveCorrelationGroups, extractInto, inferArgument, matchClaims, PROMPT_VERSION } from "@epistemic-git/pipeline";

/**
 * COVID-origins: the Huanan-market spatial-clustering crux — a genuinely MULTI-SOURCE, contested case.
 *
 * Three real sources are ingested into one ledger: two from the same camp (Débarre & Worobey) arguing
 * the market is central, and one (Weissman) arguing proximity ascertainment bias makes the clustering
 * unreliable. Because all claims live in one bundle, cross-source MATCHING relates and contradicts
 * claims between the papers, and the adversarial AUDIT can flag that the two same-author papers are not
 * independent evidence — the exact "correlated evidence treated as independent" error at the heart of
 * the Rootclaim debate, surfaced automatically on real text.
 *
 * NOTE ON PROVENANCE: source texts are the papers' abstracts as retrieved from arXiv on 2026-07-14;
 * passages are verbatim quotes from those abstracts. The live pipeline grounds every claim in them.
 */

const here = dirname(fileURLToPath(import.meta.url));
const S = (f: string) => resolve(here, "../artifacts/sources/covid", f);

const SOURCES = [
  {
    file: S("debarre-worobey-centrality.txt"),
    title: "Confirmation of the centrality of the Huanan market among early COVID-19 cases",
    url: "https://arxiv.org/abs/2403.05859",
    authors: ["Florence Débarre", "Michael Worobey"],
    stance: "argues the Huanan market is the early epicentre",
  },
  {
    file: S("weissman-ascertainment-bias.txt"),
    title: "Proximity Ascertainment Bias in Early Covid Case Locations",
    url: "https://arxiv.org/abs/2401.08680",
    authors: ["M. B. Weissman"],
    stance: "argues proximity ascertainment bias makes the market clustering unreliable",
  },
  {
    file: S("debarre-worobey-reply.txt"),
    title: "No evidence of systematic proximity ascertainment bias in early COVID-19 cases — Reply to Weissman",
    url: "https://arxiv.org/abs/2405.08040",
    authors: ["Florence Débarre", "Michael Worobey"],
    stance: "rebuts the ascertainment-bias critique",
  },
] as const;

async function main() {
  const live = Boolean(process.env["CEREBRAS_API_KEY"]);
  const client = createLlmClientFromEnv({
    mode: live ? "live" : "cached",
    cacheDir: resolve(here, "../artifacts/.cache"),
    promptVersion: PROMPT_VERSION,
  });

  const b = new BundleBuilder({
    case: "covid",
    title: "COVID-19 origins: was the Huanan market the early epicentre?",
    question: "Do the early-case residential locations show the Huanan market was the epicentre, or is that clustering an artefact of ascertainment bias?",
    mode: live ? "live" : "cached",
  });

  // Ingest each source; the third shares authors with the first (recorded, so correlation is explicit).
  const ids: string[] = [];
  for (const s of SOURCES) {
    const sourceId = b.source({
      type: "preprint", title: s.title, url: s.url, authors: [...s.authors],
      publishedDate: "2024", reliability: { peerReviewStatus: "preprint", knownStance: s.stance },
      ...(ids.length === 2 ? { relatedSources: [{ sourceId: ids[0]!, relation: "same-authors" as const }] } : {}),
    });
    ids.push(sourceId);
    const text = await readFile(s.file, "utf8");
    console.error(`extract: ${s.title.slice(0, 50)}…`);
    const st = await extractInto(b, client, { sourceId, sourceTitle: s.title, text });
    console.error(`  grounded ${st.grounded} · quarantined ${st.quarantined} · chunks ${st.chunks}`);
  }

  let bundle = b.build();
  console.error(`Cross-source matching over ${bundle.claims.length} claims…`);
  bundle = (await matchClaims(bundle, client)).bundle;
  console.error(`  matches: ${bundle.matches.length}`);
  console.error(`Inferring argument structure…`);
  bundle = (await inferArgument(bundle, client)).bundle;
  console.error(`Auditing…`);
  bundle = (await auditBundle(bundle, client)).bundle;
  console.error(`  challenges: ${bundle.challenges.length}`);
  const corr = deriveCorrelationGroups(bundle);
  bundle = corr.bundle;
  console.error(`  correlation groups: ${corr.added} (same-author / same-dataset sources)`);

  const check = validateBundle(bundle);
  if (!check.ok) {
    console.error("COVID bundle FAILED validation:");
    for (const i of check.issues.filter((x) => x.severity === "error")) console.error(`  ${i.code}: ${i.message}`);
    process.exit(1);
  }

  const out = resolve(here, "../artifacts/covid.jsonl");
  await mkdir(dirname(out), { recursive: true });
  await writeBundleFile(out, bundle);
  await writeFile(resolve(here, "../artifacts/covid.json"), JSON.stringify(bundle, null, 2) + "\n", "utf8");
  console.error(`Wrote ${out} (+ covid.json) — ${serializeBundle(bundle).split("\n").length - 1} records`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
