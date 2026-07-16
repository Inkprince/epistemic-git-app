# Reviewer & rater outreach kit

Ready-to-send materials for recruiting the humans the evaluation depends on. These unblock the
longest-lead-time part of the submission: real people. Send them **now**; the specific frozen
review packets (with exact claim-node targets) are finalized only after the cases are deepened, but
recruitment, scheduling, and conflict disclosure do not depend on those IDs.

## What to send whom

| File | Recipient | Purpose |
|---|---|---|
| [`brief-lhc-physicist.md`](brief-lhc-physicist.md) | 1 collider / gravitation / astroparticle / black-hole physicist | Expert review of the LHC safety-argument bundle |
| [`brief-covid-opposed.md`](brief-covid-opposed.md) | **Two** reviewers with *opposed* priors (one zoonosis-leaning, one lab-origin/ascertainment-bias-leaning) | Opposed-reader review of the COVID Huanan-market bundle |
| [`brief-eggs-epidemiology.md`](brief-eggs-epidemiology.md) | 1 nutrition scientist / epidemiologist | Expert review of the eggs bundle |
| [`brief-blinded-raters.md`](brief-blinded-raters.md) | ≥3 general raters (no domain expertise required) | Score anonymized outputs in the blinded baseline study |
| [`bundle-primer.md`](bundle-primer.md) | Every reviewer above | One-page "how to read a bundle" — attach to every brief |

## Non-negotiables (from `../PROTOCOL.md`)

- **Independence.** Do not recruit anyone who contributed to this project as an "independent" expert.
  Ask every reviewer to disclose coauthorship, institutional, advocacy, financial, litigation, or
  personal ties to the case before they open the artifact.
- **No verdict-contingent pay.** If you compensate for time, the amount is fixed regardless of what
  the reviewer concludes, and the amount/range is published.
- **Criticism is kept.** Reviewers must be told, before consenting, that their criticism may be
  quoted in redacted form and that we publish points we decline to act on, with our reasons.
- **Privacy.** Names, emails, signatures, and payment details never enter this repository. The
  committed record uses an opaque ID and a reviewer-approved public label; set
  `consentToPublishRedactedRecord` honestly.
- **Blinding (raters).** Raters must not be told which system produced which output, and must not see
  the private arm mapping until every answer and rating is locked.

## After someone says yes

1. Confirm stance/qualification and log conflicts.
2. For experts: once the deepened case bundle is frozen, send the matching form from `../forms/`,
   the frozen artifact + tool link, and the cited sources — nothing that coaches a verdict.
3. For raters: send the `evaluator/` packet produced by `eval/baseline/cli.ts prepare` and
   `../../baseline/EVALUATOR.md`. Never send the `private/` directory.
4. Collect the completed record before the reviewer compares notes with anyone else. For the two
   opposed COVID reviewers, lock both independently before either sees the other's answers.
