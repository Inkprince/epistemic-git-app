import type { Bundle } from "@epistemic-git/protocol";

/**
 * Deterministic correlation detection — the "counted as independent but isn't" detector.
 *
 * The Rootclaim error is treating evidence that shares a common origin (same dataset, same authors,
 * one paper re-citing another) as if it were independent confirmation. This finds such structure from
 * source metadata alone — no LLM — and returns candidate correlation groups. It stays PURE (no crypto,
 * no network) so it runs in the browser; the pipeline turns candidates into content-addressed
 * CorrelationGroup nodes (see deriveCorrelationGroups in @epistemic-git/pipeline).
 */

export interface CorrelationCandidate {
  memberKind: "claim";
  members: string[];
  sharedOrigin: "author" | "dataset" | "publication" | "institution";
  rationale: string;
}

const LINKED_RELATIONS = new Set(["same-authors", "same-dataset", "republishes", "corrects", "corrected-by", "derived-from"]);

export function detectCorrelation(bundle: Bundle): CorrelationCandidate[] {
  const sourceIds = bundle.sources.map((s) => s.id);
  const parent = new Map<string, string>(sourceIds.map((id) => [id, id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; }
    return r;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  // shared authorship
  const authorsOf = new Map(bundle.sources.map((s) => [s.id, new Set(s.authors.map((a) => a.toLowerCase().trim()))]));
  for (let i = 0; i < bundle.sources.length; i++) {
    for (let j = i + 1; j < bundle.sources.length; j++) {
      const a = authorsOf.get(bundle.sources[i]!.id)!;
      const b = authorsOf.get(bundle.sources[j]!.id)!;
      if ([...a].some((x) => x && b.has(x))) union(bundle.sources[i]!.id, bundle.sources[j]!.id);
    }
  }
  // declared relations (same-dataset / same-authors / corrects / …)
  const datasetLinked = new Set<string>();
  for (const s of bundle.sources) {
    for (const r of s.relatedSources) {
      if (LINKED_RELATIONS.has(r.relation)) {
        union(s.id, r.sourceId);
        if (r.relation === "same-dataset") { datasetLinked.add(s.id); datasetLinked.add(r.sourceId); }
      }
    }
  }

  // group sources by root, then collect their source-grounded claims
  const groups = new Map<string, string[]>();
  for (const id of sourceIds) {
    const root = find(id);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(id);
  }

  const candidates: CorrelationCandidate[] = [];
  for (const [, groupSources] of groups) {
    if (groupSources.length < 2) continue;
    const claims = bundle.claims.filter((c) => c.attribution.kind === "source" && c.attribution.ref && groupSources.includes(c.attribution.ref));
    if (claims.length < 2) continue;

    const sharedDataset = groupSources.some((s) => datasetLinked.has(s));
    const commonAuthors = intersectAuthors(groupSources.map((s) => authorsOf.get(s)!));
    const titles = groupSources.map((s) => bundle.sources.find((x) => x.id === s)?.title ?? s);
    const sharedOrigin = sharedDataset ? "dataset" : commonAuthors.length ? "author" : "publication";
    const rationale = sharedDataset
      ? `Claims drawn from sources sharing the same dataset — not independent evidence.`
      : commonAuthors.length
      ? `Claims from ${groupSources.length} sources by overlapping authors (${commonAuthors.join(", ")}) — not independent evidence: ${titles.map((t) => `"${truncate(t, 40)}"`).join("; ")}.`
      : `Claims from linked sources — treat as correlated, not independent.`;

    candidates.push({ memberKind: "claim", members: claims.map((c) => c.id), sharedOrigin, rationale });
  }
  return candidates;
}

function intersectAuthors(sets: Set<string>[]): string[] {
  if (!sets.length) return [];
  return [...sets[0]!].filter((a) => a && sets.every((s) => s.has(a)));
}
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
