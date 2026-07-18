import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteScenario, loadScenarios, saveScenario } from "../src/cases/scenarios.js";

/** Minimal localStorage shim, the module guards on typeof localStorage. */
function installLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>)["localStorage"] = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

describe("scenario branches (localStorage CRUD)", () => {
  beforeEach(installLocalStorage);
  afterEach(() => { delete (globalThis as Record<string, unknown>)["localStorage"]; });

  it("saves, lists, overwrites by name, and deletes per case", () => {
    expect(loadScenarios("lhc")).toEqual([]);
    saveScenario("lhc", { name: "skeptic", distrust: ["cl_a"], respectCorrelation: true });
    saveScenario("lhc", { name: "trusting", distrust: [], respectCorrelation: false });
    expect(loadScenarios("lhc").map((s) => s.name)).toEqual(["skeptic", "trusting"]);
    expect(loadScenarios("covid")).toEqual([]); // per-case isolation

    saveScenario("lhc", { name: "skeptic", distrust: ["cl_a", "cl_b"], respectCorrelation: true });
    const skeptic = loadScenarios("lhc").find((s) => s.name === "skeptic")!;
    expect(skeptic.distrust).toEqual(["cl_a", "cl_b"]); // same-name save replaces

    deleteScenario("lhc", "trusting");
    expect(loadScenarios("lhc").map((s) => s.name)).toEqual(["skeptic"]);
  });

  it("no-ops safely without localStorage", () => {
    delete (globalThis as Record<string, unknown>)["localStorage"];
    expect(loadScenarios("lhc")).toEqual([]);
    expect(() => saveScenario("lhc", { name: "x", distrust: [], respectCorrelation: true })).not.toThrow();
  });
});
