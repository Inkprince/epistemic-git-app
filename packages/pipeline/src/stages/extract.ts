import type { BundleBuilder, ClaimStructure, RelationModality } from "@epistemic-git/protocol";
import { completeStructured, type LlmClient } from "@epistemic-git/llm";
import { EXTRACTION_SYSTEM, PROMPT_VERSION, extractionUserPrompt } from "../prompts.js";
import { ExtractionResult } from "../schemas.js";

export interface ExtractStats {
  extracted: number;
  grounded: number;
  quarantined: number;
  chunks: number;
}

/**
 * Split text into overlapping windows so large sources fit the model context and extraction recall
 * stays high near boundaries. Quotes are always verified against the FULL source text (not the
 * chunk), so overlap-induced duplicates simply coalesce and no offset bookkeeping is needed.
 */
export function chunkText(text: string, size: number, overlap: number): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

/**
 * A first-line, DETERMINISTIC defense against instructions smuggled into a source ("prompt
 * injection"). We do not ask the model to police itself, instead we mark the character regions of
 * the source that carry known injection markers, and refuse to admit any claim whose supporting
 * passage falls inside such a region. The claim is quarantined (reason `injection-suspected`), kept
 * visible on the record, never silently dropped.
 *
 * This is intentionally a fixed, inspectable vocabulary of markers, not a complete solution: it
 * catches the classic overrides ("ignore previous instructions", "SYSTEM OVERRIDE", …) and their
 * enclosed payload, and it is honest about being a heuristic, a paraphrased or novel injection can
 * still slip past it. It exists so that the extraction stage has *a* structural line of defense that
 * a reader can audit, rather than trusting the model's goodwill.
 */
const INJECTION_OPEN_MARKERS: readonly RegExp[] = [
  /system\s+override/i,
  /\b(?:ignore|disregard|forget|override)\b[^.!?\n]*\b(?:prior|previous|above|preceding|earlier|all|these|the following)\b[^.!?\n]*\binstruction/i,
  /\bnew\s+instructions?\s*:/i,
  /\bignore\s+everything\s+(?:above|before|prior)/i,
  /\byou\s+are\s+now\b/i,
  /\bact\s+as\s+(?:if|though|a\b|an\b)/i,
  /\boverride\s*:/i,
];
const INJECTION_CLOSE_MARKERS: readonly RegExp[] = [/end\s+of\s+override/i, /end\s+override/i];

/** Split text into sentence spans, keeping each terminator with its sentence and tracking offsets. */
function sentenceSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const re = /[^.!?\n]*(?:[.!?\n]+|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    if (m[0].trim().length > 0) spans.push({ start: m.index, end: m.index + m[0].length });
    if (re.lastIndex === text.length) break;
  }
  return spans;
}

/**
 * Return the character ranges of `text` that carry a prompt-injection marker and its payload. A
 * sentence holding an open-marker is tainted; if a close-marker ("end of override") follows, the
 * taint extends through the sentence that closes it (so the whole injected block is covered).
 * Overlapping ranges are merged.
 */
export function detectInjectionSpans(text: string): Array<{ start: number; end: number }> {
  const sentences = sentenceSpans(text);
  const tainted: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i]!;
    const segment = text.slice(s.start, s.end);
    if (!INJECTION_OPEN_MARKERS.some((re) => re.test(segment))) continue;
    let end = s.end;
    for (let j = i; j < sentences.length; j++) {
      const seg = text.slice(sentences[j]!.start, sentences[j]!.end);
      if (INJECTION_CLOSE_MARKERS.some((re) => re.test(seg))) { end = sentences[j]!.end; break; }
    }
    tainted.push({ start: s.start, end });
  }
  tainted.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const span of tainted) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

function overlapsInjection(
  spans: readonly { start: number; end: number }[],
  loc: { start: number; end: number },
): boolean {
  return spans.some((span) => loc.start < span.end && loc.end > span.start);
}

/**
 * Locate a proposed quote inside the source text. Exact substring first; if that fails, a tolerant
 * pass treats whitespace runs and typographic quote/dash variants as interchangeable, models often
 * normalize those even when quoting faithfully. Either way the admitted passage is ALWAYS the
 * original source bytes at the matched offsets, so the provenance invariant (the citation must
 * physically exist in the source) is preserved; only the lookup is tolerant, never the storage.
 */
export function locateQuote(text: string, quote: string): { start: number; end: number } | undefined {
  const idx = text.indexOf(quote);
  if (idx >= 0) return { start: idx, end: idx + quote.length };

  const escaped = quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped
    .replace(/['‘’]/g, "['‘’]")
    .replace(/["“”]/g, "[\"“”]")
    .replace(/[-‐‑–\u2014]/g, "[-‐‑–\u2014]")
    .replace(/\s+/g, "\\s+");
  try {
    const m = new RegExp(pattern).exec(text);
    if (m && m[0].length > 0) return { start: m.index, end: m.index + m[0].length };
  } catch {
    // Pathological pattern, fall through to "not found".
  }
  return undefined;
}

/**
 * Stage 1, quote-grounded extraction.
 *
 * The model proposes atomic claims each with a verbatim quote, but we do NOT take its word for the
 * quote: we require the quote to locate in the real source text and compute the char offsets
 * ourselves, storing the source's own bytes as the passage. A claim whose "quote" cannot be located
 * is quarantined, not admitted. This makes the provenance invariant robust to paraphrase and
 * hallucination, the model cannot fabricate a citation, because the citation must physically exist
 * in the bytes we were given.
 */
export async function extractInto(
  builder: BundleBuilder,
  client: LlmClient,
  input: { sourceId: string; sourceTitle: string; text: string },
  opts: { chunkChars?: number; overlapChars?: number; onChunk?: (done: number, total: number) => void } = {},
): Promise<ExtractStats> {
  const chunks = chunkText(input.text, opts.chunkChars ?? 6000, opts.overlapChars ?? 400);

  // Extract per chunk, then de-duplicate identical proposals before grounding them.
  const proposals: ExtractionResult["claims"] = [];
  const seenProposal = new Set<string>();
  for (const [i, chunk] of chunks.entries()) {
    const { value } = await completeStructured(client, "extracted_claims", ExtractionResult, {
      system: EXTRACTION_SYSTEM,
      prompt: extractionUserPrompt(input.sourceTitle, chunk),
      temperature: 0,
      seed: 1,
      reasoningEffort: "low",
    });
    for (const c of value.claims) {
      const key = `${c.statement}||${c.quote}`;
      if (seenProposal.has(key)) continue;
      seenProposal.add(key);
      proposals.push(c);
    }
    opts.onChunk?.(i + 1, chunks.length);
  }

  // Regions of the source carrying smuggled instructions, computed once, deterministically.
  const injectionSpans = detectInjectionSpans(input.text);

  let grounded = 0;
  let quarantined = 0;

  for (const c of proposals) {
    const quote = c.quote.trim();
    const loc = quote.length > 0 ? locateQuote(input.text, quote) : undefined;

    if (!loc) {
      builder.quarantineClaim({
        statement: c.statement,
        reason: quote.length === 0 ? "no-supporting-passage" : "passage-does-not-entail",
        attribution: { kind: "analyst-llm", ref: client.model },
        ...(quote.length > 0 ? { attemptedPassageText: quote } : {}),
      });
      quarantined++;
      continue;
    }

    // The quote is genuinely in the source, but the source region is a smuggled instruction, not
    // evidence. Keep it visible in quarantine rather than admitting it as a grounded claim.
    if (overlapsInjection(injectionSpans, loc)) {
      builder.quarantineClaim({
        statement: c.statement,
        reason: "injection-suspected",
        attribution: { kind: "analyst-llm", ref: client.model },
        attemptedPassageText: input.text.slice(loc.start, loc.end),
      });
      quarantined++;
      continue;
    }

    const passageId = builder.passage({
      sourceId: input.sourceId,
      locator: { kind: "char", start: loc.start, end: loc.end },
      // Always the source's own bytes at the located span, never the model's rendition.
      verbatimText: input.text.slice(loc.start, loc.end),
    });

    const structure = buildStructure(c);
    builder.claim({
      statement: c.statement,
      claimType: c.claimType,
      passages: [passageId],
      attribution: { kind: "source", ref: input.sourceId },
      ...(structure ? { structure } : {}),
    });
    grounded++;
  }

  return { extracted: proposals.length, grounded, quarantined, chunks: chunks.length };
}

function buildStructure(c: {
  population: string; intervention: string; comparator: string; outcome: string;
  timeframe: string; quantifiers: string; modality: string;
}): ClaimStructure | undefined {
  const s: ClaimStructure = {};
  if (c.population) s.population = c.population;
  if (c.intervention) s.intervention = c.intervention;
  if (c.comparator) s.comparator = c.comparator;
  if (c.outcome) s.outcome = c.outcome;
  if (c.timeframe) s.timeframe = c.timeframe;
  if (c.quantifiers) s.quantifiers = c.quantifiers;
  if (c.modality && c.modality !== "unspecified") s.modality = c.modality as RelationModality;
  return Object.keys(s).length > 0 ? s : undefined;
}
