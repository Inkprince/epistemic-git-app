import { z } from "zod";

/**
 * Stage output schemas. Kept small and all-required (empty string = "not applicable") because the
 * provider's strict structured-output mode wants every property present. We post-process empties
 * back to "absent". These schemas are the machine-checkable contract for each pipeline stage.
 */

export const ExtractedClaim = z.object({
  /** an atomic, self-contained restatement of one claim the source makes. */
  statement: z.string(),
  claimType: z.enum(["empirical", "methodological", "definitional", "value", "predictive"]),
  /** an EXACT verbatim span copied from the source that asserts this claim (we verify it). */
  quote: z.string(),
  /** one sentence on why the quote entails the claim (kept for audit; not stored as a node). */
  entailment: z.string(),
  // structured fields — "" means not applicable
  population: z.string(),
  intervention: z.string(),
  comparator: z.string(),
  outcome: z.string(),
  timeframe: z.string(),
  quantifiers: z.string(),
  modality: z.enum([
    "causal", "associational", "conditional", "definitional", "normative", "predictive", "descriptive", "unspecified",
  ]),
});
export type ExtractedClaim = z.infer<typeof ExtractedClaim>;

export const ExtractionResult = z.object({
  claims: z.array(ExtractedClaim),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;

export const InferenceProposal = z.object({
  type: z.enum(["supports", "evidence-for", "explains", "presupposes", "rebuts", "contradicts", "undercuts"]),
  /** indexes into the claim list. */
  premiseIndexes: z.array(z.number().int()),
  /** index into the claim list, or -1 for the synthesized overall conclusion. */
  conclusionIndex: z.number().int(),
  warrant: z.string(),
  strength: z.enum(["strong", "moderate", "weak", "speculative"]),
  defeaters: z.array(z.string()),
});
export type InferenceProposal = z.infer<typeof InferenceProposal>;

export const InferenceResult = z.object({
  /** a single conclusion the argument builds toward, or "" if none. */
  overallConclusion: z.string(),
  inferences: z.array(InferenceProposal),
});
export type InferenceResult = z.infer<typeof InferenceResult>;

export const MatchProposal = z.object({
  type: z.enum(["equivalent", "possibly-equivalent", "narrower", "broader", "contradicts", "compatible-different-scope"]),
  fromIndex: z.number().int(),
  toIndex: z.number().int(),
  rationale: z.string(),
});
export type MatchProposal = z.infer<typeof MatchProposal>;

export const MatchResult = z.object({
  matches: z.array(MatchProposal),
});
export type MatchResult = z.infer<typeof MatchResult>;

export const ChallengeProposal = z.object({
  challengeType: z.enum([
    "source-does-not-support", "scope-drift", "quantifier-drift", "omitted-qualification",
    "correlated-evidence", "circular-citation", "confounding", "selection-bias", "construct-mismatch",
    "temporal-supersession", "missing-alternative", "invalid-inference", "rhetorical-not-evidential",
    "missing-source",
  ]),
  targetKind: z.enum(["claim", "inference", "topic"]),
  /** index into the claim or inference list; ignored when targetKind is "topic". */
  targetIndex: z.number().int(),
  /** the missing-source/topic string when targetKind is "topic"; "" otherwise. */
  topic: z.string(),
  rationale: z.string(),
  /** "" if no remedy is suggested. */
  suggestedRemedy: z.string(),
});
export type ChallengeProposal = z.infer<typeof ChallengeProposal>;

export const AuditResult = z.object({
  challenges: z.array(ChallengeProposal),
});
export type AuditResult = z.infer<typeof AuditResult>;
