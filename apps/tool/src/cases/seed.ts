/**
 * Built-in seed cases that ship with the repo as git-tracked artifacts. These are NOT deletable
 * from the browser: a stray delete would remove committed files (and, for the dev server, wipe them
 * from disk). User-imported and pipeline-built cases live only in this browser and stay deletable.
 * The dev delete endpoint (apps/tool/vite.config.ts) enforces the same set server-side.
 */
export const SEED_CASE_IDS: ReadonlySet<string> = new Set([
  "lhc",
  "covid",
  "eggs",
  "lhc-addendum",
]);

export function isSeedCase(id: string): boolean {
  return SEED_CASE_IDS.has(id);
}
