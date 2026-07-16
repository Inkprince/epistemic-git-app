import type { Bundle, Claim } from "@epistemic-git/protocol";
import type { SupportPath } from "@epistemic-git/analysis";
import { Suspense, lazy } from "react";
import { pct, truncate } from "../../domain.js";
import { ZapIcon } from "../icons.js";

// Cytoscape (~350 KB) loads only when an argument map is actually shown.
const GraphView = lazy(() => import("../../GraphView.js").then((m) => ({ default: m.GraphView })));
import { Badge, MarkCircle, SectionLabel, pressable } from "../primitives.js";
import type { Look } from "./types.js";

export function ArgumentTab({
  bundle, look, support, distrust, selected, onSelect, onGraphSelect, onToggleDistrust,
  conclusion, concSupport, delta, gaugeLabel,
  explanation,
  tryThis, presetLabel, presetActive, onPreset,
}: {
  bundle: Bundle;
  look: Look;
  support: ReadonlyMap<string, number>;
  distrust: string[];
  selected: string;
  onSelect: (id: string) => void;
  /** Highlight in the graph without stealing the left panel's tab. */
  onGraphSelect: (id: string) => void;
  onToggleDistrust: (id: string) => void;
  conclusion: Claim;
  concSupport: number;
  delta: number;
  gaugeLabel: string;
  explanation: { positive: SupportPath[]; attacks: SupportPath[] };
  tryThis?: string;
  presetLabel?: string;
  presetActive?: boolean;
  onPreset?: () => void;
}) {
  return (
    <>
      <div className="conclusion-card">
        <div className="statement" onClick={() => onSelect(conclusion.id)} {...pressable(() => onSelect(conclusion.id))} aria-label="Inspect the conclusion">{conclusion.statement}</div>
        <div className="gauge">
          <span className="val" style={{ color: "var(--green-text)" }}>{pct(concSupport)}</span>
          <span className="lbl">{gaugeLabel}</span>
          {Math.abs(delta) > 1e-4 && (
            <Badge tone={delta < 0 ? "pink" : "green"} dot>{delta > 0 ? "+" : ""}{pct(delta)} vs. trusting everything</Badge>
          )}
        </div>
        <div className="bar"><span style={{ width: `${concSupport * 100}%` }} /></div>
      </div>

      {tryThis && (
        <div className="try-hint">
          <span className="tl-circle"><ZapIcon size={17} /></span>
          <span className="txt">{tryThis}</span>
          {presetLabel && onPreset && (
            <button className="btn-outline btn-sm" onClick={onPreset}>
              {presetActive ? "↩ Restore" : presetLabel}
            </button>
          )}
        </div>
      )}

      <SectionLabel>Argument map — coloured by live support · click any node or edge for details</SectionLabel>
      <Suspense fallback={<div className="graph-wrap"><div className="graph-box" aria-label="Loading argument graph…" /></div>}>
        <GraphView
          bundle={bundle} support={support} selected={selected} distrust={distrust}
          onSelect={onGraphSelect} onInspect={onSelect} onToggleDistrust={onToggleDistrust}
        />
      </Suspense>

      <div className="content-head" style={{ marginTop: 24 }}>
        <div className="t">Supporting argument lines</div>
      </div>
      <div className="task-list">
        {explanation.positive.map((p) => <LineCard key={p.inferenceId} path={p} look={look} onSelect={onSelect} />)}
        {explanation.positive.length === 0 && <p className="subtle">Nothing supports the conclusion under these settings.</p>}
      </div>

      {explanation.attacks.length > 0 && (
        <>
          <div className="content-head" style={{ marginTop: 30 }}>
            <div className="t">Challenges to the conclusion</div>
          </div>
          <div className="task-list">
            {explanation.attacks.map((p) => <LineCard key={p.inferenceId} path={p} attack look={look} onSelect={onSelect} />)}
          </div>
        </>
      )}
    </>
  );
}

/** One argument line as a spec task card: mark circle, warrant, premises, contribution. */
function LineCard({ path, attack, look, onSelect }: { path: SupportPath; attack?: boolean; look: Look; onSelect: (id: string) => void }) {
  const mark = attack ? "pink" : path.active ? "green" : "open";
  return (
    <div
      className={`task-card clickable${!path.active && !attack ? " done dim" : ""}`}
      onClick={() => onSelect(path.inferenceId)}
      {...pressable(() => onSelect(path.inferenceId))}
      title="Inspect this inference"
    >
      <span className="mark"><MarkCircle kind={mark} /></span>
      <div className="main">
        <div className="title">{path.warrant}</div>
        <div className="desc">
          premises:{" "}
          {path.premises.map((pid, i) => (
            <span key={pid}>
              {i > 0 ? ", " : ""}
              <a
                className="premise-link"
                onClick={(e) => { e.stopPropagation(); onSelect(pid); }}
                {...pressable(() => onSelect(pid))}
              >
                {truncate(look.claims.get(pid)?.statement ?? pid, 48)}
              </a>
            </span>
          ))}
        </div>
        <div className="foot">
          {attack
            ? <Badge tone="pink" dot>rebuts — reduces support</Badge>
            : <Badge tone={path.active ? "green" : "neutral"}>{path.type} · {path.active ? "active" : "collapsed"}</Badge>}
        </div>
      </div>
      <div className="side">
        <div className="kv">Contribution: <strong>{pct(path.contribution)}</strong></div>
        <div className="minibar">
          <span style={{ width: `${path.contribution * 100}%`, background: attack ? "var(--pink)" : "var(--green)" }} />
        </div>
      </div>
    </div>
  );
}
