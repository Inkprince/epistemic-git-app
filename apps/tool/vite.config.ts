import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

// Built-in cases that ship with the repo (git-tracked artifacts). The browser delete endpoint
// refuses these so a stray click can't wipe committed seed data; user-imported cases stay deletable.
const SEED_CASES = new Set(["lhc", "covid", "eggs", "lhc-addendum"]);

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB request ceiling
const MAX_TEXT_CHARS = 150_000; // ~25 extraction chunks, keeps a run bounded
const RUN_TIMEOUT_MS = 8 * 60 * 1000; // hard ceiling on a full pipeline run

class BodyError extends Error {
  constructor(readonly code: number, message: string) { super(message); }
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
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
function deriveTitleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean).pop() ?? "";
    const slug = decodeURIComponent(seg).replace(/[-_]+/g, " ").replace(/\.\w+$/, "").trim();
    return slug ? `${u.hostname}: ${slug}` : u.hostname;
  } catch {
    return url;
  }
}

/**
 * Dev-only live runner. Exposes POST /api/build that runs the real pipeline (extract → match →
 * infer → audit → correlate) SERVER-SIDE, so the Groq key (from .env) never reaches the
 * browser. The TS pipeline is loaded through Vite's SSR module graph. Absent in the static
 * production build, there the app is a pre-baked viewer (the documented dual-mode).
 */
function liveRunner(): Plugin {
  return {
    name: "egit-live-runner",
    configureServer(server: ViteDevServer) {
      const env = loadEnv("development", repoRoot, "");
      for (const key of [
        "GROQ_API_KEY", "GROQ_MODEL", "GROQ_BASE_URL", "GROQ_MAX_RETRIES", "GROQ_RETRY_DELAY_MS", "GROQ_TIMEOUT_MS",
        "FIRECRAWL_API_KEY", "FIRECRAWL_BASE_URL",
      ]) {
        if (env[key]) process.env[key] = env[key];
      }

      let running = false; // one pipeline at a time, runs share the fs cache and the rate-limit budget
      let committing = false; // single-flight for the manifest read-modify-write

      // Dev-only: persist a bundle as a committed case, writes artifacts/<slug>.json(l) and
      // registers it in artifacts/cases.json. Vite's glob invalidation reloads the app with the
      // new case present. Absent (like /api/build) from the static production build.
      server.middlewares.use("/api/commit", async (req: IncomingMessage, res: ServerResponse, next) => {
        if (req.method !== "POST") return next();
        const send = (code: number, obj: unknown) => {
          if (res.writableEnded) return;
          res.statusCode = code;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(obj));
        };
        if (committing) return send(429, { error: "Another commit is in progress." });
        committing = true;
        try {
          const body = await readBody(req);
          const slug = String(body["slug"] ?? "").trim();
          const label = String(body["label"] ?? "").trim();
          const bundle = body["bundle"];
          const overwrite = body["overwrite"] === true || body["overwrite"] === "true";
          if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) {
            return send(400, { error: "Slug must be 2–40 chars of a-z, 0-9, hyphen." });
          }
          if (!label) return send(400, { error: "Provide a label." });
          if (!bundle || typeof bundle !== "object") return send(400, { error: "Provide a bundle." });

          const artifactsDir = resolve(repoRoot, "artifacts");
          const jsonPath = resolve(artifactsDir, `${slug}.json`);
          if (!jsonPath.startsWith(artifactsDir)) return send(400, { error: "Invalid slug." });

          const proto = await server.ssrLoadModule("@epistemic-git/protocol");
          const check = proto.validateBundle(bundle);
          const errors = (check.issues as { severity: string; code: string; message: string }[])
            .filter((i) => i.severity === "error");
          if (errors.length) {
            return send(422, { error: "Bundle failed validation.", problems: errors.slice(0, 8).map((i) => `${i.code}: ${i.message}`) });
          }

          const manifestPath = resolve(artifactsDir, "cases.json");
          // Strip a UTF-8 BOM, Node's "utf8" read keeps it, and JSON.parse chokes on it.
          // (PowerShell/Notepad edits of cases.json prepend one.)
          const manifest = JSON.parse((await readFile(manifestPath, "utf8")).replace(/^﻿/, "")) as {
            version: number;
            cases: { id: string; label: string; file: string }[];
          };
          const collision = manifest.cases.some((c) => c.id === slug) || existsSync(jsonPath);
          if (collision && !overwrite) {
            return send(409, { error: `A case or artifact named "${slug}" already exists. Pick another slug or pass overwrite.` });
          }

          await writeFile(jsonPath, JSON.stringify(bundle, null, 2) + "\n", "utf8");
          await writeFile(resolve(artifactsDir, `${slug}.jsonl`), proto.serializeBundle(bundle), "utf8");
          if (!manifest.cases.some((c) => c.id === slug)) {
            manifest.cases.push({ id: slug, label, file: `${slug}.json` });
          } else {
            manifest.cases = manifest.cases.map((c) => (c.id === slug ? { ...c, label, file: `${slug}.json` } : c));
          }
          await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
          console.log(`[egit] committed case "${slug}" (${label})`);
          send(200, { ok: true, id: slug });
        } catch (e) {
          if (e instanceof BodyError) return send(e.code, { error: e.message });
          send(500, { error: e instanceof Error ? e.message : String(e) });
        } finally {
          committing = false;
        }
      });

      // Dev-only: delete a committed case, removes artifacts/<slug>.json(l) and its cases.json entry.
      // The client hides the case regardless (localStorage); this makes the removal persist on disk.
      // Path-guarded to the artifacts dir and single-flighted with the commit handler's lock.
      server.middlewares.use("/api/delete-case", async (req: IncomingMessage, res: ServerResponse, next) => {
        if (req.method !== "POST") return next();
        const send = (code: number, obj: unknown) => {
          if (res.writableEnded) return;
          res.statusCode = code;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(obj));
        };
        if (committing) return send(429, { error: "Another commit or delete is in progress." });
        committing = true;
        try {
          const body = await readBody(req);
          const slug = String(body["slug"] ?? "").trim();
          if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) {
            return send(400, { error: "Slug must be 2-40 chars of a-z, 0-9, hyphen." });
          }
          // Seed cases ship with the repo and are git-tracked; deleting them from the browser
          // wipes committed artifacts. Refuse here so only user-imported cases can be removed.
          if (SEED_CASES.has(slug)) {
            return send(403, { error: `"${slug}" is a built-in seed case and cannot be deleted from the app. Remove it in git if you really mean to.` });
          }
          const artifactsDir = resolve(repoRoot, "artifacts");
          const jsonPath = resolve(artifactsDir, `${slug}.json`);
          const jsonlPath = resolve(artifactsDir, `${slug}.jsonl`);
          if (!jsonPath.startsWith(artifactsDir) || !jsonlPath.startsWith(artifactsDir)) {
            return send(400, { error: "Invalid slug." });
          }

          const manifestPath = resolve(artifactsDir, "cases.json");
          const manifest = JSON.parse((await readFile(manifestPath, "utf8")).replace(/^﻿/, "")) as {
            version: number;
            cases: { id: string; label: string; file: string }[];
          };
          const before = manifest.cases.length;
          manifest.cases = manifest.cases.filter((c) => c.id !== slug);
          if (manifest.cases.length !== before) {
            await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
          }
          const { rm } = await import("node:fs/promises");
          if (existsSync(jsonPath)) await rm(jsonPath);
          if (existsSync(jsonlPath)) await rm(jsonlPath);
          console.log(`[egit] deleted case "${slug}"`);
          send(200, { ok: true, id: slug });
        } catch (e) {
          if (e instanceof BodyError) return send(e.code, { error: e.message });
          send(500, { error: e instanceof Error ? e.message : String(e) });
        } finally {
          committing = false;
        }
      });

      server.middlewares.use("/api/build", async (req: IncomingMessage, res: ServerResponse, next) => {
        if (req.method !== "POST") return next();
        const send = (code: number, obj: unknown) => {
          if (res.writableEnded) return;
          res.statusCode = code;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(obj));
        };
        if (running) return send(429, { error: "A pipeline run is already in progress, wait for it to finish." });
        running = true;
        try {
          const body = await readBody(req);
          const title = String(body["title"] ?? "Pasted source").trim() || "Pasted source";
          const question = String(body["question"] ?? "").trim() || `What does “${title}” establish?`;

          // Normalize input into a list of sources. New shape: `sources: [{ text?, url?, title? }]`.
          // Back-compat: a bare `text`/`title` becomes a single pasted source.
          interface SourceInput { text?: string; url?: string; title?: string }
          const rawSources: SourceInput[] = Array.isArray(body["sources"])
            ? (body["sources"] as SourceInput[])
            : [{ text: String(body["text"] ?? ""), title }];
          const sourceInputs = rawSources
            .map((s) => ({
              url: typeof s.url === "string" ? s.url.trim() : "",
              text: typeof s.text === "string" ? s.text.trim() : "",
              title: typeof s.title === "string" ? s.title.trim() : "",
            }))
            .filter((s) => s.url || s.text);
          if (sourceInputs.length === 0) return send(400, { error: "Provide at least one source (pasted text or a URL)." });
          if (sourceInputs.some((s) => s.url && !/^https?:\/\//i.test(s.url))) {
            return send(400, { error: "Source URLs must start with http:// or https://." });
          }
          const pastedTotal = sourceInputs.reduce((n, s) => n + s.text.length, 0);
          if (pastedTotal > MAX_TEXT_CHARS) {
            return send(400, { error: `Pasted source text too long (${pastedTotal.toLocaleString()} chars; ${MAX_TEXT_CHARS.toLocaleString()} max).` });
          }

          const proto = await server.ssrLoadModule("@epistemic-git/protocol");
          const llmNode = await server.ssrLoadModule("@epistemic-git/llm/node");
          const pipe = await server.ssrLoadModule("@epistemic-git/pipeline");

          const live = Boolean(process.env["GROQ_API_KEY"]);
          const client = llmNode.createLlmClientFromEnv({
            mode: live ? "live" : "cached",
            cacheDir: resolve(repoRoot, "artifacts", ".cache"),
            promptVersion: pipe.PROMPT_VERSION,
          });

          // From here on the response is a 200 NDJSON stream: progress events while the pipeline
          // runs, then a single terminal `done` or `error` event. (Validation errors above still
          // use plain JSON status codes; nothing has been streamed yet at that point.)
          res.statusCode = 200;
          res.setHeader("content-type", "application/x-ndjson");
          res.setHeader("cache-control", "no-cache");
          const emit = (obj: unknown) => {
            if (!res.writableEnded) res.write(JSON.stringify(obj) + "\n");
          };
          const progress = (stage: string, pct: number, detail?: string) =>
            emit({ type: "progress", stage, pct: Math.round(pct), ...(detail ? { detail } : {}) });

          const run = async () => {
            const t0 = Date.now();
            const lap = (stage: string, from: number) =>
              console.log(`[egit] /api/build ${stage}: ${((Date.now() - from) / 1000).toFixed(1)}s`);
            let t = Date.now();
            const b = new proto.BundleBuilder({ case: "live", title, question, mode: live ? "live" : "cached" });

            // Stage 1, extract: retrieve each source (scrape URLs), then extract per source. The
            // extract band (3..50%) is split evenly across sources so multi-source runs still show
            // steady motion. Firecrawl is used when a key is present; native fetch is the fallback.
            progress("extract", 3);
            const cacheDir = resolve(repoRoot, "artifacts", ".cache");
            const n = sourceInputs.length;
            const agg = { extracted: 0, grounded: 0, quarantined: 0, chunks: 0 };
            // The primary (first) source is the document the case started from; keep its raw text so
            // the case can show exactly what was decomposed (capped to keep bundles reasonable).
            let primaryDoc: { title?: string; url?: string; text: string } | undefined;
            for (const [k, s] of sourceInputs.entries()) {
              let text = s.text;
              let url = s.url || undefined;
              let srcTitle = s.title;
              if (url) {
                progress("extract", 3 + 47 * (k / n), `source ${k + 1}/${n}: fetching ${url}`);
                const scraped = await pipe.scrapeUrl(url, { live: true, env: process.env, cacheDir, log: (msg: string) => console.log(`[egit] ${msg}`) });
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

            // Stages 6+7, AI embellishment: draft two opposing perspectives and narrate the top
            // claims, so a built case reads like the curated ones. Best-effort: if a stage can't run
            // (no key + cache miss), it is skipped and the build still succeeds.
            let overlaysAdded = 0;
            let narrativesAdded = 0;
            t = Date.now();
            const analyst = { kind: "analyst-llm" as const, ref: client.model };
            const worldviews = [
              { fallback: "Accepts the strongest supporting evidence", worldview: `Adopt the reading most favourable to a "yes" answer to: ${question}. Accept the claims that best support it and weight them heavily; treat contrary evidence as uncertain.` },
              { fallback: "Weights the critical evidence", worldview: `Adopt the sceptical reading of: ${question}. Weight the contradicting, confounding, and critical claims heavily; treat the supporting evidence as uncertain.` },
            ];
            // Perspective band 83..93, one honest step per worldview drafted.
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
                  // weight matches the curated author scripts (cases/eggs.ts) so a live-built case
                  // feeds computeSupport identically to the committed demos.
                  return { id: proto.assessmentId({ overlayId: ovlId, target }), overlayId: ovlId, target, stance: s.stance, weight: 0.7, ...(s.rationale ? { rationale: s.rationale } : {}) };
                });
                bundle = { ...bundle, overlays: [...bundle.overlays, overlay], assessments: [...bundle.assessments, ...assessments] };
                overlaysAdded++;
              } catch (e) {
                console.log(`[egit] perspective skipped: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
            lap(`perspective (+${overlaysAdded})`, t);

            t = Date.now();
            const conclusion = bundle.claims.find((c: { derived?: boolean }) => c.derived);
            const grounded = bundle.claims.filter((c: { derived?: boolean; passages: string[] }) => !c.derived && c.passages.length);
            const toNarrate = [...(conclusion ? [conclusion] : []), ...grounded.slice(0, 2)];
            const overlayId0 = bundle.overlays[0]?.id;
            // Narrate band 93..99, one honest step per summary written.
            for (const [ni, c] of toNarrate.entries()) {
              progress("narrate", 93 + 6 * (ni / Math.max(1, toNarrate.length)), `summary ${ni + 1}/${toNarrate.length}`);
              try {
                const { bundle: nb } = await pipe.narrateClaim(bundle, client, { claimId: c.id, ...(overlayId0 ? { overlayId: overlayId0 } : {}), respectCorrelation: true });
                if ((nb.narratives?.length ?? 0) > (bundle.narratives?.length ?? 0)) narrativesAdded++;
                bundle = nb;
              } catch (e) {
                console.log(`[egit] narrate skipped: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
            lap(`narrate (+${narrativesAdded})`, t);
            lap("total", t0);
            const finalBundle = primaryDoc ? { ...bundle, sourceDocument: primaryDoc } : bundle;
            return { bundle: finalBundle, exStats, m, inf, au, corr, overlaysAdded, narrativesAdded, sources: n };
          };
          const timeout = new Promise<never>((_, rej) =>
            setTimeout(() => rej(new BodyError(504, `Pipeline run exceeded ${RUN_TIMEOUT_MS / 60000} minutes and was abandoned.`)), RUN_TIMEOUT_MS),
);
          const { bundle, exStats, m, inf, au, corr, overlaysAdded, narrativesAdded, sources } = await Promise.race([run(), timeout]);

          const check = proto.validateBundle(bundle);
          const problems = (check.issues ?? [])
            .filter((i: { severity: string }) => i.severity === "error")
            .slice(0, 5)
            .map((i: { code: string; message: string }) => `${i.code}: ${i.message}`);
          emit({
            type: "done",
            ok: check.ok,
            bundle,
            ...(problems.length ? { problems } : {}),
            stats: {
              extract: exStats,
              matches: m.stats.added,
              inferences: inf.stats.added,
              challenges: au.stats.added,
              correlationGroups: corr.added,
              perspectives: overlaysAdded,
              narratives: narrativesAdded,
              sources,
              mode: live ? "live" : "cached",
            },
          });
          res.end();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const friendly = /cache miss/i.test(msg) || /No API key configured/i.test(msg)
            ? "No GROQ_API_KEY configured, so live extraction on new text is unavailable. Add a key to .env (repo root) and restart the dev server."
            : msg;
          if (!res.headersSent) {
            // Failed before streaming began, plain JSON status.
            if (e instanceof BodyError) return send(e.code, { error: e.message });
            return send(friendly === msg ? 500 : 503, { error: friendly });
          }
          // Already streaming, deliver the failure as the terminal event.
          if (!res.writableEnded) {
            res.write(JSON.stringify({ type: "error", error: friendly }) + "\n");
            res.end();
          }
        } finally {
          running = false;
        }
      });

      // ── AI-assist endpoints (red-team / narrate / answer / perspective) ──────────────────────
      // Each runs a model SERVER-SIDE (key from .env, never in the browser), returns attributed,
      // grounded nodes for the app to render, and is stripped from the static production build.
      // Dual-mode: cached replay with no key, live on a cache miss when a key is present.
      const aiContext = async () => {
        const proto = await server.ssrLoadModule("@epistemic-git/protocol");
        const llmNode = await server.ssrLoadModule("@epistemic-git/llm/node");
        const pipe = await server.ssrLoadModule("@epistemic-git/pipeline");
        const live = Boolean(process.env["GROQ_API_KEY"]);
        const client = llmNode.createLlmClientFromEnv({
          mode: live ? "live" : "cached",
          cacheDir: resolve(repoRoot, "artifacts", ".cache"),
          promptVersion: pipe.PROMPT_VERSION,
        });
        return { proto, pipe, client, live };
      };
      const noKeyHint = (feature: string) =>
        `No GROQ_API_KEY configured, live ${feature} is unavailable, and this input isn't in the cache. Add a key to .env (repo root) and restart the dev server.`;
      let aiBusy = false; // AI endpoints share the fs cache + rate-limit budget, one at a time.
      const jsonSend = (res: ServerResponse, code: number, obj: unknown) => {
        if (res.writableEnded) return;
        res.statusCode = code;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(obj));
      };

      server.middlewares.use("/api/redteam", async (req: IncomingMessage, res: ServerResponse, next) => {
        if (req.method !== "POST") return next();
        const send = (code: number, obj: unknown) => jsonSend(res, code, obj);
        if (aiBusy) return send(429, { error: "An AI-assist run is already in progress, wait for it to finish." });
        aiBusy = true;
        try {
          const body = await readBody(req);
          const bundle = body["bundle"] as { challenges: unknown[] } | undefined;
          const claimId = String(body["claimId"] ?? "").trim();
          if (!bundle || typeof bundle !== "object") return send(400, { error: "Provide a bundle." });
          if (!claimId) return send(400, { error: "Provide a claimId." });

          const { proto, pipe, client } = await aiContext();
          const before = bundle.challenges.length;
          const { bundle: audited, stats } = await pipe.auditBundle(bundle, client, { focusClaimId: claimId });
          const challenges = audited.challenges.slice(before);

          const check = proto.validateBundle(audited);
          const problems = (check.issues ?? [])
            .filter((i: { severity: string }) => i.severity === "error")
            .slice(0, 5)
            .map((i: { code: string; message: string }) => `${i.code}: ${i.message}`);
          send(200, { ok: check.ok, challenges, stats, ...(problems.length ? { problems } : {}) });
        } catch (e) {
          if (e instanceof BodyError) return send(e.code, { error: e.message });
          const msg = e instanceof Error ? e.message : String(e);
          if (/cache miss/i.test(msg) || /No API key configured/i.test(msg)) return send(503, { error: noKeyHint("red-teaming") });
          send(500, { error: msg });
        } finally {
          aiBusy = false;
        }
      });

      server.middlewares.use("/api/narrate", async (req: IncomingMessage, res: ServerResponse, next) => {
        if (req.method !== "POST") return next();
        const send = (code: number, obj: unknown) => jsonSend(res, code, obj);
        if (aiBusy) return send(429, { error: "An AI-assist run is already in progress, wait for it to finish." });
        aiBusy = true;
        try {
          const body = await readBody(req);
          const bundle = body["bundle"] as object | undefined;
          const claimId = String(body["claimId"] ?? "").trim();
          const overlayId = body["overlayId"] ? String(body["overlayId"]) : undefined;
          const respectCorrelation = body["respectCorrelation"] !== false;
          if (!bundle || typeof bundle !== "object") return send(400, { error: "Provide a bundle." });
          if (!claimId) return send(400, { error: "Provide a claimId." });

          const { pipe, client } = await aiContext();
          const { narrative } = await pipe.narrateClaim(bundle, client, {
            claimId, ...(overlayId ? { overlayId } : {}), respectCorrelation,
          });
          if (!narrative) return send(422, { error: "Could not produce a summary for this claim." });
          send(200, { ok: true, narrative });
        } catch (e) {
          if (e instanceof BodyError) return send(e.code, { error: e.message });
          const msg = e instanceof Error ? e.message : String(e);
          if (/cache miss/i.test(msg) || /No API key configured/i.test(msg)) return send(503, { error: noKeyHint("summaries") });
          send(500, { error: msg });
        } finally {
          aiBusy = false;
        }
      });

      server.middlewares.use("/api/answer", async (req: IncomingMessage, res: ServerResponse, next) => {
        if (req.method !== "POST") return next();
        const send = (code: number, obj: unknown) => jsonSend(res, code, obj);
        if (aiBusy) return send(429, { error: "An AI-assist run is already in progress, wait for it to finish." });
        aiBusy = true;
        try {
          const body = await readBody(req);
          const question = String(body["question"] ?? "").trim();
          const answer = body["answer"] as { grounded?: boolean; headline?: string; points?: string[]; citations?: { quote?: string }[] } | undefined;
          if (!question || !answer || typeof answer !== "object") return send(400, { error: "Provide a question and a grounded answer." });
          if (!answer.grounded) return send(400, { error: "The router refused this question, so there is nothing grounded to rephrase." });

          const { pipe, client } = await aiContext();
          const quotes = (answer.citations ?? []).map((c) => c.quote).filter((q): q is string => Boolean(q));
          const { text } = await client.complete({
            system: pipe.ANSWER_SYSTEM,
            prompt: pipe.answerUserPrompt(question, answer.headline ?? "", answer.points ?? [], quotes),
            temperature: 0, seed: 1, reasoningEffort: "low",
          });
          const clean = text.trim();
          if (!clean) return send(422, { error: "No prose produced." });
          send(200, { ok: true, text: clean, model: client.model });
        } catch (e) {
          if (e instanceof BodyError) return send(e.code, { error: e.message });
          const msg = e instanceof Error ? e.message : String(e);
          if (/cache miss/i.test(msg) || /No API key configured/i.test(msg)) return send(503, { error: noKeyHint("prose answers") });
          send(500, { error: msg });
        } finally {
          aiBusy = false;
        }
      });

      server.middlewares.use("/api/perspective", async (req: IncomingMessage, res: ServerResponse, next) => {
        if (req.method !== "POST") return next();
        const send = (code: number, obj: unknown) => jsonSend(res, code, obj);
        if (aiBusy) return send(429, { error: "An AI-assist run is already in progress, wait for it to finish." });
        aiBusy = true;
        try {
          const body = await readBody(req);
          const bundle = body["bundle"] as object | undefined;
          const worldview = String(body["worldview"] ?? "").trim();
          if (!bundle || typeof bundle !== "object") return send(400, { error: "Provide a bundle." });
          if (!worldview) return send(400, { error: "Describe the worldview to draft." });

          const { pipe, client } = await aiContext();
          const draft = await pipe.draftPerspective(bundle, client, { worldview });
          send(200, { ok: true, ...draft });
        } catch (e) {
          if (e instanceof BodyError) return send(e.code, { error: e.message });
          const msg = e instanceof Error ? e.message : String(e);
          if (/cache miss/i.test(msg) || /No API key configured/i.test(msg)) return send(503, { error: noKeyHint("perspective drafting") });
          send(500, { error: msg });
        } finally {
          aiBusy = false;
        }
      });

      // Dev-only: propose candidate sources for a topic via Firecrawl `/search`. Proposes only; it
      // admits nothing. The build modal lets the user pick which candidates become source URLs, so
      // the selection stays an explicit human act. Needs FIRECRAWL_API_KEY; results are cached.
      server.middlewares.use("/api/discover", async (req: IncomingMessage, res: ServerResponse, next) => {
        if (req.method !== "POST") return next();
        const send = (code: number, obj: unknown) => jsonSend(res, code, obj);
        if (aiBusy) return send(429, { error: "An AI-assist run is already in progress; wait for it to finish." });
        aiBusy = true;
        try {
          const body = await readBody(req);
          const query = String(body["query"] ?? "").trim();
          const limit = Math.max(1, Math.min(Number(body["limit"] ?? 8), 20));
          if (!query) return send(400, { error: "Provide a search query." });
          if (!process.env["FIRECRAWL_API_KEY"]) {
            return send(503, { error: "No FIRECRAWL_API_KEY configured. Add one to .env (repo root) and restart the dev server to discover sources, or paste URLs directly." });
          }
          const pipe = await server.ssrLoadModule("@epistemic-git/pipeline");
          const result = await pipe.discoverSources(query, {
            limit, live: true, env: process.env,
            cacheDir: resolve(repoRoot, "artifacts", ".cache"),
            log: (msg: string) => console.log(`[egit] ${msg}`),
          });
          send(200, { ok: true, candidates: result.candidates });
        } catch (e) {
          if (e instanceof BodyError) return send(e.code, { error: e.message });
          send(500, { error: e instanceof Error ? e.message : String(e) });
        } finally {
          aiBusy = false;
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), liveRunner()],
  base: "./",
  server: { fs: { allow: [repoRoot] } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          cytoscape: ["cytoscape", "cytoscape-dagre", "dagre"],
        },
      },
    },
  },
});
