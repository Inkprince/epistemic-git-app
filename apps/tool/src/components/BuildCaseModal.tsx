import type { Bundle } from "@epistemic-git/protocol";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, PlusIcon, SearchIcon, XIcon } from "./icons.js";
import { Modal } from "./Modal.js";

const SAMPLE_TEXT = `Regular consumption of nuts has been associated with a reduced risk of cardiovascular disease in several large prospective cohort studies. In the Nurses' Health Study, women who ate nuts five or more times per week had a 35% lower risk of coronary heart disease than women who rarely ate nuts. A 2013 randomized controlled trial (PREDIMED) found that a Mediterranean diet supplemented with mixed nuts reduced the incidence of major cardiovascular events by approximately 28% compared with a control diet. However, observational findings may be confounded: nut consumers in these cohorts tended to exercise more, smoke less, and have higher incomes. Critics also note that the PREDIMED trial was partially re-analysed in 2018 after irregularities in randomization at some sites, although the corrected analysis reported similar effect sizes. Nuts are energy-dense, and some researchers caution that recommendations should account for total caloric intake.`;

interface RunStats {
  extract?: { extracted: number; grounded: number; quarantined: number; chunks: number };
  matches?: number;
  inferences?: number;
  challenges?: number;
  correlationGroups?: number;
  perspectives?: number;
  narratives?: number;
  sources?: number;
  mode?: string;
}

/** The pipeline's stages in run order, each owning a slice of the progress bar. */
const STAGES = [
  { key: "extract", label: "Extracting claims", sub: "every claim must locate an exact quote", ceil: 50 },
  { key: "match", label: "Linking related claims", sub: "same claim, contradicts, more specific", ceil: 58 },
  { key: "infer", label: "Reconstructing the argument", sub: "how the claims support the conclusion", ceil: 70 },
  { key: "audit", label: "Cross-examining", sub: "raising challenges against the weakest points", ceil: 80 },
  { key: "correlate", label: "Grouping shared origins", sub: "so the same evidence isn't counted twice", ceil: 83 },
  { key: "perspective", label: "Drafting perspectives", sub: "two opposing readings of the same evidence", ceil: 93 },
  { key: "narrate", label: "Writing summaries", sub: "plain-English accounts of the top claims", ceil: 99 },
] as const;
type StageKey = (typeof STAGES)[number]["key"];

interface Progress {
  stage: StageKey;
  pct: number;
  detail?: string;
}

interface SourceRow {
  kind: "text" | "url";
  value: string;
  title: string;
}

interface Candidate {
  url: string;
  title: string;
  description: string;
  rank: number;
}

/**
 * Dev-only: build a real case from one or more sources (pasted text or URLs) through the vite
 * middleware (`POST /api/build`). URLs are retrieved via Firecrawl (native fetch fallback); an
 * optional Discover box proposes candidate URLs via Firecrawl search. The server runs the full
 * pipeline (extract, match, infer, audit, correlate) and then embellishes with drafted perspectives
 * and narratives, streaming NDJSON progress. Absent from the static production build.
 */
export function BuildCaseModal({ onClose, onResult }: { onClose: () => void; onResult: (b: Bundle) => void }) {
  const [sources, setSources] = useState<SourceRow[]>([{ kind: "text", value: "", title: "" }]);
  const [title, setTitle] = useState("Pasted source");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [displayPct, setDisplayPct] = useState(0);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [discoverQ, setDiscoverQ] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const progressRef = useRef<Progress | null>(null);
  progressRef.current = progress;

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  // The number tracks real work: it snaps to each server-reported percentage, then creeps only
  // partway into the current stage's band (never near its ceiling), so it can't claim a stage is
  // nearly done when it isn't. The active-step pulse conveys liveness for the opaque LLM stages.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      const p = progressRef.current;
      if (!p) return;
      const ceil = STAGES.find((s) => s.key === p.stage)?.ceil ?? 99;
      const target = p.pct + (ceil - p.pct) * 0.4;
      setDisplayPct((d) => Math.min(target, Math.max(p.pct, d + (target - d) * 0.04)));
    }, 250);
    return () => clearInterval(timer);
  }, [busy]);

  const setSource = (i: number, patch: Partial<SourceRow>) =>
    setSources((prev) => prev.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const addSource = (row: SourceRow) => setSources((prev) => [...prev, row]);
  const removeSource = (i: number) => setSources((prev) => (prev.length === 1 ? prev : prev.filter((_, k) => k !== i)));

  async function discover() {
    const q = discoverQ.trim();
    if (!q) return;
    setDiscovering(true);
    setStatus(null);
    try {
      const r = await fetch("/api/discover", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q, limit: 8 }),
      });
      const j = (await r.json()) as { ok?: boolean; candidates?: Candidate[]; error?: string };
      if (!r.ok || !j.ok) { setStatus({ kind: "err", msg: j.error ?? `HTTP ${r.status}` }); return; }
      setCandidates(j.candidates ?? []);
    } catch (e) {
      setStatus({ kind: "err", msg: "Discovery needs the dev server. " + String(e) });
    } finally {
      setDiscovering(false);
    }
  }

  function addCandidate(c: Candidate) {
    addSource({ kind: "url", value: c.url, title: c.title });
    setCandidates((prev) => (prev ? prev.filter((x) => x.url !== c.url) : prev));
  }

  async function run() {
    const payloadSources = sources
      .map((s) => (s.kind === "url"
        ? { url: s.value.trim(), ...(s.title.trim() ? { title: s.title.trim() } : {}) }
        : { text: s.value.trim(), ...(s.title.trim() ? { title: s.title.trim() } : {}) }))
      .filter((s) => ("url" in s ? s.url : s.text));
    if (payloadSources.length === 0) { setStatus({ kind: "err", msg: "Add at least one source (pasted text or a URL)." }); return; }

    setBusy(true);
    setStatus(null);
    setElapsed(0);
    setDisplayPct(0);
    setProgress({ stage: "extract", pct: 0 });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const r = await fetch("/api/build", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ sources: payloadSources, title, question }),
        signal: controller.signal,
      });
      const isStream = (r.headers.get("content-type") ?? "").includes("ndjson");
      if (!r.ok || !isStream || !r.body) {
        // Pre-stream failure (validation, busy slot, missing key): plain JSON error.
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setStatus({ kind: "err", msg: j.error ?? `HTTP ${r.status}` });
        return;
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      interface RunEvent {
        type: "progress" | "done" | "error";
        stage?: StageKey; pct?: number; detail?: string;
        error?: string; problems?: string[]; bundle?: Bundle; stats?: RunStats;
      }
      let terminal: RunEvent | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = done ? "" : (lines.pop() ?? "");
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as RunEvent;
          if (evt.type === "progress" && evt.stage) {
            setProgress({ stage: evt.stage, pct: evt.pct ?? 0, ...(evt.detail ? { detail: evt.detail } : {}) });
            setDisplayPct((d) => Math.max(d, evt.pct ?? 0));
          } else if (evt.type === "done" || evt.type === "error") {
            terminal = evt;
          }
        }
        if (done) break;
      }

      if (!terminal || terminal.type === "error" || !terminal.bundle) {
        setStatus({ kind: "err", msg: terminal?.error ?? "The run ended without a result; check the dev-server log." });
        return;
      }
      setDisplayPct(100);
      const ex = terminal.stats?.extract;
      const bits = [
        terminal.stats?.sources ? `${terminal.stats.sources} source${terminal.stats.sources === 1 ? "" : "s"}` : null,
        ex ? `${ex.grounded}/${ex.extracted} claims grounded` : `${terminal.bundle.claims.length} claims`,
        ex?.quarantined ? `${ex.quarantined} excluded` : null,
        `${terminal.stats?.matches ?? 0} related claims`,
        `${terminal.stats?.inferences ?? 0} reasoning steps`,
        `${terminal.stats?.challenges ?? 0} challenges`,
        terminal.stats?.perspectives ? `${terminal.stats.perspectives} perspectives` : null,
        terminal.stats?.narratives ? `${terminal.stats.narratives} summaries` : null,
        terminal.stats?.mode === "cached" ? "replayed from cache" : "live run",
      ].filter(Boolean);
      const warn = terminal.problems?.length ? ` · validation: ${terminal.problems[0]}` : "";
      setStatus({ kind: "ok", msg: `Built: ${bits.join(" · ")}${warn}` });
      onResult(terminal.bundle);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setStatus({ kind: "err", msg: "Run cancelled. (The server finishes its in-flight stage, then frees the slot.)" });
      } else {
        setStatus({ kind: "err", msg: "Live runs need the dev server. " + String(e) });
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setProgress(null);
    }
  }

  const activeIdx = progress ? STAGES.findIndex((s) => s.key === progress.stage) : -1;
  const fmtElapsed = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;
  const totalChars = sources.filter((s) => s.kind === "text").reduce((n, s) => n + s.value.trim().length, 0);
  const hasContent = sources.some((s) => s.value.trim());

  return (
    <Modal onClose={onClose} ariaLabel="Build a case from your own sources" closeOnOverlay={!busy}>
        <div className="head">
          <div className="t">{busy ? "Building your case" : "Build a case from sources"}</div>
          <button className="close" onClick={onClose} aria-label="Close"><XIcon size={16} /></button>
        </div>

        {busy && progress ? (
          <div className="build-progress" role="status" aria-live="polite">
            <p className="subtle" style={{ margin: 0 }}>
              The AI is reading your sources. Every claim it admits must be backed by an exact quote
              it can locate in the text; claims it can't back are excluded, with the reason on record.
            </p>
            <div className="bp-head">
              <span className="bp-pct">{Math.floor(displayPct)}%</span>
              <span className="bp-elapsed">{fmtElapsed} elapsed · typically 20 to 90s depending on source length</span>
            </div>
            <div className="bp-bar" role="progressbar" aria-valuenow={Math.floor(displayPct)} aria-valuemin={0} aria-valuemax={100}>
              <div className="bp-fill" style={{ width: `${displayPct}%` }} />
            </div>
            <div className="bp-stages">
              {STAGES.map((s, i) => (
                <div key={s.key} className={`bp-stage${i === activeIdx ? " active" : i < activeIdx ? " done" : ""}`}>
                  <span className="ic">{i < activeIdx ? <CheckIcon size={11} /> : i === activeIdx ? <span className="bp-dot" /> : null}</span>
                  <span>{s.label}</span>
                  <span className="detail">
                    {i === activeIdx && progress.detail ? progress.detail : i === activeIdx ? s.sub : ""}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn-outline" onClick={() => abortRef.current?.abort()}>Cancel run</button>
            </div>
          </div>
        ) : (
          <>
            <p className="subtle" style={{ margin: 0 }}>
              Add one or more sources (paste text or link a URL) and the AI builds a case: every claim
              it admits is backed by an exact quote; the ones it can't back are excluded, with the
              reason on record. It then drafts two opposing perspectives and plain-English summaries.
            </p>

            <div className="run-panel">
              {sources.map((s, i) => (
                <div key={i} className="src-row">
                  <div className="src-row-head">
                    <div className="seg" role="group" aria-label="Source kind">
                      <button className={s.kind === "text" ? "active" : ""} aria-pressed={s.kind === "text"} onClick={() => setSource(i, { kind: "text" })}>Paste text</button>
                      <button className={s.kind === "url" ? "active" : ""} aria-pressed={s.kind === "url"} onClick={() => setSource(i, { kind: "url" })}>Link URL</button>
                    </div>
                    <span style={{ flex: 1 }} />
                    {sources.length > 1 && (
                      <button className="linklike" onClick={() => removeSource(i)} aria-label={`Remove source ${i + 1}`}>Remove</button>
                    )}
                  </div>
                  {s.kind === "text" ? (
                    <textarea
                      placeholder="Paste source text…"
                      value={s.value}
                      onChange={(e) => setSource(i, { value: e.target.value })}
                      rows={5}
                    />
                  ) : (
                    <input
                      placeholder="https://…  (fetched via Firecrawl, native fetch fallback)"
                      value={s.value}
                      onChange={(e) => setSource(i, { value: e.target.value })}
                    />
                  )}
                  <input placeholder="Source title (optional)" value={s.title} onChange={(e) => setSource(i, { title: e.target.value })} />
                </div>
              ))}

              <div className="src-actions">
                <button className="chip-btn" onClick={() => addSource({ kind: "url", value: "", title: "" })}>
                  <PlusIcon size={14} /> Add source
                </button>
                {totalChars > 0 && <span className="subtle">{totalChars.toLocaleString()} characters pasted{totalChars < 200 ? " (very short sources usually yield only a claim or two)" : ""}</span>}
                {!hasContent && (
                  <button className="chip-btn" onClick={() => { setSources([{ kind: "text", value: SAMPLE_TEXT, title: "" }]); setTitle("Nuts & heart health (sample)"); setQuestion("Do nuts reduce cardiovascular risk?"); }}>
                    Use sample source
                  </button>
                )}
              </div>

              <div className="discover-box">
                <div className="src-row-head">
                  <SearchIcon size={15} />
                  <span className="subtle" style={{ fontWeight: 600 }}>Find sources</span>
                  <span style={{ flex: 1 }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    placeholder="Search a topic to propose candidate URLs (Firecrawl)…"
                    value={discoverQ}
                    onChange={(e) => setDiscoverQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void discover(); } }}
                  />
                  <button className="btn-outline" disabled={discovering || !discoverQ.trim()} onClick={discover}>
                    {discovering ? "Searching…" : "Discover"}
                  </button>
                </div>
                {candidates && candidates.length === 0 && <p className="note">No candidates found. Try a different query, or paste a URL directly.</p>}
                {candidates && candidates.length > 0 && (
                  <div className="candidate-list">
                    {candidates.map((c) => (
                      <div key={c.url} className="candidate">
                        <div className="cand-main">
                          <div className="cand-title" title={c.title}>{c.title}</div>
                          <div className="cand-url" title={c.url}>{c.url}</div>
                        </div>
                        <button className="btn-outline btn-sm" onClick={() => addCandidate(c)}><PlusIcon size={13} /> Add</button>
                      </div>
                    ))}
                    <p className="note" style={{ margin: "4px 0 0" }}>Proposals only. Nothing is added until you choose it.</p>
                  </div>
                )}
              </div>

              <input placeholder="Case title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input placeholder="Question (optional; what should the case answer?)" value={question} onChange={(e) => setQuestion(e.target.value)} />
              <button className="btn-primary" style={{ justifyContent: "center" }} disabled={!hasContent} onClick={run}>
                Build case
              </button>
            </div>
          </>
        )}
        {status && (
          <p className="note" style={{ marginTop: 8, color: status.kind === "err" ? "var(--pink)" : "var(--green-text)" }}>
            {status.msg}
          </p>
        )}
    </Modal>
  );
}
