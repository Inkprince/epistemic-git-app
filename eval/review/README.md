# Expert, opposed, and user review

This directory operationalizes the human-review work requested in `plan.md` without pretending that a
review has happened. All four expert/partisan packets and the user study are currently **pending**.
`records.json` and `changes.json` are intentionally empty; templates are not observations.

## Coverage and current status

| packet | reviewer requirement | minimum | completed |
|---|---|---:|---:|
| `lhc-physics` | independent collider, gravitation, astroparticle, or black-hole physicist | 1 | 0 |
| `covid-zoonosis` | reviewer comparatively sympathetic to market-origin/zoonotic interpretations | 1 | 0 |
| `covid-lab-origin` | reviewer comparatively sympathetic to lab-origin/ascertainment-bias objections | 1 | 0 |
| `eggs-epidemiology` | nutrition scientist or epidemiologist | 1 | 0 |
| blinded user study | participants plus at least two raters per response | see `eval/baseline` | 0 |

The two COVID reviewers receive the same neutral form and artifact. Their declared prior stance is a
sampling criterion, not a cue to reach a specified conclusion. Neither is asked to estimate the overall
probability of zoonotic or laboratory origin from this bounded spatial-analysis artifact.

## Files

- `registry.json` freezes reviewer roles, artifact bundle IDs, target claim IDs, and forms.
- `PROTOCOL.md` defines recruitment, conflicts, consent/privacy, independent review, adjudication, and
  publication.
- `forms/` contains case-specific prompts and valid tool deep links into content-addressed claims.
- `record.schema.json` and `record.template.json` define completed review records.
- `change.schema.json` and `change.template.json` define the response to each criticism, including
  declined/deferred criticism so silence cannot masquerade as resolution.
- `records.json` contains actual completed reviews only.
- `changes.json` links review IDs to artifact decisions and before/after bundle IDs.
- `validate.ts` checks registry targets against the committed bundles, verifies artifact hashes on any
  completed records, and checks that every completed criticism receives a documented decision.
- User-study records, scoring, and inter-rater agreement live in `eval/baseline/`; `registry.json` links
  that protocol rather than creating an incompatible duplicate.

## Workflow

1. Recruit against `PROTOCOL.md`; do not substitute an unqualified convenience reviewer silently.
2. Give the reviewer the matching form and committed artifact. Record its SHA-256 before review.
3. Keep contact details and raw consent outside the repository. Assign an opaque review ID.
4. Add the redacted structured record to `records.json` only with publication consent.
5. For every completed review, add one or more entries to `changes.json`. A declined criticism still
   requires a concise rationale.
6. When a criticism changes an artifact, regenerate/validate it and record both content-addressed bundle
   IDs plus the app History/diff or Git reference. Never edit old IDs in place.
7. Run `npx tsx eval/review/validate.ts` and the full test suite.

```sh
npx tsx eval/review/validate.ts
npx vitest run eval/review/review.test.ts
```

The validator exits `0` when the package is structurally sound even while recruitment is pending. Its
readiness line is the authoritative status; structural validity is not evidence of expert endorsement.
