import type { Bundle } from "@epistemic-git/protocol";
import { computeSupport, explainSupport, perspectiveDiff, valueOfInformation } from "@epistemic-git/analysis";
import { groundingPremises, primaryConclusion } from "./domain.js";

/**
 * The grounded "ask this case" router — deterministic, LLM-free, and unable to exceed the ledger.
 *
 * A question is classified by intent and answered ONLY from deterministic analysis over the bundle
 * (support, provenance, challenges, correlation, perspective-diff, cruxes). Anything it cannot ground
 * is refused with a pointer, never confabulated. This preserves the app's purity invariant: no model
 * is ever consulted, so the answer box cannot hallucinate a source, a number, or a conclusion.
 */

export interface AskCitation {
  label: string;
  nodeId?: string;
  quote?: string;
  source?: string;
  url?: string;
}

export type AskKind =
  | "overview" | "support" | "crux" | "provenance"
  | "challenges" | "independence" | "relations" | "missing" | "refused";

export interface AskAnswer {
  kind: AskKind;
  grounded: boolean;
  headline: string;
  points: string[];
  citations: AskCitation[];
  /** A node to navigate to when the user acts on the answer. */
  focusId?: string;
  /** Honesty caveat rendered distinctly (e.g. qualitative-mode disclaimer). */
  note?: string;
}

export interface AskContext {
  overlayId?: string | undefined;
  diffBId?: string | undefined;
  respectCorrelation: boolean;
  selectedId?: string | undefined;
}

const pctOf = (n: number): string => `${(n * 100).toFixed(1)}%`;

const STOP = new Set([
  "the", "a", "an", "of", "to", "is", "are", "was", "were", "in", "on", "for", "and", "or", "how",
  "what", "why", "does", "do", "did", "this", "that", "it", "its", "be", "with", "at", "by", "as",
  "we", "you", "i", "about", "which", "who", "whom", "case", "claim", "evidence", "here",
]);

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}

const has = (q: string, ...words: string[]): boolean => words.some((w) => q.includes(w));

/** Best-matching non-derived claim for the question, if the overlap is strong enough. */
function matchClaim(bundle: Bundle, question: string): Bundle["claims"][number] | undefined {
  const qt = new Set(tokens(question));
  if (qt.size === 0) return undefined;
  let best: { c: Bundle["claims"][number]; score: number } | undefined;
  for (const c of bundle.claims) {
    const ct = tokens(c.statement);
    if (ct.length === 0) continue;
    const overlap = ct.filter((w) => qt.has(w)).length;
    const score = overlap / Math.sqrt(ct.length);
    if (overlap >= 2 && (!best || score > best.score)) best = { c, score };
  }
  return best?.c;
}

export function answerCase(question: string, bundle: Bundle, ctx: AskContext): AskAnswer {
  const q = question.trim().toLowerCase();
  if (!q) return refuse("Ask a question about this case — its confidence, the disagreement, the sources behind a claim, or its weak points.");

  const conclusion = primaryConclusion(bundle);
  const overlays = bundle.overlays;
  const canDiff = overlays.length >= 2;
  const opts = { respectCorrelation: ctx.respectCorrelation };

  // ── Cruxes / disagreement ─────────────────────────────────────────────────
  if (has(q, "crux", "disagree", "disagreement", "hinge", "contested", "what would change", "most important", "load-bearing", "load bearing")) {
    if (!canDiff || !conclusion) {
      return refuse(
        "This case has fewer than two perspectives loaded, so there's no disagreement to break down. Open the Perspectives tab to author or import an opposing view, then ask again.",
        "crux",
      );
    }
    const a = ctx.overlayId ?? overlays[0]!.id;
    const b = ctx.diffBId && ctx.diffBId !== a ? ctx.diffBId : overlays.find((o) => o.id !== a)!.id;
    const diff = perspectiveDiff(bundle, a, b, conclusion.id, opts);
    const points = diff.contributions.slice(0, 3).map(
      (c) => `${pctOf(c.shareOfGap)} of the gap: “${c.statement}” (${pctOf(c.beliefA)} vs ${pctOf(c.beliefB)})`,
    );
    return {
      kind: "crux",
      grounded: true,
      headline: diff.topCrux
        ? `The single most load-bearing disagreement is “${diff.topCrux.statement}” — ${pctOf(diff.topCrux.shareOfGap)} of a ${pctOf(Math.abs(diff.gap))} gap.`
        : `The two perspectives differ by ${pctOf(Math.abs(diff.gap))} on the conclusion.`,
      points,
      citations: diff.topCrux ? [{ label: "Go to crux claim", nodeId: diff.topCrux.claimId }] : [],
      ...(diff.topCrux ? { focusId: diff.topCrux.claimId } : {}),
      note: diff.mode === "qualitative"
        ? "No numbers given: these are rough relative weights from the stated stances, not calibrated probabilities."
        : "Stated numbers: both perspectives gave explicit confidence numbers on every contributing claim.",
    };
  }

  // ── Provenance / sources ──────────────────────────────────────────────────
  if (has(q, "source", "who said", "who claims", "provenance", "citation", "quote", "where does", "where is", "back", "grounded", "attribut")) {
    const target = matchClaim(bundle, question) ?? (ctx.selectedId ? bundle.claims.find((c) => c.id === ctx.selectedId) : undefined);
    if (!target) {
      return {
        kind: "provenance", grounded: true,
        headline: `This case draws on ${bundle.sources.length} source(s).`,
        points: bundle.sources.map((s) => `${s.title}${s.url ? "" : " (no link on file)"}`),
        citations: bundle.sources.filter((s) => s.url).map((s) => ({ label: s.title, ...(s.url ? { url: s.url } : {}) })),
        note: "Name or select a specific claim to see the exact quoted passage behind it.",
      };
    }
    if (target.derived && target.passages.length === 0) {
      // A derived conclusion has no quote of its own — trace to the grounded premises it rests on.
      const premises = groundingPremises(bundle, target.id);
      const cites: AskCitation[] = premises.map((pc) => {
        const p = bundle.passages.find((x) => x.id === pc.passages[0]);
        const src = p ? bundle.sources.find((s) => s.id === p.sourceId) : undefined;
        return {
          label: src?.title ?? pc.statement, nodeId: pc.id,
          ...(p ? { quote: p.verbatimText } : {}),
          ...(src?.title ? { source: src.title } : {}),
          ...(src?.url ? { url: src.url } : {}),
        };
      });
      return {
        kind: "provenance", grounded: true,
        headline: premises.length
          ? `“${target.statement}” is a derived conclusion — no quote of its own. It rests on ${premises.length} quote-backed claim(s):`
          : `“${target.statement}” is a derived conclusion, and no quote-backed claims feed it yet.`,
        points: [], citations: cites, focusId: target.id,
      };
    }
    const cites: AskCitation[] = target.passages.map((pid) => {
      const p = bundle.passages.find((x) => x.id === pid);
      const src = p ? bundle.sources.find((s) => s.id === p.sourceId) : undefined;
      return {
        label: src?.title ?? "source",
        ...(p ? { quote: p.verbatimText } : {}),
        ...(src?.title ? { source: src.title } : {}),
        ...(src?.url ? { url: src.url } : {}),
      };
    });
    return {
      kind: "provenance", grounded: true,
      headline: `“${target.statement}” is backed by ${cites.length} exact quote(s).`,
      points: [],
      citations: cites,
      focusId: target.id,
    };
  }

  // ── Independence / correlation / double-counting ────────────────────────────
  if (has(q, "independent", "correlat", "double count", "double-count", "same data", "same dataset", "same author", "same funder", "funding", "count twice")) {
    const groups = bundle.correlationGroups;
    if (groups.length === 0) {
      return {
        kind: "independence", grounded: true,
        headline: "No correlation groups are recorded on this case — no evidence is currently flagged as sharing an origin.",
        points: [], citations: [],
        note: "Absence of a flag isn't proof of independence; it means the pipeline/authors found no shared dataset, author, funder, or instrument.",
      };
    }
    return {
      kind: "independence", grounded: true,
      headline: `${groups.length} correlation group(s) flag evidence that shares an origin, so it is combined — not multiplied — when computing support.`,
      points: groups.map((g) => `Shared ${g.sharedOrigin}: ${g.members.length} members — ${g.rationale}`),
      citations: [],
    };
  }

  // ── Challenges / weaknesses / objections ────────────────────────────────────
  if (has(q, "objection", "challenge", "weak", "flaw", "problem", "criticism", "critique", "attack", "doubt", "wrong", "hole", "rebut")) {
    const target = matchClaim(bundle, question) ?? (ctx.selectedId ? bundle.claims.find((c) => c.id === ctx.selectedId) : undefined);
    const list = target
      ? bundle.challenges.filter((c) => c.target.kind === "claim" && c.target.id === target.id)
      : bundle.challenges;
    if (list.length === 0) {
      return {
        kind: "challenges", grounded: true,
        headline: target ? `No challenges are recorded against “${target.statement}”.` : "No challenges are recorded on this case.",
        points: [], citations: [],
        ...(target ? { focusId: target.id } : {}),
      };
    }
    return {
      kind: "challenges", grounded: true,
      headline: target
        ? `${list.length} challenge(s) target “${target.statement}”.`
        : `${list.length} challenge(s) are recorded across this case.`,
      points: list.slice(0, 6).map((c) => `[${c.challengeType}] ${c.rationale}`),
      citations: [],
      ...(target ? { focusId: target.id } : {}),
    };
  }

  // ── Support / confidence ────────────────────────────────────────────────────
  if (has(q, "confiden", "support", "how strong", "how likely", "probab", "how sure", "certain", "how much", "believe", "credence")) {
    const target = matchClaim(bundle, question) ?? conclusion;
    if (!target) return refuse("This case has no claims to score yet.", "support");
    const field = computeSupport(bundle, { ...opts, ...(ctx.overlayId ? { overlayId: ctx.overlayId } : {}) });
    const s = field.support.get(target.id) ?? 0;
    const expl = explainSupport(bundle, target.id, { ...opts, ...(ctx.overlayId ? { overlayId: ctx.overlayId } : {}) });
    const points = [
      ...expl.positive.filter((p) => p.active).slice(0, 3).map((p) => `supports (+${pctOf(Math.abs(p.contribution))}): ${p.warrant ?? p.inferenceId}`),
      ...expl.attacks.slice(0, 2).map((p) => `attacks (−${pctOf(Math.abs(p.contribution))})`),
    ];
    return {
      kind: "support", grounded: true,
      headline: `${target.derived ? "The conclusion" : "That claim"} sits at ${pctOf(s)} support${ctx.overlayId ? " under the applied perspective" : " (neutral starting point)"}.`,
      points,
      citations: [{ label: "Go to claim", nodeId: target.id }],
      focusId: target.id,
      note: "Support is structural arithmetic over the case, not a calibrated real-world probability. Distrust any claim in the left panel to watch it recompute.",
    };
  }

  // ── What's missing (light heuristic — deterministic over the ledger) ────────
  if (has(q, "missing", "gap", "what else", "blind spot", "not represented", "left out", "overlooked", "underrepresented")) {
    const points: string[] = [];
    const singleSource = bundle.claims.filter((c) => !c.derived && c.attribution.kind === "source");
    if (bundle.sources.length < 3) points.push(`Only ${bundle.sources.length} source(s) — a contested question usually needs more independent lines.`);
    if (overlays.length < 2) points.push("Fewer than two perspectives are loaded, so no disagreement is being tracked.");
    const unchallenged = bundle.claims.filter((c) => !c.derived && !bundle.challenges.some((ch) => ch.target.kind === "claim" && ch.target.id === c.id));
    if (unchallenged.length) points.push(`${unchallenged.length} claim(s) carry no recorded challenge — untested, not necessarily sound.`);
    if (bundle.correlationGroups.length === 0 && singleSource.length > 1) points.push("No correlation groups recorded — worth checking whether any sources share a dataset, author, or funder.");
    if (points.length === 0) points.push("No obvious structural gaps: multiple sources, opposed perspectives, challenges, and correlation checks are all present.");
    return {
      kind: "missing", grounded: true,
      headline: "What the case is (and isn't) covering — structural gaps only:",
      points, citations: [],
      note: "This is a structural check over what's in the case, not a judgement about the wider literature. Use `discover` to search for candidate sources to fill a gap.",
    };
  }

  // ── Overview / summary ──────────────────────────────────────────────────────
  if (has(q, "summary", "summar", "overview", "what is", "tell me", "explain", "conclusion", "about", "tldr", "tl;dr") || matchClaim(bundle, question)) {
    const field = computeSupport(bundle, opts);
    const s = conclusion ? field.support.get(conclusion.id) ?? 0 : 0;
    return {
      kind: "overview", grounded: true,
      headline: conclusion ? `Conclusion: “${conclusion.statement}” — ${pctOf(s)} neutral support.` : "This case has no derived conclusion yet.",
      points: [
        `${bundle.sources.length} sources · ${bundle.claims.length} claims · ${bundle.inferences.length} inferences`,
        `${bundle.matches.length} cross-claim relations · ${bundle.challenges.length} challenges · ${bundle.quarantine.length} quarantined`,
        `${overlays.length} perspective(s)${overlays.length ? ": " + overlays.map((o) => o.label).join(" vs ") : ""}`,
      ],
      citations: conclusion ? [{ label: "Go to conclusion", nodeId: conclusion.id }] : [],
      ...(conclusion ? { focusId: conclusion.id } : {}),
    };
  }

  return refuse(
    "I can only answer from this case — its confidence, cruxes, sources, challenges, correlations, or what's structurally missing. I won't guess beyond the evidence on file. Try: “what's the crux?”, “how strong is the conclusion?”, or “what's the source for …?”",
  );
}

function refuse(headline: string, kind: AskKind = "refused"): AskAnswer {
  return { kind: kind === "refused" ? "refused" : kind, grounded: false, headline, points: [], citations: [] };
}
