import { z } from "zod";

/**
 * The Epistemic Git protocol.
 *
 * Six object types form a portable evidence ledger:
 *
 *   Source ─▶ Passage ─▶ Claim ─▶ Inference
 *                          │
 *                          ├─▶ Challenge   (typed objection, first-class)
 *                          └─▶ Assessment  (a perspective's judgment, an OVERLAY, never intrinsic)
 *
 * Two invariants make the ledger trustworthy and enforce the whole thesis:
 *   1. PROVENANCE: a source-grounded claim cannot exist without a verbatim Passage.
 *   2. ATTRIBUTION: every assertion records whether a Source said it, an AI proposed it,
 *      or a human authored it. A reader can always tell who is speaking.
 *
 * Identity is content-addressed (see ids.ts): the id is a pure function of the fields
 * that define what the object *is*, never of who recorded it or when. That is what lets
 * two investigators' bundles merge without coordination.
 */

export const SCHEMA_VERSION = "eg/0.1" as const;

// ─────────────────────────────────────────────────────────────────────────────
// Attribution, who is speaking. NEVER part of an object's identity hash.
// ─────────────────────────────────────────────────────────────────────────────

export const AttributionKind = z.enum(["source", "analyst-llm", "human"]);

export const Attribution = z.object({
  kind: AttributionKind,
  /** sourceId for `source`; model id for `analyst-llm`; person handle for `human`. */
  ref: z.string().optional(),
  note: z.string().optional(),
});
export type Attribution = z.infer<typeof Attribution>;

// ─────────────────────────────────────────────────────────────────────────────
// Reference to any node the ledger can talk about.
// ─────────────────────────────────────────────────────────────────────────────

export const TargetKind = z.enum(["claim", "inference", "passage", "source", "topic", "narrative"]);

export const TargetRef = z.object({
  kind: TargetKind,
  /** node id, or (for `topic` (a missing-source challenge)) a free-text topic. */
  id: z.string(),
});
export type TargetRef = z.infer<typeof TargetRef>;

// ─────────────────────────────────────────────────────────────────────────────
// Source
// ─────────────────────────────────────────────────────────────────────────────

export const SourceType = z.enum([
  "paper", "preprint", "blog", "news", "video", "transcript", "dataset",
  "report", "forum", "tweet", "book", "interview", "other",
]);

export const PeerReviewStatus = z.enum([
  "peer-reviewed", "preprint", "editorial", "self-published", "unknown",
]);

export const SourceRelation = z.enum([
  "cites", "derived-from", "same-dataset", "same-authors", "corrects", "corrected-by", "republishes",
]);

export const Source = z.object({
  id: z.string(),
  type: SourceType,
  title: z.string(),
  url: z.string().optional(),
  authors: z.array(z.string()).default([]),
  publishedDate: z.string().optional(), // ISO 8601; may be partial/uncertain
  retrievedDate: z.string().optional(),
  contentHash: z.string().optional(),
  reliability: z
    .object({
      fundingConflicts: z.array(z.string()).default([]),
      priorRetractions: z.number().int().nonnegative().optional(),
      peerReviewStatus: PeerReviewStatus.optional(),
      /** declared partisan stance, if any (kept explicit, never inferred silently). */
      knownStance: z.string().optional(),
    })
    .optional(),
  /** Deliberately planted or detected problems, the substrate of the adversarial suite. */
  adversarialFlags: z.array(z.string()).default([]),
  relatedSources: z
    .array(z.object({ sourceId: z.string(), relation: SourceRelation }))
    .default([]),
});
export type Source = z.infer<typeof Source>;

// ─────────────────────────────────────────────────────────────────────────────
// Passage, the provenance anchor. Every source-grounded claim points at one.
// ─────────────────────────────────────────────────────────────────────────────

export const Locator = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("char"), start: z.number().int(), end: z.number().int() }),
  z.object({ kind: z.literal("page"), page: z.number().int(), endPage: z.number().int().optional() }),
  z.object({ kind: z.literal("timestamp"), startMs: z.number().int(), endMs: z.number().int().optional() }),
  z.object({ kind: z.literal("section"), path: z.string() }),
]);
export type Locator = z.infer<typeof Locator>;

export const Passage = z.object({
  id: z.string(),
  sourceId: z.string(),
  locator: Locator,
  verbatimText: z.string(),
  contextBefore: z.string().optional(),
  contextAfter: z.string().optional(),
  /** hash of the source version this quote was taken from, so quotes can't silently drift. */
  sourceContentHash: z.string().optional(),
});
export type Passage = z.infer<typeof Passage>;

// ─────────────────────────────────────────────────────────────────────────────
// Claim, atomic, structured so that distinctions a flat graph would collapse survive.
// ─────────────────────────────────────────────────────────────────────────────

export const ClaimType = z.enum([
  "empirical", "methodological", "definitional", "value", "predictive",
]);

/** Relationship modality, what KIND of relationship the claim asserts. */
export const RelationModality = z.enum([
  "causal", "associational", "conditional", "definitional", "normative", "predictive", "descriptive",
]);

/**
 * Structured content. The comparator field is load-bearing for nutrition questions:
 * "eggs increase risk" is meaningless without "instead of what?".
 */
export const ClaimStructure = z.object({
  population: z.string().optional(),
  intervention: z.string().optional(),
  comparator: z.string().optional(),
  outcome: z.string().optional(),
  timeframe: z.string().optional(),
  modality: RelationModality.optional(),
  quantifiers: z.string().optional(),
  magnitude: z.string().optional(),
});
export type ClaimStructure = z.infer<typeof ClaimStructure>;

export const Claim = z.object({
  id: z.string(),
  statement: z.string(),
  claimType: ClaimType,
  structure: ClaimStructure.optional(),
  assumptions: z.array(z.string()).default([]),
  caveats: z.array(z.string()).default([]),
  /** Supporting passages. Required (≥1) for source-grounded claims; empty for derived claims. */
  passages: z.array(z.string()).default([]),
  /** True when this claim is a conclusion produced by inference rather than lifted from a source. */
  derived: z.boolean().default(false),
  attribution: Attribution,
  /** ensemble extraction agreement in [0,1], when available (honest extraction uncertainty). */
  extractionAgreement: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).default([]),
});
export type Claim = z.infer<typeof Claim>;

// ─────────────────────────────────────────────────────────────────────────────
// Inference, a relationship between claims that is ITSELF an attributable, challengeable
// assertion (who drew it, under what warrant, with what defeaters) not objective metadata.
// ─────────────────────────────────────────────────────────────────────────────

export const InferenceType = z.enum([
  "supports", "contradicts", "rebuts", "undercuts", "presupposes", "explains", "evidence-for",
]);

export const Strength = z.enum(["strong", "moderate", "weak", "speculative"]);

export const Inference = z.object({
  id: z.string(),
  type: InferenceType,
  premises: z.array(z.string()).min(1), // claim ids
  conclusion: z.string(), // claim id
  /** The principle licensing premises → conclusion (Toulmin warrant). */
  warrant: z.string(),
  assumptions: z.array(z.string()).default([]),
  /** Conditions under which this inference breaks, what a challenger would attack. */
  defeaters: z.array(z.string()).default([]),
  strength: Strength,
  attribution: Attribution,
  /** set when the SOURCE itself asserted this inference (vs. the tool reconstructing it). */
  provenancePassageId: z.string().optional(),
});
export type Inference = z.infer<typeof Inference>;

// ─────────────────────────────────────────────────────────────────────────────
// Challenge, a typed objection, first-class. Admitted only if it points at a specific node.
// ─────────────────────────────────────────────────────────────────────────────

export const ChallengeType = z.enum([
  "source-does-not-support",
  "scope-drift",
  "quantifier-drift",
  "omitted-qualification",
  "correlated-evidence",
  "circular-citation",
  "confounding",
  "selection-bias",
  "construct-mismatch",
  "temporal-supersession",
  "missing-alternative",
  "invalid-inference",
  "rhetorical-not-evidential",
  "missing-source",
]);

export const ChallengeStatus = z.enum(["open", "accepted", "rejected", "mitigated"]);

export const Challenge = z.object({
  id: z.string(),
  challengeType: ChallengeType,
  target: TargetRef,
  rationale: z.string(),
  raisedBy: Attribution,
  status: ChallengeStatus.default("open"),
  suggestedRemedy: z.string().optional(),
});
export type Challenge = z.infer<typeof Challenge>;

// ─────────────────────────────────────────────────────────────────────────────
// CorrelationGroup, the anti-double-counting primitive. The Rootclaim error, made explicit.
// ─────────────────────────────────────────────────────────────────────────────

export const SharedOrigin = z.enum([
  "dataset", "author", "institution", "funder", "methodology", "instrument", "publication",
]);

export const CorrelationGroup = z.object({
  id: z.string(),
  memberKind: z.enum(["claim", "source"]),
  members: z.array(z.string()).min(2),
  sharedOrigin: SharedOrigin,
  rationale: z.string(),
});
export type CorrelationGroup = z.infer<typeof CorrelationGroup>;

// ─────────────────────────────────────────────────────────────────────────────
// Match, a typed relation between two claims, WITHOUT forced equivalence.
//
// When claims come from many sources (or many chunks of one), the same underlying assertion appears
// in different words, and near-but-not-identical claims must be related without being flattened. A
// Match records that relation explicitly and attributably, the ledger says "these two are related
// this way, per whom" rather than silently merging them. For symmetric relations the pair is stored
// in a canonical (sorted) order so the same match gets one id regardless of direction; for the
// directional narrower/broader relations, `from` is the narrower/broader side respectively.
// ─────────────────────────────────────────────────────────────────────────────

export const MatchType = z.enum([
  "equivalent", "possibly-equivalent", "narrower", "broader", "contradicts", "compatible-different-scope",
]);

export const Match = z.object({
  id: z.string(),
  type: MatchType,
  from: z.string(), // claim id
  to: z.string(),   // claim id
  rationale: z.string(),
  attribution: Attribution,
});
export type Match = z.infer<typeof Match>;

// ─────────────────────────────────────────────────────────────────────────────
// Overlay + Assessment, late-binding trust. Multiple worldviews over ONE record.
// ─────────────────────────────────────────────────────────────────────────────

export const Overlay = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  analyst: Attribution,
  /** source ids this perspective admits; if omitted, it admits all sources in the bundle. */
  admits: z.array(z.string()).optional(),
  priorStance: z.string().optional(),
});
export type Overlay = z.infer<typeof Overlay>;

export const Stance = z.enum(["accept", "reject", "uncertain", "irrelevant"]);

export const Assessment = z.object({
  id: z.string(),
  overlayId: z.string(),
  target: TargetRef, // claim or inference
  stance: Stance,
  /** OPTIONAL probability in [0,1], supplied ONLY where a defensible model exists. */
  credence: z.number().min(0).max(1).optional(),
  /** OPTIONAL log-odds contribution of this node under this overlay (quantitative mode only). */
  logOdds: z.number().optional(),
  /** how load-bearing this overlay considers the node, in [0,1] (qualitative weight). */
  weight: z.number().min(0).max(1).optional(),
  rationale: z.string().optional(),
});
export type Assessment = z.infer<typeof Assessment>;

// ─────────────────────────────────────────────────────────────────────────────
// Narrative, an AI-authored plain-English account of how a claim came to be believed.
// It NARRATES the deterministic support decomposition; it never scores and cannot introduce a
// number the ledger doesn't already carry. First-class and attributed (analyst-llm), so the tool's
// own prose is itself inspectable and challengeable, the thesis applied to its own output.
// ─────────────────────────────────────────────────────────────────────────────

export const Narrative = z.object({
  id: z.string(),
  /** the node this narrative is about (typically a claim). */
  target: TargetRef,
  text: z.string(),
  /** claim ids whose deterministic support decomposition the text was grounded in. */
  groundedIn: z.array(z.string()).default([]),
  attribution: Attribution,
});
export type Narrative = z.infer<typeof Narrative>;

// ─────────────────────────────────────────────────────────────────────────────
// Quarantine, claims the pipeline REFUSED to admit. Kept visible, never dropped.
// ─────────────────────────────────────────────────────────────────────────────

export const QuarantineReason = z.enum([
  "no-supporting-passage",
  "passage-does-not-entail",
  "unverifiable-source",
  "duplicate",
  "out-of-scope",
  "injection-suspected",
]);

export const QuarantinedClaim = z.object({
  id: z.string(),
  statement: z.string(),
  reason: QuarantineReason,
  attemptedPassageText: z.string().optional(),
  attribution: Attribution,
});
export type QuarantinedClaim = z.infer<typeof QuarantinedClaim>;

// ─────────────────────────────────────────────────────────────────────────────
// Bundle, a portable, versioned case. The unit that ships, merges, and is interrogated.
// ─────────────────────────────────────────────────────────────────────────────

export const BundleProvenance = z.object({
  pipelineVersion: z.string().optional(),
  model: z.string().optional(),
  mode: z.enum(["hand-authored", "cached", "live"]).optional(),
});

// Type aliases for the enums (value + type share a name; callers can use either).
export type AttributionKind = z.infer<typeof AttributionKind>;
export type TargetKind = z.infer<typeof TargetKind>;
export type SourceType = z.infer<typeof SourceType>;
export type PeerReviewStatus = z.infer<typeof PeerReviewStatus>;
export type SourceRelation = z.infer<typeof SourceRelation>;
export type ClaimType = z.infer<typeof ClaimType>;
export type RelationModality = z.infer<typeof RelationModality>;
export type InferenceType = z.infer<typeof InferenceType>;
export type Strength = z.infer<typeof Strength>;
export type ChallengeType = z.infer<typeof ChallengeType>;
export type ChallengeStatus = z.infer<typeof ChallengeStatus>;
export type SharedOrigin = z.infer<typeof SharedOrigin>;
export type MatchType = z.infer<typeof MatchType>;
export type Stance = z.infer<typeof Stance>;
export type QuarantineReason = z.infer<typeof QuarantineReason>;

export const Bundle = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(),
  case: z.string(),
  title: z.string(),
  question: z.string(),
  createdWith: BundleProvenance.optional(),
  sources: z.array(Source).default([]),
  passages: z.array(Passage).default([]),
  claims: z.array(Claim).default([]),
  inferences: z.array(Inference).default([]),
  challenges: z.array(Challenge).default([]),
  correlationGroups: z.array(CorrelationGroup).default([]),
  matches: z.array(Match).default([]),
  overlays: z.array(Overlay).default([]),
  assessments: z.array(Assessment).default([]),
  quarantine: z.array(QuarantinedClaim).default([]),
  narratives: z.array(Narrative).default([]),
  notes: z.string().optional(),
  /**
   * The primary raw document this case was built from, kept so a reader can open the exact text the
   * app and AI decomposed. Non-identity: excluded from bundleId and bundleDigest, and carried in the
   * meta line by serializeBundle. Absent for hand-authored cases with no single source document.
   */
  sourceDocument: z
    .object({ title: z.string().optional(), url: z.string().optional(), text: z.string() })
    .optional(),
});
export type Bundle = z.infer<typeof Bundle>;
