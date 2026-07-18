import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseBundle, serializeBundle, validateBundle,
  overlayId, assessmentId, type Overlay, type Assessment, type Attribution, type Stance,
} from "@epistemic-git/protocol";
import { writeBundleFile } from "@epistemic-git/protocol/node";
import { writeFile } from "node:fs/promises";

/**
 * Add two opposed reader perspectives to the (pipeline-built) eggs bundle, so the section-4 crux
 * machinery runs on the nutrition case too, the third of the three cases, and the one where refusing
 * to manufacture a probability matters most. This decorates the committed pipeline output: every
 * existing object (and its content-addressed id) is left exactly as the pipeline produced it; we only
 * append human-authored Overlay/Assessment nodes on top. Assessments carry stance + weight but NO
 * credence, so the perspective-diff runs in its qualitative mode (relative structural weight, never a
 * calibrated dietary-risk probability).
 */

const here = dirname(fileURLToPath(import.meta.url));
const jsonl = resolve(here, "../artifacts/eggs.jsonl");
const bundle = parseBundle(readFileSync(jsonl, "utf8"));

const claimIdBy = (needle: string): string => {
  const hits = bundle.claims.filter((c) => c.statement.includes(needle));
  if (hits.length !== 1) throw new Error(`${hits.length} claims match ${JSON.stringify(needle)} (need 1)`);
  return hits[0]!.id;
};

const overlays: Overlay[] = [];
const assessments: Assessment[] = [];
const addOverlay = (label: string, ref: string, description: string, priorStance: string): string => {
  const analyst: Attribution = { kind: "human", ref };
  const id = overlayId({ label, analyst });
  overlays.push({ id, label, description, analyst, priorStance });
  return id;
};
const assess = (o: string, needle: string, stance: Stance, weight: number, rationale?: string): void => {
  const target = { kind: "claim" as const, id: claimIdBy(needle) };
  assessments.push({ id: assessmentId({ overlayId: o, target }), overlayId: o, target, stance, weight, ...(rationale ? { rationale } : {}) });
};

// Leaves that drive the conclusion "moderate egg consumption does not significantly increase CV risk":
// reassuring reviews (positive support), the all-cause-mortality analysis (an existing `contradicts`),
// and the LDL/cholesterol line (feeds a presupposition).
const REVIEW_LOWER = "systematic review found that higher egg consumption correlated";
const REVIEWS_2020 = "recent reviews from 2020 concluded that moderate daily egg";
const ONE_EGG_OK = "consuming up to one egg daily does not increase";
const ALL_CAUSE = "associations with increased all-cause mortality";
const RCT_LDL = "2018 meta-analysis of randomized trials showed eggs increase total";

// Perspective A, "eggs are cardiovascularly safe in moderation".
const safe = addOverlay(
  "Eggs-safe-in-moderation reading",
  "eggs-safe-reading",
  "Weights the reassuring cohort and 2020 review evidence: moderate egg intake shows no clear cardiovascular harm, and the LDL signal is a biomarker, not a clinical endpoint.",
  "Moderate egg consumption does not meaningfully raise cardiovascular risk.",
);
assess(safe, REVIEWS_2020, "accept", 0.85, "The 2020 reviews are the most current synthesis and find no clear harm at moderate intake.");
assess(safe, REVIEW_LOWER, "accept", 0.7, "Higher egg consumption did not track with worse outcomes in this review.");
assess(safe, ONE_EGG_OK, "accept", 0.8, "Up to one egg a day shows no increased risk.");
assess(safe, ALL_CAUSE, "uncertain", 0.4, "An all-cause-mortality association is confounded and not cardiovascular-specific.");
assess(safe, RCT_LDL, "uncertain", 0.5, "Raised LDL is a surrogate marker, not a demonstrated clinical harm.");

// Perspective B, "eggs raise cardiovascular risk".
const risk = addOverlay(
  "Eggs-raise-risk reading",
  "eggs-risk-reading",
  "Weights the trial evidence that eggs raise LDL and the mortality association: dietary cholesterol has a mechanism, and the reassuring reviews are confounded observational syntheses.",
  "Egg consumption plausibly raises cardiovascular risk and should not be treated as neutral.",
);
assess(risk, RCT_LDL, "accept", 0.85, "Randomized trials are the strongest design here and show eggs raise LDL versus no eggs.");
assess(risk, ALL_CAUSE, "accept", 0.8, "The all-cause-mortality association is a real signal the reviews explain away.");
assess(risk, REVIEWS_2020, "uncertain", 0.4, "Observational reviews are confounded by healthy-user effects.");
assess(risk, REVIEW_LOWER, "uncertain", 0.45, "Correlational and sensitive to dietary-pattern confounding.");
assess(risk, ONE_EGG_OK, "uncertain", 0.4, "A null at one egg/day does not clear higher intakes.");

const out = { ...bundle, overlays, assessments };
const check = validateBundle(out);
if (!check.ok) {
  for (const i of check.issues.filter((x) => x.severity === "error")) console.error(`  ${i.code}: ${i.message}`);
  throw new Error("eggs bundle with overlays failed validation");
}
await writeBundleFile(jsonl, out);
await writeFile(resolve(here, "../artifacts/eggs.json"), JSON.stringify(out, null, 2) + "\n", "utf8");
console.error(`eggs: added ${overlays.length} overlays · ${assessments.length} assessments · ${serializeBundle(out).split("\n").length - 1} records`);
