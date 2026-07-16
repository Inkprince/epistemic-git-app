import { describe, expect, it } from "vitest";
import { BundleBuilder, validateBundle } from "@epistemic-git/protocol";
import { CacheMissError, type CompleteParams, type CompleteResult, type LlmClient } from "@epistemic-git/llm";
import { renderReport, runSuite, runTrap, type SuiteSummary } from "./suite.js";
import { TRAPS } from "./traps.js";

const EXPECTED_TRAP_IDS = [
  "prompt-injection",
  "association-as-causation",
  "correlated-evidence",
  "quantifier-drift",
  "overstated-abstract",
  "review-primary-double-counting",
  "quote-context-reversal",
  "later-correction-retraction",
  "uncited-consensus",
  "population-timeframe-drift",
];

class ScriptedPipelineClient implements LlmClient {
  readonly model = "deterministic-test-model";
  readonly calls: string[] = [];

  async complete(params: CompleteParams): Promise<CompleteResult> {
    const name = params.schema?.name ?? "";
    this.calls.push(name);
    let value: unknown;
    switch (name) {
      case "extracted_claims":
        value = {
          claims: [
            {
              statement: "A balanced diet supports health.",
              claimType: "empirical",
              quote: "A balanced diet supports health.",
              entailment: "The sentence states the claim.",
              population: "",
              intervention: "balanced diet",
              comparator: "",
              outcome: "health",
              timeframe: "",
              quantifiers: "",
              modality: "causal",
            },
            {
              statement: "Regular handwashing reduces transmission of many infections.",
              claimType: "empirical",
              quote: "Regular handwashing reduces transmission of many infections.",
              entailment: "The sentence states the claim.",
              population: "",
              intervention: "regular handwashing",
              comparator: "",
              outcome: "transmission of many infections",
              timeframe: "",
              quantifiers: "many",
              modality: "causal",
            },
          ],
        };
        break;
      case "claim_matches":
        value = { matches: [] };
        break;
      case "argument_structure":
        value = { overallConclusion: "", inferences: [] };
        break;
      case "adversarial_audit":
        value = { challenges: [] };
        break;
      default:
        throw new Error(`Unexpected structured-output schema: ${name}`);
    }
    return { text: JSON.stringify(value), model: this.model, cached: true };
  }
}

class AlwaysMissingClient implements LlmClient {
  readonly model = "missing-cache-test-model";
  async complete(): Promise<CompleteResult> {
    throw new CacheMissError("deterministic-missing-key");
  }
}

describe("adversarial trap catalog", () => {
  it("contains exactly the ten planned traps with unique ids", () => {
    expect(TRAPS.map((trap) => trap.id)).toEqual(EXPECTED_TRAP_IDS);
    expect(new Set(TRAPS.map((trap) => trap.id)).size).toBe(TRAPS.length);
    expect(TRAPS.every((trap) => trap.sources.length > 0)).toBe(true);
  });

  it("does not award a vacuous pass to an empty bundle", () => {
    const empty = new BundleBuilder({
      case: "empty",
      title: "Empty",
      question: "What does this source establish?",
      mode: "cached",
    }).build();
    for (const trap of TRAPS) {
      expect(trap.check(empty), trap.id).toMatchObject({ pass: false });
    }
  });
});

describe("adversarial pipeline runner", () => {
  it("runs extract, match, infer, and audit and validates the resulting bundle", async () => {
    const client = new ScriptedPipelineClient();
    const trap = TRAPS.find((item) => item.id === "prompt-injection")!;

    const run = await runTrap(client, trap, "cached");

    expect(client.calls).toEqual([
      "extracted_claims",
      "claim_matches",
      "argument_structure",
      "adversarial_audit",
    ]);
    expect(run.result).toMatchObject({ pass: true });
    expect(run.stats.extract).toMatchObject({ grounded: 2, quarantined: 0, chunks: 1 });
    expect(validateBundle(run.bundle).ok).toBe(true);
    expect(run.bundle.createdWith).toMatchObject({
      mode: "cached",
      model: "deterministic-test-model",
    });
  });

  it("reports a cache miss as not run rather than pass or model miss", async () => {
    const summary = await runSuite(new AlwaysMissingClient(), [TRAPS[0]!], "cached");

    expect(summary).toMatchObject({
      selected: 1,
      executed: 0,
      detected: 0,
      missed: 0,
      notRun: 1,
      errors: 0,
    });
    expect(summary.outcomes[0]?.status).toBe("not-run");
  });

  it("renders misses and unexecuted traps honestly", () => {
    const trap = TRAPS[0]!;
    const summary: SuiteSummary = {
      mode: "cached",
      selected: 2,
      executed: 1,
      detected: 0,
      missed: 1,
      notRun: 1,
      errors: 0,
      outcomes: [
        {
          trap,
          status: "miss",
          detail: "FAILED: planted behavior remained.",
          run: {
            bundle: new BundleBuilder({ case: "x", title: "X", question: "Q" }).build(),
            result: { pass: false, detail: "FAILED: planted behavior remained." },
            stats: {
              extract: { extracted: 0, grounded: 0, quarantined: 0, chunks: 0 },
              match: { proposed: 0, added: 0, dropped: 0 },
              infer: { proposed: 0, added: 0, conclusionAdded: false },
              audit: { proposed: 0, added: 0, dropped: 0 },
            },
          },
        },
        { trap: TRAPS[1]!, status: "not-run", detail: "No cached response." },
      ],
    };

    const report = renderReport(summary);
    expect(report).toContain("0/1 executed traps detected");
    expect(report).toContain("❌ **miss**");
    expect(report).toContain("⏭️ not run");
    expect(report).not.toContain("1/2 traps detected");
  });
});
