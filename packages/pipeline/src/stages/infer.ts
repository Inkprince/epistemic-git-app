import {
  type Bundle, type Claim, claimId, type Inference, inferenceId, type InferenceType, type Strength,
} from "@epistemic-git/protocol";
import { completeStructured, type LlmClient } from "@epistemic-git/llm";
import { INFERENCE_SYSTEM, inferenceUserPrompt } from "../prompts.js";
import { InferenceResult } from "../schemas.js";

export interface InferStats {
  proposed: number;
  added: number;
  conclusionAdded: boolean;
}

/**
 * Stage 3 — inference reconstruction.
 *
 * Turns a flat set of extracted claims into a navigable argument: which claims support, rebut,
 * undercut, or presuppose which others, each with a warrant and defeaters. The model references
 * claims by INDEX (so it never has to reproduce our content-addressed ids), and it may name one
 * synthesized overall conclusion. Every reconstructed inference is attributed to the model
 * (`analyst-llm`) and is therefore itself challengeable — the tool drew it, the source did not.
 */
export async function inferArgument(
  bundle: Bundle,
  client: LlmClient,
  opts: { reasoningEffort?: "low" | "medium" | "high" } = {},
): Promise<{ bundle: Bundle; stats: InferStats }> {
  const claims = bundle.claims;
  const indexed = claims.map((c, i) => ({ index: i, statement: c.statement, claimType: c.claimType }));

  const { value } = await completeStructured(client, "argument_structure", InferenceResult, {
    system: INFERENCE_SYSTEM,
    prompt: inferenceUserPrompt(bundle.question, indexed),
    temperature: 0,
    seed: 1,
    reasoningEffort: opts.reasoningEffort ?? "medium",
  });

  const attribution = { kind: "analyst-llm" as const, ref: client.model };
  const existingClaimIds = new Set(claims.map((c) => c.id));

  // Resolve the synthesized overall conclusion (index -1) as a CANDIDATE id only. We do not commit
  // the derived claim to the bundle until we know at least one surviving inference actually concludes
  // in it — otherwise we would leave an orphan derived claim that violates the protocol invariant
  // (a derived claim must be the conclusion of some inference). This is the failure mode that occurs
  // when the model names an overall conclusion but proposes no valid inference reaching it.
  const conclusionText = value.overallConclusion.trim();
  const candidateConclusionId = conclusionText
    ? claimId({ statement: conclusionText, claimType: "predictive" })
    : undefined;

  const idByIndex = (i: number): string | undefined =>
    i === -1 ? candidateConclusionId : claims[i]?.id;

  const newInferences: Inference[] = [];
  const seen = new Set(bundle.inferences.map((inf) => inf.id));
  let conclusionReferenced = false;

  for (const prop of value.inferences) {
    const conclusion = idByIndex(prop.conclusionIndex);
    if (!conclusion) continue;
    const premises = prop.premiseIndexes.map(idByIndex).filter((x): x is string => Boolean(x));
    if (premises.length === 0) continue;
    if (premises.includes(conclusion)) continue; // no self-support

    const id = inferenceId({ type: prop.type as InferenceType, premises, conclusion, warrant: prop.warrant });
    if (seen.has(id)) continue;
    seen.add(id);
    if (conclusion === candidateConclusionId) conclusionReferenced = true;
    newInferences.push({
      id, type: prop.type as InferenceType, premises, conclusion,
      warrant: prop.warrant, assumptions: [], defeaters: prop.defeaters,
      strength: prop.strength as Strength, attribution,
    });
  }

  // Commit the synthesized conclusion claim only if it is a brand-new claim that some surviving
  // inference concludes in. If it duplicates an existing claim, or nothing concludes in it, we add no
  // orphan. Then keep only inferences whose premises and conclusion all resolve to committed claims,
  // so the model cannot leave a dangling reference by using the conclusion index as a premise.
  const newClaims: Claim[] = [];
  const conclusionAdded =
    Boolean(candidateConclusionId) && conclusionReferenced && !existingClaimIds.has(candidateConclusionId!);
  if (conclusionAdded) {
    newClaims.push({
      id: candidateConclusionId!, statement: conclusionText, claimType: "predictive",
      assumptions: [], caveats: [], passages: [], derived: true, attribution, tags: [],
    });
  }

  const validIds = new Set(existingClaimIds);
  if (conclusionAdded) validIds.add(candidateConclusionId!);
  const committedInferences = newInferences.filter(
    (inf) => validIds.has(inf.conclusion) && inf.premises.every((p) => validIds.has(p)),
  );

  const merged: Bundle = {
    ...bundle,
    claims: [...claims, ...newClaims],
    inferences: [...bundle.inferences, ...committedInferences],
  };

  return {
    bundle: merged,
    stats: { proposed: value.inferences.length, added: committedInferences.length, conclusionAdded },
  };
}
