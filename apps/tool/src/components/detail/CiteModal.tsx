import type { Bundle } from "@epistemic-git/protocol";
import { useMemo, useState } from "react";
import { citeClaim } from "../../cite.js";
import { XIcon } from "../icons.js";
import { Modal } from "../Modal.js";
import { SectionLabel } from "../primitives.js";

/**
 * "Cite this claim" the APA reference(s) a paper needs, alongside the rich provenance trace
 * (Markdown or JSON) a bibliography can't provide. Both are pure `citeClaim` output.
 */
export function CiteModal({
  bundle, claimId, overlayId, respectCorrelation, onClose,
}: {
  bundle: Bundle;
  claimId: string;
  overlayId: string | undefined;
  respectCorrelation: boolean;
  onClose: () => void;
}) {
  const result = useMemo(
    () => citeClaim(bundle, claimId, { ...(overlayId ? { overlayId } : {}), respectCorrelation }),
    [bundle, claimId, overlayId, respectCorrelation],
);
  const [format, setFormat] = useState<"markdown" | "json">("markdown");
  const [copied, setCopied] = useState<string | null>(null);

  if (!result) return null;
  const body = format === "markdown" ? result.markdown : result.json;

  const copy = (text: string, key: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    });
  };

  return (
    <Modal onClose={onClose} ariaLabel="Cite this claim" width={720}>
      <div className="head">
        <div className="t">Cite this claim</div>
        <button className="close" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
      </div>
      <p className="subtle" style={{ margin: 0 }}>
        The APA reference is what a paper needs. The trace below is what Epistemic Git adds, where the
        claim came from, why it's currently supported, and who contests it.
      </p>

      <div style={{ marginTop: 14 }}>
        <SectionLabel>APA reference{result.apa.length === 1 ? "" : "s"}</SectionLabel>
        {result.apa.length === 0 && (
          <p className="subtle">No source-level reference, this is an inferred conclusion; its provenance is the trace below.</p>
)}
        {result.apa.map((ref, i) => (
          <div key={i} className="quote" style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
            <span style={{ flex: 1 }}>{ref}</span>
            <button className="chip-btn" onClick={() => copy(ref, `apa-${i}`)}>{copied === `apa-${i}` ? "✓" : "Copy"}</button>
          </div>
))}
      </div>

      <div className="tab-row" style={{ marginTop: 16 }}>
        <button className={`tab${format === "markdown" ? " active" : ""}`} onClick={() => setFormat("markdown")}>Provenance (Markdown)</button>
        <button className={`tab${format === "json" ? " active" : ""}`} onClick={() => setFormat("json")}>Provenance (JSON)</button>
      </div>
      <textarea
        readOnly
        value={body}
        style={{ width: "100%", height: 240, fontFamily: "var(--mono, monospace)", fontSize: 12, marginTop: 8, resize: "vertical" }}
        onFocus={(e) => e.currentTarget.select()}
      />

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <button className="btn-outline" onClick={() => copy(body, "body")}>{copied === "body" ? "✓ Copied" : `Copy ${format}`}</button>
        <button className="btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
);
}
