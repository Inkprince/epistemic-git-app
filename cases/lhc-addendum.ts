import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BundleBuilder, validateBundle } from "@epistemic-git/protocol";
import { writeBundleFile } from "@epistemic-git/protocol/node";

/**
 * A SECOND, independently-authored LHC ledger, "investigator B".
 *
 * It shares the same case/question as the main LHC bundle and deliberately overlaps: it re-states the
 * safety conclusion identically (so content-addressed ids coincide and merge coalesces them), adds a
 * new supporting source, and records the skeptic perspective assessing the SAME conclusion with a
 * different credence. Merging it with the main bundle therefore demonstrates all of compounding at
 * once: new claims/inferences added, shared nodes coalesced, a conclusion whose support moves, and an
 * explicit assessment CONFLICT preserved rather than silently overwritten.
 */
export function buildLhcAddendum() {
  const b = new BundleBuilder({
    case: "lhc",
    title: "LHC micro black holes: is the collider safe?",
    question: "Could high-energy collisions at the LHC produce a microscopic black hole that endangers Earth?",
    mode: "hand-authored",
  });

  const src = b.source({
    type: "paper",
    title: "Independent re-derivation of LHC black-hole safety bounds from 2024 neutron-star data",
    authors: ["Independent Team"],
    publishedDate: "2024-05-01",
    reliability: { peerReviewStatus: "preprint" },
  });
  const psg = b.passage({
    sourceId: src,
    locator: { kind: "page", page: 1 },
    verbatimText:
      "Updated neutron-star cooling observations further constrain the accretion rate of any hypothetical stable black hole, independently reinforcing the conclusion that LHC collisions are safe.",
  });
  const cNew = b.claim({
    statement: "2024 neutron-star observations further constrain stable black-hole accretion, independently reinforcing LHC safety.",
    claimType: "empirical",
    structure: { modality: "descriptive", outcome: "tighter accretion bound" },
    passages: [psg],
    attribution: { kind: "source", ref: src },
  });

  // Re-state the safety conclusion IDENTICALLY to the main bundle so ids coincide on merge.
  const cSafe = b.claim({
    statement: "LHC collisions pose no credible danger of producing a black hole that could threaten Earth.",
    claimType: "predictive",
    structure: { modality: "predictive", outcome: "no credible planetary risk" },
    derived: true,
    attribution: { kind: "human", ref: "reference-author" },
  });

  b.inference({
    type: "supports", premises: [cNew], conclusion: cSafe,
    warrant: "An independent, tighter empirical bound on accretion reinforces the safety conclusion.",
    strength: "moderate", attribution: { kind: "source", ref: src },
  });

  // The skeptic perspective, reconstructed identically so the overlay id matches the main bundle, 
  // but assessing the SAME conclusion with a DIFFERENT credence, which merge will flag as a conflict.
  const skeptic = b.overlay({
    label: "Concerned skeptic",
    analyst: { kind: "human", ref: "skeptic" },
    description: "Distrusts the unobserved Hawking-radiation premise and worries the empirical bound may not cover at-rest capture.",
  });
  b.assess({
    overlayId: skeptic, target: { kind: "claim", id: cSafe }, stance: "uncertain",
    credence: 0.5, weight: 1.0,
    rationale: "Revised downward: unconvinced the new neutron-star bound closes the at-rest capture gap.",
  });

  return b.build();
}

async function emit() {
  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(here, "../artifacts/lhc-addendum.jsonl");
  const bundle = buildLhcAddendum();
  const result = validateBundle(bundle);
  if (!result.ok) {
    console.error("LHC addendum FAILED validation:");
    for (const i of result.issues) console.error(`  [${i.severity}] ${i.code}: ${i.message}`);
    process.exit(1);
  }
  await mkdir(dirname(outPath), { recursive: true });
  await writeBundleFile(outPath, bundle);
  await writeFile(resolve(dirname(outPath), "lhc-addendum.json"), JSON.stringify(bundle, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outPath} (+ .json): ${bundle.claims.length} claims, ${bundle.sources.length} source, ${bundle.assessments.length} assessment`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await emit();
