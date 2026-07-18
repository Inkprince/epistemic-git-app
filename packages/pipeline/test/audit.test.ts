import { BundleBuilder } from "@epistemic-git/protocol";
import type { CompleteParams, CompleteResult, LlmClient } from "@epistemic-git/llm";
import { describe, expect, it } from "vitest";
import { auditBundle } from "../src/index.js";

class FakeAuditor implements LlmClient {
  readonly model = "fake-model";
  constructor(private readonly payload: unknown) {}
  async complete(_p: CompleteParams): Promise<CompleteResult> {
    return { text: JSON.stringify(this.payload), model: this.model, cached: false };
  }
}

function smallArgument() {
  const b = new BundleBuilder({ case: "t", title: "t", question: "Is it safe?" });
  const human = { kind: "human" as const, ref: "a" };
  const c0 = b.claim({ statement: "A cohort study found an association.", claimType: "empirical", derived: true, attribution: human });
  const c1 = b.claim({ statement: "Therefore it is safe.", claimType: "predictive", derived: true, attribution: human });
  b.inference({ type: "supports", premises: [c0], conclusion: c1, warrant: "association implies safety", strength: "moderate", attribution: human });
  return b.build();
}

describe("stage 4, adversarial audit", () => {
  it("admits challenges that point at a specific node and drops the rest", async () => {
    const client = new FakeAuditor({
      challenges: [
        { challengeType: "scope-drift", targetKind: "claim", targetIndex: 0, topic: "", rationale: "generalizes beyond the cohort", suggestedRemedy: "restrict scope" },
        { challengeType: "invalid-inference", targetKind: "inference", targetIndex: 0, topic: "", rationale: "association does not license a safety conclusion", suggestedRemedy: "" },
        { challengeType: "missing-source", targetKind: "topic", targetIndex: -1, topic: "a randomized trial", rationale: "no experimental evidence is present", suggestedRemedy: "find an RCT" },
        { challengeType: "confounding", targetKind: "claim", targetIndex: 99, topic: "", rationale: "out of range, should be dropped", suggestedRemedy: "" },
      ],
    });

    const input = smallArgument();
    const { bundle, stats } = await auditBundle(input, client);

    expect(stats.proposed).toBe(4);
    expect(stats.added).toBe(3);
    expect(stats.dropped).toBe(1); // the out-of-range target is not admitted

    const byType = Object.fromEntries(bundle.challenges.map((c) => [c.challengeType, c]));
    expect(byType["scope-drift"]!.target).toEqual({ kind: "claim", id: input.claims[0]!.id });
    expect(byType["invalid-inference"]!.target).toEqual({ kind: "inference", id: input.inferences[0]!.id });
    expect(byType["missing-source"]!.target).toEqual({ kind: "topic", id: "a randomized trial" });

    expect(byType["scope-drift"]!.suggestedRemedy).toBe("restrict scope");
    expect(byType["invalid-inference"]!.suggestedRemedy).toBeUndefined(); // empty remedy omitted
    expect(byType["scope-drift"]!.raisedBy.kind).toBe("analyst-llm");
    expect(byType["scope-drift"]!.status).toBe("open");
  });

  it("with a focus claim, admits only challenges on that claim or an inference bearing on it", async () => {
    const input = smallArgument();
    const premise = input.claims[0]!; // index 0, NOT the focus
    const conclusion = input.claims[1]!; // index 1, the focus
    const inf = input.inferences[0]!; // premises:[premise], conclusion → bears on the focus

    const client = new FakeAuditor({
      challenges: [
        // on the focus claim itself → admitted
        { challengeType: "omitted-qualification", targetKind: "claim", targetIndex: 1, topic: "", rationale: "overstates the safety conclusion", suggestedRemedy: "" },
        // on an inference whose conclusion is the focus → admitted
        { challengeType: "invalid-inference", targetKind: "inference", targetIndex: 0, topic: "", rationale: "association does not license safety", suggestedRemedy: "" },
        // on a different claim (the premise) → OFF-target, dropped even though it resolves
        { challengeType: "confounding", targetKind: "claim", targetIndex: 0, topic: "", rationale: "the cohort premise is confounded", suggestedRemedy: "" },
        // on a topic → OFF-target under focus, dropped
        { challengeType: "missing-source", targetKind: "topic", targetIndex: -1, topic: "an RCT", rationale: "no experiment", suggestedRemedy: "" },
      ],
    });

    const { bundle, stats } = await auditBundle(input, client, { focusClaimId: conclusion.id });

    expect(stats.proposed).toBe(4);
    expect(stats.added).toBe(2);
    expect(stats.dropped).toBe(2); // the off-target claim and the topic

    const targets = bundle.challenges.map((c) => `${c.target.kind}:${c.target.id}`);
    expect(targets).toContain(`claim:${conclusion.id}`);
    expect(targets).toContain(`inference:${inf.id}`);
    expect(targets).not.toContain(`claim:${premise.id}`);
    expect(bundle.challenges.some((c) => c.target.kind === "topic")).toBe(false);
  });
});
