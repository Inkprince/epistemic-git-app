import { resolve } from "node:path";
import { readBundleFile } from "@epistemic-git/protocol/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getClaim, listChallenges, listCruxes, listMatches, overview, perspectiveDiffQuery, support, traceProvenance,
} from "./queries.js";

/**
 * Read-only MCP server over one Epistemic Git bundle. A downstream model (e.g. Claude Code) can attach
 * this and interrogate the ledger, trace any claim to its verbatim source, list the challenges, see
 * where perspectives diverge and which crux matters most, but it cannot get an unsupported opinion:
 * every tool returns deterministic analysis grounded in the ledger. This is the concrete
 * "withstands downstream-model interrogation" surface.
 *
 * Bundle path: $EGIT_BUNDLE, or argv[2], default artifacts/lhc.jsonl. Logs go to stderr (stdout is the
 * JSON-RPC channel).
 */

const bundlePath = resolve(process.cwd(), process.env["EGIT_BUNDLE"] ?? process.argv[2] ?? "artifacts/lhc.jsonl");
const bundle = await readBundleFile(bundlePath);
console.error(`[egit-mcp] serving ${bundle.case}, ${bundle.claims.length} claims from ${bundlePath}`);

const server = new McpServer({ name: "epistemic-git", version: "0.1.0" });
const text = (obj: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] });

server.tool("overview", "Summary of the case: question, conclusion, node counts, and available perspectives.", {},
  async () => text(overview(bundle)));

server.tool("get_claim", "Fetch a claim by id with its neutral support and any challenges against it.",
  { id: z.string() }, async ({ id }) => text(getClaim(bundle, id)));

server.tool("trace_provenance", "Trace a claim to the verbatim passage(s) and source(s) it is grounded in.",
  { claimId: z.string() }, async ({ claimId }) => text(traceProvenance(bundle, claimId)));

server.tool("list_challenges", "All adversarial challenges in the ledger, each pointing at a specific node.", {},
  async () => text(listChallenges(bundle)));

server.tool("list_matches", "All typed relations between claims (equivalent / narrower / contradicts / …).", {},
  async () => text(listMatches(bundle)));

server.tool("support", "Deterministic support for the conclusion under an optional perspective and distrust set.",
  { overlayId: z.string().optional(), distrust: z.array(z.string()).optional() },
  async (args) => text(support(bundle, args)));

server.tool("perspective_diff", "Decompose the disagreement between two perspectives about a target claim (default: the conclusion).",
  { overlayA: z.string(), overlayB: z.string(), target: z.string().optional() },
  async (args) => text(perspectiveDiffQuery(bundle, args)));

server.tool("list_cruxes", "Rank the nodes whose resolution would most reduce disagreement between two perspectives.",
  { overlayA: z.string(), overlayB: z.string(), target: z.string().optional() },
  async (args) => text(listCruxes(bundle, args)));

await server.connect(new StdioServerTransport());
console.error("[egit-mcp] ready on stdio");
