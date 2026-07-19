import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type CacheStore, CachedLlmClient } from "./cache.js";
import { GroqClient, NullClient } from "./groq.js";
import type { CompleteResult, LlmClient } from "./types.js";

/** Filesystem-backed cache (Node only). One JSON file per key; commit the directory for dual-mode. */
export class FileCacheStore implements CacheStore {
  constructor(private readonly dir: string) {}

  private path(key: string): string { return join(this.dir, `${key}.json`); }

  async get(key: string): Promise<CompleteResult | undefined> {
    const p = this.path(key);
    if (!existsSync(p)) return undefined;
    return JSON.parse(await readFile(p, "utf8")) as CompleteResult;
  }

  async set(key: string, value: CompleteResult): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.path(key), JSON.stringify(value, null, 2) + "\n", "utf8");
  }
}

/**
 * Build the pipeline's LLM client from environment. In "cached" mode (default) a key is optional,
 * cache hits need no network, and a miss throws a helpful error. In "live" mode a key is required.
 * Env: GROQ_API_KEY, GROQ_MODEL (API model id sent to Groq; default openai/gpt-oss-120b),
 * GROQ_BASE_URL, GROQ_MAX_RETRIES, GROQ_RETRY_DELAY_MS, GROQ_TIMEOUT_MS.
 *
 * Note: the cache key + attribution use the provider-independent family label "gpt-oss-120b" (not the
 * Groq routing id), so the committed cache recorded before the provider swap still replays.
 */
export function createLlmClientFromEnv(opts: {
  mode: "cached" | "live";
  cacheDir: string;
  promptVersion: string;
  env?: Record<string, string | undefined>;
}): LlmClient {
  const env = opts.env ?? process.env;
  const model = "gpt-oss-120b"; // family label: cache key + attribution, provider-independent
  const apiModel = env["GROQ_MODEL"] ?? "openai/gpt-oss-120b"; // routing id sent to Groq
  const apiKey = env["GROQ_API_KEY"];
  const intEnv = (name: string): number | undefined => {
    const n = Number(env[name]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  let inner: LlmClient;
  if (apiKey) {
    const maxRetries = intEnv("GROQ_MAX_RETRIES");
    const retryDelayMs = intEnv("GROQ_RETRY_DELAY_MS");
    const timeoutMs = intEnv("GROQ_TIMEOUT_MS");
    inner = new GroqClient({
      apiKey, model, apiModel,
      ...(env["GROQ_BASE_URL"] ? { baseUrl: env["GROQ_BASE_URL"] } : {}),
      ...(maxRetries !== undefined ? { maxRetries } : {}),
      ...(retryDelayMs !== undefined ? { retryDelayMs } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    });
  } else {
    if (opts.mode === "live") {
      throw new Error("GROQ_API_KEY is required for --live runs. Set it, or run in cached mode.");
    }
    inner = new NullClient(model); // never called on cache hits; a miss throws CacheMissError first
  }

  return new CachedLlmClient(inner, new FileCacheStore(opts.cacheDir), {
    promptVersion: opts.promptVersion,
    mode: opts.mode,
  });
}
