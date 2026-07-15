import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Bundle } from "@epistemic-git/protocol";
import { describe, expect, it } from "vitest";
import { diffBundles, merge } from "../src/index.js";

const load = (name: string): Bundle =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../artifacts/${name}.json`, import.meta.url)), "utf8")) as Bundle;

describe("diffBundles — content-addressed bundle diff", () => {
  it("is empty for identical bundles", () => {
    const lhc = load("lhc");
    const d = diffBundles(lhc, lhc);
    expect(d.totalAdded).toBe(0);
    expect(d.totalRemoved).toBe(0);
    expect(d.added).toEqual({});
  });

  it("agrees with the merge report about what a merge added", () => {
    const lhc = load("lhc");
    const addendum = load("lhc-addendum");
    const { bundle: merged, report } = merge(lhc, addendum);
    const d = diffBundles(lhc, merged);
    expect(d.totalRemoved).toBe(0); // merge is a union — nothing is ever lost
    const reportAdded = Object.values(report.added).reduce((a, b) => a + b, 0);
    expect(d.totalAdded).toBe(reportAdded);
  });

  it("is antisymmetric: swapping sides swaps added and removed", () => {
    const lhc = load("lhc");
    const merged = merge(lhc, load("lhc-addendum")).bundle;
    const fwd = diffBundles(lhc, merged);
    const rev = diffBundles(merged, lhc);
    expect(rev.totalRemoved).toBe(fwd.totalAdded);
    expect(rev.totalAdded).toBe(fwd.totalRemoved);
    expect(rev.removed).toEqual(fwd.added);
  });
});
