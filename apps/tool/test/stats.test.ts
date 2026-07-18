import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Bundle } from "@epistemic-git/protocol";
import { describe, expect, it } from "vitest";
import { attributionMix, auditActivity, overviewKpis, supportByCase } from "../src/stats.js";

const load = (name: string): Bundle =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../artifacts/${name}.json`, import.meta.url)), "utf8")) as Bundle;

const registry = {
  lhc: { label: "LHC black holes", bundle: load("lhc") },
  covid: { label: "COVID origins", bundle: load("covid") },
  eggs: { label: "Eggs & heart health", bundle: load("eggs") },
};

describe("overview aggregations", () => {
  it("overviewKpis sums across all bundles", () => {
    const k = overviewKpis(registry);
    expect(k.cases).toBe(3);
    expect(k.claims).toBe(Object.values(registry).reduce((a, r) => a + r.bundle.claims.length, 0));
    expect(k.openChallenges).toBeLessThanOrEqual(k.challenges);
  });

  it("supportByCase computes a support value in [0,1] per case", () => {
    const rows = supportByCase(registry);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.support).toBeGreaterThanOrEqual(0);
      expect(r.support).toBeLessThanOrEqual(1);
    }
  });

  it("supportByCase survives an empty bundle (0-claim guard)", () => {
    const empty: Bundle = { ...load("lhc"), claims: [], inferences: [], passages: [], challenges: [], matches: [], correlationGroups: [], overlays: [], assessments: [], quarantine: [] };
    const rows = supportByCase({ empty: { label: "Empty", bundle: empty } });
    expect(rows[0]!.support).toBe(0);
  });

  it("attributionMix partitions every claim exactly once", () => {
    const mix = attributionMix(registry);
    expect(mix.fromSource + mix.llm + mix.human).toBe(mix.total);
  });

  it("auditActivity interleaves cases and respects the limit", () => {
    const items = auditActivity(registry, 4);
    expect(items.length).toBeLessThanOrEqual(4);
    expect(new Set(items.map((i) => i.caseId)).size).toBeGreaterThan(1); // not dominated by one case
  });
});
