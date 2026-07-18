# Eggs and cardiovascular health, nutrition/epidemiology review

**Packet:** `eggs-epidemiology`  
**Frozen artifact:** `artifacts/eggs.json`, bundle `bnd_1f96a919195655f4`

Declare qualifications and conflicts before review. This artifact is grounded in four real sources
retrieved on 2026-07-18 (Harvard T.H. Chan Nutrition Source, Mayo Clinic, Harvard Health Publishing,
and the Physicians Committee industry-funding critique). Treat cross-source heterogeneity and any
tertiary framing as a candidate limitation, not as a hidden fact. Inspect exact passages,
study-design language, scope, matches, and challenges.

## Required targets

1. **Dietary vs. blood cholesterol only weakly related**, `cl_646da059993b633b`  
   Tool: `#/case/eggs?sel=646da059`  
   Is the "weakly related" framing faithful to the underlying evidence, or does it understate
   between-person variation in cholesterol response?
2. **Up to one egg/day not associated with increased risk in healthy people**, `cl_9cd9599a8702739b`  
   Tool: `#/case/eggs?sel=9cd9599a`  
   Are population, dose, comparator, follow-up, and outcome sufficiently preserved from the two large
   prospective cohorts cited?
3. **Egg cholesterol does not raise blood cholesterol like saturated/trans fat**, `cl_bb42270f7ef9d08f`  
   Tool: `#/case/eggs?sel=bb42270f`  
   Does the argument improperly translate a biomarker mechanism into a clinical-outcome claim?
4. **Higher heart-disease risk among people with diabetes**, `cl_6ec0fda638f01486`  
   Tool: `#/case/eggs?sel=6ec0fda6`  
   Name likely confounders and missing substitution/comparator information; assess whether the
   subgroup risk is scoped correctly rather than generalized.
5. **Limit eggs for diabetes/heart-disease patients**, `cl_608baede04104f08`  
   Tool: `#/case/eggs?sel=608baede`  
   Is the guidance stated at the right population scope, and does it follow from the cited evidence
   rather than overreaching from association to prescription?

For each target record a verdict, severity, rationale, source/passage, and remedy. Then propose the minimum
question decomposition needed before answering "Are eggs healthy?": population, dose, comparator food,
outcome, timeframe, diabetes status, dietary pattern, design, and biomarker versus clinical endpoint.
Explicitly answer **eggs instead of what?** and list any primary sources needed to strengthen the basis.

## Perspective representation

The bundle carries two opposed reader-perspectives over the same claims. Open the Perspectives tab
(`#/case/eggs?tab=perspectives`) and diff `Egg‑Safety Optimist` (`ovl_6aa4ef6333806ed9`)
against `Cautious Cholesterol Perspective` (`ovl_dba6773dce8ce787`).

- Do the two overlays' accept / reject / uncertain assessments (and weights) fairly state the two
  defensible readings of this literature, or is either a straw man? Name every node you would re-weight.
- Does the tool's reported load-bearing disagreement match where the real epidemiological disagreement
  sits? If not, which node carries it?
- Are the design and endpoint distinctions right, is any RCT biomarker finding correctly treated as a
  biomarker signal rather than a clinical outcome, and are the observational associations correctly
  flagged for confounding?
- Could you keep both overlays intact, adjust or add your own, and reach your considered view, without
  deleting the other reading? If not, what blocks it?
