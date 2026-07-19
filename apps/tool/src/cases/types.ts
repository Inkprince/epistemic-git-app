import type { Bundle } from "@epistemic-git/protocol";

export type CaseOrigin = "committed" | "imported" | "built";

/** One openable ledger in the app, a committed artifact, a user-imported bundle, or a case built from pasted source text. */
export interface CaseEntry {
  /** Route slug. Imported: `imp-${digest.slice(0, 8)}`; built: `built-${digest.slice(0, 8)}` (idempotent). */
  id: string;
  label: string;
  origin: CaseOrigin;
  bundle: Bundle;
  /** bundleDigest at load/import time. */
  digest: string;
  /**
   * Suggested merge sources on this case: seeded ones shipped alongside a committed case, plus any
   * a user filed locally via "Suggest a contribution". Local ones carry `suggestionId` (their
   * IndexedDB key) so the UI can decline/accept them; seeded ones omit it and are permanent.
   */
  mergePairs?: { id: string; label: string; bundle: Bundle; author?: { name: string }; suggestionId?: string }[];
}

/**
 * A contribution a user filed against a case from the browser ("Suggest a contribution"). Local-only,
 * persisted in IndexedDB, and folded into the target case's mergePairs so it surfaces as a pending
 * suggestion exactly like a seeded one. Removed when declined or accepted (merged).
 */
export interface PendingSuggestion {
  /** IndexedDB key and dedup key: `${targetCaseId}:${id}`. */
  key: string;
  /** mergePair id within the target case: `sug-${digest.slice(0, 8)}`. */
  id: string;
  targetCaseId: string;
  label: string;
  author: { name: string };
  bundle: Bundle;
  digest: string;
}

/** Shape of artifacts/cases.json. */
export interface CaseManifest {
  version: number;
  cases: {
    id: string;
    label: string;
    file: string;
    mergePairs?: { id: string; label: string; file: string; author?: { name: string } }[];
  }[];
}
