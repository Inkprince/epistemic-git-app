import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BundleBuilder, serializeBundle, validateBundle } from "@epistemic-git/protocol";
import { writeBundleFile } from "@epistemic-git/protocol/node";

/**
 * The LHC "micro black hole" safety case — hand-authored reference bundle (no LLM).
 *
 * This is a bounded, revealing slice of a *settled* question: could the LHC create a microscopic
 * black hole that destroys Earth? The interesting epistemic structure is that the safety
 * conclusion rests on TWO largely independent argument lines:
 *
 *   Line A (theoretical): any micro black hole would evaporate via Hawking radiation.
 *   Line B (empirical):   cosmic rays have bombarded astronomical bodies at higher energies for
 *                         eons; the survival of white dwarfs and neutron stars bounds the risk —
 *                         and this line does NOT depend on Hawking radiation.
 *
 * That structure is exactly what powers the flagship interaction: "distrust Hawking radiation —
 * does safety survive?" It does, via Line B, and the tool shows precisely why, localizing the
 * residual disagreement to the white-dwarf capture argument (the true crux).
 *
 * NOTE ON PROVENANCE: this reference bundle is authored by hand to exercise the tooling before
 * the extraction pipeline exists. Passages are representative quotations/paraphrases from the
 * cited primary sources and should be re-verified against the originals before any load-bearing
 * use. The live pipeline replaces these with exact extracted spans.
 */
export function buildLhcBundle() {
  const b = new BundleBuilder({
    case: "lhc",
    title: "LHC micro black holes: is the collider safe?",
    question: "Could high-energy collisions at the LHC produce a microscopic black hole that endangers Earth?",
    mode: "hand-authored",
  });

  // ── Sources ────────────────────────────────────────────────────────────────
  const lsag = b.source({
    type: "report",
    title: "Review of the Safety of LHC Collisions (LHC Safety Assessment Group)",
    url: "https://doi.org/10.1088/0954-3899/35/11/115004",
    authors: ["J. Ellis", "G. Giudice", "M. Mangano", "I. Tkachev", "U. Wiedemann"],
    publishedDate: "2008-09-05",
    reliability: { peerReviewStatus: "peer-reviewed", fundingConflicts: ["authors affiliated with CERN"] },
  });
  const gm = b.source({
    type: "paper",
    title: "Astrophysical implications of hypothetical stable TeV-scale black holes",
    url: "https://arxiv.org/abs/0806.3381",
    authors: ["S. Giddings", "M. Mangano"],
    publishedDate: "2008-06-20",
    reliability: { peerReviewStatus: "peer-reviewed" },
  });
  const hawking = b.source({
    type: "paper",
    title: "Particle creation by black holes",
    url: "https://doi.org/10.1007/BF02345020",
    authors: ["S. W. Hawking"],
    publishedDate: "1975-08-01",
    reliability: { peerReviewStatus: "peer-reviewed" },
  });
  const add = b.source({
    type: "paper",
    title: "The Hierarchy Problem and New Dimensions at a Millimeter",
    url: "https://arxiv.org/abs/hep-ph/9803315",
    authors: ["N. Arkani-Hamed", "S. Dimopoulos", "G. Dvali"],
    publishedDate: "1998-03-11",
    reliability: { peerReviewStatus: "peer-reviewed" },
  });
  const rossler = b.source({
    type: "preprint",
    title: "Abraham-Solution to Schwarzschild Metric Implies That CERN Miniblack Holes Pose a Planetary Risk",
    authors: ["O. Rössler"],
    publishedDate: "2008-01-01",
    reliability: { peerReviewStatus: "self-published", knownStance: "argues the LHC is unsafe" },
    adversarialFlags: ["not-peer-reviewed", "rebutted-by-community", "uses-non-standard-metric"],
  });
  const lawsuit = b.source({
    type: "news",
    title: "Wagner & Sancho v. CERN et al. — request to halt LHC startup over safety fears",
    authors: ["W. Wagner", "L. Sancho"],
    publishedDate: "2008-03-21",
    reliability: { peerReviewStatus: "unknown", knownStance: "argues the LHC is unsafe" },
  });

  // ── Passages (provenance anchors) ────────────────────────────────────────────
  const p_nature = b.passage({
    sourceId: lsag,
    locator: { kind: "section", path: "§Cosmic rays" },
    verbatimText:
      "Nature has already conducted the equivalent of about a hundred thousand LHC experimental programmes on Earth — and the planet still exists.",
  });
  const p_conclusion = b.passage({
    sourceId: lsag,
    locator: { kind: "section", path: "§Conclusions" },
    verbatimText: "There is no basis for any conceivable threat from the LHC.",
  });
  const p_cosmic_energy = b.passage({
    sourceId: lsag,
    locator: { kind: "section", path: "§Cosmic rays" },
    verbatimText:
      "Cosmic rays reach the Earth's atmosphere with energies far exceeding those of LHC collisions, and have done so throughout the history of the solar system.",
  });
  const p_gm_bound = b.passage({
    sourceId: gm,
    locator: { kind: "page", page: 1 },
    verbatimText:
      "The continued existence of white dwarfs and neutron stars, which would efficiently capture and be destroyed by any dangerous stable black holes, places strong empirical bounds excluding a risk to Earth.",
  });
  const p_gm_atrest = b.passage({
    sourceId: gm,
    locator: { kind: "page", page: 2 },
    verbatimText:
      "Black holes produced by cosmic-ray collisions with a body at rest are highly relativistic and would traverse it, whereas black holes produced in symmetric LHC collisions could be slow enough to be gravitationally bound; we therefore consider capture by dense stellar remnants.",
  });
  const p_hawking = b.passage({
    sourceId: hawking,
    locator: { kind: "page", page: 199 },
    verbatimText:
      "A black hole of mass M creates and emits particles as if it were a body with temperature proportional to its surface gravity, and thus slowly evaporates.",
  });
  const p_add = b.passage({
    sourceId: add,
    locator: { kind: "page", page: 1 },
    verbatimText:
      "If there are large new spatial dimensions, the fundamental scale of gravity could be as low as the TeV scale, within reach of collider energies.",
  });
  const p_rossler = b.passage({
    sourceId: rossler,
    locator: { kind: "section", path: "§Abstract" },
    verbatimText:
      "A modified solution to the Schwarzschild metric implies that microscopic black holes need not evaporate and could accrete matter, posing a planetary risk.",
  });

  // ── Claims ───────────────────────────────────────────────────────────────────
  const attr = (src: string) => ({ kind: "source" as const, ref: src });

  const c_add = b.claim({
    statement: "If large extra dimensions exist and the fundamental gravity scale is near a TeV, microscopic black holes could be produced at the LHC.",
    claimType: "predictive",
    structure: { modality: "conditional", intervention: "LHC collisions", outcome: "microscopic black hole production" },
    passages: [p_add], attribution: attr(add),
  });
  const c_production_speculative = b.claim({
    statement: "Producing black holes at the LHC requires speculative beyond-Standard-Model physics and is not predicted by established theory.",
    claimType: "methodological",
    structure: { modality: "descriptive" },
    passages: [p_add], attribution: attr(lsag),
    caveats: ["Depends on unconfirmed large-extra-dimension scenarios."],
  });
  const c_hawking = b.claim({
    statement: "Any microscopic black hole would emit Hawking radiation and evaporate almost instantly.",
    claimType: "predictive",
    structure: { modality: "causal", outcome: "near-instant evaporation" },
    passages: [p_hawking], attribution: attr(hawking),
  });
  const c_hawking_unobserved = b.claim({
    statement: "Hawking radiation has never been directly observed experimentally.",
    claimType: "empirical",
    structure: { modality: "descriptive" },
    passages: [p_hawking], attribution: attr(rossler),
    caveats: ["A widely accepted theoretical prediction, but empirically unconfirmed at time of writing."],
  });
  const c_cosmic_energy = b.claim({
    statement: "Cosmic rays strike Earth and other astronomical bodies at energies exceeding LHC collisions, and have for the lifetime of the solar system.",
    claimType: "empirical",
    structure: { modality: "descriptive" },
    passages: [p_cosmic_energy], attribution: attr(lsag),
  });
  const c_nature_ran = b.claim({
    statement: "Cosmic-ray collisions have already performed the equivalent of many thousands of LHC programs on Earth, the Sun, and other bodies, which still exist.",
    claimType: "empirical",
    structure: { modality: "descriptive", timeframe: "over the age of the solar system" },
    passages: [p_nature], attribution: attr(lsag),
  });
  const c_atrest = b.claim({
    statement: "Cosmic-ray black holes would be produced at high velocity and escape a body, whereas LHC black holes could be produced nearly at rest and be gravitationally captured — so the cosmic-ray analogy is not automatically sufficient.",
    claimType: "methodological",
    structure: { modality: "descriptive" },
    passages: [p_gm_atrest], attribution: attr(gm),
  });
  const c_whitedwarf = b.claim({
    statement: "The survival of white dwarfs and neutron stars over gigayears bounds any producible stable black hole to harmless accretion rates, even accounting for capture of slow black holes.",
    claimType: "empirical",
    structure: { modality: "causal", outcome: "harmless accretion rate bound" },
    passages: [p_gm_bound], attribution: attr(gm),
  });
  const c_charge = b.claim({
    statement: "The analysis covers both charged and neutral black holes, including the slowest-accreting neutral cases.",
    claimType: "methodological",
    passages: [p_gm_bound], attribution: attr(gm),
  });
  const c_rossler_stable = b.claim({
    statement: "A modified Schwarzschild metric implies microscopic black holes could be stable and accrete dangerously.",
    claimType: "predictive",
    structure: { modality: "causal" },
    passages: [p_rossler], attribution: attr(rossler),
    caveats: ["Relies on a non-standard metric rejected by the mainstream physics community."],
  });

  // The safety conclusion (derived — concluded by inference, so it carries no direct passage).
  const c_safe = b.claim({
    statement: "LHC collisions pose no credible danger of producing a black hole that could threaten Earth.",
    claimType: "predictive",
    structure: { modality: "predictive", outcome: "no credible planetary risk" },
    derived: true, attribution: { kind: "human", ref: "reference-author" },
  });

  // ── Inferences (the argument structure) ───────────────────────────────────────
  // Line A — theoretical, depends on Hawking radiation.
  const i_lineA = b.inference({
    type: "supports", premises: [c_hawking], conclusion: c_safe,
    warrant: "Objects that evaporate essentially instantly cannot accumulate or grow to a dangerous size.",
    strength: "strong", attribution: attr(lsag),
    defeaters: ["Hawking radiation does not exist or micro black holes are stable."],
  });
  // Line B — empirical, does NOT depend on Hawking radiation.
  const i_lineB = b.inference({
    type: "supports", premises: [c_nature_ran, c_cosmic_energy, c_whitedwarf], conclusion: c_safe,
    warrant: "If the process were dangerous, higher-energy natural analogues over cosmological time would have already destroyed observed astronomical bodies; their survival bounds the risk.",
    strength: "strong", attribution: attr(gm),
    defeaters: ["The at-rest capture disanalogy is not adequately covered by the stellar-remnant argument."],
  });
  // Low prior of production at all (independent line).
  const i_lowprior = b.inference({
    type: "supports", premises: [c_production_speculative], conclusion: c_safe,
    warrant: "If any production requires speculative physics, the prior probability of producing a black hole at all is low.",
    strength: "moderate", attribution: attr(lsag),
  });
  // The at-rest objection rebuts safety (the skeptic's residual worry)...
  const i_atrest_doubt = b.inference({
    type: "rebuts", premises: [c_atrest], conclusion: c_safe,
    warrant: "If the natural analogue does not cover LHC-produced slow black holes, the empirical safety bound may not apply.",
    strength: "weak", attribution: attr(gm),
  });
  // ...but the white-dwarf/charge analysis addresses the at-rest objection.
  const i_capture_addressed = b.inference({
    type: "rebuts", premises: [c_whitedwarf, c_charge], conclusion: c_atrest,
    warrant: "Dense stellar remnants capture even fast-moving black holes, so their survival addresses the at-rest concern.",
    strength: "strong", attribution: attr(gm),
  });
  // Skeptic's undercut of Hawking radiation.
  const i_hawking_doubt = b.inference({
    type: "undercuts", premises: [c_hawking_unobserved], conclusion: c_hawking,
    warrant: "A theoretical prediction never directly observed warrants reduced confidence in load-bearing use.",
    strength: "moderate", attribution: { kind: "analyst-llm", ref: "reference-author" },
  });
  // Rössler's stable-BH claim rebuts safety (low quality).
  const i_rossler = b.inference({
    type: "rebuts", premises: [c_rossler_stable], conclusion: c_safe,
    warrant: "If micro black holes can be stable and accrete, LHC production could be dangerous.",
    strength: "speculative", attribution: attr(rossler),
  });

  // ── Correlation group — anti-double-counting ──────────────────────────────────
  // The white-dwarf bound and the charge-coverage claim both come from the single Giddings–Mangano
  // paper; they must not be treated as two independent supports.
  b.correlationGroup({
    memberKind: "claim", members: [c_whitedwarf, c_charge], sharedOrigin: "publication",
    rationale: "Both derive from the same Giddings–Mangano (2008) analysis; not independent evidence.",
  });

  // ── Challenges (adversarial audit) ────────────────────────────────────────────
  b.challenge({
    challengeType: "construct-mismatch",
    target: { kind: "claim", id: c_nature_ran },
    rationale: "Cosmic-ray black holes are relativistic and would traverse Earth, unlike potential at-rest LHC black holes — the natural analogue may not match the LHC case.",
    raisedBy: attr(gm), status: "mitigated",
    suggestedRemedy: "Extend the argument to dense stellar remnants (white dwarfs, neutron stars) that capture even fast black holes.",
  });
  b.challenge({
    challengeType: "invalid-inference",
    target: { kind: "claim", id: c_rossler_stable },
    rationale: "Rests on a non-standard modification of the Schwarzschild metric that the physics community has rejected; not peer-reviewed.",
    raisedBy: attr(lsag), status: "accepted",
  });
  b.challenge({
    challengeType: "missing-source",
    target: { kind: "topic", id: "direct laboratory observation of Hawking radiation" },
    rationale: "Line A leans on Hawking radiation, which was not directly observed at the time; the ledger should track whether the empirical line alone suffices.",
    raisedBy: { kind: "analyst-llm", ref: "reference-author" }, status: "open",
  });

  // ── Overlays (perspectives) + assessments — late-binding trust ─────────────────
  const consensus = b.overlay({
    label: "Mainstream physics consensus (LSAG)",
    analyst: { kind: "human", ref: "lsag-consensus" },
    description: "The established view: safety is robustly supported by both the theoretical and empirical lines.",
    priorStance: "LHC is safe with very high confidence.",
  });
  const skeptic = b.overlay({
    label: "Concerned skeptic",
    analyst: { kind: "human", ref: "skeptic" },
    description: "Distrusts the unobserved Hawking-radiation premise and worries the empirical bound may not cover at-rest capture.",
    priorStance: "Residual doubt; wants the empirical line to stand without Hawking radiation.",
  });

  const claimT = (id: string) => ({ kind: "claim" as const, id });

  // Consensus overlay
  b.assess({ overlayId: consensus, target: claimT(c_hawking), stance: "accept", credence: 0.95, weight: 0.7, rationale: "Hawking radiation is well-established theory." });
  b.assess({ overlayId: consensus, target: claimT(c_whitedwarf), stance: "accept", credence: 0.97, weight: 0.9, rationale: "The stellar-remnant bound is decisive." });
  b.assess({ overlayId: consensus, target: claimT(c_nature_ran), stance: "accept", credence: 0.97, weight: 0.8 });
  b.assess({ overlayId: consensus, target: claimT(c_cosmic_energy), stance: "accept", credence: 0.99, weight: 0.6 });
  b.assess({ overlayId: consensus, target: claimT(c_atrest), stance: "accept", credence: 0.8, weight: 0.3, rationale: "A real subtlety, but fully addressed by the remnant analysis." });
  b.assess({ overlayId: consensus, target: claimT(c_charge), stance: "accept", credence: 0.95, weight: 0.5, rationale: "Both charged and neutral cases are covered." });
  b.assess({ overlayId: consensus, target: claimT(c_production_speculative), stance: "accept", credence: 0.9, weight: 0.6 });
  b.assess({ overlayId: consensus, target: claimT(c_rossler_stable), stance: "reject", credence: 0.02, weight: 0.2 });
  b.assess({ overlayId: consensus, target: claimT(c_safe), stance: "accept", credence: 0.999, weight: 1.0 });

  // Skeptic overlay
  b.assess({ overlayId: skeptic, target: claimT(c_hawking), stance: "uncertain", credence: 0.3, weight: 0.8, rationale: "Never directly observed; unwilling to make it load-bearing." });
  b.assess({ overlayId: skeptic, target: claimT(c_hawking_unobserved), stance: "accept", credence: 0.99, weight: 0.7 });
  b.assess({ overlayId: skeptic, target: claimT(c_whitedwarf), stance: "uncertain", credence: 0.6, weight: 0.9, rationale: "Powerful if the capture analysis for slow black holes is complete." });
  b.assess({ overlayId: skeptic, target: claimT(c_atrest), stance: "accept", credence: 0.8, weight: 0.8, rationale: "The at-rest vs relativistic disanalogy is the crux." });
  b.assess({ overlayId: skeptic, target: claimT(c_charge), stance: "uncertain", credence: 0.6, weight: 0.5, rationale: "Unsure the slow-neutral capture analysis is complete." });
  b.assess({ overlayId: skeptic, target: claimT(c_nature_ran), stance: "accept", credence: 0.9, weight: 0.6 });
  b.assess({ overlayId: skeptic, target: claimT(c_production_speculative), stance: "accept", credence: 0.85, weight: 0.4 });
  b.assess({ overlayId: skeptic, target: claimT(c_cosmic_energy), stance: "accept", credence: 0.95, weight: 0.5 });
  b.assess({ overlayId: skeptic, target: claimT(c_rossler_stable), stance: "uncertain", credence: 0.35, weight: 0.4 });
  b.assess({ overlayId: skeptic, target: claimT(c_safe), stance: "uncertain", credence: 0.7, weight: 1.0 });

  return b.build();
}

// ── Emit to artifacts/lhc.jsonl (only when run directly, not when imported) ─────
async function emit() {
  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(here, "../artifacts/lhc.jsonl");

  const bundle = buildLhcBundle();
  const result = validateBundle(bundle);
  if (!result.ok) {
    console.error("LHC bundle FAILED validation:");
    for (const issue of result.issues) console.error(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
    process.exit(1);
  }
  await mkdir(dirname(outPath), { recursive: true });
  await writeBundleFile(outPath, bundle);
  // Also emit a plain-JSON copy for the browser app to import directly (analysis is browser-safe;
  // protocol's parser is not, so the app never imports protocol at runtime).
  await writeFile(resolve(dirname(outPath), "lhc.json"), JSON.stringify(bundle, null, 2) + "\n", "utf8");
  const counts = {
    sources: bundle.sources.length, passages: bundle.passages.length, claims: bundle.claims.length,
    inferences: bundle.inferences.length, challenges: bundle.challenges.length,
    overlays: bundle.overlays.length, assessments: bundle.assessments.length,
  };
  console.log(`Wrote ${outPath}`);
  console.log(`Validated OK. ${serializeBundle(bundle).split("\n").length - 1} records:`, counts);
  if (result.issues.length) console.log(`(${result.issues.length} warnings)`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await emit();
