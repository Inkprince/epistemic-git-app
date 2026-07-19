import { diffBundles } from "@epistemic-git/analysis";
import type { BundleDiff, CollectionKey } from "@epistemic-git/analysis";
import { bundleDigest } from "@epistemic-git/protocol";
import type { Bundle } from "@epistemic-git/protocol";
import { useEffect, useMemo, useState } from "react";
import { eventsFor, snapshotGet } from "../../cases/history.js";
import type { HistoryEvent } from "../../cases/history.js";
import { truncate } from "../../domain.js";
import { CheckIcon, DownloadIcon, GitBranchIcon, MergeIcon, UsersIcon, ZapIcon } from "../icons.js";
import { Badge, SectionLabel } from "../primitives.js";

const KIND_META: Record<HistoryEvent["kind"], { icon: JSX.Element; label: string; bg: string }> = {
  "imported": { icon: <DownloadIcon size={15} style={{ transform: "rotate(180deg)" }} />, label: "Imported", bg: "var(--purple-bg)" },
  "merged": { icon: <MergeIcon size={15} />, label: "Merged", bg: "var(--green-bg)" },
  "pipeline-run": { icon: <ZapIcon size={15} />, label: "Built (AI)", bg: "var(--yellow)" },
  "committed": { icon: <CheckIcon size={13} />, label: "Saved as case", bg: "var(--green-bg)" },
  "suggested": { icon: <UsersIcon size={15} />, label: "Suggested", bg: "var(--amber-bg)" },
};

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * The case's lineage, every import / merge / pipeline-run / commit with its digest and parent
 * digests, like a commit log. Pick two events whose snapshots are still cached to see a full
 * content-addressed diff between them.
 */
export function HistoryPanel({ caseId, currentBundle }: { caseId: string; currentBundle: Bundle }) {
  const events = useMemo(() => eventsFor(caseId), [caseId]);
  const [picked, setPicked] = useState<string[]>([]); // digests, max 2
  const [diff, setDiff] = useState<{ a: Bundle; b: Bundle; report: BundleDiff } | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

  const togglePick = (digest: string) =>
    setPicked((p) => (p.includes(digest) ? p.filter((d) => d !== digest) : [...p.slice(-1), digest]));

  useEffect(() => {
    setDiff(null);
    setDiffError(null);
    if (picked.length !== 2) return;
    let cancelled = false;
    void Promise.all(picked.map((d) => snapshotGet(d))).then(([a, b]) => {
      if (cancelled) return;
      if (!a || !b) {
        setDiffError("One of these moments is no longer stored (only the 20 most recent are kept).");
        return;
      }
      setDiff({ a, b, report: diffBundles(a, b) });
    });
    return () => { cancelled = true; };
  }, [picked]);

  if (events.length === 0) {
    return (
      <div>
        <SectionLabel>History</SectionLabel>
        <p className="note" style={{ marginTop: 0 }}>
          No history yet for this case in this browser. Importing, merging, building, or saving
          records a moment here, a local log of how this case grew.
        </p>
      </div>
);
  }

  return (
    <div>
      <SectionLabel>History, newest first</SectionLabel>
      <p className="note" style={{ margin: "0 0 14px" }}>
        Pick two moments to compare.
      </p>
      <div className="timeline">
        {events.map((e, i) => {
          const meta = KIND_META[e.kind];
          const pickable = true;
          return (
            <div className="tl-item" key={e.id}>
              <div className="tl-rail">
                <span className="tl-circle" style={{ background: meta.bg, width: 30, height: 30 }}>{meta.icon}</span>
                {i < events.length - 1 && <div className="tl-line" />}
              </div>
              <div className="tl-body" style={{ paddingBottom: 16 }}>
                <div className="tl-text">
                  <strong>{meta.label}</strong>
                  {e.note ? <>, {e.note}</> : null}
                </div>
                <div className="tl-meta">{relTime(e.at)}
                  {e.stats && Object.entries(e.stats).map(([k, v]) => <span key={k}> · {k}: {v}</span>)}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    className="chip-btn"
                    style={{ padding: "3px 9px", fontSize: 12, fontFamily: "var(--mono)", ...(picked.includes(e.digest) ? { borderColor: "var(--ink)", background: "var(--surface-2)" } : {}) }}
                    onClick={() => pickable && togglePick(e.digest)}
                    title={picked.includes(e.digest) ? "Deselect" : "Select to compare"}
                  >
                    {e.digest.slice(0, 8)}
                  </button>
                  {e.parents.map((p) => (
                    <span key={p} className="chip mono" style={{ fontSize: 11 }} title="Parent version fingerprint, identical content always produces the same code">← {p.slice(0, 8)}</span>
))}
                  {e.digest === currentBundleDigestSafe(currentBundle) && <Badge tone="green">current</Badge>}
                </div>
              </div>
            </div>
);
        })}
      </div>

      {picked.length === 2 && (
        <div style={{ marginTop: 18 }}>
          <SectionLabel>What changed, {picked[0]!.slice(0, 8)} → {picked[1]!.slice(0, 8)}</SectionLabel>
          {diffError && <p className="note" style={{ color: "var(--pink)", marginTop: 0 }}>{diffError}</p>}
          {diff && <DiffView diff={diff.report} a={diff.a} b={diff.b} />}
        </div>
)}
    </div>
);
}

// bundleDigest is cheap but not free, cache per bundle object identity.
const digestCache = new WeakMap<Bundle, string>();
function currentBundleDigestSafe(b: Bundle): string {
  const hit = digestCache.get(b);
  if (hit) return hit;
  try {
    const d = bundleDigest(b);
    digestCache.set(b, d);
    return d;
  } catch {
    return "";
  }
}

function statementFor(id: string, ...bundles: Bundle[]): string {
  for (const b of bundles) {
    const claim = b.claims.find((c) => c.id === id);
    if (claim) return claim.statement;
    const inf = b.inferences.find((i) => i.id === id);
    if (inf) return `reasoning step: ${inf.warrant}`;
    const ch = b.challenges.find((c) => c.id === id);
    if (ch) return `challenge: ${ch.rationale}`;
    const src = b.sources.find((s) => s.id === id);
    if (src) return `source: ${src.title}`;
    const ovl = b.overlays.find((o) => o.id === id);
    if (ovl) return `perspective: ${ovl.label}`;
  }
  return id;
}

function DiffView({ diff, a, b }: { diff: BundleDiff; a: Bundle; b: Bundle }) {
  const rows = (rec: Partial<Record<CollectionKey, string[]>>, sign: "+" | "−") =>
    Object.entries(rec).flatMap(([key, ids]) =>
      (ids ?? []).map((id) => (
        <div key={`${sign}${id}`} className="diff-row" data-sign={sign}>
          <span className="d-sign">{sign}</span>
          <span className="d-kind">{key}</span>
          <span className="d-text">{truncate(statementFor(id, b, a), 110)}</span>
        </div>
)),
);
  if (diff.totalAdded === 0 && diff.totalRemoved === 0) {
    return <p className="note" style={{ marginTop: 0 }}>Identical content, same nodes on both sides.</p>;
  }
  return (
    <div className="diff-list">
      <p className="subtle" style={{ margin: "0 0 8px" }}>
        <GitBranchIcon size={13} /> {diff.totalAdded} added · {diff.totalRemoved} removed (matched by content)
      </p>
      {rows(diff.added, "+")}
      {rows(diff.removed, "−")}
    </div>
);
}
