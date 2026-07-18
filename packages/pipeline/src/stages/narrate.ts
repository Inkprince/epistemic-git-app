import { explainSupport } from "@epistemic-git/analysis";
import { type Bundle, type Narrative, narrativeId } from "@epistemic-git/protocol";
import type { LlmClient } from "@epistemic-git/llm";
import { NARRATE_SYSTEM, narrateUserPrompt } from "../prompts.js";

/**
 * "Cite this claim" summary, an AI narration of the DETERMINISTIC support decomposition for one
 * claim. The model is given only what `explainSupport` already computed plus the source quotes, and
 * is told to narrate, never to score. The result is an attributed (`analyst-llm`), grounded, and
 * therefore itself challengeable `Narrative` node, AI in the loop, under the same discipline as the
 * rest of the pipeline. LLM-side by construction; the app only renders the stored text.
 */
export async function narrateClaim(
  bundle: Bundle,
  client: LlmClient,
  opts: { claimId: string; overlayId?: string; respectCorrelation?: boolean },
): Promise<{ bundle: Bundle; narrative: Narrative | null }> {
  const claim = bundle.claims.find((c) => c.id === opts.claimId);
  if (!claim) return { bundle, narrative: null };

  const expl = explainSupport(bundle, opts.claimId, {
    ...(opts.overlayId ? { overlayId: opts.overlayId } : {}),
    respectCorrelation: opts.respectCorrelation ?? true,
  });

  // Grounding: the claims whose decomposition fed the prose, and the verbatim quotes behind them.
  const groundedIn = [claim.id, ...new Set(expl.positive.flatMap((p) => p.premises))];
  const passageById = new Map(bundle.passages.map((p) => [p.id, p]));
  const quotes = [claim, ...groundedIn.map((id) => bundle.claims.find((c) => c.id === id)).filter(Boolean)]
    .flatMap((c) => (c ? c.passages : []))
    .map((pid) => passageById.get(pid)?.verbatimText)
    .filter((x): x is string => Boolean(x))
    .slice(0, 6);

  const { text } = await client.complete({
    system: NARRATE_SYSTEM,
    prompt: narrateUserPrompt(claim.statement, expl, quotes),
    temperature: 0,
    seed: 1,
    reasoningEffort: "low",
  });

  const clean = text.trim();
  if (!clean) return { bundle, narrative: null };
  const target = { kind: "claim" as const, id: claim.id };
  const id = narrativeId({ target, text: clean, groundedIn });
  const narrative: Narrative = {
    id, target, text: clean, groundedIn,
    attribution: { kind: "analyst-llm", ref: client.model },
  };
  const existing = bundle.narratives ?? [];
  return {
    bundle: { ...bundle, narratives: existing.some((n) => n.id === id) ? existing : [...existing, narrative] },
    narrative,
  };
}
