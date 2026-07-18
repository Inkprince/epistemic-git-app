import type { Bundle } from "@epistemic-git/protocol";
import { ExternalLinkIcon, FileTextIcon, XIcon } from "../icons.js";
import { Modal } from "../Modal.js";

/**
 * Raw-document viewer: shows the primary original document a case was built from, exactly as the
 * pipeline read it, as plain scrollable text. Rendered only when the bundle carries a sourceDocument.
 */
export function RawDocumentModal({ bundle, onClose }: { bundle: Bundle; onClose: () => void }) {
  const doc = bundle.sourceDocument;
  if (!doc) return null;
  return (
    <Modal onClose={onClose} ariaLabel={`Raw document: ${doc.title ?? bundle.title}`} width={780}>
      <div className="head">
        <div className="t" style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <FileTextIcon size={18} /> Raw document
        </div>
        <button className="close" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
      </div>

      <div className="raw-doc-meta">
        <div className="raw-doc-title">{doc.title ?? bundle.title}</div>
        <div className="subtle" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <span>The original text this case was broken down from</span>
          {doc.url && (
            <a className="raw-doc-link" href={doc.url} target="_blank" rel="noopener noreferrer">
              Open original <ExternalLinkIcon size={13} />
            </a>
          )}
        </div>
      </div>

      <div className="raw-doc-body scrl" tabIndex={0}>{doc.text}</div>
    </Modal>
  );
}
