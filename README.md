# Epistemic Git

A portable, versioned, mergeable **evidence ledger**. Every claim, inference, objection, and
assessment is attributable, inspectable, independently challengeable, mergeable across investigators,
and traceable back to an exact source passage.

> **People with incompatible beliefs should be able to share the same evidence, without being forced
> to share conclusions.**

Entry for the Future of Life Foundation "Lab Leaks, Black Holes, and Eggs" epistemic case-study
competition. The designed white paper is
[`spec/introducing-epistemic-git.html`](spec/introducing-epistemic-git.html) (open it in a browser;
print to PDF for the ten-page limit).

## What it does, in one breath

You feed it sources. It pulls out each claim with the exact quote that backs it, links claims that
agree or contradict across sources, reconstructs the argument, and flags weak spots (confounding,
double-counted evidence, unsupported leaps). Then it scores how well the conclusion holds up, lets you
distrust any claim and watch the answer move, and shows exactly where two worldviews disagree, all with
plain arithmetic, no model guessing the numbers.

## Quick start (no API key)

You only need **Node ≥ 20**. No global installs, no Docker, no Python.

```bash
npm install
npm run dev          # open the explorer in your browser (starts on the LHC case)
npm run demo:lhc     # the flagship walkthrough, in the console
npm run demo:covid   # the same machinery on the contested COVID-origin case
npm run demo:eggs    # and on the everyday eggs-and-cholesterol case
npm test             # run the test suite
```

Three cases ship pre-built in `artifacts/`, so everything above runs **offline with no API key**.

## Build your own case (this is the part that needs API keys)

Everything above just *explores* cases we already built. To **build a new case from your own
sources**, the pipeline has to call an LLM to read the text, so it needs an API key.

There are two ways to do it, and both need a key:

- **In the app:** run `npm run dev`, open the "Build a case" panel, and paste your source text.
- **On the command line:** use the `egit` pipeline (examples below).

**Set up your key once:**

```bash
cp .env.example .env      # then open .env and paste in your keys
```

| Key | Needed for | Where to get it |
|---|---|---|
| `GROQ_API_KEY` | **Required** to build any case (the LLM that reads your sources) | https://console.groq.com |
| `FIRECRAWL_API_KEY` | *Optional*, only if you build from a URL that needs JS rendering | https://firecrawl.dev |

**Command-line examples:**

```bash
# Build a case from a local text file:
npx tsx packages/pipeline/src/cli.ts build \
  --in path/to/source.txt --title "Source title" --type paper --case eggs --live

# --in also takes a URL: the page is fetched, cleaned to text, and recorded as the source:
npx tsx packages/pipeline/src/cli.ts build \
  --in https://arxiv.org/abs/2403.05859 --title "Débarre & Worobey" --type paper --case covid --live
```

You always name the source; the pipeline never searches for or picks sources on its own. Once a source
has been processed, its result is cached, so re-running is free and works offline.

Want help finding sources? `discover` proposes candidates for a topic but admits **nothing** on its
own, you review the list and add the ones you trust, one at a time:

```bash
npx tsx packages/pipeline/src/cli.ts discover --query "huanan market covid origin" --live
npx tsx packages/pipeline/src/cli.ts add-source --in artifacts/covid.jsonl --source-in <url> --title "…" --live
```

## The one rule that makes this work

**The AI proposes; math decides.** The LLM only ever *extracts* structure from text (claims, quotes,
links, objections). Every number, every score, every "how much does the conclusion move" is plain
deterministic arithmetic, no model in the loop. A test (`packages/analysis/test/purity.test.ts`)
enforces this: the scoring engine literally cannot import the LLM.

The other invariants that follow from it:

- **No quote, no claim.** A source-grounded claim can't exist without a verbatim passage.
- **Everything is attributed.** Every assertion records whether a source, an AI, or a human said it.
- **Trust is your choice.** Judgments live in per-perspective overlays, never baked into a claim.
- **No fake precision.** Percentages are calibrated probabilities only when the inputs are; otherwise
  they're clearly labelled as relative structural weight.

## What's in the repo

| Path | What it is |
|---|---|
| `packages/protocol` | The ledger format: the six-object schema (Source → Passage → Claim → Inference → Challenge → Assessment), content-addressed ids, validation, JSONL/JSON-Schema/Nanopublication export. |
| `packages/analysis` | The **LLM-free** reasoning engine: support scoring, distrust-and-recompute, perspective-diff, crux ranking, correlation-aware combination, and merge. |
| `packages/llm` | The provider-agnostic LLM adapter (default **Groq `gpt-oss-120b`**). The **only** package that reads API keys or touches the network. |
| `packages/pipeline` | The `egit` pipeline and CLI: extract → match → infer → audit → correlate. This is what building a case runs. |
| `packages/mcp-server` | A read-only **MCP server** over a bundle, so a downstream model (e.g. Claude) can interrogate a ledger and only ever get grounded, deterministic answers. |
| `apps/tool` | The browser explorer (Vite + React): argument graph, support gauge, distrust-any-claim, perspective-diff, import/merge/branch/history, and the "Build a case" panel. |
| `artifacts/` | The three pre-built case bundles (`lhc`, `covid`, `eggs`) and the case manifest. |
| `eval/` | The evaluation package: baseline study design, ten adversarial traps, and expert-review packets. |
| `cases/`, `scripts/` | Authoring scripts for the built-in cases and the demo walkthroughs. |

## Interrogate a case from Claude (or any MCP client)

```bash
npm run mcp -- artifacts/covid.jsonl      # serves the bundle over MCP on stdio
```

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

The model can trace provenance, list challenges, and decompose disagreement, but every answer is
deterministic analysis grounded in the ledger, never a fresh opinion.

## The three cases

- **LHC** (hand-authored flagship): distrust Hawking radiation and the safety conclusion barely moves
  (91.5% → 87.8%), because the empirical cosmic-ray / white-dwarf line doesn't depend on it. The tool
  then names the single crux whose resolution would most reduce the mainstream-vs-skeptic disagreement.
- **Eggs** (pipeline-generated from a real source): quote-grounded claims, a `contradicts` between
  studies with opposite findings, and a `correlated-evidence` flag catching double-counted evidence.
- **COVID / Huanan market** (pipeline-generated from three real, contested arXiv papers): one ledger
  with 14 grounded claims and 22 cross-source matches; the audit caught the core error (*"conflates
  statistical non-rejection with causal attribution"*), and two opposed perspectives disagree on "the
  market was the early epicentre" by a ~41-point gap. No origin probability is announced on purpose.

## Status and honesty

Verified today: **the full test suite is green**, and the entire extract → match → infer → audit →
correlate chain is **live-verified on Groq `gpt-oss-120b`**, with every stage replaying from the
committed cache with no key. The Git verbs (export → import → merge → branch → history/diff → commit)
are real and working in the app.

What we do **not** claim yet: measured epistemic uplift. The evaluation package is fully designed and
executable, but the external human runs, expert reviews, and live adversarial traps are still pending,
and the repo says so rather than pretending otherwise. See [`eval/results.md`](eval/results.md) for the
current evidence-status ledger.
