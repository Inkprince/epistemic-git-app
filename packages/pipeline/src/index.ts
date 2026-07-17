/**
 * @epistemic-git/pipeline — turns source text into a quote-grounded evidence ledger.
 *
 * The only package (with @epistemic-git/llm) that calls a model. Each stage's input/output contract
 * is the machine-checkable form of the methodology described in the essay.
 */

export * from "./schemas.js";
export * from "./prompts.js";
export * from "./stages/extract.js";
export * from "./stages/match.js";
export * from "./stages/infer.js";
export * from "./stages/audit.js";
export * from "./stages/correlate.js";
export * from "./scrape.js";
export * from "./fetch-source.js";
export * from "./discover.js";
