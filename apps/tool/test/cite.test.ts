import { BundleBuilder } from "@epistemic-git/protocol";
import { describe, expect, it } from "vitest";
import { apaForSource, citeClaim } from "../src/cite.js";

/**
 * "Cite this claim" is pure: APA for the paper + the rich provenance trace a bibliography can't give.
 */
describe("citeClaim", () => {
  function fixture() {
    const b = new BundleBuilder({ case: "t", title: "T", question: "Are eggs fine?" });
    const src = b.source({ type: "paper", title: "A cohort study of eggs", authors: ["Jane Smith", "Amir Khan"], publishedDate: "2020-05-01", url: "https://example.org/eggs" });
    const pid = b.passage({ sourceId: src, locator: { kind: "page", page: 4 }, verbatimText: "egg intake showed no association with mortality" });
    const cid = b.claim({ statement: "Eggs show no association with mortality", claimType: "empirical", passages: [pid], attribution: { kind: "source", ref: src } });
    return { bundle: b.build(), cid, src };
  }

  it("formats an APA 7 reference with inverted authors and year", () => {
    const { bundle } = fixture();
    const apa = apaForSource(bundle.sources[0]!);
    expect(apa).toContain("Smith, J.");
    expect(apa).toContain("& Khan, A.");
    expect(apa).toContain("(2020)");
    expect(apa).toContain("https://example.org/eggs");
  });

  it("emits the APA reference and a provenance trace with the verbatim quote", () => {
    const { bundle, cid } = fixture();
    const result = citeClaim(bundle, cid)!;
    expect(result).not.toBeNull();
    expect(result.apa).toHaveLength(1);
    expect(result.markdown).toContain("Where it came from");
    expect(result.markdown).toContain("egg intake showed no association with mortality");
    // JSON form parses and carries the claim + origin.
    const parsed = JSON.parse(result.json) as { claimId: string; origin: unknown[] };
    expect(parsed.claimId).toBe(cid);
    expect(parsed.origin.length).toBe(1);
  });

  it("returns null for an unknown claim id", () => {
    const { bundle } = fixture();
    expect(citeClaim(bundle, "does-not-exist")).toBeNull();
  });
});

describe("apaForSource edge cases", () => {
  const src = (over: Partial<Parameters<BundleBuilder["source"]>[0]>) => {
    const b = new BundleBuilder({ case: "t", title: "T", question: "q" });
    const id = b.source({ type: "paper", title: "A title", authors: ["Jane Smith"], publishedDate: "2020-01-01", ...over });
    return b.build().sources.find((s) => s.id === id)!;
  };

  it("keeps a single-name (mononym) author verbatim", () => {
    expect(apaForSource(src({ authors: ["Aristotle"] }))).toBe("Aristotle (2020). A title.");
  });

  it("inverts a hyphenated surname to 'Surname, I.'", () => {
    expect(apaForSource(src({ authors: ["Anna Smith-Jones"] }))).toContain("Smith-Jones, A.");
  });

  it("preserves an already-inverted 'Last, F.' author", () => {
    expect(apaForSource(src({ authors: ["Débarre, F."] }))).toContain("Débarre, F.");
  });

  it("emits multiple initials for compound given names", () => {
    expect(apaForSource(src({ authors: ["Florence Anne Débarre"] }))).toContain("Débarre, F. A.");
  });

  it("uses 'n.d.' for a missing year and omits a missing url", () => {
    const ref = apaForSource(src({ publishedDate: undefined, url: undefined }));
    expect(ref).toContain("(n.d.)");
    expect(ref).not.toContain("http");
  });

  it("leads with the title (no leading period) when there are no authors", () => {
    expect(apaForSource(src({ authors: [], title: "Anonymous report." }))).toBe("Anonymous report. (2020).");
  });

  it("adds a type descriptor for non-obvious source kinds", () => {
    expect(apaForSource(src({ type: "preprint" }))).toContain("[Preprint]");
  });
});

describe("citeClaim provenance edge cases", () => {
  it("handles a derived conclusion with no direct quote, tracing to its grounded premises across sources", () => {
    const b = new BundleBuilder({ case: "t", title: "T", question: "q" });
    const human = { kind: "human" as const, ref: "a" };
    const s1 = b.source({ type: "paper", title: "Study one", authors: ["Jane Smith"], publishedDate: "2019-01-01" });
    const s2 = b.source({ type: "paper", title: "Study two", authors: ["Amir Khan"], publishedDate: "2021-01-01" });
    const p1 = b.passage({ sourceId: s1, locator: { kind: "page", page: 1 }, verbatimText: "finding one" });
    const p2 = b.passage({ sourceId: s2, locator: { kind: "page", page: 2 }, verbatimText: "finding two" });
    const c1 = b.claim({ statement: "Premise one", claimType: "empirical", passages: [p1], attribution: { kind: "source", ref: s1 } });
    const c2 = b.claim({ statement: "Premise two", claimType: "empirical", passages: [p2], attribution: { kind: "source", ref: s2 } });
    const concl = b.claim({ statement: "Therefore the conclusion", claimType: "predictive", derived: true, attribution: human });
    b.inference({ type: "supports", premises: [c1, c2], conclusion: concl, warrant: "both point the same way", strength: "moderate", attribution: human });
    const bundle = b.build();

    const result = citeClaim(bundle, concl)!;
    expect(result).not.toBeNull();
    // provenance resolves through BOTH grounded premises → one APA reference per source.
    expect(result.apa).toHaveLength(2);
    expect(result.markdown).toContain("finding one");
    expect(result.markdown).toContain("finding two");
  });

  it("still cites a derived claim whose premises carry no quotes (empty APA, not a crash)", () => {
    const b = new BundleBuilder({ case: "t", title: "T", question: "q" });
    const human = { kind: "human" as const, ref: "a" };
    const c1 = b.claim({ statement: "Ungrounded premise", claimType: "empirical", derived: true, attribution: human });
    const concl = b.claim({ statement: "Ungrounded conclusion", claimType: "predictive", derived: true, attribution: human });
    b.inference({ type: "supports", premises: [c1], conclusion: concl, warrant: "w", strength: "weak", attribution: human });
    const bundle = b.build();

    const result = citeClaim(bundle, concl)!;
    expect(result).not.toBeNull();
    expect(result.apa).toHaveLength(0);
    expect(result.markdown).toContain("inferred conclusion");
  });
});
