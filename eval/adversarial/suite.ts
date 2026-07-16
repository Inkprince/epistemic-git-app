import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BundleBuilder, type Bundle, validateBundle } from "@epistemic-git/protocol";
import { CacheMissError, type LlmClient } from "@epistemic-git/llm";
import { createLlmClientFromEnv } from "@epistemic-git/llm/node";
import {
  auditBundle,
  extractInto,
  inferArgument,
  matchClaims,
  PROMPT_VERSION,
  type AuditStats,
  type ExtractStats,
  type InferStats,
  type MatchStats,
} from "@epistemic-git/pipeline";
import { TRAPS, trapById, type Trap, type TrapResult } from "./traps.js";

/**
 * Adversarial trap suite — the honesty test.
 *
 * Every executed trap traverses the production extract → match → infer → audit APIs. Detection checks
 * are deterministic and live in traps.ts; they inspect only the resulting protocol bundle. Cached mode
 * is the default even when an API key is present, so replay never becomes an accidental network run.
 */

export interface TrapStageStats {
  extract: ExtractStats;
  match: MatchStats;
  infer: InferStats;
  audit: AuditStats;
}

export interface CompletedTrapRun {
  bundle: Bundle;
  result: TrapResult;
  stats: TrapStageStats;
}

export type TrapOutcome =
  | { trap: Trap; status: "detected" | "miss"; detail: string; run: CompletedTrapRun }
  | { trap: Trap; status: "not-run" | "error"; detail: string };

export interface SuiteSummary {
  mode: "cached" | "live";
  selected: number;
  executed: number;
  detected: number;
  missed: number;
  notRun: number;
  errors: number;
  outcomes: TrapOutcome[];
}

interface CliOptions {
  mode: "cached" | "live";
  cacheDir: string;
  outDir: string;
  reportPath: string;
  trapIds: string[];
  list: boolean;
  writeOutputs: boolean;
  requireComplete: boolean;
  failOnMiss: boolean;
}

const SUITE_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SUITE_DIR, "../..");

function addExtractStats(total: ExtractStats, next: ExtractStats): ExtractStats {
  return {
    extracted: total.extracted + next.extracted,
    grounded: total.grounded + next.grounded,
    quarantined: total.quarantined + next.quarantined,
    chunks: total.chunks + next.chunks,
  };
}

export async function runTrap(
  client: LlmClient,
  trap: Trap,
  mode: "cached" | "live" = "cached",
): Promise<CompletedTrapRun> {
  const builder = new BundleBuilder({
    case: `trap-${trap.id}`,
    title: trap.title,
    question: trap.question,
    mode,
    model: client.model,
    pipelineVersion: PROMPT_VERSION,
  });

  let extractStats: ExtractStats = { extracted: 0, grounded: 0, quarantined: 0, chunks: 0 };
  for (const source of trap.sources) {
    const sourceId = builder.source({ type: "other", title: source.title });
    const stats = await extractInto(builder, client, {
      sourceId,
      sourceTitle: source.title,
      text: source.text,
    });
    extractStats = addExtractStats(extractStats, stats);
  }

  const matched = await matchClaims(builder.build(), client);
  const inferred = await inferArgument(matched.bundle, client);
  const audited = await auditBundle(inferred.bundle, client);
  const validation = validateBundle(audited.bundle);
  if (!validation.ok) {
    const errors = validation.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => `${issue.code}: ${issue.message}`)
      .join("; ");
    throw new Error(`Pipeline produced an invalid bundle: ${errors}`);
  }

  return {
    bundle: audited.bundle,
    result: trap.check(audited.bundle),
    stats: {
      extract: extractStats,
      match: matched.stats,
      infer: inferred.stats,
      audit: audited.stats,
    },
  };
}

export async function runSuite(
  client: LlmClient,
  traps: readonly Trap[],
  mode: "cached" | "live",
  onOutcome?: (outcome: TrapOutcome) => Promise<void> | void,
): Promise<SuiteSummary> {
  const outcomes: TrapOutcome[] = [];

  for (const trap of traps) {
    process.stderr.write(`running trap: ${trap.id}… `);
    let outcome: TrapOutcome;
    try {
      const run = await runTrap(client, trap, mode);
      outcome = {
        trap,
        status: run.result.pass ? "detected" : "miss",
        detail: run.result.detail,
        run,
      };
      process.stderr.write(`${run.result.pass ? "DETECTED" : "MISS"}\n`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      outcome = {
        trap,
        status: error instanceof CacheMissError ? "not-run" : "error",
        detail,
      };
      process.stderr.write(`${outcome.status === "not-run" ? "NOT RUN (cache miss)" : "ERROR"}\n`);
    }
    outcomes.push(outcome);
    await onOutcome?.(outcome);
  }

  const executed = outcomes.filter((outcome) => outcome.status === "detected" || outcome.status === "miss").length;
  const detected = outcomes.filter((outcome) => outcome.status === "detected").length;
  const missed = outcomes.filter((outcome) => outcome.status === "miss").length;
  const notRun = outcomes.filter((outcome) => outcome.status === "not-run").length;
  const errors = outcomes.filter((outcome) => outcome.status === "error").length;
  return { mode, selected: traps.length, executed, detected, missed, notRun, errors, outcomes };
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

export function renderReport(summary: SuiteSummary): string {
  const detectionRate = summary.executed > 0
    ? `${summary.detected}/${summary.executed} executed traps detected`
    : "0/0 traps executed";
  const completeness = summary.executed === summary.selected
    ? `All ${summary.selected} selected traps executed.`
    : `${summary.executed}/${summary.selected} selected traps executed; ${summary.notRun} not run and ${summary.errors} errored.`;
  const rows = summary.outcomes.map((outcome) => {
    const label = outcome.status === "detected"
      ? "✅ detected"
      : outcome.status === "miss"
        ? "❌ **miss**"
        : outcome.status === "not-run"
          ? "⏭️ not run"
          : "⚠️ error";
    return `| ${outcome.trap.id} | ${label} | ${markdownCell(outcome.detail)} |`;
  });

  return `# Adversarial trap suite — results

${detectionRate}. ${completeness} Mode: \`${summary.mode}\`.

Misses are published deliberately. A cache miss is reported as **not run**, never as a model miss or a
pass. Re-run live to record missing entries, then replay cached for reproducibility.

| trap | outcome | detail |
|------|---------|--------|
${rows.join("\n")}

Every executed trap ran the production extract → match → infer → audit chain. The runner then validated
the resulting protocol bundle before applying the deterministic trap check. Bundle JSON files beside
this report are raw pipeline outputs, including outputs for detection misses.
`;
}

function resolveArgPath(value: string): string {
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

function valueAfter(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArgs(args: string[]): CliOptions {
  let mode: "cached" | "live" = "cached";
  let cacheDir = resolve(PROJECT_ROOT, "artifacts", ".cache");
  let outDir = resolve(SUITE_DIR, "out");
  let reportPath: string | undefined;
  const trapIds: string[] = [];
  let list = false;
  let writeOutputs = true;
  let requireComplete = false;
  let failOnMiss = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    switch (arg) {
      case "--live": mode = "live"; break;
      case "--cached": mode = "cached"; break;
      case "--list": list = true; break;
      case "--no-write": writeOutputs = false; break;
      case "--require-complete": requireComplete = true; break;
      case "--fail-on-miss": failOnMiss = true; break;
      case "--cache-dir":
        cacheDir = resolveArgPath(valueAfter(args, index, arg));
        index++;
        break;
      case "--out-dir":
        outDir = resolveArgPath(valueAfter(args, index, arg));
        index++;
        break;
      case "--report":
        reportPath = resolveArgPath(valueAfter(args, index, arg));
        index++;
        break;
      case "--trap": {
        const value = valueAfter(args, index, arg);
        trapIds.push(...value.split(",").map((id) => id.trim()).filter(Boolean));
        index++;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return {
    mode,
    cacheDir,
    outDir,
    reportPath: reportPath ?? resolve(outDir, "results.md"),
    trapIds,
    list,
    writeOutputs,
    requireComplete,
    failOnMiss,
  };
}

function selectTraps(ids: readonly string[]): Trap[] {
  if (ids.length === 0) return [...TRAPS];
  const selected: Trap[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const trap = trapById(id);
    if (!trap) throw new Error(`Unknown trap id: ${id}`);
    if (!seen.has(id)) selected.push(trap);
    seen.add(id);
  }
  return selected;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.list) {
    for (const trap of TRAPS) console.log(`${trap.id}\t${trap.title}`);
    return;
  }

  const traps = selectTraps(options.trapIds);
  const client = createLlmClientFromEnv({
    mode: options.mode,
    cacheDir: options.cacheDir,
    promptVersion: PROMPT_VERSION,
  });

  if (options.writeOutputs) await mkdir(options.outDir, { recursive: true });
  const summary = await runSuite(client, traps, options.mode, async (outcome) => {
    if (!options.writeOutputs || !("run" in outcome)) return;
    await writeFile(
      resolve(options.outDir, `${outcome.trap.id}.json`),
      `${JSON.stringify(outcome.run.bundle, null, 2)}\n`,
      "utf8",
    );
  });

  const report = renderReport(summary);
  if (options.writeOutputs) {
    await mkdir(dirname(options.reportPath), { recursive: true });
    await writeFile(options.reportPath, report, "utf8");
    console.error(`\n${summary.detected}/${summary.executed} executed traps detected — wrote ${options.reportPath}`);
  } else {
    console.log(report);
  }

  if (summary.errors > 0
    || (options.requireComplete && summary.executed !== summary.selected)
    || (options.failOnMiss && summary.missed > 0)) {
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
