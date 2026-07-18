import {
  assessmentId, bundleId, challengeId, claimId, correlationGroupId,
  inferenceId, matchId, narrativeId, overlayId, passageId, quarantineId, sourceId,
} from "./ids.js";
import {
  type Assessment, type Attribution, type Bundle, type Challenge, type ChallengeType,
  type Claim, type ClaimStructure, type ClaimType, type CorrelationGroup, type Inference,
  type InferenceType, type Locator, type Match, type MatchType, type Narrative, type Overlay,
  type QuarantinedClaim, type QuarantineReason, SCHEMA_VERSION, type SharedOrigin, type Source,
  type SourceType, type Stance, type Strength, type TargetRef,
} from "./schema.js";

/**
 * Fluent builder for authoring bundles by hand or from a pipeline.
 *
 * Every `add*` method computes the content-addressed id, fills array defaults, de-duplicates
 * by id (adding the same object twice is a no-op that returns the same id), and returns the id
 * so callers can wire references without tracking strings manually.
 */
export class BundleBuilder {
  private readonly sources = new Map<string, Source>();
  private readonly passages = new Map<string, Passage_>();
  private readonly claims = new Map<string, Claim>();
  private readonly inferences = new Map<string, Inference>();
  private readonly challenges = new Map<string, Challenge>();
  private readonly groups = new Map<string, CorrelationGroup>();
  private readonly matches = new Map<string, Match>();
  private readonly overlays = new Map<string, Overlay>();
  private readonly assessments = new Map<string, Assessment>();
  private readonly quarantine = new Map<string, QuarantinedClaim>();
  private readonly narratives = new Map<string, Narrative>();

  private readonly meta: { id: string; case: string; title: string; question: string };
  private readonly createdWith: Bundle["createdWith"];

  constructor(init: {
    case: string; title: string; question: string;
    mode?: "hand-authored" | "cached" | "live"; model?: string; pipelineVersion?: string;
  }) {
    this.meta = {
      id: bundleId({ case: init.case, question: init.question }),
      case: init.case, title: init.title, question: init.question,
    };
    this.createdWith = {
      ...(init.mode ? { mode: init.mode } : {}),
      ...(init.model ? { model: init.model } : {}),
      ...(init.pipelineVersion ? { pipelineVersion: init.pipelineVersion } : {}),
    };
  }

  source(s: {
    type: SourceType; title: string; url?: string; authors?: string[];
    publishedDate?: string; retrievedDate?: string; contentHash?: string;
    reliability?: Source["reliability"]; adversarialFlags?: string[];
    relatedSources?: Source["relatedSources"];
  }): string {
    const id = sourceId(s);
    if (!this.sources.has(id)) {
      this.sources.set(id, Source_({
        id, type: s.type, title: s.title, authors: s.authors ?? [],
        adversarialFlags: s.adversarialFlags ?? [], relatedSources: s.relatedSources ?? [],
        ...(s.url !== undefined ? { url: s.url } : {}),
        ...(s.publishedDate !== undefined ? { publishedDate: s.publishedDate } : {}),
        ...(s.retrievedDate !== undefined ? { retrievedDate: s.retrievedDate } : {}),
        ...(s.contentHash !== undefined ? { contentHash: s.contentHash } : {}),
        ...(s.reliability !== undefined ? { reliability: s.reliability } : {}),
      }));
    }
    return id;
  }

  passage(p: {
    sourceId: string; locator: Locator; verbatimText: string;
    contextBefore?: string; contextAfter?: string; sourceContentHash?: string;
  }): string {
    const id = passageId(p);
    if (!this.passages.has(id)) {
      this.passages.set(id, {
        id, sourceId: p.sourceId, locator: p.locator, verbatimText: p.verbatimText,
        ...(p.contextBefore !== undefined ? { contextBefore: p.contextBefore } : {}),
        ...(p.contextAfter !== undefined ? { contextAfter: p.contextAfter } : {}),
        ...(p.sourceContentHash !== undefined ? { sourceContentHash: p.sourceContentHash } : {}),
      });
    }
    return id;
  }

  claim(c: {
    statement: string; claimType: ClaimType; structure?: ClaimStructure;
    passages?: string[]; derived?: boolean; assumptions?: string[]; caveats?: string[];
    attribution: Attribution; extractionAgreement?: number; tags?: string[];
  }): string {
    const id = claimId(c);
    if (!this.claims.has(id)) {
      this.claims.set(id, {
        id, statement: c.statement, claimType: c.claimType,
        passages: c.passages ?? [], derived: c.derived ?? false,
        assumptions: c.assumptions ?? [], caveats: c.caveats ?? [],
        attribution: c.attribution, tags: c.tags ?? [],
        ...(c.structure !== undefined ? { structure: c.structure } : {}),
        ...(c.extractionAgreement !== undefined ? { extractionAgreement: c.extractionAgreement } : {}),
      });
    } else if (c.passages?.length) {
      // Same claim seen again with additional evidence: union the supporting passages.
      const existing = this.claims.get(id)!;
      existing.passages = [...new Set([...existing.passages, ...c.passages])];
    }
    return id;
  }

  inference(i: {
    type: InferenceType; premises: string[]; conclusion: string; warrant: string;
    strength: Strength; attribution: Attribution; assumptions?: string[]; defeaters?: string[];
    provenancePassageId?: string;
  }): string {
    const id = inferenceId(i);
    if (!this.inferences.has(id)) {
      this.inferences.set(id, {
        id, type: i.type, premises: i.premises, conclusion: i.conclusion, warrant: i.warrant,
        strength: i.strength, attribution: i.attribution,
        assumptions: i.assumptions ?? [], defeaters: i.defeaters ?? [],
        ...(i.provenancePassageId !== undefined ? { provenancePassageId: i.provenancePassageId } : {}),
      });
    }
    return id;
  }

  challenge(c: {
    challengeType: ChallengeType; target: TargetRef; rationale: string;
    raisedBy: Attribution; status?: Challenge["status"]; suggestedRemedy?: string;
  }): string {
    const id = challengeId(c);
    if (!this.challenges.has(id)) {
      this.challenges.set(id, {
        id, challengeType: c.challengeType, target: c.target, rationale: c.rationale,
        raisedBy: c.raisedBy, status: c.status ?? "open",
        ...(c.suggestedRemedy !== undefined ? { suggestedRemedy: c.suggestedRemedy } : {}),
      });
    }
    return id;
  }

  correlationGroup(g: {
    memberKind: "claim" | "source"; members: string[]; sharedOrigin: SharedOrigin; rationale: string;
  }): string {
    const id = correlationGroupId(g);
    if (!this.groups.has(id)) this.groups.set(id, { id, ...g });
    return id;
  }

  match(m: { type: MatchType; from: string; to: string; rationale: string; attribution: Attribution }): string {
    const id = matchId(m);
    if (!this.matches.has(id)) this.matches.set(id, { id, ...m });
    return id;
  }

  overlay(o: { label: string; analyst: Attribution; description?: string; admits?: string[]; priorStance?: string }): string {
    const id = overlayId(o);
    if (!this.overlays.has(id)) {
      this.overlays.set(id, {
        id, label: o.label, analyst: o.analyst,
        ...(o.description !== undefined ? { description: o.description } : {}),
        ...(o.admits !== undefined ? { admits: o.admits } : {}),
        ...(o.priorStance !== undefined ? { priorStance: o.priorStance } : {}),
      });
    }
    return id;
  }

  assess(a: {
    overlayId: string; target: TargetRef; stance: Stance;
    credence?: number; logOdds?: number; weight?: number; rationale?: string;
  }): string {
    const id = assessmentId(a);
    this.assessments.set(id, {
      id, overlayId: a.overlayId, target: a.target, stance: a.stance,
      ...(a.credence !== undefined ? { credence: a.credence } : {}),
      ...(a.logOdds !== undefined ? { logOdds: a.logOdds } : {}),
      ...(a.weight !== undefined ? { weight: a.weight } : {}),
      ...(a.rationale !== undefined ? { rationale: a.rationale } : {}),
    });
    return id;
  }

  quarantineClaim(q: { statement: string; reason: QuarantineReason; attemptedPassageText?: string; attribution: Attribution }): string {
    const id = quarantineId(q);
    if (!this.quarantine.has(id)) {
      this.quarantine.set(id, {
        id, statement: q.statement, reason: q.reason, attribution: q.attribution,
        ...(q.attemptedPassageText !== undefined ? { attemptedPassageText: q.attemptedPassageText } : {}),
      });
    }
    return id;
  }

  narrative(n: { target: TargetRef; text: string; groundedIn?: string[]; attribution: Attribution }): string {
    const groundedIn = n.groundedIn ?? [];
    const id = narrativeId({ target: n.target, text: n.text, groundedIn });
    if (!this.narratives.has(id)) {
      this.narratives.set(id, { id, target: n.target, text: n.text, groundedIn, attribution: n.attribution });
    }
    return id;
  }

  build(): Bundle {
    return {
      schemaVersion: SCHEMA_VERSION,
      id: this.meta.id, case: this.meta.case, title: this.meta.title, question: this.meta.question,
      ...(this.createdWith && Object.keys(this.createdWith).length ? { createdWith: this.createdWith } : {}),
      sources: [...this.sources.values()],
      passages: [...this.passages.values()],
      claims: [...this.claims.values()],
      inferences: [...this.inferences.values()],
      challenges: [...this.challenges.values()],
      correlationGroups: [...this.groups.values()],
      matches: [...this.matches.values()],
      overlays: [...this.overlays.values()],
      assessments: [...this.assessments.values()],
      quarantine: [...this.quarantine.values()],
      narratives: [...this.narratives.values()],
    };
  }
}

// Local aliases so the builder file reads cleanly without re-importing constructors.
type Passage_ = import("./schema.js").Passage;
const Source_ = (s: Source): Source => s;
