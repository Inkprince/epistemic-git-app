/**
 * Vercel serverless function: POST /api/build. Runs the SHARED build-a-case pipeline
 * (apps/tool/server/build-case.ts) on the deployed site, the same code path the dev middleware
 * uses. This file is PRE-BUNDLED by scripts/build-vercel.mjs (esbuild) into a self-contained
 * .vercel/output function, because the workspace packages are raw TypeScript and Vercel's own
 * compiler can't resolve their .js-extension ESM imports.
 *
 * Requires LLM_API_KEY in the deployment environment (Vercel → Project → Settings → Environment
 * Variables); provider-agnostic, defaults to Cerebras (set LLM_BASE_URL/LLM_MODEL for another). The
 * committed static site needs no key; only this endpoint does. The key is spent by anyone who can
 * reach the endpoint, so treat it as public-facing (see the same-origin guard below and the
 * source-size cap in build-case.ts).
 */

import { mkdir } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  BodyError, RUN_TIMEOUT_MS, friendlyBuildError, readBody, runBuildCase,
} from "../apps/tool/server/build-case.js";
import * as llmNode from "@epistemic-git/llm/node";
import * as pipe from "@epistemic-git/pipeline";
import * as proto from "@epistemic-git/protocol";

// Serverless filesystems are read-only except /tmp. Cache writes (live results, scrapes) go here;
// it is ephemeral per instance, which is fine, pasted text is a fresh cache miss every time anyway.
const CACHE_DIR = "/tmp/egit-cache";

/** Cheap deterrent against trivial cross-site abuse of the shared key: block a browser request whose
 * Origin host doesn't match the request host. Same-origin app calls pass; non-browser calls (no
 * Origin header) can't be blocked here without real auth, so this is a guard, not a wall. */
function crossOriginBlocked(req: IncomingMessage): boolean {
  const origin = req.headers["origin"];
  if (!origin) return false;
  try {
    return new URL(origin).host !== req.headers["host"];
  } catch {
    return true;
  }
}

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  const send = (code: number, obj: unknown) => {
    if (res.writableEnded) return;
    res.statusCode = code;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(obj));
  };
  if (req.method !== "POST") return send(405, { error: "POST only." });
  if (crossOriginBlocked(req)) return send(403, { error: "Cross-origin request refused." });

  // Lazy NDJSON: headers are written on the first emit, so a pre-stream validation error can still
  // answer with a JSON status.
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
    await mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
    const body = await readBody(req);
    const run = runBuildCase({
      deps: { proto, llmNode, pipe },
      body,
      cacheDir: CACHE_DIR,
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
  }
}
