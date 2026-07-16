export const ANALYSIS_FIELDS = [
  "strongestEvidence",
  "loadBearingAssumption",
  "citationIndependence",
  "passageSupport",
  "perspectiveDisagreement",
  "conflictingSourceUpdate",
  "sourceOverclaim",
] as const;

export type AnalysisField = (typeof ANALYSIS_FIELDS)[number];

export interface SystemConfig {
  id: string;
  administratorLabel: string;
  modelId: string;
  provider: string;
  armPrompt: string;
  configuration: Record<string, unknown>;
  externalRunRequired: boolean;
}

export interface StudyConfig {
  schemaVersion: string;
  studyId: string;
  frozenAt: string;
  commonPrompt: string;
  tasks: string;
  minimumRatersPerResponse: number;
  systems: SystemConfig[];
  blinding: {
    artifactIdPrefix: string;
    identityLeakTerms: string[];
    packetRule: string;
  };
  metrics: string[];
}

export interface AccuracyCriterion {
  id: string;
  description: string;
}

export interface TaskConfig {
  id: string;
  taskType: string;
  case: string;
  researchQuestion: string;
  evaluatorQuestion: string;
  expectedAnalysisField: AnalysisField;
  allowedSources: Array<{ id: string; title: string; uri: string; phase: string }>;
  rubric: {
    basis: string;
    accuracyCriteria: AccuracyCriterion[];
    cruxCriteria: string[];
  };
}

export interface TasksConfig {
  schemaVersion: string;
  tasks: TaskConfig[];
}

export interface Artifact {
  schemaVersion: string;
  taskId: string;
  title: string;
  summary: string;
  claims: Array<{ id: string; text: string; citationIds: string[]; caveats: string[] }>;
  citations: Array<{
    id: string;
    sourceTitle: string;
    sourceUri: string | null;
    locator: string | null;
    passage: string | null;
  }>;
  analysis: Record<AnalysisField, string | null>;
}

export interface ImportedRun {
  systemId: string;
  taskId: string;
  artifactPath: string;
  modelId: string;
  startedAt: string;
  completedAt: string;
  operator: string;
  providerRunId?: string | null;
  notes?: string | null;
}

export interface ImportsFile {
  schemaVersion: string;
  studyId: string;
  runs: ImportedRun[];
}

export interface EvaluationResponse {
  id: string;
  participantId: string;
  artifactId: string;
  taskId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  answerText: string;
  claims: Array<{ id: string; text: string }>;
  citations: Array<{ id: string; claimId: string; reference: string }>;
}

export interface EvaluationRating {
  responseId: string;
  raterId: string;
  accuracy: Array<{ criterionId: string; met: boolean }>;
  citationCorrectness: Array<{ citationId: string; correct: boolean }>;
  claimSupport: Array<{ claimId: string; supported: boolean }>;
  cruxIdentified: boolean | null;
  notes: string | null;
}

export interface EvaluationsFile {
  schemaVersion: string;
  studyId: string;
  responses: EvaluationResponse[];
  ratings: EvaluationRating[];
}

export interface BlindMapEntry {
  artifactId: string;
  taskId: string;
  systemId: string;
  sourceArtifactSha256: string;
  preparedArtifactSha256: string;
  generationDurationMs: number;
}

export interface BlindMap {
  schemaVersion: string;
  studyId: string;
  runId: string;
  createdAt: string;
  entries: BlindMapEntry[];
}
