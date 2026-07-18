import { describe, expect, it } from "vitest";
import { BundleBuilder } from "../src/builder.js";
import { narrativeId } from "../src/ids.js";
import { parseBundle, serializeBundle } from "../src/io.js";
import { validateBundle } from "../src/validate.js";

/**
 * The Narrative node (the AI "cite this claim" summary) is a first-class, content-addressed,
 * attributed, challengeable ledger citizen. These tests pin that: it validates, round-trips through
 * JSONL, is attributed analyst-llm with resolvable grounding, and can be the target of a Challenge.
 */
describe("Narrative node", () => {
  function bundleWithNarrative() {
    const b = new BundleBuilder({ case: "t", title: "T", question: "Are eggs fine?" });
    const src = b.source({ type: "paper", title: "Smith 2020", authors: ["Jane Smith"], publishedDate: "2020-05-01" });
    const pid = b.passage({ sourceId: src, locator: { kind: "char", start: 0, end: 13 }, verbatimText: "eggs are fine" });
    const cid = b.claim({ statement: "Eggs are fine in moderation", claimType: "empirical", passages: [pid], attribution: { kind: "source", ref: src } });
    const nid = b.narrative({
      target: { kind: "claim", id: cid },
      text: "This claim rests on a single observational source and is not strongly reinforced.",
      groundedIn: [cid],
      attribution: { kind: "analyst-llm", ref: "gpt-oss-120b" },
    });
    return { bundle: b.build(), cid, nid };
  }

  it("validates, is attributed analyst-llm, and records resolvable grounding", () => {
    const { bundle, cid, nid } = bundleWithNarrative();
    const res = validateBundle(bundle);
    expect(res.ok, JSON.stringify(res.issues)).toBe(true);
    const nar = bundle.narratives.find((n) => n.id === nid)!;
    expect(nar.attribution.kind).toBe("analyst-llm");
    expect(nar.groundedIn).toContain(cid);
    expect(nar.id).toBe(narrativeId(nar));
  });

  it("survives a JSONL round-trip byte-for-byte", () => {
    const { bundle } = bundleWithNarrative();
    const reparsed = parseBundle(serializeBundle(bundle));
    expect(reparsed.narratives).toHaveLength(1);
    expect(serializeBundle(reparsed)).toBe(serializeBundle(bundle));
    expect(validateBundle(reparsed).ok).toBe(true);
  });

  it("can itself be challenged (the AI's prose is contestable)", () => {
    const { bundle, nid } = bundleWithNarrative();
    const b = new BundleBuilder({ case: "t", title: "T", question: bundle.question });
    // rebuild with a challenge targeting the narrative
    const withChallenge = {
      ...bundle,
      challenges: [
        ...bundle.challenges,
        {
          id: "chl-test", challengeType: "rhetorical-not-evidential" as const,
          target: { kind: "narrative" as const, id: nid },
          rationale: "The summary overstates confidence relative to the single-source support.",
          raisedBy: { kind: "human" as const, ref: "reviewer" }, status: "open" as const,
        },
      ],
    };
    void b;
    // referential integrity: a challenge may target a narrative that exists
    const res = validateBundle(withChallenge);
    const refErrors = res.issues.filter((i) => i.code.startsWith("ref.challenge"));
    expect(refErrors).toEqual([]);
  });
});
