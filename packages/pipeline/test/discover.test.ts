import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverSources } from "../src/index.js";

function jsonRes(json: unknown, { ok = true, status = 200 } = {}): Response {
  return { ok, status, statusText: ok ? "OK" : "ERR", json: async () => json, text: async () => JSON.stringify(json) } as unknown as Response;
}

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "egit-discover-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const env = { FIRECRAWL_API_KEY: "fc-test" };

describe("discoverSources", () => {
  it("returns ranked candidates and never admits them", async () => {
    const fetchImpl = async (u: string | URL) => {
      expect(String(u)).toContain("/v1/search");
      return jsonRes({ success: true, data: [
        { url: "https://a.org", title: "A", description: "first" },
        { url: "https://b.org", title: "B", description: "second" },
      ] });
    };
    const out = await discoverSources("covid origin market", { live: true, env, cacheDir: dir, fetchImpl });
    expect(out.candidates).toHaveLength(2);
    expect(out.candidates[0]).toMatchObject({ url: "https://a.org", rank: 1 });
    expect(out.candidates[1]!.rank).toBe(2);
    expect(out.retrievedVia).toBe("firecrawl");
  });

  it("serves the second identical query from cache", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return jsonRes({ success: true, data: [{ url: "https://a.org", title: "A" }] }); };
    await discoverSources("same query", { live: true, env, cacheDir: dir, fetchImpl });
    await discoverSources("same query", { live: true, env, cacheDir: dir, fetchImpl });
    expect(calls).toBe(1);
  });

  it("requires a key and refuses to hit the network on a cache miss when not live", async () => {
    await expect(discoverSources("q", { live: true, env: {}, cacheDir: dir })).rejects.toThrow(/FIRECRAWL_API_KEY/);
    await expect(discoverSources("q", { live: false, env, cacheDir: dir })).rejects.toThrow(/--live/);
  });
});
