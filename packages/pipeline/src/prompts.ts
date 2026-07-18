/**
 * Prompt templates. PROMPT_VERSION is part of the cache key, bump it whenever a prompt changes so
 * stale cached responses are not reused. The extraction instructions encode the methodology's first
 * invariant: the model may only assert a claim it can ground in an exact quote, and it must not
 * smuggle in confidence the source does not state.
 */

export const PROMPT_VERSION = "eg/1";

export const EXTRACTION_SYSTEM = `You extract an evidence ledger from a single source document.

Rules: follow them exactly:
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

You are given claims by index. Propose the inferential relationships between them, which claims
support, rebut, undercut, presuppose, or explain which others, so the argument becomes navigable.

Rules:
1. Reference claims ONLY by their given index. Never invent claims that are not in the list, except
   you may state ONE overall conclusion the argument as a whole is driving toward (in
   "overallConclusion"); use conclusionIndex = -1 to point an inference at it. Leave "overallConclusion"
   as "" if the claims do not build toward a single conclusion.
2. For each inference: give the premises (indexes), the conclusion (an index, or -1), a WARRANT (the
   principle that licenses premises → conclusion), a strength (strong/moderate/weak/speculative), and
   the DEFEATERS (conditions that would break the inference, what a challenger would attack).
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
identical claims must be related precisely, never silently merged. Given claims by index, emit the
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
   are at most narrower/broader or compatible-different-scope, not equivalent.
3. Give a one-sentence rationale naming the distinction that determines the type.

Return ONLY the JSON object matching the schema.`;

export function matchUserPrompt(claims: { index: number; statement: string }[]): string {
  return `Claims:\n${claims.map((c) => `[${c.index}] ${c.statement}`).join("\n")}`;
}

export const NARRATE_SYSTEM = `You write a short, faithful, plain-English account of WHY one specific claim
currently has the support it does, for a reader inspecting an evidence ledger.

You are given: the claim, the DETERMINISTIC support decomposition (each supporting / undercutting /
attacking step, with its warrant and a relative weight already computed by the system), and the source
quotes behind it.

Hard rules:
- Narrate ONLY what you are given. Do NOT introduce any new fact, study, number, or confidence level.
- Do NOT invent or restate precise percentages as if you derived them; refer to strength qualitatively
  ("strongly", "weakly", "is contested by").
- If the support is thin, leans on one line of evidence, or is attacked, say so plainly.
- 2–4 sentences. Sober and neutral. No hedging filler, no marketing tone.
Return ONLY the prose, no preamble, no headings.`;

export function narrateUserPrompt(
  statement: string,
  expl: {
    support: number;
    positive: { strength: string; contribution: number; warrant: string; active: boolean }[];
    undercuts: { strength: string; warrant: string; active: boolean }[];
    attacks: { strength: string; warrant: string; active: boolean }[];
  },
  quotes: string[],
): string {
  const fmt = (label: string, arr: { strength: string; warrant: string }[]) =>
    arr.length ? `\n${label}:\n${arr.map((p) => `- (${p.strength}) ${p.warrant}`).join("\n")}` : "";
  const q = quotes.length ? `\n\nSource quotes:\n${quotes.map((x) => `- “${x}”`).join("\n")}` : "";
  return `Claim: ${statement}${fmt("Supporting steps", expl.positive)}${fmt("Undercutting steps", expl.undercuts)}${fmt("Attacking steps", expl.attacks)}${q}`;
}

export const PERSPECTIVE_SYSTEM = `You are drafting one PERSPECTIVE over a shared evidence ledger: how a
described worldview would judge each claim. This is a starting draft a human will review and edit, the
claims themselves are fixed and you must not invent, reword, or add any.

For each claim, choose the stance that worldview would take:
- accept, the worldview finds it credible.
- reject, the worldview disputes it.
- uncertain, the worldview neither accepts nor rejects it.
- skip, the worldview has no relevant view (omit a rationale).
Give a one-sentence rationale IN THAT WORLDVIEW'S VOICE (empty string for skip). Also suggest a short
label and a one-line description for the perspective. Return ONLY JSON matching the schema.`;

export function perspectiveUserPrompt(worldview: string, claims: { index: number; statement: string }[]): string {
  const cl = claims.map((c) => `[${c.index}] ${c.statement}`).join("\n");
  return `Worldview to embody: ${worldview}\n\nClaims:\n${cl}`;
}

export const ANSWER_SYSTEM = `You rewrite a grounded, structured answer about an evidence ledger into fluent
plain English for a reader. You are given the deterministic answer (a headline and bullet points) and its
citations, all produced by the system, not by you.

Hard rules:
- Use ONLY the given material. Introduce no new fact, number, source, or claim.
- Do NOT soften or strengthen the stated confidence, and preserve every caveat.
- If the material is thin, one-sided, or contested, keep that plain.
- 2–4 sentences. Sober and neutral.
Return ONLY the prose, no headings, no citations list (the UI shows those separately).`;

export function answerUserPrompt(
  question: string,
  headline: string,
  points: string[],
  citationQuotes: string[],
): string {
  const pts = points.length ? `\nKey points:\n${points.map((p) => `- ${p}`).join("\n")}` : "";
  const qs = citationQuotes.length ? `\nCited quotes:\n${citationQuotes.map((q) => `- “${q}”`).join("\n")}` : "";
  return `Question: ${question}\n\nDeterministic answer: ${headline}${pts}${qs}`;
}

export const AUDIT_SYSTEM = `You are an adversarial auditor of an evidence ledger. Your job is to find where the
argument is weak, overreaching, or gameable, and to say so precisely.

A challenge is admitted ONLY if it points at a SPECIFIC claim (by index) or inference (by index), or
names a SPECIFIC missing source/topic. Vague complaints are useless, do not emit them.

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
  focus?: { index: number; statement: string },
): string {
  const cl = claims.map((c) => `[${c.index}] ${c.statement}`).join("\n");
  const inf = inferences.map((i) => `[${i.index}] (${i.type}) ${i.warrant}`).join("\n");
  const focusLine = focus
    ? `\n\nFOCUS: concentrate every challenge on claim [${focus.index}], “${focus.statement}” and the inferences that bear on it. Attack that claim's grounding, scope, quantifiers, and independence specifically. Do not challenge unrelated claims.`
    : "";
  return `Question under investigation: ${question}\n\nClaims:\n${cl}\n\nInferences:\n${inf}${focusLine}`;
}
