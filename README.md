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
| `apps/tool` | The interrogable ledger explorer (Vite + React), running the analysis engine **in the browser**: a **visual argument graph** (Cytoscape, nodes coloured by live support), live support gauge, distrust-any-claim **and distrust-any-source** recompute, argument lines (active/collapsed), perspective-diff with the top crux, inference & claim inspection, a provenance drawer (claim → verbatim passage → source), **matches / challenges / quarantine** panels, a **merge view** (two same-case bundles → conflicts preserved), a **case switcher** (LHC · COVID · Eggs), and a dev-only **live runner** (`/api/build`) that runs the pipeline server-side on pasted source text with the key kept in `.env`. |
| `artifacts/lhc.jsonl` | Hand-authored reference bundle for the LHC micro-black-hole safety case (`lhc.json` is the browser copy). |
| `cases/lhc.ts` | Authoring source for the LHC bundle. `npm run author:lhc` regenerates it. |
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

Verified (32 tests across 4 packages, all green): `protocol` (incl. the `Match` relation), `analysis`,
`llm` (with rate-limit backoff), and all four `pipeline` stages (extraction now **chunked** for large
sources). The **entire extract → match → infer → audit chain is live-verified on Cerebras `gpt-oss-120b`**;
every stage replays from the committed cache with no key.

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

The explorer has a **case switcher** (LHC · COVID · Eggs) and renders the argument graph, matches,
challenges, and quarantine. Next on the tool: the MCP interrogation server, then hosting + visual QA.
