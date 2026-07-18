import type { Bundle } from "@epistemic-git/protocol";
import { idbDelete, idbGet, idbKeys, idbPut } from "./idb.js";

/**
 * Per-case lineage: every mutation event (import / merge / pipeline run / commit) is recorded
 * with the bundle digest after the event and its parent digest(s) a lightweight commit log.
 * Events live in localStorage (small); bundle snapshots for diffing live in IndexedDB, LRU-capped.
 */

export interface HistoryEvent {
  id: string;
  caseId: string;
  kind: "imported" | "merged" | "pipeline-run" | "committed";
  at: string; // ISO timestamp
  digest: string;
  parents: string[];
  stats?: Record<string, number>;
  note?: string;
}

const LS_KEY = "egit:history:v1";
const MAX_EVENTS = 200;
const MAX_SNAPSHOTS = 20;

function loadAll(): HistoryEvent[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as HistoryEvent[];
  } catch {
    return [];
  }
}

function saveAll(events: HistoryEvent[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Quota exceeded, drop the oldest half and retry once.
    try { localStorage.setItem(LS_KEY, JSON.stringify(events.slice(-MAX_EVENTS / 2))); } catch { /* give up quietly */ }
  }
}

export function appendEvent(e: Omit<HistoryEvent, "id" | "at">): HistoryEvent {
  const event: HistoryEvent = {
    ...e,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  };
  saveAll([...loadAll(), event]);
  return event;
}

export function eventsFor(caseId: string): HistoryEvent[] {
  return loadAll().filter((e) => e.caseId === caseId).reverse(); // newest first
}

/** Drop every event for a case (used when the case is deleted). Snapshots are LRU, so leave them. */
export function deleteHistory(caseId: string): void {
  saveAll(loadAll().filter((e) => e.caseId !== caseId));
}

/** Store a bundle snapshot for later diffing; evicts oldest beyond the cap. */
export async function snapshotPut(digest: string, bundle: Bundle): Promise<void> {
  await idbPut("snapshots", digest, { bundle, at: Date.now() });
  const keys = await idbKeys("snapshots");
  if (keys.length > MAX_SNAPSHOTS) {
    const entries = await Promise.all(
      keys.map(async (k) => ({ k, at: ((await idbGet<{ at: number }>("snapshots", k))?.at ?? 0) })),
);
    entries.sort((a, b) => a.at - b.at);
    for (const { k } of entries.slice(0, entries.length - MAX_SNAPSHOTS)) await idbDelete("snapshots", k);
  }
}

export async function snapshotGet(digest: string): Promise<Bundle | undefined> {
  return (await idbGet<{ bundle: Bundle }>("snapshots", digest))?.bundle;
}
