import { BundleBuilder, validateBundle } from "@epistemic-git/protocol";
import type { CompleteParams, CompleteResult, LlmClient } from "@epistemic-git/llm";
import { describe, expect, it } from "vitest";
import { extractInto, locateQuote } from "../src/index.js";

/** Returns a fixed extraction payload regardless of the prompt, counting calls. */
class FakeExtractor implements LlmClient {
  readonly model = "fake-model";
  calls = 0;
  constructor(private readonly payload: unknown) {}
  async complete(_p: CompleteParams): Promise<CompleteResult> {
    this.calls++;
    return { text: JSON.stringify(this.payload), model: this.model, cached: false };
  }
}

const SOURCE_TEXT =
  "Eggs raise LDL cholesterol in some adults. The Huanan market was an early COVID-19 cluster.";

function claim(overrides: Record<string, unknown>) {
  return {
    statement: "", claimType: "empirical", quote: "", entailment: "because the source says so",
    population: "", intervention: "", comparator: "", outcome: "", timeframe: "", quantifiers: "",
    modality: "unspecified", ...overrides,
  };
}

describe("stage 1 — quote-grounded extraction", () => {
  it("grounds a claim whose quote is a verbatim substring and quarantines one that is not", async () => {
    const client = new FakeExtractor({
      claims: [
        claim({
          statement: "Egg consumption raises LDL cholesterol in some adults.",
          quote: "Eggs raise LDL cholesterol in some adults.",
          population: "some adults", intervention: "egg consumption", outcome: "raised LDL cholesterol", modality: "causal",
        }),
        // this quote is NOT present verbatim in the source → must be quarantined, not admitted
        claim({ statement: "Vaccines cause autism.", quote: "Vaccines cause autism." }),
        // empty quote → quarantined for no supporting passage
        claim({ statement: "An unsupported assertion.", quote: "" }),
      ],
    });

    const builder = new BundleBuilder({ case: "test", title: "Test source", question: "?", mode: "cached" });
    const sourceId = builder.source({ type: "paper", title: "Test source" });
    const stats = await extractInto(builder, client, { sourceId, sourceTitle: "Test source", text: SOURCE_TEXT });

    expect(stats.extracted).toBe(3);
    expect(stats.grounded).toBe(1);
    expect(stats.quarantined).toBe(2);

    const bundle = builder.build();
    expect(bundle.claims.length).toBe(1);
    expect(bundle.quarantine.length).toBe(2);

    // the grounded claim points at a passage with correct char offsets into the real text
    const passage = bundle.passages[0]!;
    expect(passage.locator).toEqual({ kind: "char", start: 0, end: SOURCE_TEXT.indexOf(".") + 1 });
    expect(SOURCE_TEXT.slice(0, (passage.locator as { end: number }).end)).toBe(passage.verbatimText);

    // structured distinctions are preserved
    expect(bundle.claims[0]!.structure?.population).toBe("some adults");
    expect(bundle.claims[0]!.structure?.modality).toBe("causal");

    // and the whole thing is a valid, provenance-respecting ledger
    expect(validateBundle(bundle).ok).toBe(true);
  });

  it("chunks a long source, calls the model per chunk, and grounds against the full text", async () => {
    const longText =
      "Alpha beta gamma. Delta epsilon zeta. " + "filler ".repeat(40) +
      "The ANCHOR CLAIM appears exactly once near the end of the document.";
    const client = new FakeExtractor({
      claims: [claim({ statement: "There is an anchor claim.", quote: "The ANCHOR CLAIM appears exactly once near the end of the document." })],
    });

    const builder = new BundleBuilder({ case: "test", title: "Long source", question: "?", mode: "cached" });
    const sourceId = builder.source({ type: "paper", title: "Long source" });
    const stats = await extractInto(builder, client, { sourceId, sourceTitle: "Long source", text: longText }, { chunkChars: 60, overlapChars: 15 });

    expect(stats.chunks).toBeGreaterThan(1);         // the text was split
    expect(client.calls).toBe(stats.chunks);          // one model call per chunk
    expect(stats.grounded).toBe(1);                   // duplicate proposals coalesced to one grounded claim
    expect(builder.build().claims.length).toBe(1);
  });

  it("locates quotes tolerantly (whitespace runs, typographic quotes/dashes) but stores source bytes", async () => {
    const text = "The trial — dubbed “PREDIMED” — reduced   cardiovascular\nevents by 28% in adults.";

    // Exact match still wins.
    expect(locateQuote(text, "reduced   cardiovascular\nevents")).toEqual({
      start: text.indexOf("reduced"), end: text.indexOf("events") + "events".length,
    });
    // Model normalised the whitespace and punctuation — still locates the original span.
    const loc = locateQuote(text, 'The trial - dubbed "PREDIMED" - reduced cardiovascular events by 28% in adults.');
    expect(loc).toBeDefined();
    expect(text.slice(loc!.start, loc!.end)).toBe(text); // matched the full original, source bytes intact
    // Genuinely absent text stays unfindable.
    expect(locateQuote(text, "eggs cause heart attacks")).toBeUndefined();

    // End to end: the admitted passage carries the SOURCE's bytes, not the model's rendition.
    const client = new FakeExtractor({
      claims: [claim({ statement: "PREDIMED reduced CV events.", quote: 'dubbed "PREDIMED" - reduced cardiovascular events' })],
    });
    const builder = new BundleBuilder({ case: "test", title: "T", question: "?", mode: "cached" });
    const sourceId = builder.source({ type: "paper", title: "T" });
    const stats = await extractInto(builder, client, { sourceId, sourceTitle: "T", text });
    expect(stats.grounded).toBe(1);
    expect(stats.quarantined).toBe(0);
    const passage = builder.build().passages[0]!;
    expect(passage.verbatimText).toBe("dubbed “PREDIMED” — reduced   cardiovascular\nevents");
    expect(text.slice((passage.locator as { start: number }).start, (passage.locator as { end: number }).end)).toBe(passage.verbatimText);
  });
});
