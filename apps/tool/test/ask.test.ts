import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Bundle } from "@epistemic-git/protocol";
import { describe, expect, it } from "vitest";
import { answerCase } from "../src/ask.js";

const covid = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../artifacts/covid.json", import.meta.url)), "utf8"),
) as Bundle;

const ctx = { respectCorrelation: true };

describe("answerCase, grounded router over the COVID ledger", () => {
  it("names the crux for a disagreement question", () => {
    const a = answerCase("what's the crux of the disagreement?", covid, ctx);
    expect(a.kind).toBe("crux");
    expect(a.grounded).toBe(true);
    expect(a.headline.length).toBeGreaterThan(0);
    expect(a.note).toMatch(/relative weights|confidence numbers/i);
  });

  it("reports support with a percentage for a confidence question", () => {
    const a = answerCase("how strong is the conclusion?", covid, ctx);
    expect(a.kind).toBe("support");
    expect(a.grounded).toBe(true);
    expect(a.headline).toMatch(/%/);
    expect(a.focusId).toBeTruthy();
  });

  it("lists sources for a provenance question with no specific claim", () => {
    const a = answerCase("what are the sources?", covid, ctx);
    expect(a.kind).toBe("provenance");
    expect(a.grounded).toBe(true);
    expect(a.points.length + a.citations.length).toBeGreaterThan(0);
  });

  it("traces a derived conclusion down to its grounded premises", () => {
    const conclusion = covid.claims.find((c) => c.derived)!;
    const a = answerCase("what's the source for this?", covid, { respectCorrelation: true, selectedId: conclusion.id });
    expect(a.kind).toBe("provenance");
    expect(a.grounded).toBe(true);
    expect(a.headline).toMatch(/inferred conclusion/i);
    // every cited premise points at a real claim and carries a verbatim quote
    expect(a.citations.length).toBeGreaterThan(0);
    for (const c of a.citations) {
      expect(c.nodeId && covid.claims.some((x) => x.id === c.nodeId)).toBeTruthy();
      expect(typeof c.quote).toBe("string");
    }
  });

  it("surfaces challenges for a weakness question", () => {
    const a = answerCase("what's the weakest point?", covid, ctx);
    expect(a.kind).toBe("challenges");
    expect(a.grounded).toBe(true);
  });

  it("answers the independence question from correlation groups", () => {
    const a = answerCase("is any evidence double-counted?", covid, ctx);
    expect(a.kind).toBe("independence");
    expect(a.grounded).toBe(true);
  });

  it("runs a structural what's-missing check", () => {
    const a = answerCase("what's missing here?", covid, ctx);
    expect(a.kind).toBe("missing");
    expect(a.points.length).toBeGreaterThan(0);
  });

  it("refuses (grounded=false) anything outside the ledger", () => {
    const a = answerCase("what will the weather be tomorrow?", covid, ctx);
    expect(a.grounded).toBe(false);
    expect(a.kind).toBe("refused");
    expect(a.headline).toMatch(/only answer from|ledger/i);
  });
});
