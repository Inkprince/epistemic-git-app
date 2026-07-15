# Epistemic Git

A portable, versioned, mergeable **evidence ledger**. Every claim, inference, objection, and
assessment is attributable, inspectable, independently challengeable, mergeable across investigators,
and traceable to an exact source passage.

> **People with incompatible beliefs should be able to share the same evidence substrate without being
> forced to share conclusions.**

Entry for the Future of Life Foundation "Lab Leaks, Black Holes, and Eggs" epistemic case-study
competition. See [plan.md](plan.md) for the full strategy and the per-deliverable plans
([essay](plan-essay.md), [tool](plan-tool.md), [website](plan-website.md), [video](plan-video.md)).

## Setup (no API key required)

Requires only Node ≥ 20 (npm ships with it — no global installs, no Docker, no Python).

```bash
npm install
npm run dev          # launch the ledger explorer (opens the LHC case) — no API key needed
npm run demo:lhc     # deterministic proof-of-thesis walkthrough on the LHC case (console)
npm test             # protocol + analysis unit/integration tests
npm run smoke:tool   # headless render check of the explorer
```

The pre-built case bundles in `artifacts/` let everything run offline. The extraction pipeline
(needs an API key) is opt-in and never required to explore or reproduce results.

## What's here so far

| Package | Role |
|---|---|
| `packages/protocol` | The durable contribution: the six-object ledger schema (Source → Passage → Claim → Inference → Challenge → Assessment), content-addressed ids, validation invariants, JSONL IO, JSON Schema + Nanopublication export. |
| `packages/analysis` | Deterministic, **LLM-free** reasoning: argument dependency graph, weighted support propagation, drop-node recompute, perspective-diff disagreement decomposition, value-of-information, correlation-aware combination, and content-addressed merge. |
| `packages/llm` | Provider-agnostic LLM adapter (default **Cerebras `gpt-oss-120b`**), a content-hash cache for reproducible dual-mode runs, and a strict structured-output helper. The **only** package that reads API keys or touches the network. |
| `packages/pipeline` | The full pipeline + `egit` CLI (`extract` / `match` / `infer` / `audit` / `build` / `add-source` / `merge` / `verify` / `export-nanopub`). **Extract** → quote-grounded claims (admitted only if the quote is a verbatim substring of the source, else **quarantined**). **Match** → typed relations *without forced equivalence*. **Infer** → argument structure. **Audit** → typed node-specific `Challenge`s. **Correlate** → derives `CorrelationGroup`s from shared authors/dataset (the "not independent" detector). `add-source` incrementally folds a new source into a bundle and prints a diff; `verify`/`export-nanopub`/`merge` are thin wrappers. LLM calls happen only here. |
| `packages/mcp-server` | A read-only **MCP server** over a bundle (`overview`, `get_claim`, `trace_provenance`, `list_challenges`, `list_matches`, `support`, `perspective_diff`, `list_cruxes`). A downstream model can attach and interrogate the ledger, but every answer is deterministic analysis grounded in the ledger — never a fresh opinion. The "withstands downstream-model interrogation" surface. |
| `apps/tool` | The interrogable ledger explorer (Vite + React), running the analysis engine **and the full protocol validator in the browser** (content addressing uses a vendored isomorphic SHA-256). Two-screen dashboard (Overview + Case Detail) with: a **visual argument graph** (Cytoscape, lazy-loaded, nodes coloured by live support, click-popovers), live support gauge, distrust-any-claim/source recompute, perspective-diff with the top crux, provenance inspection, **matches / challenges / quarantine** tabs (always present, with empty-state explainers), and the Git verbs: **Import** any exported bundle (validated client-side, persisted in IndexedDB), **Merge…** any two loaded ledgers (conflicts rendered side-by-side, never auto-resolved), **branches** (named scenarios: perspective + distrust set, shareable via URL), a per-case **History** log with content-addressed **bundle diff**, **perspective authoring** (real content-hash `Overlay`/`Assessment` nodes built in the browser), full **deep links** (`#/case/lhc?tab=…&sel=…&s=…`), and dev-only `/api/build` (pipeline on pasted text) + `/api/commit` (persist a bundle as a committed case). Mobile drawer nav, keyboard-operable rows, focus-trapped modals. |
| `artifacts/cases.json` | The case manifest — committing a bundle (UI or by hand) registers it here; the app discovers cases from it at build time. |
| `artifacts/{lhc,covid,eggs}.jsonl` | The three case bundles (`.json` twins are the browser copies; `lhc-addendum` is the merge-demo companion). |
| `cases/lhc.ts`, `cases/covid.ts` | Authoring sources. `npm run author:lhc` / `author:covid` regenerate them. |
| `scripts/demo-lhc.ts` | The proof walkthrough rendered above. |

### The flagship interaction, today

`npm run demo:lhc` distrusts Hawking radiation and shows the safety conclusion barely moves
(91.5% → 87.8%) because the empirical cosmic-ray / white-dwarf line does not depend on it — then
decomposes exactly where the mainstream and skeptic perspectives disagree, and names the single crux
(the white-dwarf accretion bound) whose resolution would most reduce that disagreement. Every number is
deterministic arithmetic over the ledger; no model is in the loop.

## Interrogate a bundle from a downstream model (MCP)

```bash
npm run mcp -- artifacts/covid.jsonl      # serves the bundle over MCP on stdio
```

Attach it to Claude Code (or any MCP client) to let a model trace provenance, list challenges, and
decompose disagreement — verified end-to-end over stdio JSON-RPC:

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
  perspectives supply explicit credences; otherwise `qualitative` — the percentages are relative
  structural weight, not calibrated probabilities, and the UI says so.
- **Provenance is mandatory.** A source-grounded claim cannot exist without a verbatim passage.
- **Attribution everywhere.** Every assertion records whether a source, an AI, or a human said it.
- **Trust is late-binding.** Assessments are per-perspective overlays, never baked into a claim.

## The extraction pipeline (Cerebras)

```bash
cp .env.example .env          # add CEREBRAS_API_KEY for --live runs (cached mode needs no key)
# full chain: extract → infer → audit, from one source into a ledger bundle
npm run extract -- ...        # or drive the CLI directly:
npx tsx packages/pipeline/src/cli.ts build \
  --in path/to/source.txt --title "Source title" --type paper --case eggs --live
```

The pipeline is **model-agnostic** (model id is config; default `gpt-oss-120b`) and **dual-mode**: cached
mode replays the committed `artifacts/.cache/` with no key or network; `--live` calls Cerebras only on a
cache miss and records the result, so a demo stays reproducible regardless. Verified live end-to-end: a
real run extracted 5 quote-grounded claims, reconstructed a 5-inference argument with a calibrated
conclusion, and generated 5 node-specific adversarial challenges — all replaying from cache with no key.

## Status

Verified (**66 tests across all 5 packages + the app**, all green, run in CI on every push/PR):
`protocol` (incl. NIST vectors + randomized node-crypto cross-checks for the vendored SHA-256, and a
regression asserting the committed artifacts' content-hash ids never drift), `analysis` (incl.
`diffBundles`), `llm` (rate-limit backoff, per-request timeouts, Retry-After), all pipeline stages
(chunked extraction with **tolerant quote grounding** that still stores only source bytes), the app's
routing/scenario codecs, stats aggregations, and an SSR smoke render of both screens. The **entire
extract → match → infer → audit → correlate chain is live-verified on Cerebras `gpt-oss-120b`**; every
stage replays from the committed cache with no key.

**The Git verbs are real in the product:** export → **import** (browser-validated, persisted) →
**merge** any two ledgers (conflicts preserved and rendered) → **branch** (named belief-state scenarios,
URL-shareable) → **history + diff** (content-addressed lineage log) → **commit** (dev: persists and
registers a new case). Perspectives can be **authored in the UI** as real content-addressed overlay
nodes that survive export/import round-trips.

**All three competition case studies now exist, two pipeline-generated:**
- **LHC** — hand-authored flagship (rich perspectives → perspective diff).
- **Eggs** — pipeline-generated from a real source: quote-grounded claims, a `contradicts` between studies
  with opposite findings, a calibrated conclusion, and adversarial challenges (incl. a `correlated-evidence`
  double-counting flag).
- **COVID (Huanan-market crux)** — pipeline-generated from **three real, contested arXiv papers**
  (Débarre & Worobey ×2 vs Weissman). One combined ledger: 14 grounded claims, **22 cross-source matches**
  (incl. `contradicts` between the opposing camps), 10 inferences, 6 challenges (the audit caught the core
  error — *"conflates statistical non-rejection with causal attribution"*), and **1 quarantined** rhetorical
  claim that lacked a verbatim basis. Neutral-prior support of the "market was the epicentre" conclusion is
  a faithfully-contested 57%.

Remaining (listed, not started): a blinded/baseline evaluation study, the submission website
(`apps/site`), and surfacing `eval/results.md` inside the product.
