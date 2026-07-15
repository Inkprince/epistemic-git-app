import type { Bundle, Claim, Inference } from "./schema.js";

/**
 * Nanopublication export.
 *
 * FLF's "Full Epistemic Stack" names Nanopublications as the promising direction for a shared
 * claim–evidence graph. Each claim and inference becomes a nanopublication: a small named-graph
 * bundle of an ASSERTION (what is claimed), its PROVENANCE (which passage/source, attributed to
 * whom), and PUBLICATION INFO (schema + integrity). This is the concrete interoperability bridge
 * — another team's tooling that speaks Nanopublications can consume our ledger directly.
 */

const PREFIXES = `@prefix eg: <https://epistemic.git/protocol#> .
@prefix np: <http://www.nanopub.org/nschema#> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
`;

const lit = (s: string): string =>
  `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "")}"`;

function claimNanopub(bundle: Bundle, c: Claim): string {
  const np = `eg:${c.id}_np`;
  const provLines = c.passages.map((p) => `  eg:${c.id} prov:wasQuotedFrom eg:${p} .`);
  const attributedTo = c.attribution.ref ?? c.attribution.kind;
  const structure = c.structure
    ? Object.entries(c.structure)
        .filter(([, v]) => v)
        .map(([k, v]) => `  eg:${c.id} eg:${k} ${lit(String(v))} .`)
    : [];

  return `${np} {
  ${np} np:hasAssertion eg:${c.id}_assertion ; np:hasProvenance eg:${c.id}_prov ; np:hasPublicationInfo eg:${c.id}_pub .
}
eg:${c.id}_assertion {
  eg:${c.id} rdf:type eg:Claim ; rdfs:label ${lit(c.statement)} ; eg:claimType ${lit(c.claimType)} .
${structure.join("\n")}
}
eg:${c.id}_prov {
  eg:${c.id} prov:wasAttributedTo ${lit(attributedTo)} ; eg:attributionKind ${lit(c.attribution.kind)} .
${provLines.join("\n")}
}
eg:${c.id}_pub {
  ${np} eg:schemaVersion ${lit(bundle.schemaVersion)} ; eg:case ${lit(bundle.case)} ; eg:derived ${c.derived ? "true" : "false"} .
}`;
}

function inferenceNanopub(bundle: Bundle, i: Inference): string {
  const np = `eg:${i.id}_np`;
  const premiseLines = i.premises.map((p) => `  eg:${i.id} eg:hasPremise eg:${p} .`);
  const attributedTo = i.attribution.ref ?? i.attribution.kind;
  return `${np} {
  ${np} np:hasAssertion eg:${i.id}_assertion ; np:hasProvenance eg:${i.id}_prov ; np:hasPublicationInfo eg:${i.id}_pub .
}
eg:${i.id}_assertion {
  eg:${i.id} rdf:type eg:Inference ; eg:inferenceType ${lit(i.type)} ; eg:concludes eg:${i.conclusion} ;
    eg:warrant ${lit(i.warrant)} ; eg:strength ${lit(i.strength)} .
${premiseLines.join("\n")}
}
eg:${i.id}_prov {
  eg:${i.id} prov:wasAttributedTo ${lit(attributedTo)} ; eg:attributionKind ${lit(i.attribution.kind)} .
}
eg:${i.id}_pub {
  ${np} eg:schemaVersion ${lit(bundle.schemaVersion)} ; eg:case ${lit(bundle.case)} .
}`;
}

/** Serialize a bundle's claims and inferences as TriG nanopublications. */
export function toNanopubTrig(bundle: Bundle): string {
  const blocks = [
    ...bundle.claims.map((c) => claimNanopub(bundle, c)),
    ...bundle.inferences.map((i) => inferenceNanopub(bundle, i)),
  ];
  return PREFIXES + "\n" + blocks.join("\n\n") + "\n";
}
