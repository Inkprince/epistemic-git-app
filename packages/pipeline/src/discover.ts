import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Source discovery via Firecrawl `/search`, the "search for resources with bearing on the topic"
 * ingestion step.
 *
 * Deliberately NOT auto-admission. Discovery *proposes* candidate sources with the query and rank that
 * surfaced them; it never decides what is true or folds anything into a ledger. The operator reviews
 * the candidates and admits chosen ones explicitly (`egit add-source --source-in <url>`), so the
 * selection stays an auditable human act rather than a hidden authority. Results are content-hash
 * cached, so a demo replays offline and reproducibly.
 */

export interface Candidate {
  url: string;
  title: string;
  description: string;
  /** 1-based position in the provider's result list, recorded, not endorsed. */
  rank: number;
}

export interface DiscoveryResult {
  query: string;
  retrievedVia: "firecrawl";
  candidates: Candidate[];
}

export interface DiscoverOptions {
  limit?: number;
  live?: boolean;
  env?: Record<string, string | undefined>;
  cacheDir?: string;
  log?: (msg: string) => void;
  fetchImpl?: typeof fetch;
}

class DiscoverError extends Error {}

export async function discoverSources(query: string, opts: DiscoverOptions = {}): Promise<DiscoveryResult> {
  const env = opts.env ?? process.env;
  const live = opts.live ?? false;
  const limit = Math.max(1, Math.min(opts.limit ?? 8, 20));
  const log = opts.log ?? (() => {});
  const fetchImpl = opts.fetchImpl ?? fetch;
  const cacheDir = opts.cacheDir ?? resolve(process.cwd(), "artifacts", ".cache");

  const cached = await readDiscoverCache(cacheDir, query, limit);
  if (cached) {
    log(`  discovery cache hit (${cached.candidates.length} candidates)`);
    return cached;
  }

  const apiKey = env["FIRECRAWL_API_KEY"];
  if (!apiKey) throw new DiscoverError("FIRECRAWL_API_KEY is required for source discovery. Set it, or add sources by hand.");
  if (!live) throw new DiscoverError(`No committed discovery cache for this query; re-run with --live to search.`);

  const baseUrl = (env["FIRECRAWL_BASE_URL"] ?? "https://api.firecrawl.dev").replace(/\/+$/, "");
  log(`Searching for sources: “${query}” …`);
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/v1/search`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit }),
    });
  } catch (e) {
    throw new DiscoverError(`Could not reach Firecrawl: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new DiscoverError(`Firecrawl search → HTTP ${res.status} ${res.statusText}`);

  const body = (await res.json()) as {
    success?: boolean; error?: string;
    data?: Array<{ url?: string; title?: string; description?: string }>;
  };
  if (body.success === false) throw new DiscoverError(`Firecrawl error: ${body.error ?? "unknown"}`);

  const candidates: Candidate[] = (body.data ?? [])
    .filter((r): r is { url: string; title?: string; description?: string } => typeof r.url === "string")
    .map((r, i) => ({ url: r.url, title: r.title ?? r.url, description: r.description ?? "", rank: i + 1 }));

  const result: DiscoveryResult = { query, retrievedVia: "firecrawl", candidates };
  await writeDiscoverCache(cacheDir, query, limit, result);
  log(`  found ${candidates.length} candidate source(s)`);
  return result;
}

// ── Cache ───────────────────────────────────────────────────────────────────

function discoverKey(query: string, limit: number): string {
  return createHash("sha256").update(`${limit}:${query}`).digest("hex").slice(0, 32);
}

async function readDiscoverCache(cacheDir: string, query: string, limit: number): Promise<DiscoveryResult | undefined> {
  const p = join(cacheDir, "discover", `${discoverKey(query, limit)}.json`);
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(await readFile(p, "utf8")) as DiscoveryResult;
  } catch {
    return undefined;
  }
}

async function writeDiscoverCache(cacheDir: string, query: string, limit: number, result: DiscoveryResult): Promise<void> {
  const dir = join(cacheDir, "discover");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${discoverKey(query, limit)}.json`), JSON.stringify(result, null, 2) + "\n", "utf8");
}
