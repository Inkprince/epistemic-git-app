/**
 * @epistemic-git/analysis, deterministic, LLM-free reasoning over a bundle.
 *
 * Every export here is a pure function of a bundle (and, where relevant, an overlay's stated
 * beliefs). No network, no model calls, no randomness, so results are reproducible, unit-testable,
 * and instant enough to recompute live in the browser as a judge perturbs the ledger.
 */

export * from "./graph.js";
export * from "./support.js";
export * from "./perspective.js";
export * from "./correlation.js";
export * from "./merge.js";
export * from "./diff.js";
