import { type Bundle, correlationGroupId } from "@epistemic-git/protocol";
import { detectCorrelation } from "@epistemic-git/analysis";

/**
 * Derive explicit CorrelationGroup nodes from source metadata (shared authors / dataset / declared
 * relations). Deterministic: the detection lives in the pure analysis package; here we only mint the
 * content-addressed ids. Making the correlation explicit lets the assessment layer discount
 * double-counted evidence and lets the UI show *why* two "independent" citations are not independent.
 */
export function deriveCorrelationGroups(bundle: Bundle): { bundle: Bundle; added: number } {
  const groups = [...bundle.correlationGroups];
  const seen = new Set(groups.map((g) => g.id));
  let added = 0;
  for (const c of detectCorrelation(bundle)) {
    const id = correlationGroupId({ memberKind: c.memberKind, members: c.members, sharedOrigin: c.sharedOrigin });
    if (seen.has(id)) continue;
    seen.add(id);
    groups.push({ id, memberKind: c.memberKind, members: c.members, sharedOrigin: c.sharedOrigin, rationale: c.rationale });
    added++;
  }
  return { bundle: { ...bundle, correlationGroups: groups }, added };
}
