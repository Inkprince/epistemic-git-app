import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Enforces the load-bearing architectural invariant (plan-tool.md §2/§12): the assessment engine and
 * the browser app are pure and LLM-free. LLM calls exist ONLY in packages/pipeline. If someone imports
 * the LLM adapter (or Node built-ins) into analysis or the browser app, this test fails loudly.
 */
function sources(dir: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e)) out.push({ path: p, text: readFileSync(p, "utf8") });
    }
  };
  walk(dir);
  return out;
}

const root = join(__dirname, "..", "..", ".."); // repo root

describe("purity invariant, LLM calls only in packages/pipeline", () => {
  it("packages/analysis never imports the LLM adapter", () => {
    const offenders = sources(join(root, "packages/analysis/src")).filter((f) => /@epistemic-git\/llm/.test(f.text));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it("packages/analysis is browser-safe (no Node built-ins)", () => {
    const offenders = sources(join(root, "packages/analysis/src")).filter((f) => /from ["']node:/.test(f.text));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it("packages/mcp-server never imports the LLM adapter", () => {
    const offenders = sources(join(root, "packages/mcp-server/src")).filter((f) => /@epistemic-git\/llm/.test(f.text));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it("apps/tool/src is browser-safe (no LLM adapter, no Node built-ins, no protocol/node)", () => {
    const files = sources(join(root, "apps/tool/src"));
    const offenders = files.filter((f) =>
      /@epistemic-git\/llm/.test(f.text) || /from ["']node:/.test(f.text) || /@epistemic-git\/protocol\/node/.test(f.text),
);
    expect(offenders.map((f) => f.path)).toEqual([]);
  });
});
