# How to read an Epistemic Git bundle (one page)

*Attach this to every reviewer brief. It explains what you are looking at and how to navigate it. It
takes about ten minutes to absorb; you do not need any software beyond a web browser.*

## What a "bundle" is

A bundle is a structured, inspectable record of an evidence dispute. Instead of an essay that argues
for a conclusion, it is a graph of small, individually-checkable objects. The point of the exercise
is the opposite of most AI research tools: **it does not hand you a verdict.** It hands you the
evidence, the reasoning steps laid over it, and the objections against them, each attributable and
each open to challenge on its own, so that you, holding your own prior beliefs, can see exactly
where the argument is load-bearing and where it is weak.

## The six kinds of object

- **Source**, a document, with its authors, date, type, peer-review status, declared conflicts, and
  how it relates to other sources (same dataset, same authors, one correcting another).
- **Passage**, an exact, word-for-word quote from a source, with its precise location. Every claim
  must be tied to one; a claim with no supporting quote is *quarantined*, not admitted.
- **Claim**, a single structured statement. It records not just a sentence but the population, the
  intervention, the **comparator** (compared to *what?*), the outcome, the timeframe, whether it is
  causal or merely correlational, and how big the effect is. "Eggs raise heart risk" and ">7 eggs a
  week is associated with cardiac death in this cohort" are deliberately *different* claims here.
- **Inference**, a reasoning step: these premises support that conclusion, under this principle,
  with these assumptions and these pre-declared *defeaters* (the conditions that would break it). An
  inference is itself an attributed assertion, not neutral fact, you can challenge it.
- **Challenge**, a specific, typed objection ("the source does not actually say this," "the scope
  drifted," "this evidence is not independent," "a confound was ignored," …). It must point at a
  particular claim, inference, or named missing source.
- **Assessment**, a judgment (accept / reject / unsure) that belongs to a named **perspective
  (overlay)**, never to the claim itself. Many worldviews can sit over the same record at once.

Two more objects connect claims: a **Match** links two claims without pretending they are identical
(equivalent, narrower, broader, contradicting, …); a **CorrelationGroup** records that a set of
claims secretly share an origin (a dataset, an author, a funder) so they are not counted as
independent confirmations.

## What we are asking you to check

For each named target claim/inference in your form, tell us whether it is faithfully represented, 
`accept`, `revise`, `reject`, or `uncertain`, with a severity, your reasoning, a source or passage
where possible, and a concrete remedy. We specifically want to know:

1. Does any claim quietly become **broader** than its source supports (scope or quantifier drift)?
2. Are two "independent" supports actually the **same** evidence in two coats?
3. Is the **comparator** right, is "compared to what?" represented, or dropped?
4. Where does the argument make an **inferential jump** (e.g. from "we cannot reject X" to "X is
   true," or from "statistically central" to "causally responsible")? Mark every one.
5. What is the **strongest opposed argument** that is missing or under-weighted?
6. Could a reader who *disagrees with the conclusion* still use and extend this same record? If not,
   why not?

"No issue found" is a completely valid answer, but we will not infer it from a blank field, so please
say so explicitly.

## Navigating the tool

Each target in your form comes with a deep link like `#/case/covid?sel=0fd237cc`. Open the tool,
paste the link, and the object is selected with its passage, provenance, challenges, and the argument
graph around it. You can trace any claim to its exact quote, list every challenge attached to it, and
see how much each perspective's conclusion depends on it. You do not need to accept any perspective to
inspect the structure.

## What happens to your review

Every substantive point you raise is recorded and answered in public: `accepted`,
`partially-accepted`, `declined`, or `deferred`, with our reasoning. Accepted points create new,
versioned nodes; the old version stays reproducible. Points we decline stay visible with our reason.
Your criticism is the deliverable, favorable or not.
