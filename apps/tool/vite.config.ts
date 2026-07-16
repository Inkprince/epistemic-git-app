import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB request ceiling
const MAX_TEXT_CHARS = 150_000; // ~25 extraction chunks — keeps a run bounded
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

/**
 * Dev-only live runner. Exposes POST /api/build that runs the real pipeline (extract → match →
 * infer → audit → correlate) SERVER-SIDE, so the Cerebras key (from .env) never reaches the
 * browser. The TS pipeline is loaded through Vite's SSR module graph. Absent in the static
 * production build — there the app is a pre-baked viewer (the documented dual-mode).
 */
function liveRunner(): Plugin {
  return {
    name: "egit-live-runner",
    configureServer(server: ViteDevServer) {
      const env = loadEnv("development", repoRoot, "");
      for (const key of ["CEREBRAS_API_KEY", "CEREBRAS_MODEL", "CEREBRAS_BASE_URL", "CEREBRAS_MAX_RETRIES", "CEREBRAS_RETRY_DELAY_MS", "CEREBRAS_TIMEOUT_MS"]) {
        if (env[key]) process.env[key] = env[key];
      }

      let running = false; // one pipeline at a time — runs share the fs cache and the rate-limit budget
      let committing = false; // single-flight for the manifest read-modify-write

      // Dev-only: persist a bundle as a committed case — writes artifacts/<slug>.json(l) and
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
          // Strip a UTF-8 BOM — Node's "utf8" read keeps it, and JSON.parse chokes on it.
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

      server.middlewares.use("/api/build", async (req: IncomingMessage, res: ServerResponse, next) => {
        if (req.method !== "POST") return next();
        const send = (code: number, obj: unknown) => {
          if (res.writableEnded) return;
          res.statusCode = code;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(obj));
        };
        if (running) return send(429, { error: "A pipeline run is already in progress — wait for it to finish." });
        running = true;
        try {
          const body = await readBody(req);
          const text = String(body["text"] ?? "").trim();
          const title = String(body["title"] ?? "Pasted source").trim() || "Pasted source";
          const question = String(body["question"] ?? "").trim() || `What does “${title}” establish?`;
          if (!text) return send(400, { error: "Provide source text." });
          if (text.length > MAX_TEXT_CHARS) {
            return send(400, { error: `Source text too long (${text.length.toLocaleString()} chars; ${MAX_TEXT_CHARS.toLocaleString()} max).` });
          }

          const proto = await server.ssrLoadModule("@epistemic-git/protocol");
          const llmNode = await server.ssrLoadModule("@epistemic-git/llm/node");
          const pipe = await server.ssrLoadModule("@epistemic-git/pipeline");

          const live = Boolean(process.env["CEREBRAS_API_KEY"]);
          const client = llmNode.createLlmClientFromEnv({
            mode: live ? "live" : "cached",
            cacheDir: resolve(repoRoot, "artifacts", ".cache"),
            promptVersion: pipe.PROMPT_VERSION,
          });

          const run = async () => {
            const t0 = Date.now();
            const lap = (stage: string, from: number) =>
              console.log(`[egit] /api/build ${stage}: ${((Date.now() - from) / 1000).toFixed(1)}s`);
            let t = Date.now();
            const b = new proto.BundleBuilder({ case: "live", title, question, mode: live ? "live" : "cached" });
            const sourceId = b.source({ type: "other", title });
            const exStats = await pipe.extractInto(b, client, { sourceId, sourceTitle: title, text });
            lap(`extract (${exStats.grounded}/${exStats.extracted} grounded, ${exStats.chunks} chunks)`, t);
            let bundle = b.build();
            t = Date.now();
            const m = await pipe.matchClaims(bundle, client); bundle = m.bundle;
            lap(`match (+${m.stats.added})`, t);
            t = Date.now();
            const inf = await pipe.inferArgument(bundle, client); bundle = inf.bundle;
            lap(`infer (+${inf.stats.added})`, t);
            t = Date.now();
            const au = await pipe.auditBundle(bundle, client); bundle = au.bundle;
            lap(`audit (+${au.stats.added})`, t);
            const corr = pipe.deriveCorrelationGroups(bundle); bundle = corr.bundle;
            lap("total", t0);
            return { bundle, exStats, m, inf, au, corr };
          };
          const timeout = new Promise<never>((_, rej) =>
            setTimeout(() => rej(new BodyError(504, `Pipeline run exceeded ${RUN_TIMEOUT_MS / 60000} minutes and was abandoned.`)), RUN_TIMEOUT_MS),
          );
          const { bundle, exStats, m, inf, au, corr } = await Promise.race([run(), timeout]);

          const check = proto.validateBundle(bundle);
          const problems = (check.issues ?? [])
            .filter((i: { severity: string }) => i.severity === "error")
            .slice(0, 5)
            .map((i: { code: string; message: string }) => `${i.code}: ${i.message}`);
          send(200, {
            ok: check.ok,
            bundle,
            ...(problems.length ? { problems } : {}),
            stats: {
              extract: exStats,
              matches: m.stats.added,
              inferences: inf.stats.added,
              challenges: au.stats.added,
              correlationGroups: corr.added,
              mode: live ? "live" : "cached",
            },
          });
        } catch (e) {
          if (e instanceof BodyError) return send(e.code, { error: e.message });
          const msg = e instanceof Error ? e.message : String(e);
          if (/cache miss/i.test(msg) || /No API key configured/i.test(msg)) {
            return send(503, {
              error: "No CEREBRAS_API_KEY configured — live extraction on new text is unavailable. Add a key to .env (repo root) and restart the dev server.",
            });
          }
          send(500, { error: msg });
        } finally {
          running = false;
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
