import type { Claim, Inference, Passage, Source } from "@epistemic-git/protocol";

/** Fast id → node lookups shared by the detail components. */
export interface Look {
  claims: Map<string, Claim>;
  inferences: Map<string, Inference>;
  passages: Map<string, Passage>;
  sources: Map<string, Source>;
}
