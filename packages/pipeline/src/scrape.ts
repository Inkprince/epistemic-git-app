import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Source retrieval, pluggable and cached.
 *
 * A scraper turns a URL you have *named* into readable text. It never searches or ranks — the operator
 * chooses the URL; the scraper only fetches it. Two providers ship:
 *   - `native`   — dependency-free global fetch + a minimal HTML→text reduction. No key, no cost.
 *   - `firecrawl` — the Firecrawl API (https://firecrawl.dev), which renders JS and returns clean
 *                   markdown; handles pages the native reducer can't. Needs FIRECRAWL_API_KEY + --live.
 *
 * Every result is content-hash cached under artifacts/.cache/scrape/, so a demo replays offline and
 * reproducibly regardless of provider — the same dual-mode contract the LLM layer uses.
 */

export type ScraperName = "native" | "firecrawl" | "auto";

export interface ScrapeOptions {
  scraper?: ScraperName;
  live?: boolean;
  env?: Record<string, string | undefined>;
  cacheDir?: string;
  log?: (msg: string) => void;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface ScrapeResult {
  text: string;
  /** The provider that actually produced this text (after any auto-fallback). */
  scraper: "native" | "firecrawl";
}

class ScrapeError extends Error {}

/** Fetch a URL as readable text, honouring the provider choice, the cache, and dual-mode gating. */
export async function scrapeUrl(url: string, opts: ScrapeOptions = {}): Promise<ScrapeResult> {
  const env = opts.env ?? process.env;
  const live = opts.live ?? false;
  const log = opts.log ?? (() => {});
  const fetchImpl = opts.fetchImpl ?? fetch;
  const cacheDir = opts.cacheDir ?? resolve(process.cwd(), "artifacts", ".cache");
  const requested: ScraperName = opts.scraper ?? "auto";
  const hasKey = Boolean(env["FIRECRAWL_API_KEY"]);

  // Resolve "auto": prefer Firecrawl only when it can actually run (live + key), else native.
  const provider: "native" | "firecrawl" =
    requested === "firecrawl" ? "firecrawl" : requested === "native" ? "native" : live && hasKey ? "firecrawl" : "native";

  const cached = await readScrapeCache(cacheDir, provider, url);
  if (cached) {
    log(`  scrape cache hit (${provider})`);
    return { text: cached, scraper: provider };
  }

  if (provider === "firecrawl") {
    if (!hasKey) throw new ScrapeError("FIRECRAWL_API_KEY is required for --scraper firecrawl. Set it, or use --scraper native.");
    if (!live) throw new ScrapeError(`No committed scrape cache for ${url}; re-run with --live to fetch via Firecrawl, or use --scraper native.`);
    try {
      log(`Scraping ${url} via Firecrawl …`);
      const text = await firecrawlScrape(url, { env, fetchImpl });
      await writeScrapeCache(cacheDir, "firecrawl", url, text);
      log(`  scraped ${text.length.toLocaleString()} chars (firecrawl)`);
      return { text, scraper: "firecrawl" };
    } catch (e) {
      if (requested === "firecrawl") throw e; // explicit choice: surface the failure
      log(`  Firecrawl failed (${e instanceof Error ? e.message : String(e)}); falling back to native fetch`);
      // fall through to native
    }
  }

  log(`Fetching ${url} (native) …`);
  const text = await nativeFetchText(url, fetchImpl);
  await writeScrapeCache(cacheDir, "native", url, text);
  log(`  fetched ${text.length.toLocaleString()} chars (native)`);
  return { text, scraper: "native" };
}

// ── Providers ─────────────────────────────────────────────────────────────────

async function firecrawlScrape(url: string, ctx: { env: Record<string, string | undefined>; fetchImpl: typeof fetch }): Promise<string> {
  const apiKey = ctx.env["FIRECRAWL_API_KEY"]!;
  const baseUrl = (ctx.env["FIRECRAWL_BASE_URL"] ?? "https://api.firecrawl.dev").replace(/\/+$/, "");
  let res: Response;
  try {
    res = await ctx.fetchImpl(`${baseUrl}/v1/scrape`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
  } catch (e) {
    throw new ScrapeError(`Could not reach Firecrawl: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new ScrapeError(`Firecrawl scrape ${url} → HTTP ${res.status} ${res.statusText}`);
  const body = (await res.json()) as { success?: boolean; data?: { markdown?: string }; error?: string };
  if (body.success === false) throw new ScrapeError(`Firecrawl error: ${body.error ?? "unknown"}`);
  const text = (body.data?.markdown ?? "").trim();
  if (text.length < 200) throw new ScrapeError(`Firecrawl returned only ${text.length} chars for ${url}.`);
  return text;
}

async function nativeFetchText(url: string, fetchImpl: typeof fetch): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      redirect: "follow",
      headers: {
        "user-agent": "egit-pipeline/0.1 (Epistemic Git source ingest)",
        accept: "text/html,application/xhtml+xml,text/plain,*/*",
      },
    });
  } catch (e) {
    throw new ScrapeError(`Could not reach ${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new ScrapeError(`Fetch ${url} → HTTP ${res.status} ${res.statusText}`);

  const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
  if (ctype.includes("application/pdf") || /\.pdf($|\?)/i.test(url)) {
    throw new ScrapeError(
      `${url} looks like a PDF; native fetch handles HTML/plain-text only. ` +
        `Save the text to a .txt file and pass it with --in, use --scraper firecrawl, ` +
        `or link an HTML page (e.g. arXiv /abs/ rather than /pdf/).`,
    );
  }

  const raw = await res.text();
  const looksHtml = ctype.includes("html") || ctype.includes("xml") || /^\s*(<!doctype html|<html[\s>])/i.test(raw);
  const text = (looksHtml ? htmlToText(raw) : raw).trim();
  if (text.length < 200) {
    throw new ScrapeError(
      `Fetched ${url} but recovered only ${text.length} chars of readable text — the page may be ` +
        `JavaScript-rendered or access-restricted. Try --scraper firecrawl, or save the text to a file.`,
    );
  }
  return text;
}

// ── Cache ───────────────────────────────────────────────────────────────────

function scrapeKey(provider: string, url: string): string {
  return createHash("sha256").update(`${provider}:${url}`).digest("hex").slice(0, 32);
}

async function readScrapeCache(cacheDir: string, provider: string, url: string): Promise<string | undefined> {
  const p = join(cacheDir, "scrape", `${scrapeKey(provider, url)}.json`);
  if (!existsSync(p)) return undefined;
  try {
    const parsed = JSON.parse(await readFile(p, "utf8")) as { text?: string };
    return typeof parsed.text === "string" ? parsed.text : undefined;
  } catch {
    return undefined;
  }
}

async function writeScrapeCache(cacheDir: string, provider: "native" | "firecrawl", url: string, text: string): Promise<void> {
  const dir = join(cacheDir, "scrape");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${scrapeKey(provider, url)}.json`), JSON.stringify({ provider, url, text }, null, 2) + "\n", "utf8");
}

// ── HTML → readable text (dependency-free) ─────────────────────────────────────

/**
 * Minimal HTML → readable-text reduction. Drops non-content blocks, turns block boundaries into
 * newlines so sentences don't fuse, strips remaining tags, and decodes common entities. Quote
 * grounding runs against exactly this reduced text, so stored passages stay verbatim.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|blockquote|figcaption)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => safeCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => safeCodePoint(parseInt(n, 16)))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeCodePoint(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}
