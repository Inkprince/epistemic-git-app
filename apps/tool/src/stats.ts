import { computeSupport } from "@epistemic-git/analysis";
import type { Bundle } from "@epistemic-git/protocol";
import { primaryConclusion } from "./domain.js";

/** Pure cross-bundle aggregations that feed the Overview dashboard. */

export interface CaseSupport {
  id: string;
  label: string;
  support: number;
  claims: number;
  overlays: number;
  mergeable: boolean;
  generated: boolean;
}

export function supportByCase(
  bundles: Record<string, { label: string; bundle: Bundle }>,
  mergeableIds: Set<string>,
): CaseSupport[] {
  return Object.entries(bundles).map(([id, { label, bundle }]) => {
    const conclusion = primaryConclusion(bundle);
    const overlayId = bundle.overlays[0]?.id;
    const field = conclusion
      ? computeSupport(bundle, { ...(overlayId ? { overlayId } : {}), respectCorrelation: true })
      : undefined;
    return {
      id,
      label,
      support: (conclusion && field?.support.get(conclusion.id)) || 0,
      claims: bundle.claims.length,
      overlays: bundle.overlays.length,
      mergeable: mergeableIds.has(id),
      generated: bundle.claims.some((c) => c.attribution.kind === "analyst-llm"),
    };
  });
}

export function overviewKpis(bundlesRec: Record<string, { label: string; bundle: Bundle }>) {
  const all = Object.values(bundlesRec).map((b) => b.bundle);
  const sum = (f: (b: Bundle) => number) => all.reduce((a, b) => a + f(b), 0);
  return {
    cases: all.length,
    claims: sum((b) => b.claims.length),
    passages: sum((b) => b.passages.length),
    inferences: sum((b) => b.inferences.length),
    matches: sum((b) => b.matches.length),
    challenges: sum((b) => b.challenges.length),
    openChallenges: sum((b) => b.challenges.filter((c) => c.status === "open").length),
    quarantined: sum((b) => b.quarantine.length),
    sources: sum((b) => b.sources.length),
  };
}

export interface AttributionMix {
  fromSource: number;
  llm: number;
  human: number;
  quarantined: number;
  total: number;
}

export function attributionMix(bundlesRec: Record<string, { label: string; bundle: Bundle }>): AttributionMix {
  let fromSource = 0, llm = 0, human = 0, quarantined = 0;
  for (const { bundle } of Object.values(bundlesRec)) {
    for (const c of bundle.claims) {
      if (c.attribution.kind === "source") fromSource++;
      else if (c.attribution.kind === "analyst-llm") llm++;
      else human++;
    }
    quarantined += bundle.quarantine.length;
  }
  return { fromSource, llm, human, quarantined, total: fromSource + llm + human };
}

export interface AuditItem {
  kind: "challenge" | "contradiction" | "quarantine";
  actor: string;
  text: string;
  caseId: string;
  caseLabel: string;
  targetId?: string;
}

/** The freshest adversarial-audit trail we can honestly derive (bundles carry no timestamps). */
export function auditActivity(
  bundlesRec: Record<string, { label: string; bundle: Bundle }>,
  limit = 4,
): AuditItem[] {
  const items: AuditItem[] = [];
  for (const [caseId, { label, bundle }] of Object.entries(bundlesRec)) {
    for (const c of bundle.challenges) {
      items.push({
        kind: "challenge",
        actor: `${c.challengeType} challenge`,
        text: c.rationale,
        caseId,
        caseLabel: label,
        ...(c.target.kind === "claim" || c.target.kind === "inference" ? { targetId: c.target.id } : {}),
      });
    }
    for (const m of bundle.matches.filter((m) => m.type === "contradicts")) {
      items.push({ kind: "contradiction", actor: "Contradiction", text: m.rationale, caseId, caseLabel: label, targetId: m.from });
    }
    for (const q of bundle.quarantine) {
      items.push({ kind: "quarantine", actor: "Quarantine", text: q.statement, caseId, caseLabel: label });
    }
  }
  // Interleave cases so one bundle doesn't dominate the feed.
  const byCase = new Map<string, AuditItem[]>();
  for (const it of items) {
    if (!byCase.has(it.caseId)) byCase.set(it.caseId, []);
    byCase.get(it.caseId)!.push(it);
  }
  const out: AuditItem[] = [];
  const queues = [...byCase.values()];
  let i = 0;
  while (out.length < limit && queues.some((q) => q.length)) {
    const q = queues[i % queues.length]!;
    const next = q.shift();
    if (next) out.push(next);
    i++;
  }
  return out;
}
