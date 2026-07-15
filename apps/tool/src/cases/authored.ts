import type { Assessment, Bundle, Overlay } from "@epistemic-git/protocol";

/**
 * User-authored perspectives (overlays + assessments), stored locally per case. These are REAL
 * content-addressed nodes — ids computed with the same sha256 as the pipeline — so they survive
 * full validation and export/import round-trips. "Assessments are a late-binding overlay anyone
 * can add" is now literally true in the UI.
 */

export interface AuthoredSet {
  overlays: Overlay[];
  assessments: Assessment[];
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
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* quota — ignore */ }
}

export function loadAuthored(caseId: string): AuthoredSet {
  return loadStore()[caseId] ?? { overlays: [], assessments: [] };
}

export function saveAuthoredOverlay(caseId: string, overlay: Overlay, assessments: Assessment[]): void {
  const store = loadStore();
  const cur = store[caseId] ?? { overlays: [], assessments: [] };
  store[caseId] = {
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
  const cur = store[caseId];
  if (!cur) return;
  store[caseId] = {
    overlays: cur.overlays.filter((o) => o.id !== overlayId),
    assessments: cur.assessments.filter((a) => a.overlayId !== overlayId),
  };
  saveStore(store);
}

/**
 * Compose stored authored overlays into a bundle (dedup by content id; assessments whose targets
 * no longer resolve are dropped). Pure with respect to the input bundle — returns a new object
 * only when something was added.
 */
export function withAuthored(bundle: Bundle, caseId: string): Bundle {
  const authored = loadAuthored(caseId);
  if (authored.overlays.length === 0) return bundle;
  const overlayIds = new Set(bundle.overlays.map((o) => o.id));
  const assessmentIds = new Set(bundle.assessments.map((a) => a.id));
  const nodeIds = new Set([...bundle.claims.map((c) => c.id), ...bundle.inferences.map((i) => i.id)]);
  const newOverlays = authored.overlays.filter((o) => !overlayIds.has(o.id));
  const newAssessments = authored.assessments.filter((a) => !assessmentIds.has(a.id) && nodeIds.has(a.target.id));
  if (newOverlays.length === 0 && newAssessments.length === 0) return bundle;
  return {
    ...bundle,
    overlays: [...bundle.overlays, ...newOverlays],
    assessments: [...bundle.assessments, ...newAssessments],
  };
}
