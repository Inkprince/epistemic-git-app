/**
 * Shared build-a-case orchestration. ONE implementation of the extract → match → infer → audit →
 * correlate → perspective → narrate pipeline, used by BOTH the dev-server middleware
 * (apps/tool/vite.config.ts, which loads the workspace packages through Vite's SSR graph) and the
 * deployed Vercel serverless function (api-src/build.ts, which is pre-bundled with esbuild). The
 * package modules (protocol / llm / pipeline) are injected as `deps` so each caller can supply them
 * the way its environment resolves TypeScript. Keep the pipeline logic here and nowhere else.
 */

import type { IncomingMessage } from "node:http";

export const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB request ceiling
export const MAX_TEXT_CHARS = 150_000; // ~25 extraction chunks, keeps a run bounded
export const RUN_TIMEOUT_MS = 8 * 60 * 1000; // hard ceiling on a full pipeline run

export class BodyError extends Error {
  constructor(readonly code: number, message: string) { super(message); }
}

export function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > MAX_BODY_BYTES) {
        reject(new BodyError(413, "Request body too large (2 MB max)."));
        req.destroy();
      }
    });
    req.on("error", (e) => reject(new BodyError(400, `Could not read request: ${e.message}`)));
    req.on("end", () => {
      if (!data) return resolvePromise({});
      try {
        resolvePromise(JSON.parse(data));
      } catch {
        reject(new BodyError(400, "Request body must be valid JSON."));
      }
    });
  });
}

/** Best-effort human title from a URL when the caller supplies none: host + last path segment. */
export function deriveTitleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean).pop() ?? "";
    const slug = decodeURIComponent(seg).replace(/[-_]+/g, " ").replace(/\.\w+$/, "").trim();
    return slug ? `${u.hostname}: ${slug}` : u.hostname;
  } catch {
    return url;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface BuildDeps {
  proto: any; // @epistemic-git/protocol
  llmNode: any; // @epistemic-git/llm/node
  pipe: any; // @epistemic-git/pipeline
}

interface SourceInput { text?: string; url?: string; title?: string }

/**
 * Validate + normalize the request body into a source list. Throws BodyError (a pre-stream failure)
 * for bad input, so callers can answer with a plain JSON status before any NDJSON is written.
 */
export function normalizeBuild(body: Record<string, unknown>): {
  title: string; question: string; sources: { url: string; text: string; title: string }[];
} {
  const title = String(body["title"] ?? "Pasted source").trim() || "Pasted source";
  const question = String(body["question"] ?? "").trim() || `What does “${title}” establish?`;
  const rawSources: SourceInput[] = Array.isArray(body["sources"])
    ? (body["sources"] as SourceInput[])
    : [{ text: String(body["text"] ?? ""), title }];
  const sources = rawSources
    .map((s) => ({
      url: typeof s.url === "string" ? s.url.trim() : "",
      text: typeof s.text === "string" ? s.text.trim() : "",
      title: typeof s.title === "string" ? s.title.trim() : "",
    }))
    .filter((s) => s.url || s.text);
  if (sources.length === 0) throw new BodyError(400, "Provide at least one source (pasted text or a URL).");
  if (sources.some((s) => s.url && !/^https?:\/\//i.test(s.url))) {
    throw new BodyError(400, "Source URLs must start with http:// or https://.");
  }
  const pastedTotal = sources.reduce((n, s) => n + s.text.length, 0);
  if (pastedTotal > MAX_TEXT_CHARS) {
    throw new BodyError(400, `Pasted source text too long (${pastedTotal.toLocaleString()} chars; ${MAX_TEXT_CHARS.toLocaleString()} max).`);
  }
  return { title, question, sources };
}

/**
 * Run the full pipeline from normalized inputs, emitting NDJSON progress events through `emit`, and
 * return the terminal `done` payload. Best-effort embellishment (perspectives, narratives) is skipped
 * silently if a stage can't run, the build still succeeds. Throws on a hard failure; the caller maps
 * it to an `error` event (mid-stream) or a JSON status (pre-stream).
 */
export async function runBuildCase(opts: {
  deps: BuildDeps;
  body: Record<string, unknown>;
  cacheDir: string;
  env: Record<string, string | undefined>;
  log?: (msg: string) => void;
  emit: (obj: unknown) => void;
}): Promise<{ type: "done"; ok: boolean; bundle: any; problems?: string[]; stats: any }> {
  const { deps, cacheDir, env, emit } = opts;
  const { proto, llmNode, pipe } = deps;
  const log = opts.log ?? (() => {});
  const { title, question, sources: sourceInputs } = normalizeBuild(opts.body);

  // Provider-agnostic key check, inlined (this module must not import the llm package: it is loaded
  // by the Vite config loader, which can't resolve the packages' .js->.ts imports).
  const live = Boolean(env["LLM_API_KEY"] || env["CEREBRAS_API_KEY"] || env["GROQ_API_KEY"]);
  const client = llmNode.createLlmClientFromEnv({
    mode: live ? "live" : "cached",
    cacheDir,
    promptVersion: pipe.PROMPT_VERSION,
  });

  const progress = (stage: string, pct: number, detail?: string) =>
    emit({ type: "progress", stage, pct: Math.round(pct), ...(detail ? { detail } : {}) });

  const t0 = Date.now();
  const lap = (stage: string, from: number) =>
    log(`build ${stage}: ${((Date.now() - from) / 1000).toFixed(1)}s`);
  let t = Date.now();
  const b = new proto.BundleBuilder({ case: "live", title, question, mode: live ? "live" : "cached" });

  // Stage 1, extract: retrieve each source (scrape URLs), then extract per source. The extract band
  // (3..50%) is split evenly across sources so multi-source runs still show steady motion.
  progress("extract", 3);
  const n = sourceInputs.length;
  const agg = { extracted: 0, grounded: 0, quarantined: 0, chunks: 0 };
  let primaryDoc: { title?: string; url?: string; text: string } | undefined;
  for (const [k, s] of sourceInputs.entries()) {
    let text = s.text;
    const url = s.url || undefined;
    let srcTitle = s.title;
    if (url) {
      progress("extract", 3 + 47 * (k / n), `source ${k + 1}/${n}: fetching ${url}`);
      const scraped = await pipe.scrapeUrl(url, { live: true, env, cacheDir, log: (msg: string) => log(msg) });
      text = scraped.text;
      if (!srcTitle) srcTitle = deriveTitleFromUrl(url);
    }
    if (!srcTitle) srcTitle = n > 1 ? `Pasted source ${k + 1}` : title;
    if (agg.chunks === 0 && !text) continue; // skip empties defensively
    if (!primaryDoc && text) primaryDoc = { text: text.slice(0, 500_000), ...(srcTitle ? { title: srcTitle } : {}), ...(url ? { url } : {}) };
    const sourceId = b.source({ type: "other", title: srcTitle, ...(url ? { url } : {}) });
    const st = await pipe.extractInto(b, client, { sourceId, sourceTitle: srcTitle, text }, {
      onChunk: (done: number, total: number) =>
        progress("extract", 3 + 47 * ((k + done / total) / n), `source ${k + 1}/${n} · passage ${done}/${total}`),
    });
    agg.extracted += st.extracted; agg.grounded += st.grounded;
    agg.quarantined += st.quarantined; agg.chunks += st.chunks;
  }
  const exStats = agg;
  lap(`extract (${exStats.grounded}/${exStats.extracted} grounded, ${exStats.chunks} chunks, ${n} sources)`, t);
  let bundle = b.build();
  t = Date.now();
  progress("match", 50, `${exStats.grounded} claims admitted`);
  const m = await pipe.matchClaims(bundle, client); bundle = m.bundle;
  lap(`match (+${m.stats.added})`, t);
  t = Date.now();
  progress("infer", 58, `${m.stats.added} connections found`);
  const inf = await pipe.inferArgument(bundle, client); bundle = inf.bundle;
  lap(`infer (+${inf.stats.added})`, t);
  t = Date.now();
  progress("audit", 70, `${inf.stats.added} reasoning steps`);
  const au = await pipe.auditBundle(bundle, client); bundle = au.bundle;
  lap(`audit (+${au.stats.added})`, t);
  progress("correlate", 80, `${au.stats.added} challenges raised`);
  const corr = pipe.deriveCorrelationGroups(bundle); bundle = corr.bundle;

  // Stages 6+7, AI embellishment: draft two opposing perspectives and narrate the top claims, so a
  // built case reads like the curated ones. Best-effort: a stage that can't run is skipped.
  let overlaysAdded = 0;
  let narrativesAdded = 0;
  t = Date.now();
  const analyst = { kind: "analyst-llm" as const, ref: client.model };
  const worldviews = [
    { fallback: "Accepts the strongest supporting evidence", worldview: `Adopt the reading most favourable to a "yes" answer to: ${question}. Accept the claims that best support it and weight them heavily; treat contrary evidence as uncertain.` },
    { fallback: "Weights the critical evidence", worldview: `Adopt the sceptical reading of: ${question}. Weight the contradicting, confounding, and critical claims heavily; treat the supporting evidence as uncertain.` },
  ];
  for (const [pi, wv] of worldviews.entries()) {
    progress("perspective", 83 + 10 * (pi / worldviews.length), `perspective ${pi + 1}/${worldviews.length}`);
    try {
      const draft = await pipe.draftPerspective(bundle, client, { worldview: wv.worldview });
      if (!draft.stances.length) continue;
      const label = (draft.suggestedLabel || wv.fallback).trim();
      if (bundle.overlays.some((o: { label: string }) => o.label.trim().toLowerCase() === label.toLowerCase())) continue;
      const ovlId = proto.overlayId({ label, analyst });
      const overlay = { id: ovlId, label, analyst, ...(draft.suggestedDescription ? { description: draft.suggestedDescription.trim() } : {}) };
      const assessments = draft.stances.map((s: { claimId: string; stance: string; rationale: string }) => {
        const target = { kind: "claim" as const, id: s.claimId };
        return { id: proto.assessmentId({ overlayId: ovlId, target }), overlayId: ovlId, target, stance: s.stance, weight: 0.7, ...(s.rationale ? { rationale: s.rationale } : {}) };
      });
      bundle = { ...bundle, overlays: [...bundle.overlays, overlay], assessments: [...bundle.assessments, ...assessments] };
      overlaysAdded++;
    } catch (e) {
      log(`perspective skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  lap(`perspective (+${overlaysAdded})`, t);

  t = Date.now();
  const conclusion = bundle.claims.find((c: { derived?: boolean }) => c.derived);
  const grounded = bundle.claims.filter((c: { derived?: boolean; passages: string[] }) => !c.derived && c.passages.length);
  const toNarrate = [...(conclusion ? [conclusion] : []), ...grounded.slice(0, 2)];
  const overlayId0 = bundle.overlays[0]?.id;
  for (const [ni, c] of toNarrate.entries()) {
    progress("narrate", 93 + 6 * (ni / Math.max(1, toNarrate.length)), `summary ${ni + 1}/${toNarrate.length}`);
    try {
      const { bundle: nb } = await pipe.narrateClaim(bundle, client, { claimId: c.id, ...(overlayId0 ? { overlayId: overlayId0 } : {}), respectCorrelation: true });
      if ((nb.narratives?.length ?? 0) > (bundle.narratives?.length ?? 0)) narrativesAdded++;
      bundle = nb;
    } catch (e) {
      log(`narrate skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  lap(`narrate (+${narrativesAdded})`, t);
  lap("total", t0);
  const finalBundle = primaryDoc ? { ...bundle, sourceDocument: primaryDoc } : bundle;

  const check = proto.validateBundle(finalBundle);
  const problems = (check.issues ?? [])
    .filter((i: { severity: string }) => i.severity === "error")
    .slice(0, 5)
    .map((i: { code: string; message: string }) => `${i.code}: ${i.message}`);
  return {
    type: "done",
    ok: check.ok,
    bundle: finalBundle,
    ...(problems.length ? { problems } : {}),
    stats: {
      extract: exStats,
      matches: m.stats.added,
      inferences: inf.stats.added,
      challenges: au.stats.added,
      correlationGroups: corr.added,
      perspectives: overlaysAdded,
      narratives: narrativesAdded,
      sources: n,
      mode: live ? "live" : "cached",
    },
  };
}

/** Map a thrown pipeline error to a user-facing message (no-key/cache-miss gets a friendly hint). */
export function friendlyBuildError(e: unknown): { message: string; noKey: boolean } {
  const msg = e instanceof Error ? e.message : String(e);
  const noKey = /cache miss/i.test(msg) || /No API key configured/i.test(msg) || /No cached LLM response/i.test(msg);
  return {
    noKey,
    message: noKey
      ? "No LLM_API_KEY is configured on the server, so live extraction on new text is unavailable. Set LLM_API_KEY in the deployment environment (or in .env for local dev)."
      : msg,
  };
}
