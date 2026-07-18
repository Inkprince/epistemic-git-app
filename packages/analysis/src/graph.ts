import type { Bundle, Claim, Inference, InferenceType } from "@epistemic-git/protocol";

/**
 * The argument dependency graph derived from a bundle's inferences.
 *
 * Inferences are classified by how they bear on their conclusion claim:
 *   POSITIVE, the premises raise support for the conclusion.
 *   ATTACK, the premises lower support for the conclusion (rebuts / contradicts).
 *   UNDERCUT, the premises reduce trust in the conclusion claim itself.
 *
 * This is a weighted bipolar argumentation structure. Keeping the classification explicit (rather
 * than burying it in the scoring) is deliberate: the semantics in support.ts are then a small,
 * auditable function of this graph, which is what lets the assessment layer be LLM-free.
 */

export const POSITIVE_TYPES: readonly InferenceType[] = ["supports", "evidence-for", "explains", "presupposes"];
export const ATTACK_TYPES: readonly InferenceType[] = ["rebuts", "contradicts"];
export const UNDERCUT_TYPES: readonly InferenceType[] = ["undercuts"];

export type Polarity = "positive" | "attack" | "undercut";

export function polarityOf(type: InferenceType): Polarity {
  if (ATTACK_TYPES.includes(type)) return "attack";
  if (UNDERCUT_TYPES.includes(type)) return "undercut";
  return "positive";
}

export class ClaimGraph {
  readonly claims = new Map<string, Claim>();
  readonly inferences = new Map<string, Inference>();
  /** conclusion claim id → inferences that positively support it. */
  readonly supports = new Map<string, Inference[]>();
  /** conclusion claim id → inferences that attack (rebut/contradict) it. */
  readonly attacks = new Map<string, Inference[]>();
  /** target claim id → inferences that undercut trust in it. */
  readonly undercuts = new Map<string, Inference[]>();

  constructor(readonly bundle: Bundle) {
    for (const c of bundle.claims) this.claims.set(c.id, c);
    for (const inf of bundle.inferences) {
      this.inferences.set(inf.id, inf);
      const bucket =
        polarityOf(inf.type) === "attack" ? this.attacks
        : polarityOf(inf.type) === "undercut" ? this.undercuts
        : this.supports;
      const list = bucket.get(inf.conclusion) ?? [];
      list.push(inf);
      bucket.set(inf.conclusion, list);
    }
  }

  /** Claims that are not the conclusion of any positive inference, the evidential leaves. */
  leaves(): Claim[] {
    return [...this.claims.values()].filter((c) => (this.supports.get(c.id) ?? []).length === 0);
  }

  /**
   * Detect cycles in the positive-support graph (premise → conclusion). A well-formed argument
   * ledger is acyclic; a cycle usually signals circular citation and is reported so the scoring
   * can break it deterministically rather than loop.
   */
  findCycles(): string[][] {
    const cycles: string[][] = [];
    const state = new Map<string, 0 | 1 | 2>(); // 0=unvisited,1=in-stack,2=done
    const stack: string[] = [];

    const visit = (id: string) => {
      state.set(id, 1);
      stack.push(id);
      for (const inf of this.supports.get(id) ?? []) {
        for (const premise of inf.premises) {
          const s = state.get(premise) ?? 0;
          if (s === 1) {
            const from = stack.indexOf(premise);
            cycles.push(stack.slice(from >= 0 ? from : 0).concat(premise));
          } else if (s === 0) {
            visit(premise);
          }
        }
      }
      stack.pop();
      state.set(id, 2);
    };

    for (const id of this.claims.keys()) if ((state.get(id) ?? 0) === 0) visit(id);
    return cycles;
  }
}

export function buildGraph(bundle: Bundle): ClaimGraph {
  return new ClaimGraph(bundle);
}
