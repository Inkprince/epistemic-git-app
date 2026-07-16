import { describe, expect, it } from "vitest";
import {
  binaryInterRaterAgreement,
  loadConfig,
  scoreEvaluations,
  validateArtifact,
  validateStaticConfig,
  verifyFreeze,
} from "./src/core.js";
import type { Artifact, BlindMap, EvaluationsFile } from "./src/types.js";

function artifactFor(taskId: string, field: keyof Artifact["analysis"]): Artifact {
  return {
    schemaVersion: "baseline-artifact/1.0",
    taskId,
    title: "Neutral research artifact",
    summary: "A bounded summary with one sourced claim.",
    claims: [{ id: "C1", text: "A bounded claim.", citationIds: ["R1"], caveats: [] }],
    citations: [{ id: "R1", sourceTitle: "Source title", sourceUri: null, locator: null, passage: null }],
    analysis: {
      strongestEvidence: null,
      loadBearingAssumption: null,
      citationIndependence: null,
      passageSupport: null,
      perspectiveDisagreement: null,
      conflictingSourceUpdate: null,
      sourceOverclaim: null,
      [field]: "The requested analysis.",
    },
  };
}

describe("frozen baseline design", () => {
  it("contains all required arms, tasks, metrics, and unchanged frozen files", async () => {
    const config = await loadConfig();
    expect(validateStaticConfig(config.study, config.tasks).errors).toEqual([]);
    expect((await verifyFreeze()).errors).toEqual([]);
  });

  it("accepts a neutral normalized artifact and rejects identity disclosure", async () => {
    const config = await loadConfig();
    const task = config.tasks.tasks[0]!;
    const artifact = artifactFor(task.id, task.expectedAnalysisField);
    expect(validateArtifact(artifact, task, config.study.blinding.identityLeakTerms).errors).toEqual([]);
    artifact.summary = "Produced by Claude after a careful investigation.";
    expect(validateArtifact(artifact, task, config.study.blinding.identityLeakTerms).errors.join(" ")).toContain("prohibited identity term 'Claude'");
  });
});

describe("scoring", () => {
  it("computes observed metrics without treating missing arms as zero", async () => {
    const config = await loadConfig();
    const task = config.tasks.tasks.find((item) => item.id === "load-bearing-crux-lhc")!;
    const entry = {
      artifactId: "ART-TEST",
      taskId: task.id,
      systemId: "deep-research",
      sourceArtifactSha256: "a",
      preparedArtifactSha256: "b",
      generationDurationMs: 9000,
    };
    const blindMap: BlindMap = {
      schemaVersion: "baseline-blind-map/1.0",
      studyId: config.study.studyId,
      runId: "test",
      createdAt: "2026-07-16T00:00:00.000Z",
      entries: [entry],
    };
    const evaluations: EvaluationsFile = {
      schemaVersion: "baseline-evaluations/1.0",
      studyId: config.study.studyId,
      responses: [{
        id: "RESP-1",
        participantId: "P1",
        artifactId: entry.artifactId,
        taskId: task.id,
        startedAt: "2026-07-16T01:00:00.000Z",
        completedAt: "2026-07-16T01:01:00.000Z",
        durationMs: 60000,
        answerText: "Test-only answer.",
        claims: [{ id: "C1", text: "Test-only claim." }],
        citations: [{ id: "R1", claimId: "C1", reference: "Test reference" }],
      }],
      ratings: [
        {
          responseId: "RESP-1",
          raterId: "R1",
          accuracy: [{ criterionId: "CR1", met: true }, { criterionId: "CR2", met: true }],
          citationCorrectness: [{ citationId: "R1", correct: true }],
          claimSupport: [{ claimId: "C1", supported: true }],
          cruxIdentified: true,
          notes: null,
        },
        {
          responseId: "RESP-1",
          raterId: "R2",
          accuracy: [{ criterionId: "CR1", met: false }, { criterionId: "CR2", met: true }],
          citationCorrectness: [{ citationId: "R1", correct: false }],
          claimSupport: [{ claimId: "C1", supported: true }],
          cruxIdentified: false,
          notes: null,
        },
      ],
    };
    const result = scoreEvaluations(evaluations, blindMap, config);
    const observed = result.systems.find((system) => system.systemId === "deep-research")!;
    const missing = result.systems.find((system) => system.systemId === "epistemic-git")!;
    expect(observed.answerAccuracy).toBe(0.75);
    expect(observed.citationCorrectness).toBe(0.5);
    expect(observed.unsupportedClaimRate).toBe(0);
    expect(observed.cruxIdentification).toBe(0.5);
    expect(observed.timeToAnswerMs).toBe(60000);
    expect(missing.answerAccuracy).toBeNull();
    expect(missing.timeToAnswerMs).toBeNull();
  });

  it("reports chance-corrected binary agreement and null for insufficient data", () => {
    const items = new Map<string, boolean[]>([
      ["a", [true, true]],
      ["b", [false, false]],
      ["c", [true, false]],
    ]);
    const agreement = binaryInterRaterAgreement(items);
    expect(agreement.observedAgreement).toBeCloseTo(2 / 3);
    expect(agreement.itemCount).toBe(3);
    expect(binaryInterRaterAgreement(new Map([["a", [true]]])).kappa).toBeNull();
  });
});
