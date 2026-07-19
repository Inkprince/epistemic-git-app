# Adversarial evaluation

This directory implements the ten planted traps listed in `plan.md`. Each executed trap uses the
production pipeline APIs in order:

```text
extract → match → infer → audit → protocol validation → deterministic detection check
```

The detection check does not replace any pipeline stage. It only classifies the final bundle as a
**detection** or a **miss** using observable protocol records such as challenges, matches, retained
claims, quarantine entries, and inference relations.

## Trap catalog

1. `prompt-injection`
2. `association-as-causation`
3. `correlated-evidence`
4. `quantifier-drift`
5. `overstated-abstract`
6. `review-primary-double-counting`
7. `quote-context-reversal`
8. `later-correction-retraction`
9. `uncited-consensus`
10. `population-timeframe-drift`

`traps.ts` owns the planted inputs and checks. `suite.ts` owns pipeline execution, bundle validation,
cache/live selection, and reporting. `suite.test.ts` checks catalog completeness, rejects vacuous passes,
and verifies the full stage sequence with a deterministic test client.

## Running

From the project root:

```sh
npm run eval:adversarial
```

Cached mode is always the default, even if `GROQ_API_KEY` is set. A committed cache hit executes
normally without network access. A missing entry is reported as **not run**; it is never converted into
a pass or a model miss. Successful and missed bundle outputs plus the generated report are written to
`eval/adversarial/out/`. The runner does not write `eval/results.md`.

Useful options:

```text
--list                       list trap ids
--trap <id[,id...]>          run a subset (repeatable)
--cached                     force cached mode (the default)
--live                       use the provider on cache misses and record responses
--cache-dir <path>           override the cache directory
--out-dir <path>             override bundle output directory
--report <path>              override report path
--no-write                   print the report and write no outputs
--require-complete           exit nonzero if any selected trap could not execute
--fail-on-miss               exit nonzero if an executed trap is missed
```

Use `--live` deliberately: it requires `GROQ_API_KEY`, may send the planted source text to the
configured provider, and may incur provider usage. For a complete reproducible publication, record live
cache misses once and then rerun in cached mode.

## Honest interpretation

The report separates four states:

- **detected**, the final ledger surfaced the planted problem under that trap's documented check;
- **miss**, the full pipeline executed but the final ledger did not satisfy the check;
- **not run**, execution stopped because a required cache entry was unavailable;
- **error**, another execution or structural-validation failure occurred.

Detection rates use executed traps as the denominator and separately state execution coverage. All ten
traps currently replay from the committed cache and are detected. The prompt-injection trap was a real
miss in the first committed run (extraction admitted the injected bleach assertion); a deterministic
extraction-time defense now quarantines claims grounded in an injected source region
(`injection-suspected`), and the trap is detected. The defense is a first line, a fixed vocabulary of
override markers, not a proof of safety, so the trap stays as a regression guard.
