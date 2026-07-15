import { describe, expect, it } from "vitest";
import {
  BundleBuilder, bundleDigest, parseBundle, serializeBundle, toNanopubTrig, validateBundle,
} from "../src/index.js";

/** A tiny two-source bundle used across the protocol tests. */
function tinyBundle() {
  const b = new BundleBuilder({ case: "test", title: "Test", question: "Does X hold?", mode: "hand-authored" });
  const src = b.source({ type: "paper", title: "A study of X", authors: ["Ada Lovelace"] });
  const psg = b.passage({ sourceId: src, locator: { kind: "page", page: 3 }, verbatimText: "X holds under condition C." });
  const cl = b.claim({
    statement: "X holds under condition C.", claimType: "empirical",
    passages: [psg], attribution: { kind: "source", ref: src },
  });
  const concl = b.claim({
    statement: "Therefore X is generally reliable.", claimType: "predictive",
    derived: true, attribution: { kind: "analyst-llm", ref: "test-model" },
  });
  b.inference({
    type: "supports", premises: [cl], conclusion: concl,
    warrant: "If X holds under C and C is common, X is generally reliable.",
    strength: "moderate", attribution: { kind: "analyst-llm", ref: "test-model" },
  });
  return b.build();
}

describe("content-addressed ids", () => {
  it("are deterministic across independent builds", () => {
    expect(bundleDigest(tinyBundle())).toBe(bundleDigest(tinyBundle()));
  });

  it("are insensitive to whitespace and attribution", () => {
    const a = new BundleBuilder({ case: "t", title: "T", question: "q" });
    const b = new BundleBuilder({ case: "t", title: "T", question: "q" });
    const idA = a.claim({ statement: "The  sky   is blue.", claimType: "empirical", derived: true, attribution: { kind: "human", ref: "alice" } });
    const idB = b.claim({ statement: "The sky is blue.", claimType: "empirical", derived: true, attribution: { kind: "analyst-llm", ref: "model" } });
    expect(idA).toBe(idB); // same assertion → same id, regardless of who said it or spacing
  });
});

describe("serialization", () => {
  it("round-trips through JSONL byte-stably", () => {
    const bundle = tinyBundle();
    const once = serializeBundle(bundle);
    const twice = serializeBundle(parseBundle(once));
    expect(twice).toBe(once);
  });
});

describe("validation invariants", () => {
  it("accepts a well-formed bundle", () => {
    expect(validateBundle(tinyBundle()).ok).toBe(true);
  });

  it("rejects a source-grounded claim with no passage (provenance invariant)", () => {
    const b = new BundleBuilder({ case: "t", title: "T", question: "q" });
    const src = b.source({ type: "blog", title: "Opinion" });
    b.claim({ statement: "Unbacked assertion.", claimType: "empirical", attribution: { kind: "source", ref: src } });
    const res = validateBundle(b.build());
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "invariant.provenance")).toBe(true);
  });

  it("rejects a tampered id (content addressing holds)", () => {
    const bundle = tinyBundle();
    bundle.claims[0]!.id = "cl_tampered";
    const res = validateBundle(bundle);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code.startsWith("id."))).toBe(true);
  });
});

describe("nanopub export", () => {
  it("emits a TriG assertion/provenance/pubinfo graph per claim", () => {
    const trig = toNanopubTrig(tinyBundle());
    expect(trig).toContain("np:hasAssertion");
    expect(trig).toContain("np:hasProvenance");
    expect(trig).toContain("prov:wasAttributedTo");
  });
});
