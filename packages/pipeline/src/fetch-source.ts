import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { scrapeUrl, type ScrapeOptions } from "./scrape.js";

/**
 * Resolve a source input that may be either a local text file or an http(s) URL.
 *
 * This automates *retrieval of a source you have already named*, a convenience, not research.
 * The operator still chooses which document enters the ledger; the pipeline never searches for or
 * judges sources on its own. When the input is a URL, that URL is also recorded as the source's
 * citation link unless an explicit `--url` overrides it. URL retrieval is delegated to the pluggable,
 * cached scraper layer (native fetch by default; Firecrawl when selected).
 */
export async function loadSourceInput(
  pathOrUrl: string,
  explicitUrl: string | undefined,
  opts: ScrapeOptions = {},
): Promise<{ text: string; url: string | undefined }> {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const { text } = await scrapeUrl(pathOrUrl, opts);
    return { text, url: explicitUrl ?? pathOrUrl };
  }
  const text = await readFile(resolve(process.cwd(), pathOrUrl), "utf8");
  return { text, url: explicitUrl };
}
