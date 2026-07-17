import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scrapeUrl } from "../src/index.js";

function res(body: string, { ok = true, status = 200, contentType = "text/html", json }: { ok?: boolean; status?: number; contentType?: string; json?: unknown } = {}): Response {
  return {
    ok, status, statusText: ok ? "OK" : "ERR",
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? contentType : null) },
    text: async () => body,
    json: async () => json ?? JSON.parse(body),
  } as unknown as Response;
}

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "egit-scrape-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("scrapeUrl — native", () => {
  it("fetches and reduces HTML to readable text", async () => {
    const fetchImpl = async () => res("<html><body><p>Hello world. " + "x".repeat(300) + "</p></body></html>");
    const out = await scrapeUrl("https://example.org/a", { scraper: "native", cacheDir: dir, fetchImpl });
    expect(out.scraper).toBe("native");
    expect(out.text).toContain("Hello world.");
    expect(out.text).not.toContain("<p>");
  });

  it("serves the second call from cache without hitting the network", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return res("<p>" + "content ".repeat(60) + "</p>"); };
    await scrapeUrl("https://example.org/b", { scraper: "native", cacheDir: dir, fetchImpl });
    await scrapeUrl("https://example.org/b", { scraper: "native", cacheDir: dir, fetchImpl });
    expect(calls).toBe(1);
  });

  it("refuses a PDF with a helpful message", async () => {
    const fetchImpl = async () => res("%PDF-1.7 ...", { contentType: "application/pdf" });
    await expect(scrapeUrl("https://example.org/paper.pdf", { scraper: "native", cacheDir: dir, fetchImpl }))
      .rejects.toThrow(/PDF/i);
  });
});

describe("scrapeUrl — firecrawl", () => {
  const env = { FIRECRAWL_API_KEY: "fc-test" };

  it("posts to /v1/search-free scrape endpoint and returns markdown", async () => {
    let seenUrl = "";
    const fetchImpl = async (u: string | URL) => {
      seenUrl = String(u);
      return res("", { json: { success: true, data: { markdown: "# Title\n\n" + "body ".repeat(80) } } });
    };
    const out = await scrapeUrl("https://arxiv.org/abs/1", { scraper: "firecrawl", live: true, env, cacheDir: dir, fetchImpl });
    expect(seenUrl).toContain("/v1/scrape");
    expect(out.scraper).toBe("firecrawl");
    expect(out.text).toContain("# Title");
  });

  it("errors without a key", async () => {
    await expect(scrapeUrl("https://x.org", { scraper: "firecrawl", live: true, env: {}, cacheDir: dir }))
      .rejects.toThrow(/FIRECRAWL_API_KEY/);
  });

  it("errors on a cache miss when not live (no silent network)", async () => {
    await expect(scrapeUrl("https://x.org", { scraper: "firecrawl", live: false, env, cacheDir: dir }))
      .rejects.toThrow(/--live/);
  });

  it("auto falls back to native when Firecrawl fails", async () => {
    const fetchImpl = async (u: string | URL) => {
      if (String(u).includes("/v1/scrape")) return res("", { ok: false, status: 500 });
      return res("<p>" + "fallback ".repeat(60) + "</p>");
    };
    const out = await scrapeUrl("https://example.org/c", { scraper: "auto", live: true, env, cacheDir: dir, fetchImpl });
    expect(out.scraper).toBe("native");
    expect(out.text).toContain("fallback");
  });
});
