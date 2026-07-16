# Eggs and cardiovascular health — nutrition/epidemiology review

**Packet:** `eggs-epidemiology`  
**Frozen artifact:** `artifacts/eggs.json`, bundle `bnd_a9164971b6cfc742`

Declare qualifications and conflicts before review. This artifact is presently grounded in one Wikipedia
source summarizing heterogeneous literature; treat that as a candidate limitation, not as a hidden fact.
Inspect exact passages, study-design language, scope, matches, and challenges.

## Required targets

1. **Up to one egg/day in healthy people** — `cl_4f6c750a4dbdbec1`  
   Tool: `#/case/eggs?sel=4f6c750a`  
   Are population, dose, comparator, follow-up, and outcome sufficiently preserved?
2. **Reduced coronary-disease association** — `cl_4153f160a1cd5cd0`  
   Tool: `#/case/eggs?sel=4153f160`  
   Check observational/causal language and whether a review overlaps evidence counted elsewhere.
3. **Higher all-cause/CVD mortality association** — `cl_834af275120e524c`  
   Tool: `#/case/eggs?sel=834af275`  
   Name likely confounders and missing substitution/comparator information; assess whether the artifact
   overweights a decontextualized association.
4. **RCT biomarker meta-analysis** — `cl_70df06a93a29fc02`  
   Tool: `#/case/eggs?sel=70df06a9`  
   Does the argument improperly translate LDL/total cholesterol changes into clinical events?
5. **Derived CVD conclusion** — `cl_dc58cea98ff719fa`  
   Tool: `#/case/eggs?sel=dc58cea9`  
   Is "moderate" defined, does the population include diabetes status, and is no statistically significant
   increase being confused with evidence of no meaningful increase?

For each target record a verdict, severity, rationale, source/passage, and remedy. Then propose the minimum
question decomposition needed before answering "Are eggs healthy?": population, dose, comparator food,
outcome, timeframe, diabetes status, dietary pattern, design, and biomarker versus clinical endpoint.
Explicitly answer **eggs instead of what?** and list primary sources needed to replace the tertiary-source
basis.

## Perspective representation

The bundle carries two opposed reader-perspectives over the same claims. Open the Perspectives tab
(`#/case/eggs?tab=perspectives`) and diff `Eggs-safe-in-moderation reading` (`ovl_e4de5601bcb88ebd`)
against `Eggs-raise-risk reading` (`ovl_3e8de70024e3560b`).

- Do the two overlays' accept / reject / uncertain assessments (and weights) fairly state the two
  defensible readings of this literature, or is either a straw man? Name every node you would re-weight.
- The tool reports the load-bearing disagreement as **how much weight the all-cause-mortality association
  carries**, and stays qualitative (no dietary-risk probability). Does that match where the real
  epidemiological disagreement sits? If not, which node carries it?
- Are the design and endpoint distinctions right — is the RCT LDL finding correctly treated as a biomarker
  signal rather than a clinical outcome, and the observational reviews correctly flagged for confounding?
- Could you keep both overlays intact, adjust or add your own, and reach your considered view — without
  deleting the other reading? If not, what blocks it?
