import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { CompleteParams, JsonSchemaFormat, LlmClient } from "./types.js";

/**
 * Structured-output helpers. Provider strict mode constrains decoding to a JSON Schema at the token
 * level, so extraction can be forced to emit valid ledger objects. But the provider imposes limits
 * (root object, additionalProperties:false everywhere, no string pattern/format, no minItems/maxItems,
 * ≤5000 chars, ≤10 depth), so we derive schemas from small purpose-built Zod shapes and sanitize.
 */

const UNSUPPORTED_KEYS = new Set([
  "$schema", "format", "pattern", "minItems", "maxItems", "minLength", "maxLength", "default",
]);

/** Recursively strip provider-unsupported keywords and force additionalProperties:false on objects. */
export function sanitizeJsonSchema(schema: unknown): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (UNSUPPORTED_KEYS.has(k)) continue;
        out[k] = walk(v);
      }
      if (out["type"] === "object" && !("additionalProperties" in out)) out["additionalProperties"] = false;
      return out;
    }
    return node;
  };
  return walk(schema) as Record<string, unknown>;
}

export function toResponseFormat(name: string, zodSchema: z.ZodType): JsonSchemaFormat {
  const raw = zodToJsonSchema(zodSchema, { $refStrategy: "none", target: "jsonSchema7" });
  return { name, jsonSchema: sanitizeJsonSchema(raw) };
}

/**
 * Complete with a strict schema and return the parsed, Zod-validated object. Strict decoding makes
 * this reliable; the retry loop is a belt-and-braces guard for non-strict backends or edge cases.
 */
export async function completeStructured<T>(
  client: LlmClient,
  name: string,
  zodSchema: z.ZodType<T>,
  params: CompleteParams,
  opts: { retries?: number } = {},
): Promise<{ value: T; cached: boolean }> {
  const format = toResponseFormat(name, zodSchema);
  const retries = opts.retries ?? 2;
  let messages: CompleteParams["messages"] = params.messages ?? [
    ...(params.system ? [{ role: "system" as const, content: params.system }] : []),
    ...(params.prompt ? [{ role: "user" as const, content: params.prompt }] : []),
  ];
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await client.complete({ ...params, messages, schema: format });
    try {
      const parsed = zodSchema.parse(JSON.parse(res.text));
      return { value: parsed, cached: res.cached };
    } catch (err) {
      lastError = err;
      messages = [
        ...messages,
        { role: "assistant", content: res.text },
        { role: "user", content: `That did not validate against the schema (${String(err)}). Return only valid JSON matching the schema.` },
      ];
    }
  }
  throw new Error(`Structured completion failed after ${retries + 1} attempts: ${String(lastError)}`);
}
