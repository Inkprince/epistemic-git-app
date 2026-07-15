import type { Bundle } from "@epistemic-git/protocol";

/**
 * Hash routing with full deep links. Grammar:
 *
 *   #/                                     overview
 *   #/case/{caseId}                        case, defaults
 *   #/case/{caseId}?tab={mainTab}          active main tab
 *                  &sel={8hex}             selected node (claim or inference)
 *                  &s=1~{rc}~{ovl8|-}~{c8.c8|-}   scenario: correlation flag, overlay, distrust set
 *
 * Node references use the last 8 hex chars' prefix of the content-hash id (`cl_9f31ab02…` → `9f31ab02`),
 * resolved by prefix match against the loaded bundle; unresolvable refs drop gracefully so a shared
 * link degrades instead of erroring when the receiver lacks an imported bundle.
 */

export type MainTab = "argument" | "perspectives" | "challenges" | "relations" | "quarantine";
const MAIN_TABS: readonly MainTab[] = ["argument", "perspectives", "challenges", "relations", "quarantine"];

export interface CaseParams {
  tab?: MainTab;
  sel?: string;
  scenario?: string;
}

export type Route =
  | { screen: "overview" }
  | { screen: "case"; caseId: string; params?: CaseParams };

export interface ScenarioState {
  overlayId?: string;
  distrust: string[];
  respectCorrelation: boolean;
}

/** `cl_9f31ab02c4…` → `9f31ab02`. Tolerates ids without an underscore. */
export const idRef = (id: string): string => (id.split("_").pop() ?? id).slice(0, 8);

/** Resolve an 8-hex ref (or full id) against a bundle's claims + inferences + overlays. */
export function resolveRef(ref: string, bundle: Bundle): string | undefined {
  if (!ref) return undefined;
  const all = [
    ...bundle.claims.map((c) => c.id),
    ...bundle.inferences.map((i) => i.id),
    ...bundle.overlays.map((o) => o.id),
  ];
  if (all.includes(ref)) return ref;
  const hits = all.filter((id) => idRef(id) === ref || id.endsWith(ref));
  return hits.length === 1 ? hits[0] : undefined;
}

export function encodeScenario(s: ScenarioState): string {
  const overlay = s.overlayId ? idRef(s.overlayId) : "-";
  const distrust = s.distrust.length ? s.distrust.map(idRef).join(".") : "-";
  return `1~${s.respectCorrelation ? 1 : 0}~${overlay}~${distrust}`;
}

export function decodeScenario(code: string, bundle: Bundle): ScenarioState | null {
  const parts = code.split("~");
  if (parts.length !== 4 || parts[0] !== "1") return null;
  const respectCorrelation = parts[1] !== "0";
  const overlayId = parts[2] && parts[2] !== "-" ? resolveRef(parts[2], bundle) : undefined;
  const distrust =
    parts[3] && parts[3] !== "-"
      ? parts[3].split(".").map((p) => resolveRef(p, bundle)).filter((x): x is string => Boolean(x))
      : [];
  return { ...(overlayId ? { overlayId } : {}), distrust, respectCorrelation };
}

export function parseHash(hash: string): Route {
  const m = /^#\/case\/([\w-]+)(?:\?(.*))?$/.exec(hash);
  if (!m?.[1]) return { screen: "overview" };
  const params: CaseParams = {};
  if (m[2]) {
    const q = new URLSearchParams(m[2]);
    const tab = q.get("tab");
    if (tab && (MAIN_TABS as readonly string[]).includes(tab)) params.tab = tab as MainTab;
    const sel = q.get("sel");
    if (sel && /^[\w-]{1,40}$/.test(sel)) params.sel = sel;
    const s = q.get("s");
    if (s && /^[\w~.-]{1,600}$/.test(s)) params.scenario = s;
  }
  return { screen: "case", caseId: m[1], ...(Object.keys(params).length ? { params } : {}) };
}

export function formatHash(route: Route): string {
  if (route.screen === "overview") return "#/";
  const q = new URLSearchParams();
  const p = route.params ?? {};
  if (p.tab && p.tab !== "argument") q.set("tab", p.tab);
  if (p.sel) q.set("sel", p.sel);
  if (p.scenario) q.set("s", p.scenario);
  const qs = q.toString();
  // URLSearchParams percent-encodes ~ and . — decode them back for readable scenario codes.
  const pretty = qs.replace(/%7E/gi, "~").replace(/%2E/gi, ".");
  return `#/case/${route.caseId}${pretty ? `?${pretty}` : ""}`;
}
