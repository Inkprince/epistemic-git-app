import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Bundle } from "@epistemic-git/protocol";
import { describe, expect, it } from "vitest";
import { decodeScenario, encodeScenario, formatHash, idRef, parseHash, resolveRef } from "../src/routing.js";
import type { Route } from "../src/routing.js";

const lhc = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../artifacts/lhc.json", import.meta.url)), "utf8"),
) as Bundle;

describe("hash routing", () => {
  it("round-trips every route shape", () => {
    const routes: Route[] = [
      { screen: "overview" },
      { screen: "case", caseId: "lhc" },
      { screen: "case", caseId: "imp-9f31ab02" },
      { screen: "case", caseId: "lhc", params: { tab: "challenges" } },
      { screen: "case", caseId: "lhc", params: { tab: "perspectives", sel: "9f31ab02", scenario: "1~0~abcd1234~11112222.33334444" } },
    ];
    for (const r of routes) {
      expect(parseHash(formatHash(r))).toEqual(r);
    }
  });

  it("drops malformed params instead of erroring", () => {
    expect(parseHash("#/case/lhc?tab=nonsense&sel=<script>&s=%%%%")).toEqual({ screen: "case", caseId: "lhc" });
    expect(parseHash("#/nonsense")).toEqual({ screen: "overview" });
    expect(parseHash("")).toEqual({ screen: "overview" });
  });

  it("keeps the default-tab URL clean", () => {
    expect(formatHash({ screen: "case", caseId: "lhc", params: { tab: "argument" } })).toBe("#/case/lhc");
  });
});

describe("scenario codec", () => {
  it("round-trips a real belief-state against the real LHC bundle", () => {
    const claims = lhc.claims.filter((c) => !c.derived).slice(0, 2).map((c) => c.id);
    const overlay = lhc.overlays[0]!.id;
    const code = encodeScenario({ overlayId: overlay, distrust: claims, respectCorrelation: false });
    const decoded = decodeScenario(code, lhc);
    expect(decoded).not.toBeNull();
    expect(decoded!.overlayId).toBe(overlay);
    expect([...decoded!.distrust].sort()).toEqual([...claims].sort());
    expect(decoded!.respectCorrelation).toBe(false);
  });

  it("degrades gracefully when a ref cannot be resolved", () => {
    const code = encodeScenario({ distrust: ["cl_ffffffffffffffff"], respectCorrelation: true });
    const decoded = decodeScenario(code, lhc);
    expect(decoded).not.toBeNull();
    expect(decoded!.distrust).toEqual([]); // unknown claim dropped, not an error
  });

  it("rejects malformed codes", () => {
    expect(decodeScenario("2~1~-~-", lhc)).toBeNull();
    expect(decodeScenario("garbage", lhc)).toBeNull();
  });
});

describe("id refs", () => {
  it("resolves 8-hex prefixes uniquely against the bundle", () => {
    for (const c of lhc.claims) {
      expect(resolveRef(idRef(c.id), lhc)).toBe(c.id);
    }
  });
});
