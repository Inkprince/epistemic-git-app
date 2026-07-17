# Baseline and blinded evaluation

Executable, no-network study tooling for the three frozen arms requested in
`plan.md`: a deep-research baseline, a careful Claude-Code-style investigation,
and Epistemic Git. It covers strongest evidence, load-bearing crux, citation
independence, passage support, perspective disagreement, conflicting-source
update, and source overclaim.

This directory contains **no baseline outputs and no evaluation results**. The
empty fixtures are templates, not observations. External runs and human ratings
must be imported before any comparative claim is valid.

## Frozen design

`config/study.json` fixes model IDs, arm settings, prompts, required metrics,
minimum raters, and blinding policy. `config/tasks.json` fixes the seven tasks and
private scoring rubrics. `config/freeze.json` holds SHA-256 hashes of all frozen
inputs. `validate` fails if a frozen byte changes.

The two external model identifiers are provider identifiers. Before execution,
the operator must confirm those exact identifiers remain available and retain the
provider run ID in the import manifest. A substituted or silently routed model is
not the same study: create a new version and freeze it rather than editing a run.
Epistemic Git is frozen to `gpt-oss-120b` and pipeline prompt version `eg/1`.

All arms receive the same task/source packet and emit
`schemas/artifact.schema.json`. Arm-specific workflow prompts are frozen, but the
export is a neutral projection. Preparation rejects artifacts containing provider,
model, or product names and rejects unknown metadata fields. This avoids simply
handing evaluators a ledger-shaped file that reveals an arm.

The seven-task set covers all three competition cases. The eggs overclaim item
uses the committed tertiary-source excerpt and explicitly tests whether systems
preserve dose, population, comparator, design, endpoint, and uncertainty rather
than manufacturing a broad health verdict.

## Workflow

Run commands from the project root; no `package.json` edit is required.

```sh
npx tsx eval/baseline/cli.ts validate
npx tsx eval/baseline/cli.ts render --run pilot-001
```

`validate` intentionally exits with status 2 while external runs are absent.
`render` writes 21 **private** frozen prompt packets under
`eval/baseline/runs/pilot-001/private/run-packets/`; it calls no service and
creates no output on behalf of a baseline.

### Rubric-blindness (who may run an arm)

The private scoring rubrics (`accuracyCriteria` / `cruxCriteria` in
`config/tasks.json`) are what the human raters score against. **Whoever runs an
arm must not have seen those rubrics** — otherwise the artifact can be written to
the test and the comparison is void. The render packets are deliberately
rubric-free: they contain the common contract, the arm instructions, the task's
`researchQuestion`/`taskType`, and the allowed sources, but **not** the rubric.
So the safe procedure is: run each arm in a *fresh context whose only input is one
render packet (plus the allowed source files)* — a new model session, a separate
operator, or a subagent seeded solely with the packet. Do not run an arm from a
context that has read `config/tasks.json` or `runs/*/private/scores.json`. This is
why the project's own assistant, having read the rubrics to build the study, does
**not** generate the comparison artifacts itself.

Run each packet using the configured arm. Save the exact neutral JSON returned by
the arm without semantic editing. If syntax repair is unavoidable, retain the raw
provider output separately, document the transformation in `notes`, and have an
independent administrator verify that only syntax changed. Create an imports file
matching `schemas/imports.schema.json`; paths are resolved from the project root.
The matrix must contain exactly one run for every system/task pair, with exact
model IDs and real timestamps.

```sh
npx tsx eval/baseline/cli.ts validate --imports path/to/imports.json
npx tsx eval/baseline/cli.ts prepare --run study-001 --imports path/to/imports.json
```

`prepare` refuses partial matrices, model mismatches, malformed artifacts,
identity leaks, duplicate runs, and nonpositive run durations. It creates:

- `runs/study-001/evaluator/`: the only directory shared with evaluators; opaque
  artifact IDs and a keyed randomized order per task.
- `runs/study-001/private/blinding-map.json`: identities, hashes, and generation
  timing. Never share this before responses and ratings are locked.

The random key is used in memory and discarded. The resulting manifest and map
freeze IDs/order for that run. Preparation never overwrites an existing evaluator
packet or private mapping.

Collect answers according to `EVALUATOR.md`. Have at least two independent raters
code every atomic claim, citation, accuracy criterion, and applicable crux item in
an evaluations file matching `schemas/evaluations.schema.json`.

```sh
npx tsx eval/baseline/cli.ts validate \
  --imports path/to/imports.json \
  --run study-001 \
  --evaluations path/to/evaluations.json

npx tsx eval/baseline/cli.ts score \
  --run study-001 \
  --evaluations path/to/evaluations.json
```

Scores are written only to `runs/study-001/private/scores.json`. They are private,
unblinded administrative output and must not be shown to evaluators before rating
lock. Empty human data produce `null`, never zero or a fabricated success.

## Metrics

- **Answer accuracy:** fraction of frozen rubric criteria met, averaged across
  raters within response, then responses within arm.
- **Citation correctness:** fraction of answer citations rated correct. No
  citations means no eligible observation (`null`), not perfect performance.
- **Unsupported-claim rate:** one minus the fraction of atomic answer claims rated
  supported.
- **Time to answer:** participant `durationMs`; timestamps must agree within five
  seconds.
- **Crux identification:** binary rating on the load-bearing-crux task.
- **Update time:** participant duration on the conflicting-source update task.
- **Inter-rater agreement:** chance-corrected pairwise agreement over all binary
  criterion/citation/support/crux judgments. The output includes observed and
  expected agreement, item count, and judgment count; insufficient data are
  `null`.

Generation time is imported and reported separately. It is not substituted for
participant answer/update time.

## Methodological safeguards and limits

- Artifact IDs and order are unpredictable and the identity map is physically
  separated from the evaluator packet. Evaluators should receive only the
  `evaluator/` directory.
- Normalization controls format-based unblinding but may reduce native-interface
  differences. Report that limitation.
- Model prose can reveal a workflow indirectly even without banned names. Ask
  evaluators to report guesses only after ratings lock, then quantify blinding
  success separately if desired; do not alter scores post hoc.
- Task rubrics are frozen before runs. Keep failures, unusable artifacts, missing
  citations, and baseline wins.
- This is a small fixed task set. Report task-level values and uncertainty; do not
  imply broad superiority from aggregate point estimates.
- Source rubrics encode claims supported by the supplied packets, not independent
  domain truth. A domain expert should review them before a consequential study;
  any change requires a new frozen study version.
