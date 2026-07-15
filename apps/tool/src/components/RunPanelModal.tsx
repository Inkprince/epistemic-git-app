import type { Bundle } from "@epistemic-git/protocol";
import { useEffect, useRef, useState } from "react";
import { XIcon } from "./icons.js";
import { Modal } from "./Modal.js";

const SAMPLE_TEXT = `Regular consumption of nuts has been associated with a reduced risk of cardiovascular disease in several large prospective cohort studies. In the Nurses' Health Study, women who ate nuts five or more times per week had a 35% lower risk of coronary heart disease than women who rarely ate nuts. A 2013 randomized controlled trial (PREDIMED) found that a Mediterranean diet supplemented with mixed nuts reduced the incidence of major cardiovascular events by approximately 28% compared with a control diet. However, observational findings may be confounded: nut consumers in these cohorts tended to exercise more, smoke less, and have higher incomes. Critics also note that the PREDIMED trial was partially re-analysed in 2018 after irregularities in randomization at some sites, although the corrected analysis reported similar effect sizes. Nuts are energy-dense, and some researchers caution that recommendations should account for total caloric intake.`;

interface RunStats {
  extract?: { extracted: number; grounded: number; quarantined: number; chunks: number };
  matches?: number;
  inferences?: number;
  challenges?: number;
  correlationGroups?: number;
  mode?: string;
}

/**
 * Dev-only: paste source text and run the real extract → match → infer → audit → correlate
 * pipeline through the vite middleware (`POST /api/build`). Absent from the static production
 * build. Runs are cancellable and report per-stage stats.
 */
export function RunPanelModal({ onClose, onResult }: { onClose: () => void; onResult: (b: Bundle) => void }) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("Pasted source");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  async function run() {
    setBusy(true);
    setStatus(null);
    setElapsed(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const r = await fetch("/api/build", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, title, question }),
        signal: controller.signal,
      });
      const j = (await r.json()) as { error?: string; problems?: string[]; bundle?: Bundle; stats?: RunStats };
      if (!r.ok || j.error || !j.bundle) {
        setStatus({ kind: "err", msg: j.error ?? `HTTP ${r.status}` });
        return;
      }
      const ex = j.stats?.extract;
      const bits = [
        ex ? `${ex.grounded}/${ex.extracted} claims grounded` : `${j.bundle.claims.length} claims`,
        ex?.quarantined ? `${ex.quarantined} quarantined` : null,
        `${j.stats?.matches ?? 0} matches`,
        `${j.stats?.inferences ?? 0} inferences`,
        `${j.stats?.challenges ?? 0} challenges`,
        j.stats?.mode === "cached" ? "replayed from cache" : "live run",
      ].filter(Boolean);
      const warn = j.problems?.length ? ` · validation: ${j.problems[0]}` : "";
      setStatus({ kind: "ok", msg: `Built: ${bits.join(" · ")}${warn}` });
      onResult(j.bundle);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setStatus({ kind: "err", msg: "Run cancelled. (The server finishes its in-flight stage, then frees the slot.)" });
      } else {
        setStatus({ kind: "err", msg: "Live runs need the dev server. " + String(e) });
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  const chars = text.trim().length;

  return (
    <Modal onClose={onClose} ariaLabel="Run the pipeline on your own source" closeOnOverlay={!busy}>
        <div className="head">
          <div className="t">Run the pipeline</div>
          <button className="close" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
        </div>
        <p className="subtle" style={{ margin: 0 }}>
          Paste any source text — the extract → match → infer → audit pipeline builds a live evidence
          ledger from it. Every admitted claim is grounded in a verbatim quote; ungroundable claims are quarantined.
        </p>
        <div className="run-panel">
          <textarea
            ref={textRef}
            placeholder="Paste source text…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            disabled={busy}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="subtle">{chars.toLocaleString()} characters{chars > 0 && chars < 200 ? " — very short sources extract poorly" : ""}</span>
            <span style={{ flex: 1 }} />
            {!busy && !text && (
              <button className="chip-btn" onClick={() => { setText(SAMPLE_TEXT); setTitle("Nuts & heart health (sample)"); setQuestion("Do nuts reduce cardiovascular risk?"); }}>
                Use sample source
              </button>
            )}
          </div>
          <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
          <input placeholder="Question (optional — what should the ledger answer?)" value={question} onChange={(e) => setQuestion(e.target.value)} disabled={busy} />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={busy || !text.trim()} onClick={run}>
              {busy ? `Running extract → match → infer → audit… ${elapsed}s` : "Run pipeline"}
            </button>
            {busy && (
              <button className="btn-outline" onClick={() => abortRef.current?.abort()}>Cancel</button>
            )}
          </div>
          {busy && (
            <p className="note" style={{ marginTop: 0 }}>
              Typically 20–90 seconds depending on source length and rate limits. The key stays server-side.
            </p>
          )}
          {status && (
            <p className="note" style={{ marginTop: 2, color: status.kind === "err" ? "var(--pink)" : "var(--green-text)" }}>
              {status.msg}
            </p>
          )}
        </div>
    </Modal>
  );
}
