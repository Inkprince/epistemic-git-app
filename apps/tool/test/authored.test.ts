import { BundleBuilder, challengeId, narrativeId } from "@epistemic-git/protocol";
import type { Bundle, Challenge, Narrative } from "@epistemic-git/protocol";
import { beforeEach, describe, expect, it } from "vitest";

// Minimal in-memory localStorage so the (browser-only) authored store works under the node test env.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
(globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();

// Import AFTER the stub is installed (the module reads `localStorage` at call time, but be safe).
const {
  loadAuthored, saveAuthoredChallenges, saveAuthoredNarrative, withAuthored,
} = await import("../src/cases/authored.js");

function baseBundle(): { bundle: Bundle; claimId: string } {
  const b = new BundleBuilder({ case: "t", title: "T", question: "q" });
  const human = { kind: "human" as const, ref: "a" };
  const src = b.source({ type: "paper", title: "S", authors: ["Jane Smith"], publishedDate: "2020-01-01" });
  const pid = b.passage({ sourceId: src, locator: { kind: "page", page: 1 }, verbatimText: "quote" });
  const claimId = b.claim({ statement: "A grounded claim", claimType: "empirical", passages: [pid], attribution: { kind: "source", ref: src } });
  return { bundle: b.build(), claimId };
}

function mkChallenge(targetId: string, rationale: string): Challenge {
  const target = { kind: "claim" as const, id: targetId };
  return {
    id: challengeId({ challengeType: "scope-drift", target, rationale }),
    challengeType: "scope-drift", target, rationale,
    raisedBy: { kind: "analyst-llm" as const, ref: "m" }, status: "open",
  };
}

function mkNarrative(targetId: string, text: string, groundedIn: string[]): Narrative {
  const target = { kind: "claim" as const, id: targetId };
  return { id: narrativeId({ target, text, groundedIn }), target, text, groundedIn, attribution: { kind: "analyst-llm", ref: "m" } };
}

describe("authored store, challenges & narratives", () => {
  beforeEach(() => { (globalThis as unknown as { localStorage: MemStorage }).localStorage.clear(); });

  it("dedups saved challenges by content id", () => {
    const { bundle, claimId } = baseBundle();
    const ch = mkChallenge(claimId, "generalizes beyond the sample");
    saveAuthoredChallenges("t", [ch]);
    saveAuthoredChallenges("t", [ch, mkChallenge(claimId, "generalizes beyond the sample")]); // same id twice
    expect(loadAuthored("t").challenges).toHaveLength(1);
  });

  it("keeps only the latest narrative per target", () => {
    const { bundle, claimId } = baseBundle();
    saveAuthoredNarrative("t", mkNarrative(claimId, "first summary", [claimId]));
    saveAuthoredNarrative("t", mkNarrative(claimId, "second summary", [claimId]));
    const stored = loadAuthored("t").narratives;
    expect(stored).toHaveLength(1);
    expect(stored[0]!.text).toBe("second summary");
  });

  it("composes authored challenges & narratives into a bundle, deduping against existing nodes", () => {
    const { bundle, claimId } = baseBundle();
    const ch = mkChallenge(claimId, "unsupported leap");
    const nar = mkNarrative(claimId, "This rests on one source.", [claimId]);
    saveAuthoredChallenges("t", [ch]);
    saveAuthoredNarrative("t", nar);

    const composed = withAuthored(bundle, "t");
    expect(composed.challenges.map((c) => c.id)).toContain(ch.id);
    expect((composed.narratives ?? []).map((n) => n.id)).toContain(nar.id);

    // Re-composing over a bundle that ALREADY has them adds no duplicates.
    const again = withAuthored(composed, "t");
    expect(again.challenges).toHaveLength(composed.challenges.length);
    expect(again.narratives ?? []).toHaveLength((composed.narratives ?? []).length);
  });

  it("drops authored nodes whose targets/grounding don't resolve in the bundle", () => {
    const { bundle, claimId } = baseBundle();
    saveAuthoredChallenges("t", [mkChallenge("cl_missing", "targets a claim not in this bundle")]);
    saveAuthoredNarrative("t", mkNarrative(claimId, "grounded in a ghost", ["cl_ghost"]));

    const composed = withAuthored(bundle, "t");
    expect(composed.challenges.some((c) => c.target.id === "cl_missing")).toBe(false);
    expect((composed.narratives ?? []).some((n) => n.groundedIn.includes("cl_ghost"))).toBe(false);
  });

  it("leaves the bundle untouched when there are no authored additions", () => {
    const { bundle } = baseBundle();
    expect(withAuthored(bundle, "empty-case")).toBe(bundle);
  });
});
