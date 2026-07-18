import {
  type Bundle, type Challenge, challengeId, type ChallengeType, type TargetRef,
} from "@epistemic-git/protocol";
import { completeStructured, type LlmClient } from "@epistemic-git/llm";
import { AUDIT_SYSTEM, auditUserPrompt } from "../prompts.js";
import { AuditResult } from "../schemas.js";

export interface AuditStats {
  proposed: number;
  added: number;
  dropped: number;
}

/**
 * Stage 4, adversarial audit.
 *
 * Runs typed critic passes over the ledger and emits Challenge nodes, each REQUIRED to point at a
 * specific claim, inference, or named missing topic, vague criticism is dropped, never admitted.
 * Challenges are attributed to the model (`analyst-llm`) and start life "open"; they are first-class
 * ledger citizens, so the tool and any downstream reader can see exactly where the argument is
 * contested. This is the adversarial-robustness layer made concrete.
 */
export async function auditBundle(
  bundle: Bundle,
  client: LlmClient,
  opts: { reasoningEffort?: "low" | "medium" | "high"; focusClaimId?: string } = {},
): Promise<{ bundle: Bundle; stats: AuditStats }> {
  const claims = bundle.claims;
  const inferences = bundle.inferences;

  // Optional "red-team this claim" focus: bias the auditor toward one claim, then admit only the
  // challenges that actually land on it or on an inference that bears on it.
  const focusIndex = opts.focusClaimId ? claims.findIndex((c) => c.id === opts.focusClaimId) : -1;
  const focus = focusIndex >= 0 ? { index: focusIndex, statement: claims[focusIndex]!.statement } : undefined;
  const focusInferenceIds = opts.focusClaimId
    ? new Set(inferences.filter((inf) => inf.conclusion === opts.focusClaimId || inf.premises.includes(opts.focusClaimId)).map((inf) => inf.id))
    : undefined;

  const { value } = await completeStructured(client, "adversarial_audit", AuditResult, {
    system: AUDIT_SYSTEM,
    prompt: auditUserPrompt(
      bundle.question,
      claims.map((c, i) => ({ index: i, statement: c.statement })),
      inferences.map((inf, i) => ({ index: i, type: inf.type, warrant: inf.warrant })),
      focus,
),
    temperature: 0,
    seed: 1,
    reasoningEffort: opts.reasoningEffort ?? "medium",
  });

  const raisedBy = { kind: "analyst-llm" as const, ref: client.model };
  const seen = new Set(bundle.challenges.map((c) => c.id));
  const added: Challenge[] = [];
  let dropped = 0;

  for (const prop of value.challenges) {
    const target = resolveTarget(prop, claims, inferences);
    if (!target) { dropped++; continue; } // could not point at a specific node → not admitted

    // When focused, admit only challenges that hit the focus claim or an inference bearing on it.
    if (opts.focusClaimId) {
      const hitsFocus =
        (target.kind === "claim" && target.id === opts.focusClaimId) ||
        (target.kind === "inference" && focusInferenceIds!.has(target.id));
      if (!hitsFocus) { dropped++; continue; }
    }

    const id = challengeId({ challengeType: prop.challengeType as ChallengeType, target, rationale: prop.rationale });
    if (seen.has(id)) continue;
    seen.add(id);
    added.push({
      id, challengeType: prop.challengeType as ChallengeType, target, rationale: prop.rationale,
      raisedBy, status: "open",
      ...(prop.suggestedRemedy.trim() ? { suggestedRemedy: prop.suggestedRemedy.trim() } : {}),
    });
  }

  return {
    bundle: { ...bundle, challenges: [...bundle.challenges, ...added] },
    stats: { proposed: value.challenges.length, added: added.length, dropped },
  };
}

function resolveTarget(
  prop: { targetKind: "claim" | "inference" | "topic"; targetIndex: number; topic: string },
  claims: { id: string }[],
  inferences: { id: string }[],
): TargetRef | undefined {
  if (prop.targetKind === "topic") {
    return prop.topic.trim() ? { kind: "topic", id: prop.topic.trim() } : undefined;
  }
  const pool = prop.targetKind === "claim" ? claims : inferences;
  const node = pool[prop.targetIndex];
  return node ? { kind: prop.targetKind, id: node.id } : undefined;
}
