import type { Bundle, Stance } from "@epistemic-git/protocol";
import { completeStructured, type LlmClient } from "@epistemic-git/llm";
import { PERSPECTIVE_SYSTEM, perspectiveUserPrompt } from "../prompts.js";
import { PerspectiveResult } from "../schemas.js";

export interface DraftedStance {
  claimId: string;
  stance: Stance;
  rationale: string;
}

export interface DraftedPerspective {
  suggestedLabel: string;
  suggestedDescription: string;
  stances: DraftedStance[];
}

/**
 * AI-assisted perspective authoring: given a described worldview, propose a stance + rationale on
 * each (non-derived) claim. This only DRAFTS: the human reviews, edits, and commits the overlay in
 * the UI, and the resulting Assessment nodes are deterministically scored like any other. Speeds the
 * flagship perspective-diff without letting the model decide what anyone believes.
 */
export async function draftPerspective(
  bundle: Bundle,
  client: LlmClient,
  opts: { worldview: string },
): Promise<DraftedPerspective> {
  const claims = bundle.claims.filter((c) => !c.derived);
  const { value } = await completeStructured(client, "perspective_draft", PerspectiveResult, {
    system: PERSPECTIVE_SYSTEM,
    prompt: perspectiveUserPrompt(opts.worldview, claims.map((c, i) => ({ index: i, statement: c.statement }))),
    temperature: 0,
    seed: 1,
    reasoningEffort: "low",
  });

  const stances: DraftedStance[] = [];
  for (const s of value.stances) {
    const claim = claims[s.claimIndex];
    if (!claim || s.stance === "skip") continue;
    stances.push({ claimId: claim.id, stance: s.stance as Stance, rationale: s.rationale.trim() });
  }
  return {
    suggestedLabel: value.suggestedLabel.trim(),
    suggestedDescription: value.suggestedDescription.trim(),
    stances,
  };
}
