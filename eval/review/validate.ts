#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REVIEW_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PROJECT_DIR = resolve(REVIEW_DIR, "..", "..");

type Packet = {
  id: string;
  caseId: string;
  artifactPath: string;
  bundleId: string;
  formPath: string;
  requiredReviewerStance: string;
  minimumCompletedReviews: number;
  targetIds: string[];
};

type Registry = {
  schemaVersion: string;
  status: string;
  artifactSnapshotDate: string;
  packets: Packet[];
  userStudy: {
    status: string;
    protocolPath: string;
    recordSchemaPath: string;
    emptyRecordPath: string;
    agreementMethod: string;
    minimumRatersPerResponse: number;
  };
};

type Review = {
  id: string;
  packetId: string;
  status: string;
  artifactBundleId: string;
  artifactSha256: string;
  startedAt: string;
  completedAt: string;
  reviewer: {
    publicLabel: string;
    qualification: string;
    declaredStance: string;
    conflicts: string[];
    consentToPublishRedactedRecord: boolean;
  };
  judgments: Array<{
    targetId: string;
    verdict: string;
    severity: string;
    rationale: string;
    sourceOrPassage: string | null;
    proposedRemedy: string | null;
  }>;
  missingEvidence: string[];
  overallAssessment: string;
  administratorNotes: string | null;
};

type Records = { schemaVersion: string; status: string; reviews: Review[] };
type Change = {
  id: string;
  reviewIds: string[];
  decision: string;
  decisionRationale: string;
  affectedTargetIds: string[];
  beforeBundleId: string;
  afterBundleId: string | null;
  commitOrDiffRef: string | null;
  summary: string;
  decidedAt: string;
};
type Changes = { schemaVersion: string; status: string; changes: Change[] };

type Artifact = {
  id: string;
  case: string;
  sources?: Array<{ id: string }>;
  passages?: Array<{ id: string }>;
  claims?: Array<{ id: string }>;
  inferences?: Array<{ id: string }>;
  challenges?: Array<{ id: string }>;
  matches?: Array<{ id: string }>;
  overlays?: Array<{ id: string }>;
};

export interface ReviewValidation {
  errors: string[];
  warnings: string[];
  readiness: {
    expertPacketsComplete: number;
    expertPacketsRequired: number;
    completedReviews: number;
    userStudyStatus: string;
    complete: boolean;
  };
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validInstant(value: string): boolean {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function requireReadable(relativePath: string, label: string, errors: string[]): Promise<void> {
  try {
    await readFile(resolve(PROJECT_DIR, relativePath));
  } catch (error) {
    errors.push(`${label} is unreadable: ${relativePath} (${error instanceof Error ? error.message : String(error)})`);
  }
}

export async function validateReviewPackage(): Promise<ReviewValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const [registry, records, changes] = await Promise.all([
    json<Registry>(resolve(REVIEW_DIR, "registry.json")),
    json<Records>(resolve(REVIEW_DIR, "records.json")),
    json<Changes>(resolve(REVIEW_DIR, "changes.json")),
  ]);

  if (registry.schemaVersion !== "expert-review-registry/1.0") errors.push("registry schemaVersion is invalid");
  if (records.schemaVersion !== "expert-review-records/1.0") errors.push("records schemaVersion is invalid");
  if (changes.schemaVersion !== "expert-review-changes/1.0") errors.push("changes schemaVersion is invalid");

  const packetById = new Map<string, Packet>();
  const artifactByPacket = new Map<string, { bytes: Buffer; nodeIds: Set<string> }>();
  for (const packet of registry.packets) {
    if (packetById.has(packet.id)) errors.push(`duplicate packet id: ${packet.id}`);
    packetById.set(packet.id, packet);
    if (!nonEmpty(packet.requiredReviewerStance)) errors.push(`packet ${packet.id}: reviewer requirement is empty`);
    if (!Number.isInteger(packet.minimumCompletedReviews) || packet.minimumCompletedReviews < 1) {
      errors.push(`packet ${packet.id}: minimumCompletedReviews must be a positive integer`);
    }
    if (!packet.targetIds.length || new Set(packet.targetIds).size !== packet.targetIds.length) {
      errors.push(`packet ${packet.id}: targetIds must be non-empty and unique`);
    }
    await requireReadable(packet.formPath, `packet ${packet.id} form`, errors);
    try {
      const artifactPath = resolve(PROJECT_DIR, packet.artifactPath);
      const bytes = await readFile(artifactPath);
      const artifact = JSON.parse(bytes.toString("utf8")) as Artifact;
      if (artifact.id !== packet.bundleId) errors.push(`packet ${packet.id}: bundle id changed (${artifact.id} != ${packet.bundleId})`);
      if (artifact.case !== packet.caseId) errors.push(`packet ${packet.id}: artifact case is ${artifact.case}, expected ${packet.caseId}`);
      const nodeIds = new Set([
        ...(artifact.sources ?? []).map((item) => item.id),
        ...(artifact.passages ?? []).map((item) => item.id),
        ...(artifact.claims ?? []).map((item) => item.id),
        ...(artifact.inferences ?? []).map((item) => item.id),
        ...(artifact.challenges ?? []).map((item) => item.id),
        ...(artifact.matches ?? []).map((item) => item.id),
        ...(artifact.overlays ?? []).map((item) => item.id),
      ]);
      for (const targetId of packet.targetIds) {
        if (!nodeIds.has(targetId)) errors.push(`packet ${packet.id}: target ${targetId} is absent from ${packet.artifactPath}`);
      }
      artifactByPacket.set(packet.id, { bytes, nodeIds });
    } catch (error) {
      errors.push(`packet ${packet.id}: artifact unreadable (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  if (registry.packets.length !== 4) errors.push(`expected four expert/opposed packets, found ${registry.packets.length}`);
  for (const id of ["lhc-physics", "covid-zoonosis", "covid-lab-origin", "eggs-epidemiology"]) {
    if (!packetById.has(id)) errors.push(`missing required packet: ${id}`);
  }
  await Promise.all([
    requireReadable(registry.userStudy.protocolPath, "user-study protocol", errors),
    requireReadable(registry.userStudy.recordSchemaPath, "user-study record schema", errors),
    requireReadable(registry.userStudy.emptyRecordPath, "user-study empty record", errors),
  ]);
  if (registry.userStudy.minimumRatersPerResponse < 2) errors.push("user study requires at least two raters per response");
  if (!/agreement/i.test(registry.userStudy.agreementMethod)) errors.push("user study must name an inter-rater agreement method");

  const reviewById = new Map<string, Review>();
  const reviewCount = new Map<string, number>();
  for (const review of records.reviews) {
    if (reviewById.has(review.id)) errors.push(`duplicate review id: ${review.id}`);
    reviewById.set(review.id, review);
    const packet = packetById.get(review.packetId);
    if (!packet) {
      errors.push(`review ${review.id}: unknown packet ${review.packetId}`);
      continue;
    }
    reviewCount.set(packet.id, (reviewCount.get(packet.id) ?? 0) + 1);
    if (review.status !== "completed") errors.push(`review ${review.id}: status must be completed`);
    if (review.artifactBundleId !== packet.bundleId) errors.push(`review ${review.id}: artifact bundle does not match packet`);
    const artifact = artifactByPacket.get(packet.id);
    if (artifact && review.artifactSha256 !== sha256(artifact.bytes)) errors.push(`review ${review.id}: artifact SHA-256 does not match committed bytes`);
    if (!validInstant(review.startedAt) || !validInstant(review.completedAt) || Date.parse(review.completedAt) <= Date.parse(review.startedAt)) {
      errors.push(`review ${review.id}: invalid review timing`);
    }
    if (!nonEmpty(review.reviewer.publicLabel) || !nonEmpty(review.reviewer.qualification) || !nonEmpty(review.reviewer.declaredStance)) {
      errors.push(`review ${review.id}: reviewer disclosure fields are incomplete`);
    }
    if (!review.reviewer.consentToPublishRedactedRecord) errors.push(`review ${review.id}: public record lacks consent to publish`);
    if (!nonEmpty(review.overallAssessment)) errors.push(`review ${review.id}: overallAssessment is empty`);
    const judged = review.judgments.map((judgment) => judgment.targetId);
    for (const targetId of packet.targetIds) {
      if (judged.filter((id) => id === targetId).length !== 1) errors.push(`review ${review.id}: target ${targetId} must be judged exactly once`);
    }
    for (const judgment of review.judgments) {
      if (!packet.targetIds.includes(judgment.targetId)) errors.push(`review ${review.id}: judgment target ${judgment.targetId} is outside the packet`);
      if (!["accept", "revise", "reject", "uncertain"].includes(judgment.verdict)) errors.push(`review ${review.id}: invalid verdict`);
      if (!["minor", "major", "critical"].includes(judgment.severity)) errors.push(`review ${review.id}: invalid severity`);
      if (!nonEmpty(judgment.rationale)) errors.push(`review ${review.id}: judgment rationale is empty`);
    }
  }

  const changeIds = new Set<string>();
  const reviewsWithDecision = new Set<string>();
  for (const change of changes.changes) {
    if (changeIds.has(change.id)) errors.push(`duplicate change id: ${change.id}`);
    changeIds.add(change.id);
    if (!change.reviewIds.length) errors.push(`change ${change.id}: no reviewIds`);
    for (const reviewId of change.reviewIds) {
      const review = reviewById.get(reviewId);
      if (!review) errors.push(`change ${change.id}: unknown review ${reviewId}`);
      else {
        reviewsWithDecision.add(reviewId);
        const packet = packetById.get(review.packetId)!;
        for (const targetId of change.affectedTargetIds) {
          if (!packet.targetIds.includes(targetId)) errors.push(`change ${change.id}: target ${targetId} is outside review ${reviewId}'s packet`);
        }
      }
    }
    if (!["accepted", "partially-accepted", "declined", "deferred"].includes(change.decision)) errors.push(`change ${change.id}: invalid decision`);
    if (!nonEmpty(change.decisionRationale) || !nonEmpty(change.summary) || !validInstant(change.decidedAt)) errors.push(`change ${change.id}: decision documentation is incomplete`);
    if ((change.decision === "accepted" || change.decision === "partially-accepted")
      && (!nonEmpty(change.afterBundleId) || change.afterBundleId === change.beforeBundleId || !nonEmpty(change.commitOrDiffRef))) {
      errors.push(`change ${change.id}: accepted changes require a distinct afterBundleId and diff reference`);
    }
  }
  for (const review of records.reviews) {
    if (!reviewsWithDecision.has(review.id)) errors.push(`review ${review.id}: no documented artifact decision`);
  }

  if (records.reviews.length === 0 && records.status !== "pending-human-review") errors.push("empty review records must remain pending-human-review");
  if (changes.changes.length === 0 && changes.status !== "no-human-criticism-received") errors.push("empty change log must state no-human-criticism-received");

  const expertPacketsComplete = registry.packets.filter((packet) =>
    (reviewCount.get(packet.id) ?? 0) >= packet.minimumCompletedReviews).length;
  const complete = expertPacketsComplete === registry.packets.length
    && registry.userStudy.status === "complete"
    && errors.length === 0;
  if (expertPacketsComplete < registry.packets.length) {
    warnings.push(`${registry.packets.length - expertPacketsComplete} expert/opposed packet(s) still need human review`);
  }
  if (registry.userStudy.status !== "complete") warnings.push(`user study status: ${registry.userStudy.status}`);
  if (registry.status === "complete" && !complete) errors.push("registry claims complete before all human work is complete");

  return {
    errors,
    warnings,
    readiness: {
      expertPacketsComplete,
      expertPacketsRequired: registry.packets.length,
      completedReviews: records.reviews.length,
      userStudyStatus: registry.userStudy.status,
      complete,
    },
  };
}

async function main(): Promise<void> {
  const result = await validateReviewPackage();
  console.log(`review package: ${result.errors.length ? "INVALID" : "STRUCTURALLY VALID"}`);
  for (const warning of result.warnings) console.log(`warning: ${warning}`);
  for (const error of result.errors) console.error(`error: ${error}`);
  console.log(`expert packets: ${result.readiness.expertPacketsComplete}/${result.readiness.expertPacketsRequired} complete`);
  console.log(`completed review records: ${result.readiness.completedReviews}`);
  console.log(`user study: ${result.readiness.userStudyStatus}`);
  console.log(result.readiness.complete ? "READY: human review requirements are complete." : "PENDING: do not claim expert review or user-study results.");
  if (result.errors.length) process.exitCode = 1;
}

const direct = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (direct) main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
