# Blinded evaluator instructions

You are comparing research artifacts. You are not being asked to guess how any
artifact was produced. Do not inspect parent directories, file history, private
study files, or network metadata. Report any accidental identity clue to the
administrator and stop that assignment; the packet should be replaced before you
continue.

## Procedure

1. Work through tasks in the order in `manifest.json` and artifacts in each
   task's listed order. The order and IDs are fixed and intentionally opaque.
2. Start the timer immediately before opening an artifact. Stop immediately after
   finalizing your answer. Do not pause the timer for ordinary reading or source
   checking within the artifact.
3. Answer only from the artifact. Do not browse, use another assistant, or rely on
   private subject-matter notes.
4. Make factual claims atomic. Assign each one a local ID (`C1`, `C2`, ...).
   Assign each citation/reference a local ID (`R1`, `R2`, ...) and state which
   claim it supports. This permits unsupported-claim and citation scoring without
   reconstructing your intent.
5. Preserve uncertainty and scope. Distinguish direct quotation, source assertion,
   inference, and your own judgment.
6. For the conflicting-source task, the displayed elapsed time is also the update
   time. State what changed, what did not, and what evidence would discriminate
   between the competing accounts.
7. Submit the answer before viewing the next artifact. Do not revise earlier
   answers after comparison.

## Record fields

The administrator records one `responses` entry per answer using
`schemas/evaluations.schema.json`: timestamps, elapsed milliseconds, answer text,
atomic claims, and citations. At least two raters independently code every rubric
criterion, every citation, and every answer claim. Raters must not see the private
system mapping. Free-text notes cannot replace a required binary judgment.

If the artifact is unusable or appears corrupted, record that fact in the answer;
do not silently skip it. Missing and failed cases remain part of the study.
