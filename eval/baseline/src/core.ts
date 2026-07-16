import { createHash, createHmac, randomBytes } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANALYSIS_FIELDS,
  type Artifact,
  type BlindMap,
  type EvaluationsFile,
  type EvaluationRating,
  type EvaluationResponse,
  type ImportsFile,
  type StudyConfig,
  type SystemConfig,
  type TaskConfig,
  type TasksConfig,
} from "./types.js";

export const BASELINE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PROJECT_DIR = resolve(BASELINE_DIR, "..", "..");

const REQUIRED_TASK_TYPES = [
  "strongest-evidence",
  "load-bearing-assumption",
  "citation-independence",
  "passage-support",
  "perspective-disagreement",
  "conflicting-source-update",
  "source-overclaim",
] as const;

const REQUIRED_METRICS = [
  "answerAccuracy",
  "citationCorrectness",
  "unsupportedClaimRate",
  "timeToAnswerMs",
  "cruxIdentification",
  "updateTimeMs",
  "interRaterAgreement",
] as const;

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export interface LoadedConfig {
  study: StudyConfig;
  tasks: TasksConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: string[], where: string, errors: string[]) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${where}: unknown field '${key}'`);
  }
}

function requiredString(value: unknown, where: string, errors: string[]): value is string {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${where}: expected a non-empty string`);
    return false;
  }
  return true;
}

function parseInstant(value: unknown, where: string, errors: string[]): number | null {
  if (!requiredString(value, where, errors)) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    errors.push(`${where}: expected an ISO-8601 date-time`);
    return null;
  }
  return parsed;
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function loadConfig(): Promise<LoadedConfig> {
  const study = await readJson<StudyConfig>(resolve(BASELINE_DIR, "config", "study.json"));
  const tasks = await readJson<TasksConfig>(resolve(BASELINE_DIR, study.tasks));
  return { study, tasks };
}

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export async function verifyFreeze(): Promise<ValidationResult> {
  const result: ValidationResult = { errors: [], warnings: [] };
  const lockPath = resolve(BASELINE_DIR, "config", "freeze.json");
  let lock: { schemaVersion?: string; files?: Record<string, string> };
  try {
    lock = await readJson(lockPath);
  } catch (error) {
    result.errors.push(`freeze lock unreadable: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }
  if (lock.schemaVersion !== "baseline-freeze/1.0" || !isRecord(lock.files)) {
    result.errors.push("freeze lock has an invalid schemaVersion or files map");
    return result;
  }
  for (const [relativePath, expected] of Object.entries(lock.files)) {
    try {
      const actual = sha256(await readFile(resolve(BASELINE_DIR, relativePath)));
      if (actual !== expected) result.errors.push(`frozen file changed: ${relativePath}`);
    } catch (error) {
      result.errors.push(`frozen file missing/unreadable: ${relativePath} (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  return result;
}

export function validateStaticConfig(study: StudyConfig, tasks: TasksConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (study.schemaVersion !== "baseline-study/1.0") errors.push("study schemaVersion must be baseline-study/1.0");
  if (tasks.schemaVersion !== "baseline-tasks/1.0") errors.push("tasks schemaVersion must be baseline-tasks/1.0");
  if (!Number.isInteger(study.minimumRatersPerResponse) || study.minimumRatersPerResponse < 2) {
    errors.push("minimumRatersPerResponse must be an integer >= 2");
  }
  const systemIds = new Set<string>();
  for (const system of study.systems ?? []) {
    if (systemIds.has(system.id)) errors.push(`duplicate system id: ${system.id}`);
    systemIds.add(system.id);
    if (!system.modelId || !system.armPrompt || !system.provider) errors.push(`system ${system.id} is not fully frozen`);
  }
  for (const required of ["deep-research", "careful-claude-code", "epistemic-git"]) {
    if (!systemIds.has(required)) errors.push(`missing required system: ${required}`);
  }
  if (systemIds.size !== 3) errors.push(`expected exactly 3 systems, found ${systemIds.size}`);

  const taskIds = new Set<string>();
  const taskTypes = new Set<string>();
  for (const task of tasks.tasks ?? []) {
    if (taskIds.has(task.id)) errors.push(`duplicate task id: ${task.id}`);
    taskIds.add(task.id);
    taskTypes.add(task.taskType);
    if (!ANALYSIS_FIELDS.includes(task.expectedAnalysisField)) errors.push(`task ${task.id}: invalid analysis field`);
    const criterionIds = task.rubric.accuracyCriteria.map((criterion) => criterion.id);
    if (!criterionIds.length || new Set(criterionIds).size !== criterionIds.length) errors.push(`task ${task.id}: invalid accuracy criteria`);
    for (const cruxId of task.rubric.cruxCriteria) {
      if (!criterionIds.includes(cruxId)) errors.push(`task ${task.id}: unknown crux criterion ${cruxId}`);
    }
    if (!task.allowedSources.length) errors.push(`task ${task.id}: no allowed sources`);
  }
  for (const type of REQUIRED_TASK_TYPES) if (!taskTypes.has(type)) errors.push(`missing task type: ${type}`);
  if (taskIds.size !== REQUIRED_TASK_TYPES.length) errors.push(`expected exactly 7 tasks, found ${taskIds.size}`);
  for (const metric of REQUIRED_METRICS) if (!study.metrics.includes(metric)) errors.push(`missing metric: ${metric}`);

  if (study.systems.some((system) => system.externalRunRequired)) {
    warnings.push("External system runs are required; configuration alone is not a result.");
  }
  return { errors, warnings };
}

function leakRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i");
}

function collectStrings(value: unknown, path = "artifact"): Array<{ path: string; value: string }> {
  if (typeof value === "string") return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((item, index) => collectStrings(item, `${path}[${index}]`));
  if (isRecord(value)) return Object.entries(value).flatMap(([key, item]) => collectStrings(item, `${path}.${key}`));
  return [];
}

export function validateArtifact(value: unknown, task: TaskConfig, leakTerms: string[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(value)) return { errors: ["artifact: expected an object"], warnings };
  exactKeys(value, ["schemaVersion", "taskId", "title", "summary", "claims", "citations", "analysis"], "artifact", errors);
  if (value.schemaVersion !== "baseline-artifact/1.0") errors.push("artifact.schemaVersion must be baseline-artifact/1.0");
  if (value.taskId !== task.id) errors.push(`artifact.taskId must be ${task.id}`);
  requiredString(value.title, "artifact.title", errors);
  requiredString(value.summary, "artifact.summary", errors);

  const citationIds = new Set<string>();
  if (!Array.isArray(value.citations)) errors.push("artifact.citations: expected an array");
  else value.citations.forEach((citation, index) => {
    const where = `artifact.citations[${index}]`;
    if (!isRecord(citation)) return errors.push(`${where}: expected an object`);
    exactKeys(citation, ["id", "sourceTitle", "sourceUri", "locator", "passage"], where, errors);
    if (requiredString(citation.id, `${where}.id`, errors)) {
      if (citationIds.has(citation.id)) errors.push(`${where}.id: duplicate '${citation.id}'`);
      citationIds.add(citation.id);
    }
    requiredString(citation.sourceTitle, `${where}.sourceTitle`, errors);
    for (const field of ["sourceUri", "locator", "passage"] as const) {
      if (citation[field] !== null && typeof citation[field] !== "string") errors.push(`${where}.${field}: expected string or null`);
    }
  });

  const claimIds = new Set<string>();
  if (!Array.isArray(value.claims) || value.claims.length === 0) errors.push("artifact.claims: expected a non-empty array");
  else value.claims.forEach((claim, index) => {
    const where = `artifact.claims[${index}]`;
    if (!isRecord(claim)) return errors.push(`${where}: expected an object`);
    exactKeys(claim, ["id", "text", "citationIds", "caveats"], where, errors);
    if (requiredString(claim.id, `${where}.id`, errors)) {
      if (claimIds.has(claim.id)) errors.push(`${where}.id: duplicate '${claim.id}'`);
      claimIds.add(claim.id);
    }
    requiredString(claim.text, `${where}.text`, errors);
    if (!Array.isArray(claim.citationIds) || !claim.citationIds.every((id) => typeof id === "string")) errors.push(`${where}.citationIds: expected string array`);
    if (!Array.isArray(claim.caveats) || !claim.caveats.every((item) => typeof item === "string")) errors.push(`${where}.caveats: expected string array`);
    if (Array.isArray(claim.citationIds) && Array.isArray(claim.caveats) && claim.citationIds.length === 0 && claim.caveats.length === 0) {
      errors.push(`${where}: uncited claims require an explicit caveat`);
    }
    if (Array.isArray(claim.citationIds)) {
      for (const id of claim.citationIds) if (!citationIds.has(id)) errors.push(`${where}: unknown citation id '${id}'`);
    }
  });

  if (!isRecord(value.analysis)) errors.push("artifact.analysis: expected an object");
  else {
    exactKeys(value.analysis, [...ANALYSIS_FIELDS], "artifact.analysis", errors);
    for (const field of ANALYSIS_FIELDS) {
      const content = value.analysis[field];
      if (field === task.expectedAnalysisField) requiredString(content, `artifact.analysis.${field}`, errors);
      else if (content !== null) errors.push(`artifact.analysis.${field}: must be null for task ${task.id}`);
    }
  }

  for (const item of collectStrings(value)) {
    for (const term of leakTerms) {
      if (leakRegex(term).test(item.value)) errors.push(`${item.path}: contains prohibited identity term '${term}'`);
    }
  }
  return { errors, warnings };
}

export async function validateImports(imports: ImportsFile, config: LoadedConfig, requireComplete: boolean): Promise<ValidationResult> {
  const { study, tasks } = config;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (imports.schemaVersion !== "baseline-imports/1.0") errors.push("imports schemaVersion must be baseline-imports/1.0");
  if (imports.studyId !== study.studyId) errors.push(`imports studyId must be ${study.studyId}`);
  if (!Array.isArray(imports.runs)) return { errors: [...errors, "imports.runs must be an array"], warnings };
  const systems = new Map(study.systems.map((system) => [system.id, system]));
  const taskMap = new Map(tasks.tasks.map((task) => [task.id, task]));
  const seen = new Set<string>();
  for (const [index, run] of imports.runs.entries()) {
    const where = `runs[${index}]`;
    const system = systems.get(run.systemId);
    const task = taskMap.get(run.taskId);
    if (!system) errors.push(`${where}: unknown system '${run.systemId}'`);
    if (!task) errors.push(`${where}: unknown task '${run.taskId}'`);
    const key = `${run.systemId}/${run.taskId}`;
    if (seen.has(key)) errors.push(`${where}: duplicate run ${key}`);
    seen.add(key);
    if (system && run.modelId !== system.modelId) errors.push(`${where}: model '${run.modelId}' does not match frozen '${system.modelId}'`);
    const start = parseInstant(run.startedAt, `${where}.startedAt`, errors);
    const end = parseInstant(run.completedAt, `${where}.completedAt`, errors);
    if (start !== null && end !== null && end <= start) errors.push(`${where}: completedAt must be after startedAt`);
    requiredString(run.operator, `${where}.operator`, errors);
    if (task && requiredString(run.artifactPath, `${where}.artifactPath`, errors)) {
      const artifactPath = isAbsolute(run.artifactPath) ? run.artifactPath : resolve(PROJECT_DIR, run.artifactPath);
      try {
        const artifact = await readJson<Artifact>(artifactPath);
        const checked = validateArtifact(artifact, task, study.blinding.identityLeakTerms);
        errors.push(...checked.errors.map((message) => `${where} (${run.artifactPath}): ${message}`));
      } catch (error) {
        errors.push(`${where}: artifact unreadable (${error instanceof Error ? error.message : String(error)})`);
      }
    }
  }
  const missing: string[] = [];
  for (const system of study.systems) for (const task of tasks.tasks) {
    const key = `${system.id}/${task.id}`;
    if (!seen.has(key)) missing.push(key);
  }
  if (missing.length) {
    const message = `missing ${missing.length} external run(s): ${missing.join(", ")}`;
    if (requireComplete) errors.push(message); else warnings.push(message);
  }
  return { errors, warnings };
}

async function assertAbsent(path: string) {
  try {
    await access(path);
    throw new Error(`refusing to overwrite existing path: ${path}`);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

export function checkedRunId(runId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(runId)) throw new Error("run id must match ^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$");
  return runId;
}

export async function renderRunPackets(runId: string, config: LoadedConfig): Promise<string> {
  checkedRunId(runId);
  const out = resolve(BASELINE_DIR, "runs", runId, "private", "run-packets");
  await assertAbsent(out);
  const common = await readFile(resolve(BASELINE_DIR, config.study.commonPrompt), "utf8");
  await mkdir(out, { recursive: true });
  for (const system of config.study.systems) {
    const arm = await readFile(resolve(BASELINE_DIR, system.armPrompt), "utf8");
    const systemDir = resolve(out, system.id);
    await mkdir(systemDir, { recursive: true });
    for (const task of config.tasks.tasks) {
      const header = `FROZEN STUDY: ${config.study.studyId}\nSYSTEM ARM: ${system.administratorLabel}\nMODEL ID: ${system.modelId}\nCONFIGURATION: ${JSON.stringify(system.configuration)}\n\n`;
      const allowedSources = await Promise.all(task.allowedSources.map(async (source) => {
        if (source.uri.startsWith("inline:")) {
          return { ...source, uri: null, content: source.uri.slice("inline:".length) };
        }
        if (/^https?:\/\//i.test(source.uri)) return { ...source, content: null };
        return { ...source, content: await readFile(resolve(PROJECT_DIR, source.uri), "utf8") };
      }));
      const taskPacket = {
        id: task.id,
        taskType: task.taskType,
        case: task.case,
        researchQuestion: task.researchQuestion,
        expectedAnalysisField: task.expectedAnalysisField,
        allowedSources,
      };
      const body = `${header}${common}\n${arm}\n# TASK JSON\n${JSON.stringify(taskPacket, null, 2)}\n`;
      await writeFile(resolve(systemDir, `${task.id}.txt`), body, "utf8");
    }
  }
  await writeFile(resolve(out, "README.txt"), "PRIVATE: These packets disclose system identity. Never provide this directory to evaluators.\n", "utf8");
  return out;
}

function hmac(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

export async function prepareBlindedRun(runId: string, imports: ImportsFile, config: LoadedConfig): Promise<string> {
  checkedRunId(runId);
  const checked = await validateImports(imports, config, true);
  if (checked.errors.length) throw new Error(checked.errors.join("\n"));

  const base = resolve(BASELINE_DIR, "runs", runId);
  const evaluatorDir = resolve(base, "evaluator");
  const privateMapPath = resolve(base, "private", "blinding-map.json");
  await assertAbsent(evaluatorDir);
  await assertAbsent(privateMapPath);

  const taskMap = new Map(config.tasks.tasks.map((task) => [task.id, task]));
  const key = randomBytes(32);
  const packetId = `PKT-${hmac(key, config.study.studyId).slice(0, 12).toUpperCase()}`;
  const entries: BlindMap["entries"] = [];
  const artifacts = new Map<string, Artifact>();

  for (const run of imports.runs) {
    const task = taskMap.get(run.taskId)!;
    const artifactPath = isAbsolute(run.artifactPath) ? run.artifactPath : resolve(PROJECT_DIR, run.artifactPath);
    const raw = await readFile(artifactPath);
    const artifact = JSON.parse(raw.toString("utf8")) as Artifact;
    const artifactId = `${config.study.blinding.artifactIdPrefix}-${hmac(key, `${run.taskId}\0${run.systemId}`).slice(0, 12).toUpperCase()}`;
    const prepared = `${JSON.stringify(artifact, null, 2)}\n`;
    artifacts.set(artifactId, artifact);
    entries.push({
      artifactId,
      taskId: run.taskId,
      systemId: run.systemId,
      sourceArtifactSha256: sha256(raw),
      preparedArtifactSha256: sha256(prepared),
      generationDurationMs: Date.parse(run.completedAt) - Date.parse(run.startedAt),
    });
    const postCheck = validateArtifact(artifact, task, config.study.blinding.identityLeakTerms);
    if (postCheck.errors.length) throw new Error(postCheck.errors.join("\n"));
  }

  const publicTasks = config.tasks.tasks.map((task) => {
    const artifactIds = entries
      .filter((entry) => entry.taskId === task.id)
      .sort((a, b) => hmac(key, `order\0${task.id}\0${a.systemId}`).localeCompare(hmac(key, `order\0${task.id}\0${b.systemId}`)))
      .map((entry) => entry.artifactId);
    return { taskId: task.id, taskType: task.taskType, question: task.evaluatorQuestion, artifactIds };
  });

  await mkdir(resolve(evaluatorDir, "artifacts"), { recursive: true });
  await mkdir(dirname(privateMapPath), { recursive: true });
  for (const [artifactId, artifact] of artifacts) {
    await writeFile(resolve(evaluatorDir, "artifacts", `${artifactId}.json`), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  }
  await writeFile(resolve(evaluatorDir, "manifest.json"), `${JSON.stringify({
    schemaVersion: "baseline-evaluator-packet/1.0",
    studyId: config.study.studyId,
    packetId,
    tasks: publicTasks,
  }, null, 2)}\n`, "utf8");
  await writeFile(resolve(evaluatorDir, "INSTRUCTIONS.md"), await readFile(resolve(BASELINE_DIR, "EVALUATOR.md"), "utf8"), "utf8");

  const blindMap: BlindMap = {
    schemaVersion: "baseline-blind-map/1.0",
    studyId: config.study.studyId,
    runId,
    createdAt: new Date().toISOString(),
    entries,
  };
  await writeFile(privateMapPath, `${JSON.stringify(blindMap, null, 2)}\n`, "utf8");
  await writeFile(resolve(base, "private", "ADMIN-NOTICE.txt"), "PRIVATE: This directory reveals system identity and timing. Never share it with evaluators or raters before ratings are locked.\n", "utf8");
  return evaluatorDir;
}

function sameMembers(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((item) => expected.includes(item)) && new Set(actual).size === actual.length;
}

export function validateEvaluations(evaluations: EvaluationsFile, blindMap: BlindMap, config: LoadedConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (evaluations.schemaVersion !== "baseline-evaluations/1.0") errors.push("evaluations schemaVersion must be baseline-evaluations/1.0");
  if (evaluations.studyId !== config.study.studyId) errors.push(`evaluations studyId must be ${config.study.studyId}`);
  const mapEntries = new Map(blindMap.entries.map((entry) => [entry.artifactId, entry]));
  const tasks = new Map(config.tasks.tasks.map((task) => [task.id, task]));
  const responses = new Map<string, EvaluationResponse>();
  const participantArtifact = new Set<string>();
  for (const [index, response] of evaluations.responses.entries()) {
    const where = `responses[${index}]`;
    if (responses.has(response.id)) errors.push(`${where}: duplicate response id '${response.id}'`);
    responses.set(response.id, response);
    const entry = mapEntries.get(response.artifactId);
    if (!entry) errors.push(`${where}: unknown artifact '${response.artifactId}'`);
    else if (response.taskId !== entry.taskId) errors.push(`${where}: task does not match blinded artifact`);
    if (!tasks.has(response.taskId)) errors.push(`${where}: unknown task '${response.taskId}'`);
    const assignment = `${response.participantId}/${response.artifactId}`;
    if (participantArtifact.has(assignment)) errors.push(`${where}: participant has duplicate response for artifact`);
    participantArtifact.add(assignment);
    const start = parseInstant(response.startedAt, `${where}.startedAt`, errors);
    const end = parseInstant(response.completedAt, `${where}.completedAt`, errors);
    if (!Number.isInteger(response.durationMs) || response.durationMs <= 0) errors.push(`${where}: durationMs must be a positive integer`);
    if (start !== null && end !== null) {
      if (end <= start) errors.push(`${where}: completedAt must be after startedAt`);
      else if (Math.abs((end - start) - response.durationMs) > 5000) errors.push(`${where}: durationMs differs from timestamps by more than 5 seconds`);
    }
    requiredString(response.answerText, `${where}.answerText`, errors);
    if (!Array.isArray(response.claims) || response.claims.length === 0) errors.push(`${where}: atomize at least one answer claim`);
    const claimIds = response.claims.map((claim) => claim.id);
    const citationIds = response.citations.map((citation) => citation.id);
    if (new Set(claimIds).size !== claimIds.length) errors.push(`${where}: duplicate claim ids`);
    if (new Set(citationIds).size !== citationIds.length) errors.push(`${where}: duplicate citation ids`);
    for (const citation of response.citations) if (!claimIds.includes(citation.claimId)) errors.push(`${where}: citation ${citation.id} has unknown claimId`);
  }

  const ratingKeys = new Set<string>();
  const ratingCounts = new Map<string, number>();
  for (const [index, rating] of evaluations.ratings.entries()) {
    const where = `ratings[${index}]`;
    const response = responses.get(rating.responseId);
    if (!response) {
      errors.push(`${where}: unknown response '${rating.responseId}'`);
      continue;
    }
    const key = `${rating.responseId}/${rating.raterId}`;
    if (ratingKeys.has(key)) errors.push(`${where}: duplicate rater for response`);
    ratingKeys.add(key);
    ratingCounts.set(rating.responseId, (ratingCounts.get(rating.responseId) ?? 0) + 1);
    const task = tasks.get(response.taskId)!;
    const expectedCriteria = task.rubric.accuracyCriteria.map((criterion) => criterion.id);
    if (!sameMembers(rating.accuracy.map((item) => item.criterionId), expectedCriteria)) errors.push(`${where}: accuracy must rate every rubric criterion exactly once`);
    if (!sameMembers(rating.citationCorrectness.map((item) => item.citationId), response.citations.map((citation) => citation.id))) errors.push(`${where}: citationCorrectness must rate every response citation exactly once`);
    if (!sameMembers(rating.claimSupport.map((item) => item.claimId), response.claims.map((claim) => claim.id))) errors.push(`${where}: claimSupport must rate every response claim exactly once`);
    const expectsCrux = task.rubric.cruxCriteria.length > 0;
    if (expectsCrux && typeof rating.cruxIdentified !== "boolean") errors.push(`${where}: cruxIdentified must be boolean for this task`);
    if (!expectsCrux && rating.cruxIdentified !== null) errors.push(`${where}: cruxIdentified must be null for this task`);
  }
  for (const response of evaluations.responses) {
    const count = ratingCounts.get(response.id) ?? 0;
    if (count < config.study.minimumRatersPerResponse) warnings.push(`response ${response.id} has ${count}/${config.study.minimumRatersPerResponse} required ratings`);
  }
  if (!evaluations.responses.length) warnings.push("No human responses imported; all outcome metrics will be null.");
  return { errors, warnings };
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function ratio(values: boolean[]): number | null {
  return values.length ? values.filter(Boolean).length / values.length : null;
}

export interface AgreementResult {
  method: string;
  kappa: number | null;
  observedAgreement: number | null;
  expectedAgreement: number | null;
  itemCount: number;
  judgmentCount: number;
}

export function binaryInterRaterAgreement(items: Map<string, boolean[]>): AgreementResult {
  const usable = [...items.values()].filter((values) => values.length >= 2);
  const judgments = usable.flat();
  if (!usable.length || !judgments.length) {
    return { method: "chance-corrected pairwise agreement for binary judgments", kappa: null, observedAgreement: null, expectedAgreement: null, itemCount: 0, judgmentCount: 0 };
  }
  let agreeingPairs = 0;
  let pairs = 0;
  for (const values of usable) {
    for (let i = 0; i < values.length; i++) for (let j = i + 1; j < values.length; j++) {
      pairs++;
      if (values[i] === values[j]) agreeingPairs++;
    }
  }
  const observed = agreeingPairs / pairs;
  const positive = judgments.filter(Boolean).length / judgments.length;
  const expected = positive ** 2 + (1 - positive) ** 2;
  const kappa = expected === 1 ? (observed === 1 ? 1 : null) : (observed - expected) / (1 - expected);
  return {
    method: "chance-corrected pairwise agreement for binary judgments",
    kappa,
    observedAgreement: observed,
    expectedAgreement: expected,
    itemCount: usable.length,
    judgmentCount: judgments.length,
  };
}

function responseMetric(ratings: EvaluationRating[], selector: (rating: EvaluationRating) => boolean[]): number | null {
  return average(ratings.map((rating) => ratio(selector(rating))).filter((value): value is number => value !== null));
}

export function scoreEvaluations(evaluations: EvaluationsFile, blindMap: BlindMap, config: LoadedConfig) {
  const entryByArtifact = new Map(blindMap.entries.map((entry) => [entry.artifactId, entry]));
  const ratingsByResponse = new Map<string, EvaluationRating[]>();
  for (const rating of evaluations.ratings) {
    const list = ratingsByResponse.get(rating.responseId) ?? [];
    list.push(rating);
    ratingsByResponse.set(rating.responseId, list);
  }
  const agreementFor = (responseIds: Set<string>) => {
    const items = new Map<string, boolean[]>();
    const add = (key: string, value: boolean) => items.set(key, [...(items.get(key) ?? []), value]);
    for (const rating of evaluations.ratings) {
      if (!responseIds.has(rating.responseId)) continue;
      for (const item of rating.accuracy) add(`${rating.responseId}/accuracy/${item.criterionId}`, item.met);
      for (const item of rating.citationCorrectness) add(`${rating.responseId}/citation/${item.citationId}`, item.correct);
      for (const item of rating.claimSupport) add(`${rating.responseId}/support/${item.claimId}`, item.supported);
      if (rating.cruxIdentified !== null) add(`${rating.responseId}/crux`, rating.cruxIdentified);
    }
    return binaryInterRaterAgreement(items);
  };

  const systems = config.study.systems.map((system) => {
    const responses = evaluations.responses.filter((response) => entryByArtifact.get(response.artifactId)?.systemId === system.id);
    const rated = responses.map((response) => ({ response, ratings: ratingsByResponse.get(response.id) ?? [] }));
    const generation = blindMap.entries.filter((entry) => entry.systemId === system.id).map((entry) => entry.generationDurationMs);
    return {
      systemId: system.id,
      administratorLabel: system.administratorLabel,
      responseCount: responses.length,
      ratedResponseCount: rated.filter((item) => item.ratings.length > 0).length,
      answerAccuracy: average(rated.map((item) => responseMetric(item.ratings, (rating) => rating.accuracy.map((score) => score.met))).filter((value): value is number => value !== null)),
      citationCorrectness: average(rated.map((item) => responseMetric(item.ratings, (rating) => rating.citationCorrectness.map((score) => score.correct))).filter((value): value is number => value !== null)),
      unsupportedClaimRate: average(rated.map((item) => {
        const support = responseMetric(item.ratings, (rating) => rating.claimSupport.map((score) => score.supported));
        return support === null ? null : 1 - support;
      }).filter((value): value is number => value !== null)),
      timeToAnswerMs: average(responses.map((response) => response.durationMs)),
      cruxIdentification: average(rated.map((item) => responseMetric(item.ratings, (rating) => rating.cruxIdentified === null ? [] : [rating.cruxIdentified])).filter((value): value is number => value !== null)),
      updateTimeMs: average(responses.filter((response) => response.taskId === "conflicting-source-update-covid").map((response) => response.durationMs)),
      generationTimeMs: average(generation),
      interRaterAgreement: agreementFor(new Set(responses.map((response) => response.id))),
    };
  });

  return {
    schemaVersion: "baseline-scores/1.0",
    studyId: config.study.studyId,
    generatedAt: new Date().toISOString(),
    status: evaluations.responses.length ? "observed-human-data" : "no-human-data",
    systems,
    interRaterAgreement: agreementFor(new Set(evaluations.responses.map((response) => response.id))),
    caveats: [
      "Null means no eligible observations; it is never converted to zero.",
      "Accuracy, citation, claim-support, and crux values first average raters within a response, then responses within a system.",
      "Unsupported-claim rate is one minus rated claim support.",
      "Time-to-answer and update-time are participant elapsed times; generationTimeMs is separately imported operational metadata.",
      "System labels are unblinded administrative data. Do not share this result before ratings are locked.",
    ],
  };
}

export async function writeScores(runId: string, evaluations: EvaluationsFile, config: LoadedConfig): Promise<{ path: string; validation: ValidationResult }> {
  checkedRunId(runId);
  const privateDir = resolve(BASELINE_DIR, "runs", runId, "private");
  const blindMap = await readJson<BlindMap>(resolve(privateDir, "blinding-map.json"));
  const validation = validateEvaluations(evaluations, blindMap, config);
  if (validation.errors.length) throw new Error(validation.errors.join("\n"));
  const path = resolve(privateDir, "scores.json");
  await writeFile(path, `${JSON.stringify(scoreEvaluations(evaluations, blindMap, config), null, 2)}\n`, "utf8");
  return { path, validation };
}

export function systemForId(study: StudyConfig, id: string): SystemConfig | undefined {
  return study.systems.find((system) => system.id === id);
}
