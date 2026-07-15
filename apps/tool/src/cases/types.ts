import type { Bundle } from "@epistemic-git/protocol";

export type CaseOrigin = "committed" | "imported";

/** One openable ledger in the app — a committed artifact or a user-imported bundle. */
export interface CaseEntry {
  /** Route slug. Imported: `imp-${digest.slice(0, 8)}` (idempotent re-import). */
  id: string;
  label: string;
  origin: CaseOrigin;
  bundle: Bundle;
  /** bundleDigest at load/import time. */
  digest: string;
  /** Suggested merge sources shipped alongside a committed case. */
  mergePairs?: { id: string; label: string; bundle: Bundle }[];
}

/** Shape of artifacts/cases.json. */
export interface CaseManifest {
  version: number;
  cases: {
    id: string;
    label: string;
    file: string;
    mergePairs?: { id: string; label: string; file: string }[];
  }[];
}
