import { normalizeText, parseBundle, validateBundle } from "@epistemic-git/protocol";
import type { Bundle } from "@epistemic-git/protocol";
import { useRef, useState } from "react";
import { useCases } from "../cases/store.js";
import { FileTextIcon, UsersIcon, XIcon } from "./icons.js";
import { Modal } from "./Modal.js";
import { Avatar } from "./primitives.js";

const AUTHOR_LS_KEY = "egit:suggest:author";

/**
 * The authoring side of the merge lifecycle: a user files a contribution against a case. They give
 * their name, choose the bundle to contribute (a loaded case or an uploaded file), and file it. It
 * becomes a pending suggestion on the target case (local-only), which the case then surfaces and can
 * review, accept (merge), or decline, exactly like a seeded suggestion.
 */
export function SuggestContributionModal({
  targetCaseId, targetLabel, targetQuestion, onClose, onFiled,
}: {
  targetCaseId: string;
  targetLabel: string;
  targetQuestion: string;
  onClose: () => void;
  onFiled: (key: string) => void;
}) {
  const { cases, addSuggestion } = useCases();
  // Prefill with the last name typed here; the author still travels with the suggestion.
  const [author, setAuthor] = useState<string>(() => {
    try { return localStorage.getItem(AUTHOR_LS_KEY) ?? ""; } catch { return ""; }
  });
  const [chosen, setChosen] = useState<{ bundle: Bundle; from: string } | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const others = Object.values(cases).filter((c) => c.id !== targetCaseId);

  const pick = (bundle: Bundle, from: string) => {
    setChosen({ bundle, from });
    setLabel((prev) => prev || bundle.title || from);
    setError(null);
  };

  async function handleFile(file: File) {
    setError(null);
    try {
      const text = await file.text();
      const raw = file.name.endsWith(".jsonl") ? parseBundle(text) : JSON.parse(text);
      const check = validateBundle(raw);
      if (!check.ok || check.issues.some((i) => i.severity === "error")) {
        setError("That file isn't a valid case, so it can't be contributed.");
        return;
      }
      const b = raw as Bundle;
      pick(b, file.name.replace(/\.(bundle\.)?jsonl?$/i, "").replace(/[-_]/g, " "));
    } catch (e) {
      setError(`Could not read the file: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const differentQuestion =
    chosen && normalizeText(chosen.bundle.question) !== normalizeText(targetQuestion);

  const canFile = author.trim().length > 0 && chosen !== null;

  const file = () => {
    if (!chosen) return;
    try { localStorage.setItem(AUTHOR_LS_KEY, author.trim()); } catch { /* ignore */ }
    const key = addSuggestion(targetCaseId, chosen.bundle, { label, author });
    onFiled(key);
    onClose();
  };

  return (
    <Modal onClose={onClose} ariaLabel={`Suggest a contribution to ${targetLabel}`} width={560}>
      <div className="head">
        <div className="t" style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <UsersIcon size={18} /> Suggest a contribution
        </div>
        <button className="close" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
      </div>
      <p className="subtle" style={{ margin: 0 }}>
        File a contribution to <strong>{targetLabel}</strong>. It becomes a pending suggestion on the
        case that anyone can review and merge, or decline. Nothing leaves your machine.
      </p>

      <label className="field-label" htmlFor="sug-author">Your name</label>
      <input
        id="sug-author"
        className="text-input"
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        placeholder="e.g. Dr. Lena Ostrova"
        maxLength={60}
        autoFocus
      />

      <div className="field-label">What are you contributing?</div>
      {others.length === 0 && (
        <p className="note" style={{ margin: "2px 0 0" }}>
          Load another case first (Import case), then it can be contributed here, or drop a case file below.
        </p>
      )}
      {others.length > 0 && (
        <div className="merge-list" style={{ maxHeight: 200 }}>
          {others.map((c) => {
            const active = chosen?.from === c.label;
            return (
              <button
                key={c.id}
                className={`sug-source${active ? " active" : ""}`}
                onClick={() => pick(c.bundle, c.label)}
              >
                <Avatar label={c.label} size={30} tile />
                <div className="mr-main">
                  <div className="mr-title">{c.label}</div>
                  <div className="mr-sub">{c.bundle.claims.length} claims · {c.bundle.inferences.length} reasoning steps</div>
                </div>
                {active && <span className="badge green">selected</span>}
              </button>
            );
          })}
        </div>
      )}

      <div
        className="dropzone sm"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleFile(f); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        aria-label="Choose or drop a case file to contribute"
      >
        <FileTextIcon size={20} />
        <div className="dz-sub">or drop / choose a case file (.json, .jsonl)</div>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.jsonl,application/json"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
        />
      </div>

      {chosen && (
        <>
          <div className="field-label">Short description</div>
          <input
            className="text-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. 2024 neutron-star re-derivation"
            maxLength={80}
          />
          {differentQuestion && (
            <p className="note" style={{ color: "var(--red)", fontWeight: 600, margin: "8px 0 0" }}>
              Heads up: this asks a different question than the case. The claims still combine, but the
              conclusions may not be comparable.
            </p>
          )}
        </>
      )}

      {error && <div className="note" style={{ color: "var(--pink)", marginTop: 8 }}>{error}</div>}

      <div className="modal-actions">
        <button className="btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={file} disabled={!canFile} title={canFile ? "File this suggestion" : "Add your name and choose what to contribute"}>
          File suggestion
        </button>
      </div>
    </Modal>
  );
}
