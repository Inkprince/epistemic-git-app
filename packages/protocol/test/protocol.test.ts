import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BundleBuilder, bundleDigest, parseBundle, serializeBundle, sha256Hex, toNanopubTrig, validateBundle, verifyIds,
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

describe("vendored sha256 (isomorphic content addressing)", () => {
  it("matches the NIST test vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))
      .toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("agrees with node:crypto on randomized inputs (incl. unicode + block boundaries)", () => {
    const alphabet = "abc XYZ 0123 éü中文🙂\n\t«»—“”";
    const cases: string[] = [];
    // Deterministic pseudo-random strings across every interesting length regime.
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (const len of [1, 3, 31, 55, 56, 57, 63, 64, 65, 119, 120, 121, 500, 5000]) {
      for (let k = 0; k < 15; k++) {
        let s = "";
        for (let i = 0; i < len; i++) s += alphabet[Math.floor(rnd() * alphabet.length)];
        cases.push(s);
      }
    }
    for (const s of cases) {
      expect(sha256Hex(s)).toBe(createHash("sha256").update(s, "utf8").digest("hex"));
    }
  });

  it("does not change the ids of any committed artifact bundle (regression tripwire)", () => {
    for (const name of ["lhc", "covid", "eggs", "lhc-addendum"]) {
      const raw = JSON.parse(readFileSync(fileURLToPath(new URL(`../../../artifacts/${name}.json`, import.meta.url)), "utf8"));
      expect(verifyIds(raw), `${name}.json ids drifted`).toEqual([]);
    }
  });
});

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
