import type { Bundle } from "@epistemic-git/protocol";

/**
 * Pure bundle-to-bundle diff over content-addressed ids, the "git diff" companion to merge().
 * Because ids are content hashes, membership comparison IS semantic comparison: a node whose
 * identity-defining fields changed is a removal plus an addition, never a silent mutation.
 */

export type CollectionKey =
  | "sources" | "passages" | "claims" | "inferences" | "challenges"
  | "correlationGroups" | "matches" | "overlays" | "assessments" | "quarantine" | "narratives";

export const COLLECTION_KEYS: readonly CollectionKey[] = [
  "sources", "passages", "claims", "inferences", "challenges",
  "correlationGroups", "matches", "overlays", "assessments", "quarantine", "narratives",
];

export interface BundleDiff {
  /** ids present in b but not a, per collection (only non-empty keys). */
  added: Partial<Record<CollectionKey, string[]>>;
  /** ids present in a but not b, per collection (only non-empty keys). */
  removed: Partial<Record<CollectionKey, string[]>>;
  totalAdded: number;
  totalRemoved: number;
}

export function diffBundles(a: Bundle, b: Bundle): BundleDiff {
  const added: Partial<Record<CollectionKey, string[]>> = {};
  const removed: Partial<Record<CollectionKey, string[]>> = {};
  let totalAdded = 0;
  let totalRemoved = 0;

  for (const key of COLLECTION_KEYS) {
    const aIds = new Set(((a[key] as { id: string }[] | undefined) ?? []).map((x) => x.id));
    const bIds = new Set(((b[key] as { id: string }[] | undefined) ?? []).map((x) => x.id));
    const plus = [...bIds].filter((id) => !aIds.has(id));
    const minus = [...aIds].filter((id) => !bIds.has(id));
    if (plus.length) { added[key] = plus; totalAdded += plus.length; }
    if (minus.length) { removed[key] = minus; totalRemoved += minus.length; }
  }
  return { added, removed, totalAdded, totalRemoved };
}
