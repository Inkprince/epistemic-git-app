import { BundleBuilder } from "@epistemic-git/protocol";
import type { CompleteParams, CompleteResult, LlmClient } from "@epistemic-git/llm";
import { describe, expect, it } from "vitest";
import { matchClaims } from "../src/index.js";

class FakeMatcher implements LlmClient {
  readonly model = "fake-model";
  constructor(private readonly payload: unknown) {}
  async complete(_p: CompleteParams): Promise<CompleteResult> {
    return { text: JSON.stringify(this.payload), model: this.model, cached: false };
  }
}

function claimsBundle() {
  const b = new BundleBuilder({ case: "t", title: "t", question: "?" });
  const human = { kind: "human" as const, ref: "a" };
  b.claim({ statement: "Eggs raise CVD risk in diabetics.", claimType: "empirical", derived: true, attribution: human });
  b.claim({ statement: "Eggs raise cardiovascular risk among people with type 2 diabetes.", claimType: "empirical", derived: true, attribution: human });
  b.claim({ statement: "Eggs have no effect on CVD risk in the general population.", claimType: "empirical", derived: true, attribution: human });
  return b.build();
}

describe("stage 2, claim matching", () => {
  it("adds typed match edges by index and drops invalid ones without collapsing claims", async () => {
    const client = new FakeMatcher({
      matches: [
        { type: "equivalent", fromIndex: 0, toIndex: 1, rationale: "same population, exposure, and outcome, different wording" },
        { type: "compatible-different-scope", fromIndex: 0, toIndex: 2, rationale: "diabetics vs general population" },
        { type: "narrower", fromIndex: 0, toIndex: 99, rationale: "out of range, should be dropped" },
        { type: "equivalent", fromIndex: 2, toIndex: 2, rationale: "self, should be dropped" },
      ],
    });

    const input = claimsBundle();
    const { bundle, stats } = await matchClaims(input, client);

    expect(stats.proposed).toBe(4);
    expect(stats.added).toBe(2);
    expect(stats.dropped).toBe(2); // out-of-range and self-match

    // claims are NOT merged, all three survive; the relations are recorded as edges
    expect(bundle.claims.length).toBe(3);
    expect(bundle.matches.length).toBe(2);

    const equiv = bundle.matches.find((m) => m.type === "equivalent");
    expect(new Set([equiv!.from, equiv!.to])).toEqual(new Set([input.claims[0]!.id, input.claims[1]!.id]));
    expect(equiv!.attribution.kind).toBe("analyst-llm");
    expect(bundle.matches.some((m) => m.type === "compatible-different-scope")).toBe(true);
  });
});
