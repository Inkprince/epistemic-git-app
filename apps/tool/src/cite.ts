import { explainSupport } from "@epistemic-git/analysis";
import type { Bundle, Claim, Passage, Source, SourceType } from "@epistemic-git/protocol";
import { challengesFor, groundingPremises, locatorText, overlaysById, pct, stancesFor } from "./domain.js";

/**
 * "Cite this claim" Epistemic Git practicing what it preaches. A conventional citation answers
 * only "where did this come from"; this emits the APA reference (for the paper) AND the rich
 * provenance trace (origin passages, the deterministic support decomposition, and who contests it)
 * that a bibliography cannot. Pure: a function of the bundle + the current perspective, no model.
 */

export interface CiteResult {
  /** One APA 7th reference per underlying source. */
  apa: string[];
  markdown: string;
  json: string;
}

// APA descriptor for source types a reader wouldn't assume from the title alone.
const SOURCE_KIND_LABEL: Partial<Record<SourceType, string>> = {
  preprint: "Preprint",
  dataset: "Data set",
  video: "Video",
  transcript: "Transcript",
  report: "Report",
  blog: "Blog post",
  forum: "Online forum post",
  tweet: "Tweet",
  interview: "Interview",
};

function apaYear(iso?: string): string {
  if (!iso) return "n.d.";
  const y = iso.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : "n.d.";
}

/** "Florence Débarre" → "Débarre, F."; a name already "Last, F." is kept as-is. */
function apaAuthor(name: string): string {
  const n = name.trim();
  if (!n) return n;
  if (n.includes(",")) return n;
  const parts = n.split(/\s+/);
  if (parts.length === 1) return n;
  const last = parts[parts.length - 1]!;
  const initials = parts.slice(0, -1).map((p) => `${p[0]!.toUpperCase()}.`).join(" ");
  return `${last}, ${initials}`;
}

function apaAuthors(authors: string[]): string {
  const fmt = authors.map(apaAuthor).filter(Boolean);
  if (fmt.length === 0) return "";
  if (fmt.length === 1) return fmt[0]!;
  return `${fmt.slice(0, -1).join(", ")}, & ${fmt[fmt.length - 1]}`;
}

export function apaForSource(s: Source): string {
  const year = apaYear(s.publishedDate);
  const authors = apaAuthors(s.authors);
  const title = s.title.replace(/\.\s*$/, "");
  const kind = SOURCE_KIND_LABEL[s.type];
  const kindNote = kind ? ` [${kind}]` : "";
  const tail = s.url ? ` ${s.url}` : "";
  const ref = authors
    ? `${authors} (${year}). ${title}${kindNote}.${tail}`
    : `${title}${kindNote}. (${year}).${tail}`;
  return ref.trim();
}

interface ProvenanceEntry {
  source: Source;
  passages: Passage[];
}

/** Sources (with their quoted passages) behind a claim, directly, or via its grounding premises. */
function provenanceOf(bundle: Bundle, claim: Claim): ProvenanceEntry[] {
  const grounded = claim.passages.length ? [claim] : groundingPremises(bundle, claim.id);
  const byId = new Map<string, Passage>(bundle.passages.map((p) => [p.id, p]));
  const srcById = new Map<string, Source>(bundle.sources.map((s) => [s.id, s]));
  const bySrc = new Map<string, ProvenanceEntry>();
  for (const c of grounded) {
    for (const pid of c.passages) {
      const p = byId.get(pid);
      const src = p ? srcById.get(p.sourceId) : undefined;
      if (!p || !src) continue;
      const entry = bySrc.get(src.id) ?? { source: src, passages: [] };
      entry.passages.push(p);
      bySrc.set(src.id, entry);
    }
  }
  return [...bySrc.values()];
}

export function citeClaim(
  bundle: Bundle,
  claimId: string,
  opts: { overlayId?: string; respectCorrelation?: boolean } = {},
): CiteResult | null {
  const claim = bundle.claims.find((c) => c.id === claimId);
  if (!claim) return null;

  const overlays = overlaysById(bundle);
  const perspectiveLabel = opts.overlayId ? overlays.get(opts.overlayId)?.label ?? "unknown" : "neutral (no perspective)";
  const prov = provenanceOf(bundle, claim);
  const apa = prov.map((e) => apaForSource(e.source));
  const expl = explainSupport(bundle, claim.id, {
    ...(opts.overlayId ? { overlayId: opts.overlayId } : {}),
    respectCorrelation: opts.respectCorrelation ?? true,
  });
  const stances = stancesFor(bundle, claim.id);
  const challenges = challengesFor(bundle, claim.id);
  const narrative = (bundle.narratives ?? []).find((n) => n.target.kind === "claim" && n.target.id === claim.id);

  // ── Markdown (human-facing) ──────────────────────────────────────────────
  const md: string[] = [];
  md.push(`> ${claim.statement}`, "");
  md.push(`**Support:** ${pct(expl.support)}, perspective: ${perspectiveLabel}`, "");

  md.push("**Where it came from**");
  if (prov.length === 0) {
    md.push("- (inferred conclusion with no direct quote, see the argument for its grounding)");
  }
  for (const e of prov) {
    md.push(`- ${apaForSource(e.source)}`);
    for (const p of e.passages) md.push(`  - “${p.verbatimText}” (${locatorText(p)})`);
  }
  md.push("");

  if (expl.positive.length || expl.attacks.length || expl.undercuts.length) {
    md.push("**Why it holds now (deterministic support decomposition)**");
    for (const p of expl.positive) md.push(`- supports (${p.strength}, contribution ${pct(p.contribution)}): ${p.warrant}`);
    for (const p of expl.undercuts) md.push(`- undercuts (${p.strength}): ${p.warrant}`);
    for (const p of expl.attacks) md.push(`- attacks (${p.strength}): ${p.warrant}`);
    md.push("");
  }

  if (stances.length || challenges.length) {
    md.push("**Who contests it**");
    for (const st of stances) md.push(`- ${st.overlay.label}: ${st.stance}${st.rationale ? `, ${st.rationale}` : ""}`);
    for (const c of challenges) md.push(`- ${c.challengeType} [${c.status}]: ${c.rationale}`);
    md.push("");
  }

  if (narrative) {
    md.push("**AI summary (AI-authored, narrates the support breakdown above, does not score)**");
    md.push(narrative.text, "");
  }

  md.push(`_Provenance exported from Epistemic Git · claim id ${claim.id}_`);

  // ── JSON (machine-facing; the same five questions, structured) ────────────
  const json = JSON.stringify(
    {
      claimId: claim.id,
      statement: claim.statement,
      perspective: perspectiveLabel,
      support: expl.support,
      apa,
      origin: prov.map((e) => ({
        source: apaForSource(e.source),
        sourceId: e.source.id,
        url: e.source.url,
        passages: e.passages.map((p) => ({ text: p.verbatimText, locator: locatorText(p) })),
      })),
      supportPaths: [
        ...expl.positive.map((p) => ({ role: "supports" as const, strength: p.strength, weight: p.contribution, warrant: p.warrant })),
        ...expl.undercuts.map((p) => ({ role: "undercuts" as const, strength: p.strength, weight: p.contribution, warrant: p.warrant })),
        ...expl.attacks.map((p) => ({ role: "attacks" as const, strength: p.strength, weight: p.contribution, warrant: p.warrant })),
      ],
      contested: [
        ...stances.map((st) => ({ by: st.overlay.label, kind: "stance" as const, stance: st.stance, rationale: st.rationale })),
        ...challenges.map((c) => ({ by: "challenge", kind: "challenge" as const, challengeType: c.challengeType, status: c.status, rationale: c.rationale })),
      ],
      ...(narrative ? { aiSummary: { text: narrative.text, attribution: "analyst-llm", groundedIn: narrative.groundedIn } } : {}),
    },
    null,
    2,
);

  return { apa, markdown: md.join("\n"), json };
}
