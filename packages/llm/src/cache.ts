import { createHash } from "node:crypto";
import { CacheMissError, type CompleteParams, type CompleteResult, type LlmClient } from "./types.js";

/**
 * Content-hash cache, the mechanism behind reproducible dual-mode runs.
 *
 * The cache key is a pure hash of everything that determines the output: model, prompt-template
 * version, messages, schema, and sampling params. A committed cache lets the whole pipeline replay
 * bit-for-bit with NO API key; `--live` (mode "live") only calls the provider on a miss and records
 * the result. In "cached" mode a miss throws, so a demo never silently depends on the network.
 */

export interface CacheStore {
  get(key: string): Promise<CompleteResult | undefined>;
  set(key: string, value: CompleteResult): Promise<void>;
}

export class MemoryCacheStore implements CacheStore {
  private readonly map = new Map<string, CompleteResult>();
  async get(key: string) { return this.map.get(key); }
  async set(key: string, value: CompleteResult) { this.map.set(key, value); }
}

function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, x]) => [k, sort(x)]),
);
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

export function cacheKey(model: string, promptVersion: string, params: CompleteParams): string {
  const messages = params.messages ?? [
    ...(params.system ? [{ role: "system", content: params.system }] : []),
    ...(params.prompt ? [{ role: "user", content: params.prompt }] : []),
  ];
  const payload = {
    model, promptVersion, messages,
    schema: params.schema?.jsonSchema ?? null,
    temperature: params.temperature ?? null,
    seed: params.seed ?? null,
    reasoningEffort: params.reasoningEffort ?? null,
  };
  return createHash("sha256").update(canonical(payload)).digest("hex").slice(0, 32);
}

/** Wraps any client with the content-hash cache. `mode` decides what a miss means. */
export class CachedLlmClient implements LlmClient {
  constructor(
    private readonly inner: LlmClient,
    private readonly store: CacheStore,
    private readonly opts: { promptVersion: string; mode: "cached" | "live" },
) {}

  get model(): string { return this.inner.model; }

  async complete(params: CompleteParams): Promise<CompleteResult> {
    const key = cacheKey(this.inner.model, this.opts.promptVersion, params);
    const hit = await this.store.get(key);
    if (hit) return { ...hit, cached: true };
    if (this.opts.mode === "cached") throw new CacheMissError(key);

    const fresh = await this.inner.complete(params);
    await this.store.set(key, { ...fresh, cached: false });
    return fresh;
  }
}
