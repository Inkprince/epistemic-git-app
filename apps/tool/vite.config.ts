import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import { BodyError, RUN_TIMEOUT_MS, friendlyBuildError, readBody, runBuildCase } from "./server/build-case.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

// Built-in cases that ship with the repo (git-tracked artifacts). The browser delete endpoint
// refuses these so a stray click can't wipe committed seed data; user-imported cases stay deletable.
const SEED_CASES = new Set(["lhc", "covid", "eggs", "lhc-addendum"]);

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
        // Provider-agnostic LLM config (legacy GROQ_*/CEREBRAS_* names still accepted).
        "LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL", "LLM_MAX_TOKENS",
        "LLM_MAX_RETRIES", "LLM_RETRY_DELAY_MS", "LLM_TIMEOUT_MS",
        "CEREBRAS_API_KEY",
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

      // Dev /api/build: runs the SHARED pipeline orchestration (server/build-case.ts), the same code
      // path the deployed Vercel function uses, with the workspace packages loaded through Vite's SSR
      // graph. Streams NDJSON progress then a terminal done/error event (validation failures answer
      // with a plain JSON status before any stream begins).
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
        // Lazy NDJSON: headers are written on the FIRST emit, so a pre-stream validation error can
        // still answer with a JSON status (nothing has been streamed yet).
        let streaming = false;
        const emit = (obj: unknown) => {
          if (!streaming) {
            res.statusCode = 200;
            res.setHeader("content-type", "application/x-ndjson");
            res.setHeader("cache-control", "no-cache");
            streaming = true;
          }
          if (!res.writableEnded) res.write(JSON.stringify(obj) + "\n");
        };
        try {
          const body = await readBody(req);
          const [proto, llmNode, pipe] = await Promise.all([
            server.ssrLoadModule("@epistemic-git/protocol"),
            server.ssrLoadModule("@epistemic-git/llm/node"),
            server.ssrLoadModule("@epistemic-git/pipeline"),
          ]);
          const run = runBuildCase({
            deps: { proto, llmNode, pipe },
            body,
            cacheDir: resolve(repoRoot, "artifacts", ".cache"),
            env: process.env,
            log: (msg) => console.log(`[egit] ${msg}`),
            emit,
          });
          const timeout = new Promise<never>((_, rej) =>
            setTimeout(() => rej(new BodyError(504, `Pipeline run exceeded ${RUN_TIMEOUT_MS / 60000} minutes and was abandoned.`)), RUN_TIMEOUT_MS));
          const done = await Promise.race([run, timeout]);
          emit(done);
          res.end();
        } catch (e) {
          const { message } = friendlyBuildError(e);
          if (!streaming) {
            if (e instanceof BodyError) return send(e.code, { error: e.message });
            return send(500, { error: message });
          }
          if (!res.writableEnded) {
            res.write(JSON.stringify({ type: "error", error: message }) + "\n");
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
        const live = llmNode.hasLlmKey(process.env);
        const client = llmNode.createLlmClientFromEnv({
          mode: live ? "live" : "cached",
          cacheDir: resolve(repoRoot, "artifacts", ".cache"),
          promptVersion: pipe.PROMPT_VERSION,
        });
        return { proto, pipe, client, live };
      };
      const noKeyHint = (feature: string) =>
        `No LLM_API_KEY configured, live ${feature} is unavailable, and this input isn't in the cache. Add a key to .env (repo root) and restart the dev server.`;
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
