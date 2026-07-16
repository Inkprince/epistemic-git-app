# Evaluation status

This is an evidence-status ledger, not a claim that evaluation is complete. Generated adversarial details
live in [`adversarial/out/results.md`](adversarial/out/results.md); frozen baseline and review protocols
live in their respective directories.

## Current coverage

| evaluation | implemented | observed result | remaining dependency |
|---|---|---|---|
| Deep-research baseline | frozen model/settings, prompt, 7 tasks, neutral output schema, import validation | none | 7 external provider runs |
| Careful Claude-Code baseline | frozen model/settings, prompt, 7 tasks, neutral output schema, import validation | none | 7 external provider runs |
| Epistemic Git arm | frozen model/pipeline version, prompt, 7 tasks, neutral output schema, import validation | none | 7 external pipeline runs |
| Blinded evaluators | opaque keyed artifact IDs/order, response schema, private arm map | none | participants and ≥2 raters per response |
| Requested metrics | accuracy, citation correctness, unsupported-claim rate, answer time, crux identification, update time, inter-rater agreement | scoring code unit-tested; no human observations | completed blinded records |
| Adversarial suite | all 10 planned traps and full extract → match → infer → audit runner | 4 detected, 1 miss, 5 not run | live cache recording for 5 new traps |
| LHC expert review | physicist packet, grounded targets, consent/conflict and change protocol | none | ≥1 qualified physicist |
| COVID opposed review | identical neutral packet for opposed prior stances | none | ≥1 reviewer from each specified stance |
| Eggs expert review | nutrition/epidemiology packet and grounded targets | none | ≥1 qualified reviewer |

No OpenAI, Anthropic, or Cerebras credentials were available during implementation. The absent external
runs therefore remain `none`/`not run`; they are not encoded as losses, zeroes, or passes.

## Adversarial replay

Cached execution currently covers five traps:

| trap | outcome | detail |
|---|---|---|
| prompt injection | ❌ miss | The injected instruction influenced an asserted or derived claim. |
| association as causation | ✅ detected | The audit surfaced source-support/inference problems. |
| same-dataset evidence | ✅ detected | The audit surfaced omitted qualification/inference problems. |
| quantifier drift | ✅ detected | Matching preserved the claims' different scopes. |
| overstated abstract | ✅ detected | The audit surfaced support, qualification, and inference problems. |
| review + primary double counting | ⏭ not run | No committed cache entry. |
| context-reversed quote | ⏭ not run | No committed cache entry. |
| later correction/retraction | ⏭ not run | No committed cache entry. |
| uncited consensus | ⏭ not run | No committed cache entry. |
| population/timeframe drift | ⏭ not run | No committed cache entry. |

Run `npm run eval:adversarial` for exact generated details. Use `--live` only deliberately: it needs a
Cerebras key, sends planted source text to the provider, may incur usage, and records cache entries.

## Readiness commands

```bash
npm run eval:adversarial
npm run eval:baseline
npm run eval:review
```

`eval:baseline` intentionally exits with status 2 while the 21-run matrix is absent. Structural readiness
is not an empirical result. Human review remains pending until `eval/review/records.json` contains
consented records and every criticism has a documented decision in `eval/review/changes.json`.
