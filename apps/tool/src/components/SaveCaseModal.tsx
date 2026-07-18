import type { Bundle } from "@epistemic-git/protocol";
import { useState } from "react";
import { appendEvent } from "../cases/history.js";
import { bundleDigest } from "@epistemic-git/protocol";
import { CheckIcon, XIcon } from "./icons.js";
import { Modal } from "./Modal.js";

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "case";

/**
 * Dev-only "git commit": persist the current bundle (imported / merged / live-run) as a
 * committed case, the server writes artifacts/<slug>.json(l) and registers it in
 * artifacts/cases.json; Vite reloads with the new case in the sidebar.
 */
export function SaveCaseModal({ bundle, suggestedLabel, onClose }: { bundle: Bundle; suggestedLabel: string; onClose: () => void }) {
  const [label, setLabel] = useState(suggestedLabel);
  const [slug, setSlug] = useState(slugify(suggestedLabel));
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/commit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ bundle, label, slug }),
      });
      const j = (await r.json()) as { ok?: boolean; id?: string; error?: string; problems?: string[] };
      if (!r.ok || !j.ok || !j.id) {
        setError([j.error ?? `HTTP ${r.status}`, ...(j.problems ?? [])].join(" · "));
        return;
      }
      appendEvent({ caseId: j.id, kind: "committed", digest: bundleDigest(bundle), parents: [], note: label });
      // The manifest changed on disk, reload onto the new case so the glob re-evaluates cleanly.
      window.location.hash = `#/case/${j.id}`;
      window.location.reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} ariaLabel="Save as case" closeOnOverlay={!busy}>
        <div className="head">
          <div className="t">Save as case</div>
          <button className="close" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
        </div>
        <p className="subtle" style={{ margin: 0 }}>
          Save this case to the repository: <span className="mono">artifacts/{slug || "…"}.json</span> is
          written and registered, and it becomes a permanent case in the sidebar. (Dev server only.)
        </p>
        <div className="run-panel">
          <input
            placeholder="Case label"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            disabled={busy}
          />
          <input
            placeholder="web address name (a-z, 0-9, hyphen)"
            value={slug}
            onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
            disabled={busy}
            className="mono"
          />
          <button
            className="btn-primary"
            style={{ justifyContent: "center" }}
            disabled={busy || !label.trim() || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)}
            onClick={commit}
          >
            <CheckIcon size={15} /> {busy ? "Saving…" : "Save case"}
          </button>
          {error && <p className="note" style={{ marginTop: 2, color: "var(--pink)" }}>{error}</p>}
        </div>
    </Modal>
);
}
