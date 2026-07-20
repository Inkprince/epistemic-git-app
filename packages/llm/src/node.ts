import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type CacheStore, CachedLlmClient } from "./cache.js";
import { OpenAiCompatClient, NullClient } from "./openai-compat.js";
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
 * The live LLM API key, resolved provider-agnostically: `LLM_API_KEY` first, then the legacy
 * `CEREBRAS_API_KEY` / `GROQ_API_KEY` aliases so older `.env` files keep working.
 */
export function llmApiKey(env: Record<string, string | undefined> = process.env): string | undefined {
  return env["LLM_API_KEY"] ?? env["CEREBRAS_API_KEY"] ?? env["GROQ_API_KEY"];
}

/** True when a live LLM key is configured (any of the accepted names). Used to pick live vs cached. */
export function hasLlmKey(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(llmApiKey(env));
}

/**
 * Build the pipeline's LLM client from environment. Provider-agnostic and OpenAI-compatible, so it
 * talks to any provider by base URL + routing model id; the defaults target Cerebras gpt-oss-120b.
 * In "cached" mode (default) a key is optional (cache hits need no network, a miss throws a helpful
 * error); in "live" mode a key is required.
 *
 * Env (all optional except the key for live runs):
 *   LLM_API_KEY      the key (aliases: CEREBRAS_API_KEY, GROQ_API_KEY)
 *   LLM_BASE_URL     OpenAI-compatible base URL (default https://api.cerebras.ai/v1)
 *   LLM_MODEL        routing model id sent to the provider (default gpt-oss-120b; Groq: openai/gpt-oss-120b)
 *   LLM_MAX_TOKENS   completion-token ceiling (default 8192; raise on higher-limit tiers)
 *   LLM_MAX_RETRIES, LLM_RETRY_DELAY_MS, LLM_TIMEOUT_MS   (legacy GROQ_* aliases still read)
 *
 * The cache key + attribution use the provider-independent family label "gpt-oss-120b" (not the
 * routing id), so the committed cache replays regardless of which provider produced it.
 */
export function createLlmClientFromEnv(opts: {
  mode: "cached" | "live";
  cacheDir: string;
  promptVersion: string;
  env?: Record<string, string | undefined>;
}): LlmClient {
  const env = opts.env ?? process.env;
  const model = "gpt-oss-120b"; // family label: cache key + attribution, provider-independent
  const apiModel = env["LLM_MODEL"] ?? env["GROQ_MODEL"] ?? "gpt-oss-120b"; // routing id sent to the provider
  const apiKey = llmApiKey(env);
  const baseUrl = env["LLM_BASE_URL"] ?? env["GROQ_BASE_URL"];
  const intEnv = (...names: string[]): number | undefined => {
    for (const name of names) {
      const n = Number(env[name]);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return undefined;
  };

  let inner: LlmClient;
  if (apiKey) {
    const maxTokens = intEnv("LLM_MAX_TOKENS");
    const maxRetries = intEnv("LLM_MAX_RETRIES", "GROQ_MAX_RETRIES");
    const retryDelayMs = intEnv("LLM_RETRY_DELAY_MS", "GROQ_RETRY_DELAY_MS");
    const timeoutMs = intEnv("LLM_TIMEOUT_MS", "GROQ_TIMEOUT_MS");
    inner = new OpenAiCompatClient({
      apiKey, model, apiModel,
      ...(baseUrl ? { baseUrl } : {}),
      ...(maxTokens !== undefined ? { maxTokens } : {}),
      ...(maxRetries !== undefined ? { maxRetries } : {}),
      ...(retryDelayMs !== undefined ? { retryDelayMs } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    });
  } else {
    if (opts.mode === "live") {
      throw new Error("LLM_API_KEY is required for --live runs. Set it, or run in cached mode.");
    }
    inner = new NullClient(model); // never called on cache hits; a miss throws CacheMissError first
  }

  return new CachedLlmClient(inner, new FileCacheStore(opts.cacheDir), {
    promptVersion: opts.promptVersion,
    mode: opts.mode,
  });
}
