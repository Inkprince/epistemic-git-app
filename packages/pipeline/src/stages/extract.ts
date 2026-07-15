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
 * Locate a proposed quote inside the source text. Exact substring first; if that fails, a tolerant
 * pass treats whitespace runs and typographic quote/dash variants as interchangeable — models often
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
    .replace(/[-‐‑–—]/g, "[-‐‑–—]")
    .replace(/\s+/g, "\\s+");
  try {
    const m = new RegExp(pattern).exec(text);
    if (m && m[0].length > 0) return { start: m.index, end: m.index + m[0].length };
  } catch {
    // Pathological pattern — fall through to "not found".
  }
  return undefined;
}

/**
 * Stage 1 — quote-grounded extraction.
 *
 * The model proposes atomic claims each with a verbatim quote, but we do NOT take its word for the
 * quote: we require the quote to locate in the real source text and compute the char offsets
 * ourselves, storing the source's own bytes as the passage. A claim whose "quote" cannot be located
 * is quarantined, not admitted. This makes the provenance invariant robust to paraphrase and
 * hallucination — the model cannot fabricate a citation, because the citation must physically exist
 * in the bytes we were given.
 */
export async function extractInto(
  builder: BundleBuilder,
  client: LlmClient,
  input: { sourceId: string; sourceTitle: string; text: string },
  opts: { chunkChars?: number; overlapChars?: number } = {},
): Promise<ExtractStats> {
  const chunks = chunkText(input.text, opts.chunkChars ?? 6000, opts.overlapChars ?? 400);

  // Extract per chunk, then de-duplicate identical proposals before grounding them.
  const proposals: ExtractionResult["claims"] = [];
  const seenProposal = new Set<string>();
  for (const chunk of chunks) {
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
  }

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

    const passageId = builder.passage({
      sourceId: input.sourceId,
      locator: { kind: "char", start: loc.start, end: loc.end },
      // Always the source's own bytes at the located span — never the model's rendition.
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
