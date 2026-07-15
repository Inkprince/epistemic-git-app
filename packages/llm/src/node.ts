import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type CacheStore, CachedLlmClient } from "./cache.js";
import { CerebrasClient, NullClient } from "./cerebras.js";
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
 * Build the pipeline's LLM client from environment. In "cached" mode (default) a key is optional —
 * cache hits need no network, and a miss throws a helpful error. In "live" mode a key is required.
 * Env: CEREBRAS_API_KEY, CEREBRAS_MODEL (default gpt-oss-120b), CEREBRAS_BASE_URL,
 * CEREBRAS_MAX_RETRIES, CEREBRAS_RETRY_DELAY_MS, CEREBRAS_TIMEOUT_MS.
 */
export function createLlmClientFromEnv(opts: {
  mode: "cached" | "live";
  cacheDir: string;
  promptVersion: string;
  env?: Record<string, string | undefined>;
}): LlmClient {
  const env = opts.env ?? process.env;
  const model = env["CEREBRAS_MODEL"] ?? "gpt-oss-120b";
  const apiKey = env["CEREBRAS_API_KEY"];
  const intEnv = (name: string): number | undefined => {
    const n = Number(env[name]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  let inner: LlmClient;
  if (apiKey) {
    const maxRetries = intEnv("CEREBRAS_MAX_RETRIES");
    const retryDelayMs = intEnv("CEREBRAS_RETRY_DELAY_MS");
    const timeoutMs = intEnv("CEREBRAS_TIMEOUT_MS");
    inner = new CerebrasClient({
      apiKey, model,
      ...(env["CEREBRAS_BASE_URL"] ? { baseUrl: env["CEREBRAS_BASE_URL"] } : {}),
      ...(maxRetries !== undefined ? { maxRetries } : {}),
      ...(retryDelayMs !== undefined ? { retryDelayMs } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    });
  } else {
    if (opts.mode === "live") {
      throw new Error("CEREBRAS_API_KEY is required for --live runs. Set it, or run in cached mode.");
    }
    inner = new NullClient(model); // never called on cache hits; a miss throws CacheMissError first
  }

  return new CachedLlmClient(inner, new FileCacheStore(opts.cacheDir), {
    promptVersion: opts.promptVersion,
    mode: opts.mode,
  });
}
