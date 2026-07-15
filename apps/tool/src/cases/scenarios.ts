import type { ScenarioState } from "../routing.js";

/**
 * Named scenarios — the app's "branches". A scenario is a saved belief-state (perspective +
 * distrust set + correlation toggle) over an immutable ledger: you branch interpretations,
 * not data. Persisted locally per case; shareable because the same state round-trips
 * through the URL scenario codec.
 */

export interface Scenario extends ScenarioState {
  name: string;
}

const LS_KEY = "egit:scenarios:v1";

type Store = Record<string, Scenario[]>;

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

export function loadScenarios(caseId: string): Scenario[] {
  return loadStore()[caseId] ?? [];
}

export function saveScenario(caseId: string, scenario: Scenario): Scenario[] {
  const store = loadStore();
  const list = (store[caseId] ?? []).filter((s) => s.name !== scenario.name);
  store[caseId] = [...list, scenario].slice(-30);
  saveStore(store);
  return store[caseId];
}

export function deleteScenario(caseId: string, name: string): Scenario[] {
  const store = loadStore();
  store[caseId] = (store[caseId] ?? []).filter((s) => s.name !== name);
  saveStore(store);
  return store[caseId];
}
