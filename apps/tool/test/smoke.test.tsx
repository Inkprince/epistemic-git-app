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
    for (const s of ["Cases", "Conclusion support by case", "Where each claim came from", "Recent scrutiny", "Import case"]) {
      expect(html, `overview missing "${s}"`).toContain(s);
    }
  });

  it("renders the LHC case detail with real data", () => {
    const html = renderToString(createElement(App, { initialRoute: { screen: "case", caseId: "lhc" } }));
    for (const s of ["Current support", "Why the conclusion holds", "Argument", "Evidence", "Inspect", "Perspectives"]) {
      expect(html, `detail missing "${s}"`).toContain(s);
    }
  });

  it("renders the rebuilt multi-source eggs case detail", () => {
    const html = renderToString(createElement(App, { initialRoute: { screen: "case", caseId: "eggs" } }));
    // The multi-source rebuild must render the Sources section, its source links, and the header
    // "Raw document" button (the case carries a primary sourceDocument).
    for (const s of ["Evidence", "Sources", "nutritionsource.hsph.harvard.edu", "Perspectives", "Raw document"]) {
      expect(html, `eggs detail missing "${s}"`).toContain(s);
    }
  });

  it("renders the all-cases browser screen", () => {
    const html = renderToString(createElement(App, { initialRoute: { screen: "cases" } }));
    for (const s of ["Cases", "Import case", "claims"]) {
      expect(html, `cases screen missing "${s}"`).toContain(s);
    }
  });
});
