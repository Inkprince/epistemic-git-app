import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";

/**
 * Headless render smoke test: exercises the full component render path (case-store init,
 * useMemo analysis calls, overview aggregation, detail argument rendering) without a browser,
 * so a runtime crash surfaces in CI. Runs under vitest (not tsx) because the case manifest
 * uses import.meta.glob, a Vite-transform feature.
 */
describe("app smoke render", () => {
  it("renders the overview with real data", () => {
    const html = renderToString(createElement(App));
    for (const s of ["Evidence ledgers", "Conclusion support by case", "Claim attribution", "Adversarial audit trail", "Case ledgers", "Import ledger"]) {
      expect(html, `overview missing "${s}"`).toContain(s);
    }
  });

  it("renders the LHC case detail with real data", () => {
    const html = renderToString(createElement(App, { initialRoute: { screen: "case", caseId: "lhc" } }));
    for (const s of ["Live support", "Supporting argument lines", "Argument", "Evidence", "Inspect", "Perspectives"]) {
      expect(html, `detail missing "${s}"`).toContain(s);
    }
  });
});
