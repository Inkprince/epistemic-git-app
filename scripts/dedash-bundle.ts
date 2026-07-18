import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateBundle, serializeBundle,
  sourceId, passageId, claimId, inferenceId, challengeId,
  correlationGroupId, matchId, overlayId, assessmentId, quarantineId, narrativeId, bundleId,
  type Bundle, type TargetRef,
} from "@epistemic-git/protocol";

/**
 * Remove em-dashes from a committed bundle's AUTHORED text, then recompute every content-addressed
 * id and rewrite all references, so the bundle stays internally consistent (the id-integrity
 * regression tripwire keeps passing). Verbatim quotes and source context are left untouched: the
 * product's core invariant is provenance fidelity, so a quote that genuinely contains an em-dash
 * keeps it. Run: tsx scripts/dedash-bundle.ts <bundle.json> [more.json ...]
 */

// Same context-aware replacement as scripts/dedash.mjs, applied per authored string.
function dedash(line: string): string {
  let s = line;
  const dashes = (s.match(/\u2014/g) || []).length;
  if (dashes === 2) s = s.replace(/\s+\u2014\s+([^\u2014.!?;:]+?)\s+\u2014\s+/g, " ($1) ");
  s = s.replace(/([,:;.!?)"'”’])\s*\u2014\s*/g, "$1 ");
  s = s.replace(/(^|[.!?]\s+)([A-Z][A-Za-z0-9'’ ]{1,28}?)\s+\u2014\s+/g, (_m, pre: string, label: string) => {
    const words = label.trim().split(/\s+/).length;
    return words <= 3 ? `${pre}${label}: ` : `${pre}${label}, `;
  });
  s = s.replace(/\s+\u2014\s+/g, ", ");
  s = s.replace(/\s+\u2014/g, ", ").replace(/\u2014\s+/g, ", ");
  s = s.replace(/(\S)\u2014(\S)/g, "$1, $2");
  s = s.replace(/\u2014/g, ", ");
  s = s.replace(/,\s*,/g, ",").replace(/:\s*,/g, ":").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
  return s;
}
const ddArr = (xs: string[] | undefined): string[] | undefined => (xs ? xs.map(dedash) : xs);

function rebuild(bundle: Bundle): Bundle {
  const b = structuredClone(bundle);

  // 1. Sources (title/knownStance authored; url and type are identity-stable except title).
  const srcMap = new Map<string, string>();
  for (const s of b.sources) {
    if (s.reliability?.knownStance) s.reliability.knownStance = dedash(s.reliability.knownStance);
    const oldId = s.id;
    s.title = dedash(s.title);
    const nid = sourceId({ type: s.type, title: s.title, url: s.url, authors: s.authors });
    srcMap.set(oldId, nid);
    s.id = nid;
  }

  // 2. Passages (verbatimText + context are SOURCE bytes: keep; only sourceId ref may change).
  const psgMap = new Map<string, string>();
  for (const p of b.passages) {
    const oldId = p.id;
    p.sourceId = srcMap.get(p.sourceId) ?? p.sourceId;
    const nid = passageId({ sourceId: p.sourceId, locator: p.locator, verbatimText: p.verbatimText });
    psgMap.set(oldId, nid);
    p.id = nid;
  }

  // 3. Claims (statement/structure/assumptions/caveats authored).
  const claimMap = new Map<string, string>();
  for (const c of b.claims) {
    const oldId = c.id;
    c.statement = dedash(c.statement);
    c.assumptions = ddArr(c.assumptions) ?? c.assumptions;
    c.caveats = ddArr(c.caveats) ?? c.caveats;
    if (c.structure) for (const k of Object.keys(c.structure) as (keyof typeof c.structure)[]) {
      const v = c.structure[k];
      if (typeof v === "string") (c.structure[k] as string) = dedash(v);
    }
    const nid = claimId({ statement: c.statement, claimType: c.claimType, structure: c.structure });
    claimMap.set(oldId, nid);
    c.id = nid;
    c.passages = c.passages.map((p) => psgMap.get(p) ?? p);
    if (c.attribution.kind === "source" && c.attribution.ref) c.attribution.ref = srcMap.get(c.attribution.ref) ?? c.attribution.ref;
  }

  const remapTarget = (t: TargetRef): TargetRef =>
    t.kind === "claim" ? { ...t, id: claimMap.get(t.id) ?? t.id }
    : t.kind === "inference" ? { ...t, id: infMap.get(t.id) ?? t.id }
    : { ...t, id: dedash(t.id) }; // topic

  // 4. Inferences (premises/conclusion are claim ids; warrant authored).
  const infMap = new Map<string, string>();
  for (const i of b.inferences) {
    const oldId = i.id;
    i.warrant = dedash(i.warrant);
    i.assumptions = ddArr(i.assumptions) ?? i.assumptions;
    i.defeaters = ddArr(i.defeaters) ?? i.defeaters;
    i.premises = i.premises.map((p) => claimMap.get(p) ?? p);
    i.conclusion = claimMap.get(i.conclusion) ?? i.conclusion;
    const nid = inferenceId({ type: i.type, premises: i.premises, conclusion: i.conclusion, warrant: i.warrant });
    infMap.set(oldId, nid);
    i.id = nid;
    if (i.provenancePassageId) i.provenancePassageId = psgMap.get(i.provenancePassageId) ?? i.provenancePassageId;
  }

  // 5. Matches (from/to are claim ids; rationale authored).
  for (const m of b.matches) {
    m.from = claimMap.get(m.from) ?? m.from;
    m.to = claimMap.get(m.to) ?? m.to;
    m.rationale = dedash(m.rationale);
    m.id = matchId({ type: m.type, from: m.from, to: m.to });
  }

  // 6. Challenges (target is claim/inference; rationale + remedy authored).
  for (const c of b.challenges) {
    c.target = remapTarget(c.target);
    c.rationale = dedash(c.rationale);
    if (c.suggestedRemedy) c.suggestedRemedy = dedash(c.suggestedRemedy);
    c.id = challengeId({ challengeType: c.challengeType, target: c.target, rationale: c.rationale });
  }

  // 7. Correlation groups (members are claim or source ids; rationale authored).
  for (const g of b.correlationGroups) {
    g.members = g.members.map((m) => (g.memberKind === "claim" ? claimMap.get(m) : srcMap.get(m)) ?? m);
    g.rationale = dedash(g.rationale);
    g.id = correlationGroupId({ memberKind: g.memberKind, members: g.members, sharedOrigin: g.sharedOrigin });
  }

  // 8. Overlays (label/description/priorStance authored; admits are source ids).
  const ovlMap = new Map<string, string>();
  for (const o of b.overlays) {
    const oldId = o.id;
    o.label = dedash(o.label);
    if (o.description) o.description = dedash(o.description);
    if (o.priorStance) o.priorStance = dedash(o.priorStance);
    if (o.admits) o.admits = o.admits.map((s) => srcMap.get(s) ?? s);
    const nid = overlayId({ label: o.label, analyst: o.analyst });
    ovlMap.set(oldId, nid);
    o.id = nid;
  }

  // 9. Assessments (overlayId + target refs; rationale authored).
  for (const a of b.assessments) {
    a.overlayId = ovlMap.get(a.overlayId) ?? a.overlayId;
    a.target = remapTarget(a.target);
    if (a.rationale) a.rationale = dedash(a.rationale);
    a.id = assessmentId({ overlayId: a.overlayId, target: a.target });
  }

  // 10. Quarantine (statement authored; attemptedPassageText is the model's failed quote, authored).
  for (const q of b.quarantine) {
    q.statement = dedash(q.statement);
    if (q.attemptedPassageText) q.attemptedPassageText = dedash(q.attemptedPassageText);
    q.id = quarantineId({ statement: q.statement, reason: q.reason });
  }

  // 11. Narratives (text authored; target + groundedIn refs).
  for (const n of b.narratives ?? []) {
    n.target = remapTarget(n.target);
    n.text = dedash(n.text);
    n.groundedIn = n.groundedIn.map((c) => claimMap.get(c) ?? c);
    n.id = narrativeId({ target: n.target, text: n.text, groundedIn: n.groundedIn });
  }

  // 12. Bundle identity (title/question authored).
  b.title = dedash(b.title);
  b.question = dedash(b.question);
  b.id = bundleId({ case: b.case, question: b.question });

  return b;
}

const files = process.argv.slice(2);
if (!files.length) { console.error("usage: tsx scripts/dedash-bundle.ts <bundle.json> ..."); process.exit(1); }
for (const rel of files) {
  const path = resolve(process.cwd(), rel);
  const bundle = JSON.parse(readFileSync(path, "utf8")) as Bundle;
  const rebuilt = rebuild(bundle);
  const check = validateBundle(rebuilt);
  if (!check.ok) {
    console.error(`${rel}: FAILED validation after rebuild`);
    for (const i of check.issues.filter((x) => x.severity === "error")) console.error(`  ${i.code}: ${i.message}`);
    process.exit(1);
  }
  writeFileSync(path, JSON.stringify(rebuilt, null, 2) + "\n", "utf8");
  const jsonl = path.replace(/\.json$/, ".jsonl");
  writeFileSync(jsonl, serializeBundle(rebuilt), "utf8");
  const remaining = JSON.stringify(rebuilt).match(/\u2014/g)?.length ?? 0;
  console.error(`${rel}: rebuilt OK, ${remaining} em-dash(es) remaining (verbatim quotes kept)`);
}
