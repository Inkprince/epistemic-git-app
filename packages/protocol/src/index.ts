/**
 * @epistemic-git/protocol — the portable evidence-ledger protocol.
 *
 * The durable contribution of the entry. Everything else (pipeline, analysis, tool) is
 * machinery that reads and writes this format. Node-only filesystem helpers live at
 * `@epistemic-git/protocol/node`.
 */

export * from "./schema.js";
export * from "./canonical.js";
export * from "./ids.js";
export * from "./builder.js";
export * from "./validate.js";
export * from "./io.js";
export * from "./nanopub.js";
