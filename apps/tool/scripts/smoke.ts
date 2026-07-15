import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { App } from "../src/App.js";

/**
 * Headless render smoke test: exercises the full component render path (state init, useMemo
 * analysis calls, overview aggregation, detail argument/inspect rendering) without a browser,
 * so a runtime crash surfaces in CI. Not a substitute for visual QA, but it proves both screens
 * render real data without throwing.
 */
const overview = renderToString(createElement(App));
const detail = renderToString(createElement(App, { initialRoute: { screen: "case", caseId: "lhc" } }));

const checks: [string, string, string[]][] = [
  ["overview", overview, ["Evidence ledgers", "Conclusion support by case", "Claim attribution", "Adversarial audit trail", "Case ledgers"]],
  ["detail", detail, ["Live support", "Supporting argument lines", "Argument", "Evidence", "Inspect", "Perspectives"]],
];

let failed = false;
for (const [name, html, mustContain] of checks) {
  const missing = mustContain.filter((s) => !html.includes(s));
  if (missing.length) {
    console.error(`SMOKE FAIL (${name}) — missing from render:`, missing);
    failed = true;
  } else {
    console.log(`SMOKE OK (${name}) — rendered ${html.length} chars of HTML.`);
  }
}
if (failed) process.exit(1);
