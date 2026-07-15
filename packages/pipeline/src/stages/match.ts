import { type Bundle, type Match, matchId, type MatchType } from "@epistemic-git/protocol";
import { completeStructured, type LlmClient } from "@epistemic-git/llm";
import { MATCH_SYSTEM, matchUserPrompt } from "../prompts.js";
import { MatchResult } from "../schemas.js";

export interface MatchStats {
  proposed: number;
  added: number;
  dropped: number;
}

/**
 * Stage 2 — claim matching (without forced equivalence).
 *
 * Relates claims to one another as typed, attributed Match edges: equivalent, possibly-equivalent,
 * narrower/broader, contradicts, or compatible-but-different-scope. Crucially it does NOT merge
 * claims — a difference in population, dose, comparator, or outcome is preserved as a narrower/broader
 * or different-scope relation, never collapsed. This is what lets the ledger relate the same assertion
 * across many sources while keeping every distinction a careful reader would need.
 */
export async function matchClaims(
  bundle: Bundle,
  client: LlmClient,
  opts: { reasoningEffort?: "low" | "medium" | "high" } = {},
): Promise<{ bundle: Bundle; stats: MatchStats }> {
  const claims = bundle.claims;
  if (claims.length < 2) return { bundle, stats: { proposed: 0, added: 0, dropped: 0 } };

  const { value } = await completeStructured(client, "claim_matches", MatchResult, {
    system: MATCH_SYSTEM,
    prompt: matchUserPrompt(claims.map((c, i) => ({ index: i, statement: c.statement }))),
    temperature: 0,
    seed: 1,
    reasoningEffort: opts.reasoningEffort ?? "medium",
  });

  const attribution = { kind: "analyst-llm" as const, ref: client.model };
  const seen = new Set(bundle.matches.map((m) => m.id));
  const added: Match[] = [];
  let dropped = 0;

  for (const prop of value.matches) {
    const from = claims[prop.fromIndex]?.id;
    const to = claims[prop.toIndex]?.id;
    if (!from || !to || from === to) { dropped++; continue; }

    const type = prop.type as MatchType;
    const id = matchId({ type, from, to });
    if (seen.has(id)) continue;
    seen.add(id);
    added.push({ id, type, from, to, rationale: prop.rationale, attribution });
  }

  return {
    bundle: { ...bundle, matches: [...bundle.matches, ...added] },
    stats: { proposed: value.matches.length, added: added.length, dropped },
  };
}
