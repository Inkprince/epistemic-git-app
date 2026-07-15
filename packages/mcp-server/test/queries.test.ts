import { readBundleFile } from "@epistemic-git/protocol/node";
import { beforeAll, describe, expect, it } from "vitest";
import type { Bundle } from "@epistemic-git/protocol";
import {
  getClaim, listChallenges, listMatches, overview, perspectiveDiffQuery, support, traceProvenance,
} from "../src/queries.js";

let bundle: Bundle;
beforeAll(async () => { bundle = await readBundleFile("artifacts/lhc.jsonl"); });

describe("mcp queries (deterministic, read-only)", () => {
  it("overview reports the conclusion and counts", () => {
    const o = overview(bundle);
    expect(o.conclusion?.statement).toContain("no credible danger");
    expect(o.counts.claims).toBeGreaterThan(0);
    expect(o.overlays.length).toBe(2);
  });

  it("trace_provenance returns verbatim passages for a source-grounded claim", () => {
    const grounded = bundle.claims.find((c) => c.passages.length > 0)!;
    const tp = traceProvenance(bundle, grounded.id);
    expect("passages" in tp && tp.passages.length).toBeGreaterThan(0);
    expect(JSON.stringify(tp)).toContain("verbatimText");
  });

  it("get_claim includes neutral support and errors cleanly on a bad id", () => {
    const c = bundle.claims[0]!;
    expect(getClaim(bundle, c.id)).toHaveProperty("neutralSupport");
    expect(getClaim(bundle, "cl_nope")).toHaveProperty("error");
  });

  it("perspective_diff decomposes disagreement between the two overlays", () => {
    const [a, b] = bundle.overlays;
    const d = perspectiveDiffQuery(bundle, { overlayA: a!.id, overlayB: b!.id });
    expect("gap" in d && Math.abs(d.gap)).toBeGreaterThan(0);
    expect("topCrux" in d && d.topCrux).toBeTruthy();
  });

  it("list_challenges and list_matches return arrays", () => {
    expect(Array.isArray(listChallenges(bundle))).toBe(true);
    expect(Array.isArray(listMatches(bundle))).toBe(true);
  });

  it("support reflects the conclusion under a perspective", () => {
    const s = support(bundle, { overlayId: bundle.overlays[0]!.id });
    expect(s.conclusion?.support).toBeGreaterThan(0.5);
  });
});
