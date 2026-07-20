/**
 * Vercel serverless function: POST /api/discover. Proposes candidate source URLs for a topic via
 * Firecrawl search, so the "Find sources" box in the build modal works on the deployed site. It
 * PROPOSES ONLY, nothing is admitted; the user picks which candidates become sources. Needs
 * FIRECRAWL_API_KEY in the deployment environment; without it, returns a friendly 503.
 *
 * Pre-bundled by scripts/build-vercel.mjs (see api-src/build.ts for why).
 */

import { mkdir } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { BodyError, readBody } from "../apps/tool/server/build-case.js";
import * as pipe from "@epistemic-git/pipeline";

const CACHE_DIR = "/tmp/egit-cache";

export default async function handler(req: IncomingMessage & { method?: string }, res: ServerResponse) {
  const send = (code: number, obj: unknown) => {
    if (res.writableEnded) return;
    res.statusCode = code;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(obj));
  };
  if (req.method !== "POST") return send(405, { error: "POST only." });

  try {
    const body = await readBody(req);
    const query = String(body["query"] ?? "").trim();
    const limit = Math.max(1, Math.min(Number(body["limit"] ?? 8), 20));
    if (!query) return send(400, { error: "Provide a search query." });
    if (!process.env["FIRECRAWL_API_KEY"]) {
      return send(503, { error: "No FIRECRAWL_API_KEY is configured on the server. Set it in the deployment environment to discover sources, or paste URLs directly." });
    }
    await mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
    const result = await pipe.discoverSources(query, {
      limit, live: true, env: process.env, cacheDir: CACHE_DIR,
      log: (msg: string) => console.log(`[egit] ${msg}`),
    });
    send(200, { ok: true, candidates: result.candidates });
  } catch (e) {
    if (e instanceof BodyError) return send(e.code, { error: e.message });
    send(500, { error: e instanceof Error ? e.message : String(e) });
  }
}
