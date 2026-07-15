import { BundleBuilder } from "@epistemic-git/protocol";
import type { CompleteParams, CompleteResult, LlmClient } from "@epistemic-git/llm";
import { describe, expect, it } from "vitest";
import { inferArgument } from "../src/index.js";

class FakeInferer implements LlmClient {
  readonly model = "fake-model";
  constructor(private readonly payload: unknown) {}
  async complete(_p: CompleteParams): Promise<CompleteResult> {
    return { text: JSON.stringify(this.payload), model: this.model, cached: false };
  }
}

function threeClaimBundle() {
  const b = new BundleBuilder({ case: "t", title: "t", question: "Is it safe?" });
  const human = { kind: "human" as const, ref: "a" };
  b.claim({ statement: "Evidence one.", claimType: "empirical", derived: true, attribution: human });
  b.claim({ statement: "Evidence two.", claimType: "empirical", derived: true, attribution: human });
  b.claim({ statement: "A counter-consideration.", claimType: "empirical", derived: true, attribution: human });
  return b.build();
}

describe("stage 3 — inference reconstruction", () => {
  it("adds a synthesized conclusion and wires inferences by index", async () => {
    const client = new FakeInferer({
      overallConclusion: "Therefore the thing is safe.",
      inferences: [
        { type: "supports", premiseIndexes: [0, 1], conclusionIndex: -1, warrant: "two lines of evidence support safety", strength: "strong", defeaters: ["either datum is wrong"] },
        { type: "rebuts", premiseIndexes: [2], conclusionIndex: -1, warrant: "the counter-consideration argues against safety", strength: "weak", defeaters: [] },
        { type: "supports", premiseIndexes: [99], conclusionIndex: -1, warrant: "out of range — should be dropped", strength: "moderate", defeaters: [] },
      ],
    });

    const input = threeClaimBundle();
    const { bundle, stats } = await inferArgument(input, client);

    expect(stats.conclusionAdded).toBe(true);
    expect(stats.added).toBe(2); // the out-of-range premise inference is dropped

    const conclusion = bundle.claims.find((c) => c.statement === "Therefore the thing is safe.");
    expect(conclusion?.derived).toBe(true);
    expect(conclusion?.attribution.kind).toBe("analyst-llm");

    const supports = bundle.inferences.find((i) => i.type === "supports");
    expect(supports?.conclusion).toBe(conclusion?.id);
    expect(supports?.premises).toEqual([input.claims[0]!.id, input.claims[1]!.id]);
    expect(supports?.attribution.kind).toBe("analyst-llm"); // the tool drew it, not the source

    const rebuts = bundle.inferences.find((i) => i.type === "rebuts");
    expect(rebuts?.premises).toEqual([input.claims[2]!.id]);
  });
});
