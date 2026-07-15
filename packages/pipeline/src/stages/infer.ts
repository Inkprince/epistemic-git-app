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
  const newClaims: Claim[] = [];
  const existingClaimIds = new Set(claims.map((c) => c.id));

  // Resolve the synthesized overall conclusion (index -1), if any.
  let conclusionId: string | undefined;
  const conclusionText = value.overallConclusion.trim();
  if (conclusionText) {
    const id = claimId({ statement: conclusionText, claimType: "predictive" });
    conclusionId = id;
    if (!existingClaimIds.has(id)) {
      newClaims.push({
        id, statement: conclusionText, claimType: "predictive",
        assumptions: [], caveats: [], passages: [], derived: true, attribution, tags: [],
      });
      existingClaimIds.add(id);
    }
  }

  const idByIndex = (i: number): string | undefined =>
    i === -1 ? conclusionId : claims[i]?.id;

  const newInferences: Inference[] = [];
  const seen = new Set(bundle.inferences.map((inf) => inf.id));

  for (const prop of value.inferences) {
    const conclusion = idByIndex(prop.conclusionIndex);
    if (!conclusion) continue;
    const premises = prop.premiseIndexes.map(idByIndex).filter((x): x is string => Boolean(x));
    if (premises.length === 0) continue;
    if (premises.includes(conclusion)) continue; // no self-support

    const id = inferenceId({ type: prop.type as InferenceType, premises, conclusion, warrant: prop.warrant });
    if (seen.has(id)) continue;
    seen.add(id);
    newInferences.push({
      id, type: prop.type as InferenceType, premises, conclusion,
      warrant: prop.warrant, assumptions: [], defeaters: prop.defeaters,
      strength: prop.strength as Strength, attribution,
    });
  }

  const merged: Bundle = {
    ...bundle,
    claims: [...claims, ...newClaims],
    inferences: [...bundle.inferences, ...newInferences],
  };

  return {
    bundle: merged,
    stats: { proposed: value.inferences.length, added: newInferences.length, conclusionAdded: Boolean(conclusionId) },
  };
}
