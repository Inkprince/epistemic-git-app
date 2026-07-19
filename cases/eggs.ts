import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BundleBuilder, validateBundle, serializeBundle,
  overlayId, assessmentId,
  type Overlay, type Assessment, type Attribution, type Stance,
} from "@epistemic-git/protocol";
import { writeBundleFile } from "@epistemic-git/protocol/node";
import { createLlmClientFromEnv } from "@epistemic-git/llm/node";
import {
  auditBundle, deriveCorrelationGroups, draftPerspective, extractInto,
  inferArgument, matchClaims, narrateClaim, scrapeUrl, PROMPT_VERSION,
} from "@epistemic-git/pipeline";

/**
 * Eggs and cardiovascular risk: a genuinely MULTI-SOURCE, contested nutrition case.
 *
 * Real sources are ingested into one ledger: reassuring reviews and guideline pages that read
 * moderate egg intake as safe, alongside cohort and meta-analytic work (and an industry-funding
 * critique) that reads dietary cholesterol from eggs as a real risk. Because every claim lives in one
 * bundle, cross-source MATCHING relates and contradicts claims between the camps, the adversarial
 * AUDIT flags confounding and correlated-evidence problems, and two opposing perspectives read the
 * same ledger two ways. Sources are retrieved via the cached scraper (Firecrawl when a key is present,
 * native fetch otherwise); passages are verbatim quotes the live pipeline grounds every claim in.
 */

const here = dirname(fileURLToPath(import.meta.url));

const SOURCES = [
  {
    url: "https://nutritionsource.hsph.harvard.edu/food-features/eggs/",
    title: "Eggs (Harvard T.H. Chan School of Public Health, The Nutrition Source)",
    type: "other" as const,
    authors: [] as string[],
    stance: "reads moderate egg intake as compatible with a healthy diet for most people",
  },
  {
    url: "https://www.mayoclinic.org/diseases-conditions/high-blood-cholesterol/expert-answers/cholesterol/faq-20058468",
    title: "Eggs: Are they good or bad for my cholesterol? (Mayo Clinic)",
    type: "other" as const,
    authors: [] as string[],
    stance: "moderate: most healthy people can eat eggs without materially raising cardiovascular risk",
  },
  {
    url: "https://www.bhf.org.uk/informationsupport/heart-matters-magazine/nutrition/ask-the-expert/eggs",
    title: "Are eggs good for you? (British Heart Foundation)",
    type: "other" as const,
    authors: [] as string[],
    stance: "reassuring: eggs can be part of a heart-healthy diet",
  },
  {
    url: "https://www.pcrm.org/news/news-releases/new-review-study-shows-egg-industry-funded-research-downplays-danger-cholesterol",
    title: "Egg-Industry-Funded Research Downplays the Danger of Cholesterol (Physicians Committee)",
    type: "other" as const,
    authors: [] as string[],
    stance: "critical: industry-funded studies understate the cardiovascular risk of dietary cholesterol from eggs",
  },
  {
    url: "https://www.health.harvard.edu/heart-health/are-eggs-risky-for-heart-health",
    title: "Are eggs risky for heart health? (Harvard Health Publishing)",
    type: "other" as const,
    authors: [] as string[],
    stance: "cautions that egg consumption is associated with higher cardiovascular risk in some cohorts",
  },
] as const;

async function main() {
  const live = Boolean(process.env["GROQ_API_KEY"]);
  const client = createLlmClientFromEnv({
    mode: live ? "live" : "cached",
    cacheDir: resolve(here, "../artifacts/.cache"),
    promptVersion: PROMPT_VERSION,
  });

  const b = new BundleBuilder({
    case: "eggs",
    title: "Eggs and cardiovascular risk: does moderate egg consumption raise heart disease risk?",
    question: "Does moderate egg consumption meaningfully raise cardiovascular disease risk, or is it safe for most people?",
    mode: live ? "live" : "cached",
  });

  let admitted = 0;
  let primaryDoc: { title: string; url: string; text: string } | undefined;
  for (const s of SOURCES) {
    let text: string;
    try {
      console.error(`scrape: ${s.title.slice(0, 48)}…`);
      const scraped = await scrapeUrl(s.url, {
        live: true, env: process.env,
        cacheDir: resolve(here, "../artifacts/.cache"),
        log: (m: string) => console.error("  " + m),
      });
      text = scraped.text;
    } catch (e) {
      console.error(`  SKIP (scrape failed): ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (text.trim().length < 400) { console.error("  SKIP (too little text)"); continue; }
    const sourceId = b.source({
      type: s.type, title: s.title, url: s.url, authors: [...s.authors],
      retrievedDate: "2026-07-18", reliability: { knownStance: s.stance },
    });
    const st = await extractInto(b, client, { sourceId, sourceTitle: s.title, text });
    console.error(`  grounded ${st.grounded} · quarantined ${st.quarantined} · chunks ${st.chunks}`);
    if (st.grounded > 0) {
      admitted++;
      // Keep the first admitted source's raw document so the case can show what was decomposed.
      if (!primaryDoc) primaryDoc = { title: s.title, url: s.url, text };
    }
  }
  if (admitted < 3) throw new Error(`only ${admitted} sources admitted claims; need at least 3 for a multi-source case`);

  let bundle = b.build();
  console.error(`Cross-source matching over ${bundle.claims.length} claims…`);
  bundle = (await matchClaims(bundle, client)).bundle;
  console.error(`  matches: ${bundle.matches.length}`);
  console.error("Inferring argument structure…");
  bundle = (await inferArgument(bundle, client)).bundle;
  console.error("Auditing…");
  bundle = (await auditBundle(bundle, client)).bundle;
  console.error(`  challenges: ${bundle.challenges.length}`);
  const corr = deriveCorrelationGroups(bundle);
  bundle = corr.bundle;
  console.error(`  correlation groups: ${corr.added}`);

  // Two opposing perspectives, drafted by the model from the shared ledger, then attached as
  // first-class Overlay + Assessment nodes (attributed analyst-llm). This mirrors the covid case:
  // the same evidence, read two ways, so the perspective-diff can localise the crux.
  const analyst: Attribution = { kind: "analyst-llm", ref: client.model };
  const overlays: Overlay[] = [];
  const assessments: Assessment[] = [];
  const worldviews = [
    { fallback: "Eggs-safe-in-moderation reading", worldview: "Adopt the reading most favourable to eggs being safe: moderate egg intake does not meaningfully raise cardiovascular risk for most people. Accept the reassuring cohort and review evidence and weight it heavily; treat the risk associations as uncertain or confounded." },
    { fallback: "Eggs-raise-risk reading", worldview: "Adopt the cautious reading: dietary cholesterol from eggs raises LDL and egg consumption is associated with higher cardiovascular and all-cause mortality risk. Weight the trial and mortality-association evidence heavily; treat the reassuring findings as uncertain or industry-influenced." },
  ];
  for (const wv of worldviews) {
    try {
      const draft = await draftPerspective(bundle, client, { worldview: wv.worldview });
      if (!draft.stances.length) { console.error(`  perspective "${wv.fallback}" produced no stances; skipping`); continue; }
      const label = (draft.suggestedLabel || wv.fallback).trim();
      if (overlays.some((o) => o.label.toLowerCase() === label.toLowerCase())) continue;
      const id = overlayId({ label, analyst });
      overlays.push({ id, label, analyst, ...(draft.suggestedDescription ? { description: draft.suggestedDescription.trim() } : {}) });
      for (const stance of draft.stances) {
        const target = { kind: "claim" as const, id: stance.claimId };
        assessments.push({
          id: assessmentId({ overlayId: id, target }),
          overlayId: id, target, stance: stance.stance as Stance, weight: 0.7,
          ...(stance.rationale ? { rationale: stance.rationale } : {}),
        });
      }
    } catch (e) {
      console.error(`  perspective "${wv.fallback}" skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  bundle = { ...bundle, overlays, assessments };
  console.error(`  overlays: ${overlays.length} · assessments: ${assessments.length}`);

  // Narrate the conclusion and the two best-supported grounded claims.
  const conclusion = bundle.claims.find((c) => c.derived);
  const grounded = bundle.claims.filter((c) => !c.derived && c.passages.length);
  const toNarrate = [...(conclusion ? [conclusion] : []), ...grounded.slice(0, 2)];
  const overlay0 = bundle.overlays[0]?.id;
  for (const c of toNarrate) {
    try {
      bundle = (await narrateClaim(bundle, client, { claimId: c.id, ...(overlay0 ? { overlayId: overlay0 } : {}), respectCorrelation: true })).bundle;
    } catch (e) {
      console.error(`  narrate skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.error(`  narratives: ${(bundle.narratives ?? []).length}`);

  if (primaryDoc) bundle = { ...bundle, sourceDocument: primaryDoc };

  const check = validateBundle(bundle);
  if (!check.ok) {
    console.error("EGGS bundle FAILED validation:");
    for (const i of check.issues.filter((x) => x.severity === "error")) console.error(`  ${i.code}: ${i.message}`);
    process.exit(1);
  }

  const out = resolve(here, "../artifacts/eggs.jsonl");
  await mkdir(dirname(out), { recursive: true });
  await writeBundleFile(out, bundle);
  await writeFile(resolve(here, "../artifacts/eggs.json"), JSON.stringify(bundle, null, 2) + "\n", "utf8");
  console.error(`Wrote ${out} (+ eggs.json): ${bundle.claims.length} claims, ${bundle.sources.length} sources, ${bundle.challenges.length} challenges, ${bundle.overlays.length} perspectives`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
