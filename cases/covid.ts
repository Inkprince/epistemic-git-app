import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BundleBuilder, validateBundle, serializeBundle,
  overlayId, assessmentId, inferenceId,
  type Overlay, type Assessment, type Attribution, type Stance, type Inference,
} from "@epistemic-git/protocol";
import { writeBundleFile } from "@epistemic-git/protocol/node";
import { createLlmClientFromEnv, hasLlmKey } from "@epistemic-git/llm/node";
import { auditBundle, deriveCorrelationGroups, extractInto, inferArgument, matchClaims, PROMPT_VERSION } from "@epistemic-git/pipeline";

/**
 * COVID-origins: the Huanan-market spatial-clustering crux, a genuinely MULTI-SOURCE, contested case.
 *
 * Three real sources are ingested into one ledger: two from the same camp (Débarre & Worobey) arguing
 * the market is central, and one (Weissman) arguing proximity ascertainment bias makes the clustering
 * unreliable. Because all claims live in one bundle, cross-source MATCHING relates and contradicts
 * claims between the papers, and the adversarial AUDIT can flag that the two same-author papers are not
 * independent evidence, the exact "correlated evidence treated as independent" error at the heart of
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
    title: "No evidence of systematic proximity ascertainment bias in early COVID-19 cases, Reply to Weissman",
    url: "https://arxiv.org/abs/2405.08040",
    authors: ["Florence Débarre", "Michael Worobey"],
    stance: "rebuts the ascertainment-bias critique",
  },
] as const;

async function main() {
  const live = hasLlmKey(process.env);
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

  // ── Opposed perspectives (overlays) + assessments, the SAME structure, read two ways ──────────
  //
  // This is the point of the whole system on a LIVE dispute: two readers who disagree attach
  // different credences to the one shared ledger, and the perspective-diff (in packages/analysis)
  // then decomposes exactly which node carries their disagreement about "the market was the early
  // epicentre" without either reader having to accept the other's conclusion, and with no model in
  // the loop. Claims are pipeline-generated, so we key each assessment to a claim by a stable,
  // self-documenting substring of its statement; the ids are content-addressed and reproduce from
  // cache, and this authoring adds only Overlay/Assessment nodes (existing ids never change).
  const claimIdBy = (needle: string): string => {
    const hits = bundle.claims.filter((c) => c.statement.includes(needle));
    if (hits.length !== 1) throw new Error(`overlay authoring: ${hits.length} claims match ${JSON.stringify(needle)} (need exactly 1)`);
    return hits[0]!.id;
  };

  // Human-in-the-loop inference edit (workflow stage 3). The automated pass recorded the two camps'
  // claims as `contradicts` MATCHES but did not wire the ascertainment-bias line as an ATTACK on the
  // epicentre conclusion, so support could not propagate across the dispute. We add one attributed,
  // challengeable inference that an analyst would add on review: if proximity-ascertainment bias makes
  // the residential-clustering inference unreliable, that undercuts the market-as-epicentre conclusion.
  // It is attributed to a human (not the model) and can be rejected like any other node.
  const analyst: Attribution = { kind: "human", ref: "analyst-review" };
  const biasUnreliable = claimIdBy("become unreliable");
  const epicentre = claimIdBy("Huanan market was the early epicentre");
  const undercutWarrant =
    "If proximity ascertainment bias makes residential-clustering inferences unreliable, the clustering cannot establish the market as the early epicentre.";
  const undercut: Inference = {
    id: inferenceId({ type: "undercuts", premises: [biasUnreliable], conclusion: epicentre, warrant: undercutWarrant }),
    type: "undercuts", premises: [biasUnreliable], conclusion: epicentre, warrant: undercutWarrant,
    assumptions: [], defeaters: ["The bias is shown to be small or absent", "Non-spatial lines of evidence independently establish the epicentre"],
    strength: "moderate", attribution: analyst,
  };
  bundle = { ...bundle, inferences: [...bundle.inferences, undercut] };

  const overlays: Overlay[] = [];
  const assessments: Assessment[] = [];
  const addOverlay = (label: string, ref: string, description: string, priorStance: string): string => {
    const analyst: Attribution = { kind: "human", ref };
    const id = overlayId({ label, analyst });
    overlays.push({ id, label, description, analyst, priorStance });
    return id;
  };
  // NOTE: assessments carry stance + weight but deliberately NO credence. On a bitter, unsettled
  // dispute we refuse to manufacture calibrated probabilities, so the perspective-diff runs in its
  // QUALITATIVE mode: it still localizes the load-bearing disagreement and names the crux, but the
  // percentages are relative structural weight, not origin probabilities. (This mirrors the essay's
  // stance: the COVID bundle deliberately announces no origin probability.)
  const pushAssessment = (
    overlayIdValue: string,
    target: { kind: "claim" | "inference"; id: string },
    stance: Stance,
    weight: number,
    rationale?: string,
): void => {
    assessments.push({
      id: assessmentId({ overlayId: overlayIdValue, target }),
      overlayId: overlayIdValue, target, stance, weight,
      ...(rationale ? { rationale } : {}),
    });
  };
  const assess = (o: string, needle: string, stance: Stance, weight: number, rationale?: string): void =>
    pushAssessment(o, { kind: "claim", id: claimIdBy(needle) }, stance, weight, rationale);
  const assessInf = (o: string, inferenceIdValue: string, stance: Stance, weight: number, rationale?: string): void =>
    pushAssessment(o, { kind: "inference", id: inferenceIdValue }, stance, weight, rationale);

  // Assessments target the LEAF claims that actually drive support propagation (a non-leaf claim's
  // support is computed from its own inferences, so a belief stated on it would be ignored) plus the
  // one cross-camp inference above. The positive leaf for the conclusion is the "mode falls at the
  // market entrance" finding; the skeptic's line enters through Weissman's two raw distance findings,
  // which feed "clustering becomes unreliable", which now undercuts the conclusion.
  const MODE_AT_MARKET = "with proper implementation of their methods, the mode falls at the entrance";
  const BIAS_INCOMPAT = "apparently incompatible with a location model";
  const BIAS_SIGN = "sign of the difference instead agrees";
  const STOCHASTICITY = "stochasticity";
  const CENTRALITY_FRAMING = "has recently been challenged by Stoyan and Chiu";

  // Perspective A, market-central reading (comparatively sympathetic to the Débarre–Worobey case).
  const central = addOverlay(
    "Market-central reading",
    "market-central-reading",
    "Reads the residential-clustering evidence as robust: the mode is a sound centre that falls at the market, and the ascertainment-bias objection is not established, so it does not undercut the epicentre conclusion.",
    "The early-case clustering points to the Huanan market as the epicentre.",
);
  assess(central, MODE_AT_MARKET, "accept", 0.9, "With proper implementation the mode falls at the market entrance and the 95% region includes it.");
  assess(central, CENTRALITY_FRAMING, "accept", 0.5, "The Worobey et al. centrality result is sound.");
  assess(central, STOCHASTICITY, "accept", 0.6, "Infection away from home plus chance explains the pattern without any bias.");
  assess(central, BIAS_INCOMPAT, "reject", 0.8, "The distance comparison is not compelling once infection locations are not assumed residential.");
  assess(central, BIAS_SIGN, "reject", 0.8, "The sign is consistent with ordinary spread, not with large bias.");
  assessInf(central, undercut.id, "reject", 0.7, "The bias is not established, so it does not undercut centrality.");

  // Perspective B, ascertainment-bias reading (comparatively sympathetic to Weissman's objection).
  const skeptic = addOverlay(
    "Ascertainment-bias reading",
    "ascertainment-skeptic-reading",
    "Holds that proximity ascertainment bias is real and large, so residential-clustering inferences are unreliable and cannot carry the epicentre conclusion; doubts the stochasticity rescue and reads a mode at the market as partly an artefact of where cases were sought.",
    "The clustering may be an artefact of where cases were sought; centrality is not established.",
);
  assess(skeptic, BIAS_INCOMPAT, "accept", 0.9, "The closer-than-linked pattern is the signature of proximity ascertainment bias.");
  assess(skeptic, BIAS_SIGN, "accept", 0.9, "The sign of the distance difference matches a large-bias model.");
  assess(skeptic, STOCHASTICITY, "uncertain", 0.6, "Stochasticity is asserted, not shown sufficient to explain the pattern.");
  assess(skeptic, MODE_AT_MARKET, "uncertain", 0.7, "A mode at the market may itself reflect where cases were ascertained.");
  assess(skeptic, CENTRALITY_FRAMING, "uncertain", 0.4, "Centrality is exactly what is contested.");
  assessInf(skeptic, undercut.id, "accept", 0.9, "If the clustering is unreliable, it cannot establish the market as epicentre.");

  bundle = { ...bundle, overlays, assessments };
  console.error(`  overlays: ${overlays.length} · assessments: ${assessments.length}`);

  // Keep the primary (first) source's raw document so the case can show what was decomposed.
  const primary = SOURCES[0]!;
  bundle = { ...bundle, sourceDocument: { title: primary.title, url: primary.url, text: await readFile(primary.file, "utf8") } };

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
  console.error(`Wrote ${out} (+ covid.json) ${serializeBundle(bundle).split("\n").length - 1} records`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
