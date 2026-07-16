import { parseBundle } from "@epistemic-git/protocol";
import type { ValidationIssue } from "@epistemic-git/protocol";
import { useRef, useState } from "react";
import { useCases } from "../cases/store.js";
import { FileTextIcon, XIcon } from "./icons.js";
import { Modal } from "./Modal.js";

/**
 * Load any exported evidence ledger (.json or .jsonl) back into the explorer. The bundle is
 * fully validated in the browser — schema, referential integrity, provenance invariants, and
 * content-hash id integrity — and refused with the issue list if it fails. Imports persist
 * locally (IndexedDB) and appear in the sidebar until removed.
 */
export function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: (id: string) => void }) {
  const { importBundle } = useCases();
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<{ msg: string; issues?: ValidationIssue[] } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      let raw: unknown;
      if (file.name.endsWith(".jsonl")) {
        raw = parseBundle(text);
      } else {
        raw = JSON.parse(text);
      }
      const label = file.name.replace(/\.(bundle\.)?jsonl?$/i, "").replace(/[-_]/g, " ");
      const result = importBundle(raw, label);
      if (!result.ok) {
        setError({ msg: "This file is not a valid evidence ledger — refused (nothing was imported).", issues: result.issues.slice(0, 6) });
        return;
      }
      onImported(result.id);
      onClose();
    } catch (e) {
      setError({ msg: `Could not read the file: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} ariaLabel="Import a bundle">
        <div className="head">
          <div className="t">Import a ledger</div>
          <button className="close" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
        </div>
        <p className="subtle" style={{ margin: 0 }}>
          Open an exported bundle (<span className="mono">.json</span> or <span className="mono">.jsonl</span>).
          Your browser checks it end-to-end — schema, provenance, and content-hash integrity — before
          anything is added. Nothing leaves your machine.
        </p>
        <div
          className={`dropzone${dragOver ? " over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) void handleFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          aria-label="Choose or drop a bundle file"
        >
          <FileTextIcon size={26} />
          <div className="dz-title">{busy ? "Validating…" : "Drop a bundle here"}</div>
          <div className="dz-sub">or click to choose a file</div>
          <input
            ref={inputRef}
            type="file"
            accept=".json,.jsonl,application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </div>
        {error && (
          <div className="note" style={{ color: "var(--pink)" }}>
            {error.msg}
            {error.issues && (
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {error.issues.map((i, n) => <li key={n} className="mono" style={{ fontSize: 12 }}>{i.code}: {i.message}</li>)}
              </ul>
            )}
          </div>
        )}
    </Modal>
  );
}
