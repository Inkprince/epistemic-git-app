import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  CacheMissError, CachedLlmClient, GroqClient, type CompleteParams, type CompleteResult,
  type FetchLike, type LlmClient, MemoryCacheStore, completeStructured, sanitizeJsonSchema, toResponseFormat,
} from "../src/index.js";

/** A scripted client that returns queued texts, recording how many calls it received. */
class ScriptedClient implements LlmClient {
  readonly model = "test-model";
  calls = 0;
  constructor(private readonly texts: string[]) {}
  async complete(_params: CompleteParams): Promise<CompleteResult> {
    const text = this.texts[Math.min(this.calls, this.texts.length - 1)]!;
    this.calls++;
    return { text, model: this.model, cached: false };
  }
}

describe("content-hash cache", () => {
  it("returns a cached result and does not call the inner client twice", async () => {
    const inner = new ScriptedClient(["hello"]);
    const client = new CachedLlmClient(inner, new MemoryCacheStore(), { promptVersion: "v1", mode: "live" });
    const a = await client.complete({ prompt: "hi" });
    const b = await client.complete({ prompt: "hi" });
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true);
    expect(inner.calls).toBe(1);
  });

  it("throws CacheMissError in cached mode when nothing is recorded", async () => {
    const client = new CachedLlmClient(new ScriptedClient(["x"]), new MemoryCacheStore(), { promptVersion: "v1", mode: "cached" });
    await expect(client.complete({ prompt: "unseen" })).rejects.toBeInstanceOf(CacheMissError);
  });

  it("keys differ when the prompt differs", async () => {
    const inner = new ScriptedClient(["one", "two"]);
    const client = new CachedLlmClient(inner, new MemoryCacheStore(), { promptVersion: "v1", mode: "live" });
    await client.complete({ prompt: "a" });
    await client.complete({ prompt: "b" });
    expect(inner.calls).toBe(2);
  });
});

describe("Groq client", () => {
  it("builds an OpenAI-style request with strict json_schema and parses the response", async () => {
    const fake: FetchLike = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      // assert we send the structured-output request shape, with Groq's routing model id
      expect(body["model"]).toBe("openai/gpt-oss-120b");
      expect((body["response_format"] as any).type).toBe("json_schema");
      expect((body["response_format"] as any).json_schema.strict).toBe(true);
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 3 },
        }),
      };
    });
    const client = new GroqClient({ apiKey: "k", fetchImpl: fake });
    const res = await client.complete({ prompt: "hi", schema: { name: "s", jsonSchema: { type: "object" } } });
    expect(res.text).toBe('{"ok":true}');
    // the recorded model is the provider-independent family label, not the routing id
    expect(res.model).toBe("gpt-oss-120b");
    expect(res.usage).toEqual({ promptTokens: 10, completionTokens: 3 });
  });

  it("throws on a non-retriable error", async () => {
    const fake: FetchLike = async () => ({ ok: false, status: 400, text: async () => "bad request" });
    const client = new GroqClient({ apiKey: "k", fetchImpl: fake });
    await expect(client.complete({ prompt: "hi" })).rejects.toThrow(/400/);
  });

  it("gives up on a persistent 429 after maxRetries", async () => {
    const fake: FetchLike = async () => ({ ok: false, status: 429, text: async () => "rate limited" });
    const client = new GroqClient({ apiKey: "k", fetchImpl: fake, maxRetries: 0, sleep: async () => {} });
    await expect(client.complete({ prompt: "hi" })).rejects.toThrow(/429/);
  });

  it("retries a 429 and then succeeds", async () => {
    let n = 0;
    const fake: FetchLike = async () => {
      n++;
      return n === 1
        ? { ok: false, status: 429, text: async () => "rate limited" }
        : { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: "ok" } }] }) };
    };
    const client = new GroqClient({ apiKey: "k", fetchImpl: fake, sleep: async () => {} });
    const res = await client.complete({ prompt: "hi" });
    expect(res.text).toBe("ok");
    expect(n).toBe(2);
  });
});

describe("structured output", () => {
  const schema = z.object({ answer: z.number() });

  it("parses and validates a conformant response", async () => {
    const client = new ScriptedClient(['{"answer": 42}']);
    const { value } = await completeStructured(client, "ans", schema, { prompt: "q" });
    expect(value.answer).toBe(42);
  });

  it("retries when the first response is invalid, then succeeds", async () => {
    const client = new ScriptedClient(["not json", '{"answer": 7}']);
    const { value } = await completeStructured(client, "ans", schema, { prompt: "q" }, { retries: 2 });
    expect(value.answer).toBe(7);
    expect(client.calls).toBe(2);
  });
});

describe("schema sanitizer", () => {
  it("strips unsupported keywords and forces additionalProperties:false", () => {
    const cleaned = sanitizeJsonSchema({
      type: "object",
      properties: { s: { type: "string", format: "email", minLength: 2 }, xs: { type: "array", minItems: 1, items: { type: "string" } } },
    });
    const s = (cleaned["properties"] as any).s;
    const xs = (cleaned["properties"] as any).xs;
    expect(cleaned["additionalProperties"]).toBe(false);
    expect(s.format).toBeUndefined();
    expect(s.minLength).toBeUndefined();
    expect(xs.minItems).toBeUndefined();
  });

  it("produces a provider-safe response format from a zod schema", () => {
    const rf = toResponseFormat("thing", z.object({ name: z.string(), tags: z.array(z.string()) }));
    expect(rf.name).toBe("thing");
    expect(rf.jsonSchema["type"]).toBe("object");
    expect(rf.jsonSchema["additionalProperties"]).toBe(false);
    expect(JSON.stringify(rf.jsonSchema)).not.toContain("$schema");
  });
});
