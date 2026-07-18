import {
  assessmentId, challengeId, claimId, correlationGroupId, inferenceId, matchId, narrativeId, overlayId, passageId, sourceId,
} from "./ids.js";
import { Bundle } from "./schema.js";

export interface ValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  /** id of the offending node, when applicable. */
  node?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/**
 * Validate a bundle at three levels:
 *   1. structural, matches the Zod schema;
 *   2. referential, every id reference resolves to a node that exists;
 *   3. invariant, PROVENANCE (source-grounded claims carry a passage; derived claims are
 *      concluded by an inference) and ID INTEGRITY (recorded ids match recomputed ids).
 *
 * A ledger that fails any error-level check is not trustworthy and callers should refuse it.
 */
/**
 * Convenience: return only the content-addressing issues (recorded id ≠ recomputed id). A clean result
 * ([]) means every node's id is a faithful hash of its content, the guarantee that makes merge safe.
 */
export function verifyIds(input: unknown): ValidationIssue[] {
  return validateBundle(input).issues.filter((i) => i.code.startsWith("id."));
}

export function validateBundle(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  const parsed = Bundle.safeParse(input);
  if (!parsed.success) {
    for (const e of parsed.error.issues) {
      issues.push({ code: "schema", severity: "error", message: `${e.path.join(".")}: ${e.message}` });
    }
    return { ok: false, issues };
  }
  const b = parsed.data;

  const sourceIds = new Set(b.sources.map((s) => s.id));
  const passageIds = new Set(b.passages.map((p) => p.id));
  const claimIds = new Set(b.claims.map((c) => c.id));
  const inferenceIds = new Set(b.inferences.map((i) => i.id));
  const overlayIds = new Set(b.overlays.map((o) => o.id));
  const narrativeIds = new Set(b.narratives.map((n) => n.id));

  const err = (code: string, message: string, node?: string) =>
    issues.push({ code, severity: "error", message, ...(node ? { node } : {}) });
  const warn = (code: string, message: string, node?: string) =>
    issues.push({ code, severity: "warning", message, ...(node ? { node } : {}) });

  // ── Referential integrity ────────────────────────────────────────────────
  for (const p of b.passages) {
    if (!sourceIds.has(p.sourceId)) err("ref.passage.source", `passage ${p.id} references missing source ${p.sourceId}`, p.id);
  }
  for (const c of b.claims) {
    for (const pid of c.passages) {
      if (!passageIds.has(pid)) err("ref.claim.passage", `claim ${c.id} references missing passage ${pid}`, c.id);
    }
  }
  for (const i of b.inferences) {
    for (const pr of i.premises) {
      if (!claimIds.has(pr)) err("ref.inference.premise", `inference ${i.id} references missing premise claim ${pr}`, i.id);
    }
    if (!claimIds.has(i.conclusion)) err("ref.inference.conclusion", `inference ${i.id} references missing conclusion claim ${i.conclusion}`, i.id);
    if (i.provenancePassageId && !passageIds.has(i.provenancePassageId)) {
      err("ref.inference.provenance", `inference ${i.id} references missing provenance passage ${i.provenancePassageId}`, i.id);
    }
  }
  for (const ch of b.challenges) {
    checkTarget(ch.target, ch.id, "challenge");
  }
  for (const a of b.assessments) {
    if (!overlayIds.has(a.overlayId)) err("ref.assessment.overlay", `assessment ${a.id} references missing overlay ${a.overlayId}`, a.id);
    checkTarget(a.target, a.id, "assessment", true);
  }
  for (const g of b.correlationGroups) {
    const pool = g.memberKind === "claim" ? claimIds : sourceIds;
    for (const m of g.members) {
      if (!pool.has(m)) err("ref.group.member", `correlation group ${g.id} references missing ${g.memberKind} ${m}`, g.id);
    }
  }
  for (const m of b.matches) {
    if (!claimIds.has(m.from)) err("ref.match.from", `match ${m.id} references missing claim ${m.from}`, m.id);
    if (!claimIds.has(m.to)) err("ref.match.to", `match ${m.id} references missing claim ${m.to}`, m.id);
    if (m.from === m.to) err("match.self", `match ${m.id} relates a claim to itself`, m.id);
  }
  for (const o of b.overlays) {
    for (const s of o.admits ?? []) {
      if (!sourceIds.has(s)) warn("ref.overlay.admits", `overlay ${o.id} admits unknown source ${s}`, o.id);
    }
  }
  for (const nar of b.narratives) {
    checkTarget(nar.target, nar.id, "narrative");
    for (const gid of nar.groundedIn) {
      if (!claimIds.has(gid)) err("ref.narrative.grounded", `narrative ${nar.id} is grounded in missing claim ${gid}`, nar.id);
    }
  }

  function checkTarget(t: { kind: string; id: string }, node: string, ctx: string, claimOrInferenceOnly = false) {
    switch (t.kind) {
      case "claim": if (!claimIds.has(t.id)) err(`ref.${ctx}.target`, `${ctx} ${node} targets missing claim ${t.id}`, node); break;
      case "inference": if (!inferenceIds.has(t.id)) err(`ref.${ctx}.target`, `${ctx} ${node} targets missing inference ${t.id}`, node); break;
      case "passage": if (claimOrInferenceOnly) err(`ref.${ctx}.target`, `${ctx} ${node} may only target a claim or inference`, node);
        else if (!passageIds.has(t.id)) err(`ref.${ctx}.target`, `${ctx} ${node} targets missing passage ${t.id}`, node); break;
      case "source": if (claimOrInferenceOnly) err(`ref.${ctx}.target`, `${ctx} ${node} may only target a claim or inference`, node);
        else if (!sourceIds.has(t.id)) err(`ref.${ctx}.target`, `${ctx} ${node} targets missing source ${t.id}`, node); break;
      case "narrative": if (claimOrInferenceOnly) err(`ref.${ctx}.target`, `${ctx} ${node} may only target a claim or inference`, node);
        else if (!narrativeIds.has(t.id)) err(`ref.${ctx}.target`, `${ctx} ${node} targets missing narrative ${t.id}`, node); break;
      case "topic": break; // a missing-source challenge names a topic, not an existing node
      default: err(`ref.${ctx}.target`, `${ctx} ${node} has unknown target kind ${t.kind}`, node);
    }
  }

  // ── Invariant: PROVENANCE ──────────────────────────────────────────────────
  const concludedClaims = new Set(b.inferences.map((i) => i.conclusion));
  for (const c of b.claims) {
    if (c.derived) {
      if (!concludedClaims.has(c.id)) {
        err("invariant.derived-orphan", `derived claim ${c.id} is not the conclusion of any inference`, c.id);
      }
    } else if (c.attribution.kind === "source" && c.passages.length === 0) {
      err("invariant.provenance", `source-grounded claim ${c.id} has no supporting passage (quote-grounding violated)`, c.id);
    } else if (c.passages.length === 0) {
      warn("invariant.no-passage", `non-derived claim ${c.id} has no supporting passage`, c.id);
    }
  }

  // ── Invariant: ID INTEGRITY (content addressing holds) ─────────────────────
  for (const s of b.sources) {
    if (s.id !== sourceId(s)) err("id.source", `source id ${s.id} does not match its content hash`, s.id);
  }
  for (const p of b.passages) {
    if (p.id !== passageId(p)) err("id.passage", `passage id ${p.id} does not match its content hash`, p.id);
  }
  for (const c of b.claims) {
    if (c.id !== claimId(c)) err("id.claim", `claim id ${c.id} does not match its content hash`, c.id);
  }
  for (const i of b.inferences) {
    if (i.id !== inferenceId(i)) err("id.inference", `inference id ${i.id} does not match its content hash`, i.id);
  }
  for (const ch of b.challenges) {
    if (ch.id !== challengeId(ch)) err("id.challenge", `challenge id ${ch.id} does not match its content hash`, ch.id);
  }
  for (const g of b.correlationGroups) {
    if (g.id !== correlationGroupId(g)) err("id.group", `correlation group id ${g.id} does not match its content hash`, g.id);
  }
  for (const m of b.matches) {
    if (m.id !== matchId(m)) err("id.match", `match id ${m.id} does not match its content hash`, m.id);
  }
  for (const o of b.overlays) {
    if (o.id !== overlayId(o)) err("id.overlay", `overlay id ${o.id} does not match its content hash`, o.id);
  }
  for (const a of b.assessments) {
    if (a.id !== assessmentId(a)) err("id.assessment", `assessment id ${a.id} does not match its content hash`, a.id);
  }
  for (const nar of b.narratives) {
    if (nar.id !== narrativeId(nar)) err("id.narrative", `narrative id ${nar.id} does not match its content hash`, nar.id);
  }

  return { ok: !issues.some((i) => i.severity === "error"), issues };
}
