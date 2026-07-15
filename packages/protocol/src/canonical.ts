import { sha256Hex } from "./sha256.js";

/**
 * Deterministic content addressing.
 *
 * Two investigators who never coordinate must arrive at the SAME id for the same
 * underlying assertion, or the "Git" merge cannot coalesce their work. So ids are a
 * pure function of an object's identity-defining fields — never of timestamps, author,
 * or any incidental metadata. This module is the single source of that determinism.
 */

/** Unicode-normalize, trim, and collapse internal whitespace runs to a single space. */
export function normalizeText(text: string): string {
  return text.normalize("NFC").trim().replace(/\s+/g, " ");
}

/**
 * Produce a stable string for any JSON value: object keys are sorted recursively so
 * key order never affects the hash. Arrays keep their order (callers sort explicitly
 * when a field has set semantics, e.g. premises or authors). Strings are left as-is
 * here — normalize them at the field level before hashing when appropriate.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([k, v]) => [k, sortValue(v)]));
  }
  return value;
}

/** SHA-256 hex digest of the canonical form of `value`. Pure JS — identical in Node and browser. */
export function hashContent(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

/**
 * A content-addressed id: `${prefix}_${first N hex chars of sha256(canonical(value))}`.
 * 16 hex chars = 64 bits: collision-safe far beyond any single case bundle, and short
 * enough to read in a URL or a diff.
 */
export function contentId(prefix: string, value: unknown, length = 16): string {
  return `${prefix}_${hashContent(value).slice(0, length)}`;
}
