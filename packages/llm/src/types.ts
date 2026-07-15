/** Provider-agnostic LLM interface. The model id is always configuration, never hard-coded, so a
 * better model is a swap — and the assessment layer never depends on any of this. */

export type Role = "system" | "user" | "assistant";

export interface LlmMessage {
  role: Role;
  content: string;
}

export interface JsonSchemaFormat {
  /** schema name reported to the provider (e.g. "extracted_claims"). */
  name: string;
  /** a Cerebras/OpenAI-safe JSON Schema object (root object, additionalProperties:false, etc.). */
  jsonSchema: Record<string, unknown>;
}

export interface CompleteParams {
  system?: string;
  /** convenience single user turn; ignored if `messages` is given. */
  prompt?: string;
  messages?: LlmMessage[];
  /** when present, request strict structured output constrained to this schema. */
  schema?: JsonSchemaFormat;
  temperature?: number;
  maxTokens?: number;
  /** fixed seed for reproducible sampling where the provider honors it. */
  seed?: number;
  reasoningEffort?: "low" | "medium" | "high";
}

export interface CompleteResult {
  text: string;
  model: string;
  cached: boolean;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface LlmClient {
  readonly model: string;
  complete(params: CompleteParams): Promise<CompleteResult>;
}

/** Thrown in cached-only mode when an input was never recorded — a signal to run once with `--live`. */
export class CacheMissError extends Error {
  constructor(readonly key: string) {
    super(`No cached LLM response for key ${key}. Run once with --live (and an API key) to record it.`);
    this.name = "CacheMissError";
  }
}
