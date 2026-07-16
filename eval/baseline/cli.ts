#!/usr/bin/env node
import { resolve } from "node:path";
import {
  BASELINE_DIR,
  PROJECT_DIR,
  loadConfig,
  prepareBlindedRun,
  readJson,
  renderRunPackets,
  validateEvaluations,
  validateImports,
  validateStaticConfig,
  verifyFreeze,
  writeScores,
} from "./src/core.js";
import type { BlindMap, EvaluationsFile, ImportsFile } from "./src/types.js";

function usage(): never {
  console.error(`Baseline evaluation CLI

Usage:
  npx tsx eval/baseline/cli.ts validate [--imports PATH] [--run RUN_ID --evaluations PATH]
  npx tsx eval/baseline/cli.ts render --run RUN_ID
  npx tsx eval/baseline/cli.ts prepare --run RUN_ID --imports PATH
  npx tsx eval/baseline/cli.ts score --run RUN_ID --evaluations PATH

All generated files stay under eval/baseline/runs/. External services are never
called by this CLI; render creates private frozen run packets for an operator.
`);
  process.exit(2);
}

function options(args: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) usage();
    result.set(key.slice(2), value);
  }
  return result;
}

function inputPath(path: string): string {
  return resolve(PROJECT_DIR, path);
}

function report(label: string, errors: string[], warnings: string[]) {
  console.log(`${label}: ${errors.length ? "FAIL" : "OK"}`);
  for (const warning of warnings) console.log(`  warning: ${warning}`);
  for (const error of errors) console.error(`  error: ${error}`);
}

async function ensureFrozen() {
  const config = await loadConfig();
  const staticCheck = validateStaticConfig(config.study, config.tasks);
  const freezeCheck = await verifyFreeze();
  report("configuration", staticCheck.errors, staticCheck.warnings);
  report("freeze lock", freezeCheck.errors, freezeCheck.warnings);
  const errors = [...staticCheck.errors, ...freezeCheck.errors];
  if (errors.length) throw new Error("Frozen study configuration is invalid.");
  return config;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") usage();
  const opts = options(rest);
  const config = await ensureFrozen();

  if (command === "validate") {
    let ready = true;
    const importsPath = opts.get("imports");
    if (importsPath) {
      const imported = await readJson<ImportsFile>(inputPath(importsPath));
      const checked = await validateImports(imported, config, true);
      report("external runs", checked.errors, checked.warnings);
      ready = ready && checked.errors.length === 0;
    } else {
      console.log(`external runs: NOT READY\n  warning: no --imports file supplied; all ${config.study.systems.length * config.tasks.tasks.length} external runs remain unverified`);
      ready = false;
    }

    const evaluationsPath = opts.get("evaluations");
    const runId = opts.get("run");
    if (evaluationsPath || runId) {
      if (!evaluationsPath || !runId) usage();
      const evaluations = await readJson<EvaluationsFile>(inputPath(evaluationsPath));
      const blindMap = await readJson<BlindMap>(resolve(BASELINE_DIR, "runs", runId, "private", "blinding-map.json"));
      const checked = validateEvaluations(evaluations, blindMap, config);
      report("human evaluations", checked.errors, checked.warnings);
      ready = ready && checked.errors.length === 0 && evaluations.responses.length > 0 && !checked.warnings.some((warning) => warning.includes("required ratings"));
    } else {
      console.log("human evaluations: NOT AVAILABLE (expected before results can be claimed)");
    }
    console.log(ready ? "READY: frozen inputs and complete external run matrix validated." : "NOT READY: no evaluation result may be claimed yet.");
    if (!ready) process.exitCode = 2;
    return;
  }

  if (command === "render") {
    const runId = opts.get("run");
    if (!runId || opts.size !== 1) usage();
    const path = await renderRunPackets(runId, config);
    console.log(`Wrote private frozen run packets: ${path}`);
    console.log("No external systems were called and no baseline outputs were created.");
    return;
  }

  if (command === "prepare") {
    const runId = opts.get("run");
    const importsPath = opts.get("imports");
    if (!runId || !importsPath || opts.size !== 2) usage();
    const imported = await readJson<ImportsFile>(inputPath(importsPath));
    const path = await prepareBlindedRun(runId, imported, config);
    console.log(`Wrote evaluator-safe packet: ${path}`);
    console.log(`Keep ${resolve(BASELINE_DIR, "runs", runId, "private")} inaccessible until all ratings are locked.`);
    return;
  }

  if (command === "score") {
    const runId = opts.get("run");
    const evaluationsPath = opts.get("evaluations");
    if (!runId || !evaluationsPath || opts.size !== 2) usage();
    const evaluations = await readJson<EvaluationsFile>(inputPath(evaluationsPath));
    const result = await writeScores(runId, evaluations, config);
    report("human evaluations", result.validation.errors, result.validation.warnings);
    console.log(`Wrote private scores: ${result.path}`);
    if (!evaluations.responses.length) console.log("No human data were present; score fields are null and status is no-human-data.");
    return;
  }

  usage();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
