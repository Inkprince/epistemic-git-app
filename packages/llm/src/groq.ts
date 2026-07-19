import type { CompleteParams, CompleteResult, LlmClient, LlmMessage } from "./types.js";

/**
 * Groq client (gpt-oss-120b by default). OpenAI-compatible, so this is a thin fetch wrapper, no SDK
 * dependency. The transport is injectable so the cache and structured-output logic can be unit-tested
 * with no network and no API key.
 *
 * Two model strings, on purpose:
 *   - `model` is the provider-INDEPENDENT family label ("gpt-oss-120b"). It is what the content-hash
 *     cache keys on and what gets recorded as the analyst attribution in bundles. Keeping it stable
 *     means the committed `artifacts/.cache/` (recorded before the provider swap) still replays
 *     bit-for-bit.
 *   - `apiModel` is what we actually POST to Groq ("openai/gpt-oss-120b"), which routes the same model
 *     under Groq's `openai/` namespace.
 * They are the same underlying model; only the routing id differs between providers.
 */

export interface HttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  /** Optional response headers (used to honor Retry-After on 429). Test fakes may omit it. */
  headers?: { get(name: string): string | null };
}
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<HttpResponse>;

export interface GroqOptions {
  apiKey: string;
  /** Family label used for the cache key + attribution; default "gpt-oss-120b". */
  model?: string;
  /** Model id actually sent to Groq; default "openai/gpt-oss-120b". */
  apiModel?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  /** retries on 429/5xx (free tier is rate-limited); default 5. */
  maxRetries?: number;
  /** base backoff in ms between retries; default 12000 (tokens/min buckets refill within ~60s). */
  retryDelayMs?: number;
  /** per-request timeout in ms (a hung socket aborts instead of blocking forever); default 120000. */
  timeoutMs?: number;
  /** injectable sleep (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_MODEL = "gpt-oss-120b";
const DEFAULT_API_MODEL = "openai/gpt-oss-120b";
const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
/** Generous completion ceiling so long structured outputs don't get provider-default truncated. */
const DEFAULT_MAX_COMPLETION_TOKENS = 16384;

export class GroqClient implements LlmClient {
  readonly model: string;
  private readonly apiModel: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: GroqOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.apiModel = opts.apiModel ?? DEFAULT_API_MODEL;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init) as unknown as Promise<HttpResponse>);
    this.maxRetries = opts.maxRetries ?? 5;
    this.retryDelayMs = opts.retryDelayMs ?? 12000;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async complete(params: CompleteParams): Promise<CompleteResult> {
    const messages: LlmMessage[] = params.messages ?? [
      ...(params.system ? [{ role: "system" as const, content: params.system }] : []),
      ...(params.prompt ? [{ role: "user" as const, content: params.prompt }] : []),
    ];

    const body: Record<string, unknown> = { model: this.apiModel, messages };
    if (params.temperature !== undefined) body["temperature"] = params.temperature;
    body["max_completion_tokens"] = params.maxTokens ?? DEFAULT_MAX_COMPLETION_TOKENS;
    if (params.seed !== undefined) body["seed"] = params.seed;
    if (params.reasoningEffort !== undefined) body["reasoning_effort"] = params.reasoningEffort;
    if (params.schema) {
      body["response_format"] = {
        type: "json_schema",
        json_schema: { name: params.schema.name, strict: true, schema: params.schema.jsonSchema },
      };
    }

    const payload = JSON.stringify(body);
    let raw = "";
    for (let attempt = 0; ; attempt++) {
      let res: HttpResponse;
      const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
      const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined;
      try {
        res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
          body: payload,
          ...(controller ? { signal: controller.signal } : {}),
        });
        raw = await res.text();
      } catch (e) {
        // Network failure or timeout abort, retriable like a 5xx.
        if (attempt >= this.maxRetries) {
          const why = e instanceof Error && e.name === "AbortError"
            ? `request timed out after ${this.timeoutMs}ms`
            : e instanceof Error ? e.message : String(e);
          throw new Error(`Groq API unreachable: ${why}`);
        }
        await this.sleep(this.backoff(attempt));
        continue;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (res.ok) break;
      // Retry on rate limits (429) and transient server errors (5xx); fail fast otherwise.
      const retriable = res.status === 429 || res.status >= 500;
      if (!retriable || attempt >= this.maxRetries) {
        throw new Error(`Groq API error ${res.status}: ${raw.slice(0, 500)}`);
      }
      const retryAfter = res.headers?.get("retry-after");
      const hinted = retryAfter ? Number(retryAfter) * 1000 : NaN;
      await this.sleep(Number.isFinite(hinted) && hinted > 0 ? hinted : this.backoff(attempt));
    }

    let json: { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
    try {
      json = JSON.parse(raw) as typeof json;
    } catch {
      throw new Error(`Groq API returned non-JSON response (HTTP 200): ${raw.slice(0, 200)}`);
    }
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("Groq API returned an empty completion.");
    return {
      text,
      model: this.model,
      cached: false,
      ...(json.usage ? { usage: { promptTokens: json.usage.prompt_tokens, completionTokens: json.usage.completion_tokens } } : {}),
    };
  }

  /** Linear backoff with ±25% jitter, clears per-minute buckets without thundering-herd sync. */
  private backoff(attempt: number): number {
    const base = this.retryDelayMs * (attempt + 1);
    return Math.round(base * (0.75 + Math.random() * 0.5));
  }
}

/** A client that refuses to make calls, used as the inner client in cached-only mode with no key. */
export class NullClient implements LlmClient {
  constructor(readonly model: string) {}
  async complete(): Promise<CompleteResult> {
    throw new Error("No API key configured; cannot make a live LLM call. Run in cached mode or set GROQ_API_KEY.");
  }
}
