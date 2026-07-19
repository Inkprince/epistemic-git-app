# Epistemic Git

A portable, versioned, mergeable **evidence ledger**. Every claim, inference, objection, and
assessment is attributable, inspectable, independently challengeable, mergeable across investigators,
and traceable to an exact source passage.

> **People with incompatible beliefs should be able to share the same evidence substrate without being
> forced to share conclusions.**

Entry for the Future of Life Foundation "Lab Leaks, Black Holes, and Eggs" epistemic case-study
competition. The designed white paper is [`spec/introducing-epistemic-git.html`](spec/introducing-epistemic-git.html).

## Setup (no API key required)

Requires only Node ≥ 20 (npm ships with it, no global installs, no Docker, no Python).

```bash
npm install
npm run dev          # launch the ledger explorer (opens the LHC case) no API key needed
npm run demo:lhc     # deterministic proof-of-thesis walkthrough on the LHC case (console)
npm run demo:covid   # the same crux machinery on the CONTESTED COVID case (qualitative)
npm run demo:eggs    # and on the everyday nutrition case, crux = the all-cause-mortality weighting
npm run demo:merge   # compounding at scale: two independent investigations merge into one ledger
npm test             # protocol + analysis unit/integration tests
npm run smoke:tool   # headless render check of the explorer
```

The pre-built case bundles in `artifacts/` let everything run offline. The extraction pipeline
(needs an API key) is opt-in and never required to explore or reproduce results.

## What's here so far

### Official white paper

The paper is [`spec/introducing-epistemic-git.html`](spec/introducing-epistemic-git.html), a
self-contained, print-ready document (open in a browser; print to PDF for the ten-page limit).
Its figures are the real app screenshots in [`spec/img/`](spec/img/).

| Package | Role |
|---|---|
| `packages/protocol` | The durable contribution: the six-object ledger schema (Source → Passage → Claim → Inference → Challenge → Assessment), content-addressed ids, validation invariants, JSONL IO, JSON Schema + Nanopublication export. |
| `packages/analysis` | Deterministic, **LLM-free** reasoning: argument dependency graph, weighted support propagation, drop-node recompute, perspective-diff disagreement decomposition, value-of-information, correlation-aware combination, and content-addressed merge. |
| `packages/llm` | Provider-agnostic LLM adapter (default **Groq `gpt-oss-120b`**), a content-hash cache for reproducible dual-mode runs, and a strict structured-output helper. The **only** package that reads API keys or touches the network. |
| `packages/pipeline` | The full pipeline + `egit` CLI (`extract` / `match` / `infer` / `audit` / `build` / `add-source` / `discover` / `merge` / `verify` / `export-nanopub`). `--in`/`--source-in` accept a local file or a URL, retrieved by a pluggable **scraper** (native fetch, or Firecrawl for JS/markdown), content-hash cached. `discover` proposes candidate sources (Firecrawl search) for the operator to review, it admits nothing. **Extract** → quote-grounded claims (admitted only if the quote is a verbatim substring of the source, else **quarantined**). **Match** → typed relations *without forced equivalence*. **Infer** → argument structure. **Audit** → typed node-specific `Challenge`s. **Correlate** → derives `CorrelationGroup`s from shared authors/dataset (the "not independent" detector). `add-source` incrementally folds a new source into a bundle and prints a diff; `verify`/`export-nanopub`/`merge` are thin wrappers. LLM calls happen only here. |
| `packages/mcp-server` | A read-only **MCP server** over a bundle (`overview`, `get_claim`, `trace_provenance`, `list_challenges`, `list_matches`, `support`, `perspective_diff`, `list_cruxes`). A downstream model can attach and interrogate the ledger, but every answer is deterministic analysis grounded in the ledger, never a fresh opinion. The "withstands downstream-model interrogation" surface. |
| `apps/tool` | The interrogable ledger explorer (Vite + React), running the analysis engine **and the full protocol validator in the browser** (content addressing uses a vendored isomorphic SHA-256). Two-screen dashboard (Overview + Case Detail) with: a **grounded "ask this case" box** (a deterministic, LLM-free router that answers only from the ledger (support, cruxes, provenance, challenges, correlation, what's-missing) and visibly refuses anything it can't ground, so it cannot hallucinate), a **visual argument graph** (Cytoscape, lazy-loaded, nodes coloured by live support, click-popovers), live support gauge, distrust-any-claim/source recompute, perspective-diff with the top crux, provenance inspection, **challenges / connections / excluded** tabs (always present, with empty-state explainers), and the Git verbs: **Import** any exported bundle (validated client-side, persisted in IndexedDB), **Merge…** any two loaded ledgers (conflicts rendered side-by-side, never auto-resolved), **scenarios** (named what-ifs: perspective + distrust set, shareable via URL), a per-case **History** log with content-addressed **bundle diff**, **perspective authoring** (real content-hash `Overlay`/`Assessment` nodes built in the browser), full **deep links** (`#/case/lhc?tab=…&sel=…&s=…`), and dev-only `/api/build` (pipeline on pasted text) + `/api/commit` (persist a bundle as a committed case). Mobile drawer nav, keyboard-operable rows, focus-trapped modals. |
| `artifacts/cases.json` | The case manifest, committing a bundle (UI or by hand) registers it here; the app discovers cases from it at build time. |
| `artifacts/{lhc,covid,eggs}.jsonl` | The three case bundles (`.json` twins are the browser copies; `lhc-addendum` is the merge-demo companion). |
| `eval/baseline` | Frozen three-arm baseline study: seven blinded tasks, neutral artifact contract, private arm mapping, accuracy/citation/support/time/crux/update scoring, and chance-corrected inter-rater agreement. External runs and human ratings are still pending. |
| `eval/adversarial` | Ten planted traps with full production-pipeline execution, deterministic detection checks, bundle validation, and honest detected/miss/not-run/error reporting. |
| `eval/review` | Grounded physicist, opposed COVID, and nutrition/epidemiology review packets; consent/conflict protocol; record schemas; and criticism-to-artifact change tracking. Human reviews are still pending. |
| `cases/lhc.ts`, `cases/covid.ts` | Authoring sources. `npm run author:lhc` / `author:covid` regenerate them. |
| `scripts/demo-lhc.ts` | The proof walkthrough rendered above. |

### The flagship interaction, today

`npm run demo:lhc` distrusts Hawking radiation and shows the safety conclusion barely moves
(91.5% → 87.8%) because the empirical cosmic-ray / white-dwarf line does not depend on it, then
decomposes exactly where the mainstream and skeptic perspectives disagree, and names the single crux
(the white-dwarf accretion bound) whose resolution would most reduce that disagreement. Every number is
deterministic arithmetic over the ledger; no model is in the loop.

## Interrogate a bundle from a downstream model (MCP)

```bash
npm run mcp -- artifacts/covid.jsonl      # serves the bundle over MCP on stdio
```

Attach it to Claude Code (or any MCP client) to let a model trace provenance, list challenges, and
decompose disagreement, verified end-to-end over stdio JSON-RPC:

```json
{
  "mcpServers": {
    "epistemic-git": {
      "command": "npx",
      "args": ["tsx", "packages/mcp-server/src/server.ts", "artifacts/covid.jsonl"]
    }
  }
}
```

## Design invariants

- **Separate extraction from judgment.** LLMs (in the pipeline) only *propose* attributed structure;
  all scoring is deterministic math in `packages/analysis`. This invariant is **enforced by a test**
  (`packages/analysis/test/purity.test.ts`): the analysis engine and the browser app never import the
  LLM adapter or Node built-ins.
- **Never fabricate precision.** The perspective-diff reports `quantitative` mode only when both
  perspectives supply explicit credences; otherwise `qualitative`, the percentages are relative
  structural weight, not calibrated probabilities, and the UI says so.
- **Provenance is mandatory.** A source-grounded claim cannot exist without a verbatim passage.
- **Attribution everywhere.** Every assertion records whether a source, an AI, or a human said it.
- **Trust is late-binding.** Assessments are per-perspective overlays, never baked into a claim.

## The extraction pipeline (Groq)

```bash
cp .env.example .env          # add GROQ_API_KEY for --live runs (cached mode needs no key)
# full chain: extract → infer → audit, from one source into a ledger bundle
npm run extract -- ...        # or drive the CLI directly:
npx tsx packages/pipeline/src/cli.ts build \
  --in path/to/source.txt --title "Source title" --type paper --case eggs --live
# --in also accepts an http(s) URL, the page is fetched, reduced to readable text, and its
# URL recorded as the source link (HTML/plain-text only; --url overrides the recorded link):
npx tsx packages/pipeline/src/cli.ts build \
  --in https://arxiv.org/abs/2403.05859 --title "Débarre & Worobey" --type paper --case covid --live
```

Fetching automates retrieval of a source **you name**, the operator still chooses which document
enters the ledger; the pipeline never searches for, ranks, or judges sources on its own. A fetched
page is only as reproducible as the page itself; once extracted, the content-hash cache replays offline.

`--scraper native` (default, no key) reduces HTML with a dependency-free reducer; `--scraper firecrawl`
uses [Firecrawl](https://firecrawl.dev) to render JS-heavy pages and PDFs into clean markdown (needs
`FIRECRAWL_API_KEY` + `--live`; `auto` falls back to native on failure). Both cache by content hash.

```bash
# Source DISCOVERY (opt-in, Firecrawl): propose candidate sources for a topic, admits NOTHING.
npx tsx packages/pipeline/src/cli.ts discover --query "huanan market covid origin ascertainment bias" --live
# You review the ranked candidates, then admit the ones you trust, one at a time:
npx tsx packages/pipeline/src/cli.ts add-source --in artifacts/covid.jsonl --source-in <url> --title "…" --live
```

`discover` *proposes* sources with the query and rank that surfaced them; it never folds anything into a
ledger. Admission stays an explicit, auditable human step (`add-source`) so search assists curation
without becoming a hidden authority over what counts as evidence.

The pipeline is **model-agnostic** (model id is config; default `gpt-oss-120b` on Groq) and **dual-mode**: cached
mode replays the committed `artifacts/.cache/` with no key or network; `--live` calls Groq only on a
cache miss and records the result, so a demo stays reproducible regardless. Verified live end-to-end: a
real run extracted 5 quote-grounded claims, reconstructed a 5-inference argument with a calibrated
conclusion, and generated 5 node-specific adversarial challenges, all replaying from cache with no key.

## Evaluation package

The executable study design now exists, but the repository does **not** claim epistemic uplift yet:

```bash
npm run eval:adversarial  # cached replay; publishes misses and unavailable cache entries
npm run eval:baseline     # readiness check; exits 2 until all 21 external runs are imported
npm run eval:review       # validates review packets and reports human recruitment status
```

- `eval/baseline/config/` freezes the three systems, exact model IDs/settings, prompts, seven tasks,
  rubrics, blinding policy, and requested metrics. The CLI renders private run packets, rejects partial or
  identity-leaking imports, prepares keyed opaque evaluator packets, and scores imported human records.
  With no OpenAI, Anthropic, or Groq credentials in this environment, all 21 model/task runs and all
  human ratings remain explicitly unobserved.
- `eval/adversarial/` contains all ten planned traps, and **all ten now replay from the committed cache
  and are detected**. Prompt injection was a published miss in the first run (extraction admitted the
  injected instruction); a deterministic extraction-time defense now quarantines claims grounded in an
  injected source region (`injection-suspected`), and the miss-to-detected history is kept on the record.
  The defense is a first line (a fixed marker vocabulary), not a proof of safety.
- `eval/review/` provides content-addressed case questions for an LHC physicist, two opposed COVID
  reviewers, and a nutrition scientist/epidemiologist. Completed review and artifact-change logs remain
  empty until real reviewers consent and respond.

See [`eval/results.md`](eval/results.md) for the current evidence-status ledger and each evaluation
subdirectory for execution instructions.

## Status

Verified (**81 tests across all packages, the app, and evaluation tooling**, all green):
`protocol` (incl. NIST vectors + randomized node-crypto cross-checks for the vendored SHA-256, and a
regression asserting the committed artifacts' content-hash ids never drift), `analysis` (incl.
`diffBundles`), `llm` (rate-limit backoff, per-request timeouts, Retry-After), all pipeline stages
(chunked extraction with **tolerant quote grounding** that still stores only source bytes), the app's
routing/scenario codecs, stats aggregations, and an SSR smoke render of both screens. The **entire
extract → match → infer → audit → correlate chain is live-verified on Groq `gpt-oss-120b`**; every
stage replays from the committed cache with no key.

**The Git verbs are real in the product:** export → **import** (browser-validated, persisted) →
**merge** any two ledgers (conflicts preserved and rendered) → **branch** (named belief-state scenarios,
URL-shareable) → **history + diff** (content-addressed lineage log) → **commit** (dev: persists and
registers a new case). Perspectives can be **authored in the UI** as real content-addressed overlay
nodes that survive export/import round-trips.

**All three competition case studies now exist, two pipeline-generated:**
- **LHC**, hand-authored flagship (rich perspectives → perspective diff).
- **Eggs**, pipeline-generated from a real source: quote-grounded claims, a `contradicts` between studies
  with opposite findings, a calibrated conclusion, and adversarial challenges (incl. a `correlated-evidence`
  double-counting flag).
- **COVID (Huanan-market crux)**, pipeline-generated from **three real, contested arXiv papers**
  (Débarre & Worobey ×2 vs Weissman). One combined ledger: 14 grounded claims, **22 cross-source matches**
  (incl. `contradicts` between the opposing camps), 10 inferences, 6 challenges (the audit caught the core
  error, *"conflates statistical non-rejection with causal attribution"*), and **1 quarantined** rhetorical
  claim that lacked a verbatim basis. **Two opposed perspective overlays** (market-central vs
  ascertainment-bias) now sit over the shared structure, so the **qualitative perspective-diff** runs on
  this live dispute: the two readings support "the market was the early epicentre" at a **~41-point gap**,
  and the deterministic crux ranking names the *"mode falls at the market entrance"* finding as the single
  most load-bearing disagreement, with Weissman's two distance findings close behind. No origin probability
  is announced (the mode is qualitative on purpose); neutral-prior support of the conclusion is a
  faithfully-contested 31%.

Remaining external work is tracked rather than represented as complete: execute the frozen baseline
matrix with the named provider models, collect blinded human ratings and expert/opposed reviews, and run
the five uncached adversarial traps live. Per the current scope, the essay, video, and submission website
remain deferred.
