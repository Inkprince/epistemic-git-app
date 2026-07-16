# Human review protocol

## Purpose

The review tests whether domain experts and opposed readers can find errors, missing evidence, hidden
assumptions, and misleading scope in the same inspectable ledger. It is not an endorsement survey and
must retain criticism that the project authors decline.

## Recruitment and independence

- **LHC:** recruit at least one researcher with relevant collider, gravitation, astroparticle, or black-hole
  physics expertise. Record the basis for qualification and any CERN/LHC Safety Assessment Group ties.
- **COVID:** recruit two reviewers with meaningfully opposed prior interpretations of the origin evidence:
  one comparatively sympathetic to market-origin/zoonotic arguments and one comparatively sympathetic to
  lab-origin or ascertainment-bias objections. Both review the identical packet independently.
- **Eggs:** recruit at least one nutrition scientist or epidemiologist familiar with dietary exposure,
  substitution models, biomarkers versus clinical endpoints, and observational confounding.
- Do not recruit project contributors as independent experts. Disclose coauthorship, institutional,
  advocacy, financial, litigation, and personal relationships relevant to the case.
- Compensation, if any, pays for time and is not contingent on verdict. Publish its amount/range.

## Consent and privacy

Before starting, tell reviewers: purpose; expected time; what will be published; that criticism may be
quoted in redacted form; that participation is voluntary; and how to withdraw before publication. Keep
names, email addresses, signatures, and payment details outside this repository. The committed record uses
an opaque ID and a reviewer-approved public label. Set `consentToPublishRedactedRecord` accurately; a
nonconsenting review may inform private development but must not be committed as a public record.

## Review procedure

1. Freeze the artifact byte-for-byte and record its bundle ID and SHA-256.
2. Give only the matching form, artifact/tool access, and cited source material. Do not coach a desired
   verdict or reveal another reviewer's answers.
3. The reviewer inspects each named target and records `accept`, `revise`, `reject`, or `uncertain`, with
   severity, rationale, a source/passage where possible, and a concrete remedy.
4. Ask for missing evidence and an overall calibrated assessment. "No issue found" is valid but must not
   be inferred from a blank field.
5. Collect the completed record before discussing it with another reviewer. For opposed COVID reviewers,
   compare answers only after both are locked.

## Adjudication and artifact updates

For every completed review, the authors record each substantive decision as `accepted`,
`partially-accepted`, `declined`, or `deferred`. Declined/deferred points remain public with rationale.
Accepted changes create new content-addressed nodes/bundles; old bundles remain reproducible. Record:

- review IDs and affected node IDs;
- before and after bundle IDs;
- a History/diff or Git reference;
- what changed and why;
- why any requested part was not changed.

A completed review without an entry in `changes.json` is an incomplete review cycle. Do not describe review
as complete until the validator reports all packet minima met and every review has a documented response.

## User study and inter-rater agreement

Use the frozen blinded protocol in `eval/baseline/`. It compares the deep-research baseline, careful
Claude-Code-style investigation, and Epistemic Git on seven tasks. Evaluators see opaque artifact IDs;
private arm mappings stay sealed until answers and ratings lock. At least two independent raters score
every binary rubric, citation, claim-support, and crux judgment. The scorer reports chance-corrected
pairwise agreement and leaves insufficient observations `null`; this expert-review protocol does not
manufacture agreement from the case-review prose.
