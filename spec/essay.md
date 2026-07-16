# Epistemic Git: a portable, mergeable ledger of attributable evidence

*A specification and its prototype, for the Future of Life Foundation's "Lab Leaks, Black Holes, and Eggs" competition.*

> **Thesis.** People with incompatible beliefs should be able to share the same evidence
> substrate without being forced to share conclusions. The unit of AI-assisted research should not
> be a verdict; it should be a versioned ledger of *attributable assertions* — claims, the inferences
> that connect them, and the challenges against them — each grounded in an exact source passage, each
> independently contestable, and all of it mergeable across investigators the way source code is.

This document specifies that ledger, the human+AI workflow that produces it, and the deterministic
analysis it enables. It is written so another team could reimplement the method, extend it, or attack
it. Everything the accompanying prototype does is legible here on its own; the code is a proof that the
specification runs, not a substitute for reading it. The core is eight sections; a two-page pseudocode
summary (Appendix A) and reference material (Appendices B+) are optional.

A note on epistemic honesty, since it is the thing we are selling: where we have run something and
observed a result, we report the number and where it came from. Where we have built and frozen an
evaluation but not yet executed it against external systems and human raters, we say so plainly and
report *nothing* rather than a placeholder. §5 has real executed results; §6 is a frozen, reproducible
protocol whose empirical rows are still empty. We would rather show you the boundary than blur it.

---

## §1 — The failure of conclusion-centric AI research

Ask a state-of-the-art deep-research tool or a careful agentic coding assistant a contested empirical
question and you get back a fluent, cited answer. It is a genuinely useful object and a structurally
wrong one. Four properties a collective reasoning process needs are missing:

- **Auditability.** The citations are a bibliography, not a binding. To know whether source [7]
  actually supports the sentence it is attached to, you re-read [7] by hand. The link between a claim
  and the exact words that license it is not represented, so it cannot be checked mechanically.
- **Mergeability.** Your colleague runs the same query and gets a differently-worded answer with an
  overlapping but not identical source set. There is no operation that combines the two into one
  artifact while preserving what each contributed and flagging where they genuinely disagree. You
  reconcile them in your head, or in a doc, and the reconciliation is not itself reusable.
- **Contestability.** An objection — "that abstract overstates the result," "those two citations are
  the same dataset counted twice" — has nowhere to live. It becomes a comment, or a rebuttal essay, or
  nothing. It does not attach to the specific inference it defeats, so the next reader inherits the
  claim without the objection.
- **Faithful uncertainty.** Re-run the query and the answer silently changes. Prose smooths over the
  difference between "three independent studies agree" and "three papers from one lab, one dataset,
  agree." The output type has no place to *keep* a distinction the model noticed, so the distinction
  evaporates.

These are not prompt-quality problems; better prose does not add a join between a claim and its passage.
**The output type is wrong.** A verdict is a terminal object: you can accept it or discard it, but you
cannot fork it, diff it, or hand a piece of it to someone who trusts different sources. What collective
inquiry needs is not a better verdict generator but *evidence substrate* — a structured, portable
record of who asserted what, on what grounds, and who contests it — over which many parties, holding
different priors, can compute their own conclusions and see exactly where and why they part ways.

This is a concrete instantiation of the direction the Future of Life Foundation's own framing points
at [1]: an ingestion → structure → assessment stack in which **trust is a late-binding property**,
attached by a reader rather than baked into the record. We take that seriously enough to make assessment a separable overlay (§2,
§4) rather than a field on a claim. The name is the whole idea: treat evidence the way Git treats
code — content-addressed, forkable, mergeable, with a full attributable history — so that disagreement
becomes a *diff* you can inspect instead of an argument you have to have.

---

## §2 — The attributable-assertion model (the protocol)

The durable contribution is a small open protocol: six core object types, an Overlay that scopes
judgments, and three relational objects — expressed as a JSON Schema (Appendix B) with a canonical
JSONL serialization. A **bundle** is one portable case.

```
Source ─▶ Passage ─▶ Claim ─▶ Inference
                       │
                       ├─▶ Challenge    (typed objection, first-class)
                       └─▶ Assessment   (a perspective's judgment — an OVERLAY, never intrinsic)
```
*Figure 1. The object model. Match and CorrelationGroup relate claims; Overlay scopes Assessments.*

- **Source** — identity, authors, date, type, peer-review status, declared funding conflicts, known
  partisan stance, and typed relations to other sources (`same-dataset`, `same-authors`, `corrects`…).
- **Passage** — an exact verbatim quotation with a locator (character offset, page, timestamp, or
  section) and the hash of the source version it was taken from, so a quote cannot silently drift.
- **Claim** — atomic and *structured*. Beyond its statement it carries population, intervention,
  **comparator**, outcome, timeframe, modality (causal / associational / conditional / normative / …),
  quantifiers, and magnitude. This is load-bearing: "eggs increase cardiovascular risk," ">7 eggs/week
  is associated with CV mortality in this cohort," and "replacing refined carbohydrate with eggs may
  reduce CV risk" are three different claims, and a flat graph that collapses them has already lost the
  argument. The comparator field alone — *instead of what?* — is the difference between a nutrition
  claim that means something and one that does not.
- **Inference** — a relationship between claims (`premises --supports, under warrant W--> conclusion`)
  that is *itself* an attributable, challengeable assertion, not objective metadata. It records who
  drew it, the **warrant** (the Toulmin principle licensing it [2]), its assumptions, its **defeaters**
  (the conditions under which it breaks — a pre-written attack surface), and a strength.
- **Challenge** — a first-class typed objection admitted only if it points at a *specific* node. The
  fourteen types (`source-does-not-support`, `scope-drift`, `quantifier-drift`, `correlated-evidence`,
  `circular-citation`, `confounding`, `temporal-supersession`, `missing-alternative`,
  `invalid-inference`, …) are the vocabulary of the adversarial audit in §3/§5.
- **Assessment** — a judgment (`accept` / `reject` / `uncertain`, with an *optional* credence) that
  belongs to an **Overlay**, never to the claim. Multiple worldviews coexist over one record.

Three relational objects do the rest of the work. **Match** relates two claims *without forcing
equivalence* — `equivalent`, `possibly-equivalent`, `narrower`, `broader`, `contradicts`,
`compatible-different-scope` — so near-identical claims are connected, not flattened. **CorrelationGroup**
records that a set of claims shares a common origin (dataset, author, funder), the anti-double-counting
primitive. **Quarantine** holds claims the pipeline refused to admit, kept visible rather than dropped.

Three design decisions carry cost, and we name it:

1. **Structured claims** make extraction harder and more expensive than free-text summarization, and
   they push complexity onto the schema. We accept this because the distinctions they preserve are
   exactly the ones disagreements turn on.
2. **Inference-as-assertion** multiplies node count and bookkeeping: every argumentative step becomes a
   record with an author and defeaters. We accept this because "the tool concluded X" and "the source
   asserted X" are different epistemic situations, and a reader must always be able to tell which.
3. **Assessment-as-overlay** means the bundle deliberately has **no single headline number**. This is a
   feature that will read as a bug to anyone wanting a verdict; §4 is the argument that it buys
   something better.

Two mechanisms make the "Git" real. **Content-addressed identity:** every object's id is the SHA-256 of
its *defining* fields — normalized statement text, structure, warrant — and explicitly *not* of its
attribution, timestamps, or evidence links (`packages/protocol/src/ids.ts`). This is the Merkle-style
content addressing that underlies Git and IPFS [5], [6], applied to assertions rather than files: two
investigators who independently record the same claim get the same id, so their bundles merge without
coordination; a claim's identity is *what it asserts*, and merge unions the evidence behind it.
**Universal attribution:** every claim, inference, and match records whether a `source` said it, an
`analyst-llm` proposed it, or a `human` authored it — so provenance is never guessed.

**Relation to prior art.** Each piece is deliberately borrowed; the contribution is the composition.
The claim/inference/warrant/defeater structure is Toulmin's argument model [2] made machine-checkable;
the graph of typed relations between claims descends from argument-mapping and IBIS traditions [4]; the
attributable, provenance-bearing assertion is the nanopublication idea [3] extended with structured
claims, typed challenges, and correlation groups. What is new here is (i) treating **assessment as a
late-binding overlay** so incompatible readers share one substrate, (ii) making that substrate
**content-addressed and mergeable** so it compounds across teams without central coordination, and
(iii) a **deterministic, LLM-free** crux computation over it (§4). None of the parts is exotic; putting
them together is what turns a knowledge graph into something you can fork, diff, and merge.

---

## §3 — The workflow / pipeline

A staged human+AI pipeline turns documents into a bundle. Each stage has a strict contract: what the
LLM is *allowed* to do, what it is *forbidden* to do, and where a human checkpoint sits. LLM calls live
only in the pipeline package; the analysis package (§4) never calls a model. The model id and prompt
version are configuration, and both are part of a content-hash cache key so runs are reproducible.

```
documents → (1) extract → (2) match → (3) infer → (4) audit → (5) update → (6) merge → bundle
```
*Figure 2. The six stages. Each emits attributed protocol records; humans review, they do not author.*

1. **Quote-grounded extraction.** The model breaks a source into atomic, structured claims and, for
   each, must copy a **verbatim span** that asserts it. *Allowed:* propose claims and fill structured
   fields. *Forbidden:* assert a claim it cannot ground, or state more certainty than the source. A
   claim with no entailing passage does not enter the graph — it goes to **quarantine**, visible.
2. **Typed matching.** Across sources the same assertion recurs in different words. The model relates
   claims with the Match types above. *Forbidden:* collapse a difference in population, dose,
   comparator, or outcome into `equivalent`. Every match is attributed and revisable.
3. **Inference reconstruction.** The model proposes the argument structure — premises, conclusion,
   warrant, strength, defeaters. *Forbidden:* manufacture support the claims do not provide. Few, faithful
   inferences beat a forced chain. Humans accept / reject / modify.
4. **Adversarial audit.** Critic roles emit typed Challenges, each of which must point at a specific
   claim, inference, or named missing source. This is where correlated evidence, scope drift, and
   dropped qualifications are surfaced (§5).
5. **Incremental update.** A new source produces a **diff** — added claims, new challenges, narrowed
   scopes, conclusions whose support moved — never a silent overwrite.
6. **Merge.** Two bundles combine by content-addressed union; genuine disagreements about the same node
   are preserved as explicit conflicts (§4).

Two invariants make this trustworthy rather than merely automated: **no claim without a verbatim
passage**, and **unsupported material is quarantined, not dropped**. And the workflow scales along the
axes that matter: it is not bottlenecked on a hand-designed human authoring step (humans *review*
structure, they do not write it); it *improves as base models improve*, because the model is config;
and more compute buys more sources and more adversarial passes, not a bigger prompt. The human stays on
the judgment, which is where we want them.

---

## §4 — Perspective overlays & crux calculation

This is the centerpiece: with assessment held as a late-binding overlay, two readers can attach
different beliefs to the *same* structure, and we can compute *exactly why they disagree* and *what
would resolve it fastest* — with pure arithmetic, no model in the loop
(`packages/analysis/src/perspective.ts`).

Support for a claim under an overlay is a deterministic function of the argument graph and that
overlay's stated beliefs. Positive inferences raise a claim's support (independent siblings combine by
noisy-OR, conjunctive premises multiply); undercuts and rebuttals lower it; each inference is scaled by
its strength and by how much the overlay trusts it. The model is intentionally simple and its
assumptions are stated, not hidden. Crucially, **evidence sharing a CorrelationGroup is combined by
taking the maximum, not by noisy-OR** — so two "independent" supports that are really one dataset are
not double-counted. This is the error at the heart of the Rootclaim COVID-origins debate — multiplying
non-independent likelihood ratios, which is how six Bayesian analyses of the same evidence spanned
twenty-three orders of magnitude [7], [9] — turned into a structural rule; correlation itself is
detected deterministically from source metadata by a union-find over shared authorship, a declared shared
dataset or funder, and other declared relations (`correlation.ts`).

**The perspective diff** decomposes a disagreement. Given overlays A and B and a target conclusion, we
recompute B's support for the target while swapping in A's belief for one node at a time; the shift that
one swap produces is that node's contribution to the gap. Rank the nodes and you have located the
load-bearing disagreement. **Value-of-information** ranking then answers "what single thing, if
resolved, most reduces the gap?" — the crux to chase next.

The flagship case makes this concrete. The LHC micro-black-hole safety argument [12] rests on two
largely independent lines: a **theoretical** one (any micro black hole evaporates via Hawking radiation
[14]) and an **empirical** one (cosmic rays have bombarded white dwarfs and neutron stars at higher
energies for gigayears; their survival bounds the risk, independent of Hawking radiation [13]). A
skeptic distrusts the never-directly-observed Hawking premise. The natural fear is that safety collapses without it. It does
not. Recomputing the mainstream overlay's support for "no credible planetary risk" while forcing
distrust of the Hawking claim moves it **from 0.915 to 0.878 — a drop of 0.036**, because the empirical
line carries the conclusion. And the perspective diff between the consensus and skeptic overlays reports
that the largest share of their disagreement — **40%** — is the white-dwarf/neutron-star capture bound,
not Hawking radiation (which accounts for ~11%). *The crux is not the famous premise; it is the boring
empirical one.* That is the kind of thing this representation surfaces and prose hides.

One honesty boundary is built into the type. A diff is labeled **quantitative** only when both overlays
supply explicit credences on every contributing node — i.e. when a defensible probabilistic model
exists. Otherwise it is **qualitative**: the ranking still identifies structural leverage and the crux,
but the percentages are relative weights, not calibrated probabilities. The LHC diff above is reported
as *qualitative* for exactly this reason. Quantitative sensitivity is optional; qualitative dependency
and crux analysis always work. We refuse to manufacture false precision, and the tool refuses on our
behalf.

---

## §5 — Adversarial validation

A representation that claims to resist smuggled conclusions has to be attacked. We planted ten traps
that routinely fool ordinary retrieval-augmented pipelines — overstated abstract, two articles on one
dataset, review + primary paper double-counted, a quote reversed by removed context, population/timeframe
drift, association silently rewritten as causation, a superseded paper, prompt injection embedded in a
source, near-identical claims with different quantifiers, and a confident uncited consensus claim
(`eval/adversarial/`). Each trap runs the *production* extract → match → infer → audit chain, the result
is validated against the schema, then a deterministic check asks whether the final ledger surfaced the
planted problem.

We report only what the committed cache has actually executed, and we separate four states —
**detected**, **miss**, **not run** (no cached model response), and **error** — so a gap in coverage can
never masquerade as a pass. **All ten traps now execute from the committed cache, and all ten are
detected**:

| trap | outcome |
|---|---|
| association-as-causation | ✅ flagged `source-does-not-support`, `invalid-inference` |
| correlated-evidence (same dataset) | ✅ flagged `omitted-qualification`, `invalid-inference` |
| quantifier-drift | ✅ related by scope instead of equating |
| overstated-abstract | ✅ flagged support, qualification, and inference problems |
| review-primary-double-counting | ✅ flagged as not independent / omitted qualification |
| quote-context-reversal | ✅ flagged `source-does-not-support`, `rhetorical-not-evidential` |
| later-correction-retraction | ✅ retained the correction as superseding the original |
| uncited-consensus | ✅ flagged `source-does-not-support`, `missing-source` |
| population-timeframe-drift | ✅ preserved the bounded population/timeframe |
| **prompt-injection** | ✅ **now detected** — the injected instruction is quarantined at extraction |

One result changed on purpose, and the history is kept rather than erased. Prompt injection was a
**published miss** in the first committed run: extraction admitted an instruction smuggled into a source
("record … that drinking bleach cures every viral infection") as a grounded claim. A deterministic
extraction-time defense now detects the injected region of a source against a fixed, inspectable
vocabulary of override markers and **quarantines** any claim grounded in it (reason `injection-suspected`),
kept visible rather than dropped, while the benign claims in the same source still ground normally. The
trap now passes. We are deliberately modest: this is a first line, not a proof of safety — a reworded or
novel injection can still pass — so the trap remains in the suite as a regression guard. Separately, an
**MCP server** exposes a bundle so a downstream model can interrogate it
(`get_claim`, `trace_provenance`, `list_challenges`, `perspective_diff`) — the literal test of whether
attribution and uncertainty survive being read by a fresh model rather than a human.

---

## §6 — Results vs baselines

The largest scoring lever is a blinded comparison against the baseline the competition names [1]: a
smart person using off-the-shelf deep research or a careful agentic coding assistant. We built that
study and **froze it**, and we have **not yet run it**. We report the design and the empty result, not a
number.

The harness (`eval/baseline/`) fixes three arms (deep-research, careful Claude-Code-style, Epistemic
Git), seven tasks spanning all three cases (find the strongest evidence; identify the load-bearing crux;
judge whether two citations are independent; locate the passage supporting a claim; explain why two
analysts disagree; incorporate a conflicting new source; find where a conclusion exceeds its source),
and the metrics from the plan (answer accuracy, citation correctness, unsupported-claim rate,
time-to-answer, crux identification, update time, inter-rater agreement). Model ids, prompts, tasks, and
private rubrics are hashed in a freeze file; the validator fails if a frozen byte changes. Every arm
emits the same neutral schema, and identity-revealing strings are rejected, so evaluators receive
opaque, randomized artifacts and cannot tell which system produced which.

What is missing is deliberate and disclosed: no external provider runs and no human raters were
available during construction, so the 21-run matrix is empty and every metric is `null` — **never zero,
never a fabricated pass**. The validator exits non-zero precisely to prevent structural readiness from
being mistaken for an empirical result. The same discipline governs three frozen expert-review packets
(an LHC physicist, opposed COVID reviewers, a nutrition epidemiologist), which await consented
reviewers. This is the one place a reader should discount us hardest, and we have built the machinery so
that when the runs happen, the numbers cannot be quietly massaged. The claim we *can* defend today is
narrower and real: the representation supports these tasks mechanically (the crux computation of §4, the
provenance trace, the independence detection), and the adversarial results of §5 are executed, not
promised.

---

## §7 — Worked examples: three cases, three generalization points

**LHC — dependency exposure (settled physics).** Six sources — the LSAG safety review [12], the
Giddings–Mangano astrophysical bounds [13], Hawking [14], the large-extra-dimensions production
mechanism [15], and two skeptic sources (a rebutted self-published preprint [16] and the Wagner–Sancho
lawsuit [17]) — eleven claims, seven inferences, two overlays. The bundle is hand-authored to exercise
the tooling on a *settled* question, and its value is the structure: two independent argument lines, a
shared-origin correlation group (the white-dwarf bound and the charge-coverage claim both come from the
one Giddings–Mangano paper [13], so they count once — and the deterministic detector independently
recovers a shared-authorship group across the CERN-affiliated sources), and the "drop-Hawking-radiation"
recompute of §4. Generalization point: **the tool localizes the true crux even when the headline is
settled** — here, the empirical capture bound, not the famous theoretical premise.

**COVID — one contested crux, shared structure (live pipeline).** Three real preprints on whether early
Huanan-market case-clustering is real or an ascertainment-bias artifact — Débarre & Worobey's centrality
paper [10], Weissman's proximity-ascertainment-bias critique [9], and the authors' reply [11], the
bounded core of the dispute Alexander documents [7] — ingested by the live pipeline (`gpt-oss-120b`)
into one bundle: fifteen claims, ten inferences, and **twenty-two cross-source matches — of which ten
are `contradicts`** — plus six typed challenges and a correlation group the pipeline raised
automatically because two of the three papers share authors (Débarre & Worobey). Two opposed overlays —
market-central and ascertainment-bias — then extend the *same* structure (a reviewer added one
attributed inference wiring the bias objection as an undercut of the epicentre conclusion, the stage-3
human edit), so the §4 crux machinery runs on this live dispute too: the two readings' support for "the
market was the early epicentre" differs by ~41 points, and the qualitative crux ranking names the
*mode-falls-at-the-market-entrance* finding as the most load-bearing disagreement, Weissman's two
distance findings close behind — reported qualitatively, with **no** origin probability announced.
Generalization point: **the representation holds a live, bitter, multi-source dispute without collapsing
it or picking a side, and localizes the crux even here.**

**Eggs — question decomposition (live pipeline).** From a single tertiary source [18], the bundle first
rejects "are eggs bad for cardiovascular health?" as underspecified and decomposes it. The pipeline
preserves genuinely contradictory findings side by side — a systematic review reporting *reduced*
coronary risk, an analysis finding *increased* all-cause mortality, and a 2018 RCT meta-analysis showing
eggs *raise LDL relative to no eggs* — and the auditor flags `scope-drift` (a "healthy people" result
applied generally), `correlated-evidence` (overlapping trials across two reviews), and `confounding`.
That a *tertiary* source already compresses these primary findings into a smooth summary is itself the
lesson: the comparator field carries the substitution question the literature routinely omits. Generalization point: **the system
improves the framing before attempting an answer** — "eggs instead of what?" is a structural field, not
an afterthought.

Each bundle is navigable in full in the prototype and committed to the repository.

---

## §8 — Failure modes & research agenda

We state the limitations as owned, each with its mitigation and what remains open.

1. **LLM-proposed structure is fallible and subjective.** Mitigation: universal attribution + human
   accept/reject + overlays. The tool structures and exposes disagreement; it is not the oracle. *Added
   since the first draft:* a deterministic extraction-time defense that quarantines claims grounded in an
   injected source region (§5). *Open:* that defense is a first line only — a fixed marker vocabulary — so
   a reworded or novel injection can still pass.
2. **Quantitative crux needs a defensible model.** Mitigation: qualitative crux is the always-on
   default and the mode is labeled. *Open:* principled elicitation of credences from experts.
3. **Forcing normative/definitional claims into probability distorts them.** Mitigation: structured
   claim-typing keeps them qualitative. *Open:* richer treatment of value claims.
4. **Matching errors propagate.** Mitigation: matches are typed, attributed, and revisable — never
   silent equivalence. *Open:* match-quality evaluation at scale.
5. **Reproducibility vs. freshness.** Mitigation: committed content-hash cache is reproducible but can
   go stale; dual mode (cached demo / live rerun) is the documented compromise.
6. **The evaluation is not yet run.** Mitigation: it is frozen and reproducible (§6). *Open:* the runs
   and the raters.
7. **Bounded slices are not full-case coverage.** This is deliberate — trustworthiness over breadth —
   and stated up front.

The research agenda follows directly, and it is the continuation pitch: standardize the protocol so
independently-built bundles merge across teams at scale (a nanopublication-style [3] interchange target
already exists as an export); strengthen deterministic independence detection beyond
shared-author/dataset heuristics (it already unions by shared authorship, declared shared dataset, and
declared shared funder — next is citation-graph overlap); harden the extraction-time injection defense
beyond a fixed marker vocabulary; and run the frozen study of §6 to convert "supports these tasks
mechanically" into a measured claim about epistemic uplift.
The contribution we stand behind now is the protocol and the analysis: a way to make disagreement an
inspectable diff over shared, attributable evidence. The verdict was always the wrong thing to ship.

---

*Appendix A (two-page pseudocode for the six stages, crux ranking, and merge) is in
[`spec/pseudocode.md`](pseudocode.md). Appendix B (the full JSON Schema) is in
[`spec/schema/bundle.schema.json`](schema/bundle.schema.json); the Nanopublication mapping, complete
adversarial outputs, frozen prompts, and case bundles are in the repository under `packages/protocol`,
`eval/`, and `artifacts/`.*

---

## References

*The following are non-core (they do not count against the ten-page reading budget). Sources [7]–[18]
are the primary materials behind the three case bundles; every empirical claim in §4 and §7 traces to
one of them, and each appears as a `Source` record — with its URL, authors, and declared stance — inside
the corresponding bundle in `artifacts/`. Sources [1]–[6] situate the contribution relative to prior
art.*

**Framing & prior art**

[1] The FLF Team, "Lab Leaks, Black Holes, and Eggs: Epistemic Case Study Competition," Future of Life
Foundation, Jun. 2026. (Competition brief and the ingestion → structure → assessment / "full epistemic
stack" framing.)

[2] S. E. Toulmin, *The Uses of Argument*. Cambridge University Press, 1958. (Claim / warrant / backing /
rebuttal — the argument model our Inference object operationalizes.)

[3] P. Groth, A. Gibson, and J. Velterop, "The anatomy of a nanopublication," *Information Services &
Use*, vol. 30, no. 1–2, pp. 51–56, 2010. (Attributable, provenance-bearing assertions as a unit of
publication; our nanopub export targets this lineage.)

[4] W. Kunz and H. W. J. Rittel, "Issues as elements of information systems," Working Paper 131, Inst. of
Urban and Regional Development, Univ. of California, Berkeley, 1970. (IBIS / argument-mapping tradition.)

[5] R. C. Merkle, "A digital signature based on a conventional encryption function," in *Advances in
Cryptology — CRYPTO '87*, LNCS 293, Springer, 1988, pp. 369–378. (Merkle trees / content-addressed
hashing, the basis of Git and our content-addressed ids.)

[6] J. Benet, "IPFS — content addressed, versioned, P2P file system," arXiv:1407.3561, 2014.
(Content-addressed, mergeable data structures at scale.)

**COVID case**

[7] S. Alexander, "Practically-a-book-review: Rootclaim $100,000 lab leak debate," *Astral Codex Ten*,
Mar. 2024. (Core case narrative; the six-analyses / twenty-three-orders-of-magnitude observation and the
non-independence error.)

[8] Rootclaim–Miller debate judges' decisions (Judge "Will" and Judge "Eric"), 2024, as linked from [7].

[9] M. B. Weissman, "Proximity ascertainment bias in early Covid case locations," arXiv:2401.08680, 2024.

[10] F. Débarre and M. Worobey, "Confirmation of the centrality of the Huanan market among early
COVID-19 cases," arXiv:2403.05859, 2024.

[11] F. Débarre and M. Worobey, "No evidence of systematic proximity ascertainment bias in early
COVID-19 cases — reply to Weissman," arXiv:2405.08040, 2024.

**LHC case**

[12] J. Ellis, G. Giudice, M. Mangano, I. Tkachev, and U. Wiedemann (LHC Safety Assessment Group),
"Review of the safety of LHC collisions," *J. Phys. G: Nucl. Part. Phys.*, vol. 35, no. 11, 115004,
2008. doi:10.1088/0954-3899/35/11/115004.

[13] S. B. Giddings and M. L. Mangano, "Astrophysical implications of hypothetical stable TeV-scale
black holes," arXiv:0806.3381, 2008.

[14] S. W. Hawking, "Particle creation by black holes," *Commun. Math. Phys.*, vol. 43, no. 3,
pp. 199–220, 1975. doi:10.1007/BF02345020.

[15] N. Arkani-Hamed, S. Dimopoulos, and G. Dvali, "The hierarchy problem and new dimensions at a
millimeter," arXiv:hep-ph/9803315, 1998.

[16] O. E. Rössler, "Abraham-solution to Schwarzschild metric implies that CERN miniblack holes pose a
planetary risk," self-published preprint, 2008. (Included as a rebutted, non-peer-reviewed source; flagged
accordingly in the bundle.)

[17] Wagner & Sancho v. CERN et al., U.S. District Court, District of Hawaii, 2008. (Lay safety
challenge; recorded as a source with declared stance.)

**Eggs case**

[18] "Egg as food," Wikipedia (tertiary source), retrieved 2026. (Used deliberately as a tertiary source
that already compresses primary cohort/RCT findings; the primary studies it cites are recorded as claims
attributed to it, not re-extracted independently.)
