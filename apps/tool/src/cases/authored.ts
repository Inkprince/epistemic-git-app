import type { Assessment, Bundle, Challenge, Narrative, Overlay } from "@epistemic-git/protocol";

/**
 * User-authored perspectives (overlays + assessments) and AI-proposed challenges, stored locally
 * per case. These are REAL content-addressed nodes, ids computed with the same sha256 as the
 * pipeline, so they survive full validation and export/import round-trips. "Assessments are a
 * late-binding overlay anyone can add" (and "the ledger's own AI output is itself a first-class,
 * challengeable node") is now literally true in the UI.
 */

export interface AuthoredSet {
  overlays: Overlay[];
  assessments: Assessment[];
  /** AI-proposed (or otherwise locally-added) challenges, e.g. from "red-team this claim". */
  challenges: Challenge[];
  /** AI-authored per-claim summaries, e.g. from "cite this claim". */
  narratives: Narrative[];
}

const LS_KEY = "egit:authored-overlays:v1";

type Store = Record<string, AuthoredSet>;

function loadStore(): Store {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

function saveStore(s: Store): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* quota, ignore */ }
}

export function loadAuthored(caseId: string): AuthoredSet {
  const s = loadStore()[caseId];
  return {
    overlays: s?.overlays ?? [], assessments: s?.assessments ?? [],
    challenges: s?.challenges ?? [], narratives: s?.narratives ?? [],
  };
}

/** Append AI-proposed (or locally-added) challenges for a case, deduped by content id. */
export function saveAuthoredChallenges(caseId: string, challenges: Challenge[]): void {
  if (challenges.length === 0) return;
  const cur = loadAuthored(caseId);
  const seen = new Set(cur.challenges.map((c) => c.id));
  const store = loadStore();
  store[caseId] = { ...cur, challenges: [...cur.challenges, ...challenges.filter((c) => !seen.has(c.id))] };
  saveStore(store);
}

/** Store an AI-authored per-claim narrative, replacing any prior narrative for the same target. */
export function saveAuthoredNarrative(caseId: string, narrative: Narrative): void {
  const cur = loadAuthored(caseId);
  const store = loadStore();
  store[caseId] = {
    ...cur,
    narratives: [...cur.narratives.filter((n) => !(n.target.kind === narrative.target.kind && n.target.id === narrative.target.id)), narrative],
  };
  saveStore(store);
}

export function saveAuthoredOverlay(caseId: string, overlay: Overlay, assessments: Assessment[]): void {
  const cur = loadAuthored(caseId); // full set, so stored challenges/narratives are preserved
  const store = loadStore();
  store[caseId] = {
    ...cur,
    overlays: [...cur.overlays.filter((o) => o.id !== overlay.id), overlay],
    assessments: [
      ...cur.assessments.filter((a) => a.overlayId !== overlay.id),
      ...assessments,
    ],
  };
  saveStore(store);
}

export function deleteAuthoredOverlay(caseId: string, overlayId: string): void {
  const store = loadStore();
  if (!store[caseId]) return;
  const cur = loadAuthored(caseId);
  store[caseId] = {
    ...cur,
    overlays: cur.overlays.filter((o) => o.id !== overlayId),
    assessments: cur.assessments.filter((a) => a.overlayId !== overlayId),
  };
  saveStore(store);
}

/**
 * Compose stored authored overlays into a bundle (dedup by content id; assessments whose targets
 * no longer resolve are dropped). Pure with respect to the input bundle, returns a new object
 * only when something was added.
 */
export function withAuthored(bundle: Bundle, caseId: string): Bundle {
  const authored = loadAuthored(caseId);
  if (authored.overlays.length === 0 && authored.challenges.length === 0 && authored.narratives.length === 0) return bundle;
  const overlayIds = new Set(bundle.overlays.map((o) => o.id));
  const assessmentIds = new Set(bundle.assessments.map((a) => a.id));
  const challengeIds = new Set(bundle.challenges.map((c) => c.id));
  const narrativeIds = new Set((bundle.narratives ?? []).map((n) => n.id));
  const nodeIds = new Set([...bundle.claims.map((c) => c.id), ...bundle.inferences.map((i) => i.id)]);
  const targetResolves = (id: string, kind: string) => kind === "topic" || nodeIds.has(id);
  const claimIds = new Set(bundle.claims.map((c) => c.id));
  const newOverlays = authored.overlays.filter((o) => !overlayIds.has(o.id));
  const newAssessments = authored.assessments.filter((a) => !assessmentIds.has(a.id) && nodeIds.has(a.target.id));
  const newChallenges = authored.challenges.filter((c) => !challengeIds.has(c.id) && targetResolves(c.target.id, c.target.kind));
  const newNarratives = authored.narratives.filter(
    (n) => !narrativeIds.has(n.id) && targetResolves(n.target.id, n.target.kind) && n.groundedIn.every((g) => claimIds.has(g)),
);
  if (newOverlays.length === 0 && newAssessments.length === 0 && newChallenges.length === 0 && newNarratives.length === 0) return bundle;
  return {
    ...bundle,
    overlays: [...bundle.overlays, ...newOverlays],
    assessments: [...bundle.assessments, ...newAssessments],
    challenges: [...bundle.challenges, ...newChallenges],
    narratives: [...(bundle.narratives ?? []), ...newNarratives],
  };
}
