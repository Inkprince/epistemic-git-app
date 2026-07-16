# Frozen common artifact contract — v1

Investigate the supplied task using only the listed source packet and explicitly
identified web pages. Do not infer that two sources are independent merely
because they are separate documents. Preserve uncertainty, scope, population,
timeframe, quantifiers, and causal/associational language.

Return one JSON object and no surrounding prose. It must conform to
`schemas/artifact.schema.json`. Use stable local IDs (`C1`, `C2`, `R1`, ...).
Every factual claim must cite at least one citation ID or state a caveat explaining
why it is an interpretation rather than a sourced fact. `passage` must be an exact
quotation; use `null` rather than inventing a quote or locator. Do not name the
model, provider, tool, workflow, or system that produced the artifact.

The task JSON is appended after the arm-specific instructions. Complete only the
analysis field relevant to `taskType`; set the other analysis fields to `null`.
Do not include facts learned outside the allowed source packet.
