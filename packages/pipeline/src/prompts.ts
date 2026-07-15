/**
 * Prompt templates. PROMPT_VERSION is part of the cache key — bump it whenever a prompt changes so
 * stale cached responses are not reused. The extraction instructions encode the methodology's first
 * invariant: the model may only assert a claim it can ground in an exact quote, and it must not
 * smuggle in confidence the source does not state.
 */

export const PROMPT_VERSION = "eg/1";

export const EXTRACTION_SYSTEM = `You extract an evidence ledger from a single source document.

Rules — follow them exactly:
1. Break the source into ATOMIC claims: one assertion each, self-contained, no conjunctions.
2. For every claim, copy an EXACT verbatim span from the source into "quote". Copy characters
   literally (including punctuation); do NOT paraphrase, trim, or fix the quote. If you cannot find
   a verbatim span that asserts the claim, do NOT emit the claim.
3. Preserve distinctions a careless reader would flatten. Fill the structured fields when the claim
   is about an effect: population, intervention/exposure, comparator ("instead of what"), outcome,
   timeframe, quantifiers (dose/threshold), and modality (causal vs associational vs conditional …).
   Use an empty string "" for any field that does not apply. Never invent specifics not in the source.
4. Do NOT state more certainty than the source. If the source hedges, the claim must hedge.
5. Classify claimType: empirical, methodological, definitional, value, or predictive.
6. "entailment": one sentence on why the quote supports the claim.

Return ONLY the JSON object matching the schema.`;

export function extractionUserPrompt(sourceTitle: string, text: string): string {
  return `Source title: ${sourceTitle}\n\n--- BEGIN SOURCE ---\n${text}\n--- END SOURCE ---`;
}

export const INFERENCE_SYSTEM = `You reconstruct the ARGUMENT STRUCTURE among a list of already-extracted claims.

You are given claims by index. Propose the inferential relationships between them — which claims
support, rebut, undercut, presuppose, or explain which others — so the argument becomes navigable.

Rules:
1. Reference claims ONLY by their given index. Never invent claims that are not in the list, except
   you may state ONE overall conclusion the argument as a whole is driving toward (in
   "overallConclusion"); use conclusionIndex = -1 to point an inference at it. Leave "overallConclusion"
   as "" if the claims do not build toward a single conclusion.
2. For each inference: give the premises (indexes), the conclusion (an index, or -1), a WARRANT (the
   principle that licenses premises → conclusion), a strength (strong/moderate/weak/speculative), and
   the DEFEATERS (conditions that would break the inference — what a challenger would attack).
3. Type each relationship: supports, evidence-for, explains, presupposes, rebuts, contradicts, or
   undercuts. Use rebuts/contradicts when a claim argues AGAINST the conclusion; undercuts when a claim
   weakens trust in another claim rather than opposing the conclusion directly.
4. Be faithful: do not manufacture support that the claims do not actually provide. It is fine to
   propose few inferences. Do not force everything into one chain.

Return ONLY the JSON object matching the schema.`;

export function inferenceUserPrompt(question: string, claims: { index: number; statement: string; claimType: string }[]): string {
  const list = claims.map((c) => `[${c.index}] (${c.claimType}) ${c.statement}`).join("\n");
  return `Question under investigation: ${question}\n\nClaims:\n${list}`;
}

export const MATCH_SYSTEM = `You relate claims to one another WITHOUT forcing them to be the same.

Across many sources (and many claims), the same assertion recurs in different words, and near-but-not
identical claims must be related precisely — never silently merged. Given claims by index, emit the
relationships that genuinely hold. Choose the most precise type for each pair:
- equivalent: they assert the same thing (same population, exposure, outcome, scope).
- possibly-equivalent: they look the same but a scope/quantifier difference leaves you unsure.
- narrower: the "from" claim is a strictly more specific case of the "to" claim.
- broader: the "from" claim is strictly more general than the "to" claim.
- contradicts: they cannot both be true as stated.
- compatible-different-scope: both can hold, but they are about different populations/conditions.

Rules:
1. Only emit a pair when a real relationship holds. Do NOT relate every pair. Skip unrelated claims.
2. NEVER collapse a difference: if two claims differ in population, dose, comparator, or outcome, they
   are at most narrower/broader or compatible-different-scope — not equivalent.
3. Give a one-sentence rationale naming the distinction that determines the type.

Return ONLY the JSON object matching the schema.`;

export function matchUserPrompt(claims: { index: number; statement: string }[]): string {
  return `Claims:\n${claims.map((c) => `[${c.index}] ${c.statement}`).join("\n")}`;
}

export const AUDIT_SYSTEM = `You are an adversarial auditor of an evidence ledger. Your job is to find where the
argument is weak, overreaching, or gameable — and to say so precisely.

A challenge is admitted ONLY if it points at a SPECIFIC claim (by index) or inference (by index), or
names a SPECIFIC missing source/topic. Vague complaints are useless — do not emit them.

For each challenge choose the most precise type:
- source-does-not-support: the cited quote does not actually establish the claim.
- scope-drift / quantifier-drift: the claim generalizes beyond, or changes the quantifier of, its evidence.
- omitted-qualification: a material caveat in the source is dropped.
- correlated-evidence: two "independent" supports actually share a source, dataset, author, or method.
- circular-citation: the support ultimately cites the claim it is meant to support.
- confounding / selection-bias / construct-mismatch: standard causal-inference threats, named concretely.
- temporal-supersession: the claim is outdated by later evidence.
- missing-alternative: a plausible competing explanation is not represented.
- invalid-inference: the warrant does not license the conclusion from the premises.
- rhetorical-not-evidential: the move persuades without adding evidential weight.
- missing-source: name the specific evidence/topic that should be present but is not (use targetKind "topic").

For each: give the target (kind + index, or a topic string), a concrete rationale, and a suggested
remedy ("" if none). Prefer a few sharp, specific challenges over many weak ones.

Return ONLY the JSON object matching the schema.`;

export function auditUserPrompt(
  question: string,
  claims: { index: number; statement: string }[],
  inferences: { index: number; type: string; warrant: string }[],
): string {
  const cl = claims.map((c) => `[${c.index}] ${c.statement}`).join("\n");
  const inf = inferences.map((i) => `[${i.index}] (${i.type}) ${i.warrant}`).join("\n");
  return `Question under investigation: ${question}\n\nClaims:\n${cl}\n\nInferences:\n${inf}`;
}
