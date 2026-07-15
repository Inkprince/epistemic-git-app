import { hashContent } from "./canonical.js";
import { Bundle } from "./schema.js";

/**
 * JSONL serialization. A bundle is written as one record per line — a `meta` line followed
 * by one line per node, each tagged with its type. Line-orientation is deliberate: it makes
 * bundles diffable and mergeable with ordinary text tooling, which is the whole "Git" premise.
 * Records are emitted in a stable order (by type, then id) so the same bundle always serializes
 * byte-for-byte identically.
 */

type Tagged = { t: string } & Record<string, unknown>;

const NODE_ORDER = [
  ["source", "sources"],
  ["passage", "passages"],
  ["claim", "claims"],
  ["inference", "inferences"],
  ["challenge", "challenges"],
  ["correlationGroup", "correlationGroups"],
  ["match", "matches"],
  ["overlay", "overlays"],
  ["assessment", "assessments"],
  ["quarantine", "quarantine"],
] as const;

export function serializeBundle(input: Bundle): string {
  // Normalize through the schema so key order is canonical (schema-declaration order) whether
  // the bundle came from the builder or from parseBundle — guaranteeing byte-stable output.
  const bundle = Bundle.parse(input);
  const { sources, passages, claims, inferences, challenges, correlationGroups, matches, overlays, assessments, quarantine, ...meta } = bundle;
  const lines: string[] = [JSON.stringify({ t: "meta", ...meta })];
  const collections: Record<string, { id: string }[]> = {
    sources, passages, claims, inferences, challenges, correlationGroups, matches, overlays, assessments, quarantine,
  };
  for (const [tag, key] of NODE_ORDER) {
    const items = [...collections[key]!].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const item of items) lines.push(JSON.stringify({ t: tag, ...item }));
  }
  return lines.join("\n") + "\n";
}

export function parseBundle(text: string): Bundle {
  const records: Tagged[] = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Tagged);

  const meta = records.find((r) => r.t === "meta");
  if (!meta) throw new Error("bundle JSONL has no meta record");
  const { t: _t, ...metaFields } = meta;

  const pick = (tag: string) =>
    records.filter((r) => r.t === tag).map(({ t: _drop, ...rest }) => rest);

  const assembled = {
    ...metaFields,
    sources: pick("source"),
    passages: pick("passage"),
    claims: pick("claim"),
    inferences: pick("inference"),
    challenges: pick("challenge"),
    correlationGroups: pick("correlationGroup"),
    matches: pick("match"),
    overlays: pick("overlay"),
    assessments: pick("assessment"),
    quarantine: pick("quarantine"),
  };
  return Bundle.parse(assembled);
}

/** A stable digest over all node ids — a cheap version/integrity fingerprint for a bundle. */
export function bundleDigest(bundle: Bundle): string {
  const ids = [
    ...bundle.sources, ...bundle.passages, ...bundle.claims, ...bundle.inferences,
    ...bundle.challenges, ...bundle.correlationGroups, ...bundle.matches, ...bundle.overlays,
    ...bundle.assessments, ...bundle.quarantine,
  ].map((n) => n.id).sort();
  return hashContent({ id: bundle.id, question: bundle.question, ids });
}
