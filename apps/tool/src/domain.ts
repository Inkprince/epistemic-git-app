import type {
  Attribution, Bundle, Challenge, Claim, Inference, Overlay, Passage, Source,
} from "@epistemic-git/protocol";

/** The primary conclusion of a bundle = its (first) derived claim; null for an empty bundle. */
export function primaryConclusion(bundle: Bundle): Claim | null {
  return bundle.claims.find((c) => c.derived) ?? bundle.claims[bundle.claims.length - 1] ?? null;
}

export function claimsById(bundle: Bundle): Map<string, Claim> {
  return new Map(bundle.claims.map((c) => [c.id, c]));
}
export function inferencesById(bundle: Bundle): Map<string, Inference> {
  return new Map(bundle.inferences.map((i) => [i.id, i]));
}
export function passagesById(bundle: Bundle): Map<string, Passage> {
  return new Map(bundle.passages.map((p) => [p.id, p]));
}
export function sourcesById(bundle: Bundle): Map<string, Source> {
  return new Map(bundle.sources.map((s) => [s.id, s]));
}
export function overlaysById(bundle: Bundle): Map<string, Overlay> {
  return new Map(bundle.overlays.map((o) => [o.id, o]));
}

export function challengesFor(bundle: Bundle, target: string): Challenge[] {
  return bundle.challenges.filter((c) => c.target.id === target);
}

export function attributionClass(a: Attribution): "src" | "llm" | "human" {
  return a.kind === "source" ? "src" : a.kind === "analyst-llm" ? "llm" : "human";
}
export function attributionLabel(a: Attribution): string {
  return a.kind === "source" ? "from source" : a.kind === "analyst-llm" ? "AI-proposed" : "human";
}

export function locatorText(p: Passage): string {
  const l = p.locator;
  switch (l.kind) {
    case "char": return `chars ${l.start}–${l.end}`;
    case "page": return l.endPage ? `pp. ${l.page}–${l.endPage}` : `p. ${l.page}`;
    case "timestamp": return `${fmtMs(l.startMs)}${l.endMs ? `–${fmtMs(l.endMs)}` : ""}`;
    case "section": return l.path;
  }
}
function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

/** Support 0→1 mapped onto a red → yellow → green ramp that matches the dashboard palette. */
export function supportColor(s: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [239, 68, 68]],    // #ef4444
    [0.5, [234, 179, 8]],  // #eab308
    [1, [34, 197, 94]],    // #22c55e
  ];
  const x = Math.max(0, Math.min(1, s));
  for (let i = 1; i < stops.length; i++) {
    const [x1, c1] = stops[i - 1]!;
    const [x2, c2] = stops[i]!;
    if (x <= x2) {
      const t = (x - x1) / (x2 - x1);
      const mix = c1.map((v, j) => Math.round(v + (c2[j]! - v) * t));
      return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
    }
  }
  return "rgb(34,197,94)";
}
export const truncate = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + "…" : s);
