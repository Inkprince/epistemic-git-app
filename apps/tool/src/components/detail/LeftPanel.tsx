import type { Bundle } from "@epistemic-git/protocol";
import { overlaysById, truncate } from "../../domain.js";
import { CpuIcon, FileTextIcon, LinkIcon, UsersIcon } from "../icons.js";
import { InfoRow, SectionLabel, SourceLink, pressable } from "../primitives.js";
import { HistoryPanel } from "./HistoryPanel.js";
import { InspectPanel } from "./InspectPanel.js";
import type { Look } from "./types.js";

export type LeftTab = "evidence" | "inspect" | "history";

export function LeftPanel({
  caseId, bundle, look, support, query,
  leftTab, onLeftTab,
  overlayId, onOverlay,
  respectCorrelation, onRespectCorrelation,
  distrust, onToggleDistrust, onSetDistrust,
  selected, onSelect, onLocalChange,
}: {
  caseId: string;
  bundle: Bundle;
  look: Look;
  support: ReadonlyMap<string, number>;
  query: string;
  leftTab: LeftTab;
  onLeftTab: (t: LeftTab) => void;
  overlayId: string | undefined;
  onOverlay: (id: string) => void;
  respectCorrelation: boolean;
  onRespectCorrelation: (v: boolean) => void;
  distrust: string[];
  onToggleDistrust: (id: string) => void;
  onSetDistrust: (updater: (d: string[]) => string[]) => void;
  selected: string;
  onSelect: (id: string) => void;
  onLocalChange: () => void;
}) {
  const overlays = bundle.overlays;
  const overlaysMap = overlaysById(bundle);
  const q = query.trim().toLowerCase();
  const claimMatches = (c: (typeof bundle.claims)[number]) => {
    if (!q) return true;
    if (c.statement.toLowerCase().includes(q)) return true;
    const p = look.passages.get(c.passages[0] ?? "");
    if (p?.verbatimText.toLowerCase().includes(q)) return true;
    const src = p ? look.sources.get(p.sourceId) : undefined;
    return Boolean(src?.title.toLowerCase().includes(q));
  };
  const evidence = bundle.claims.filter((c) => !c.derived).filter(claimMatches);
  const generated = bundle.claims.some((c) => c.attribution.kind === "analyst-llm");

  return (
    <section className="left-panel">
      <div className="tab-row">
        <button className={`tab${leftTab === "evidence" ? " active" : ""}`} onClick={() => onLeftTab("evidence")}>Evidence</button>
        <button className={`tab${leftTab === "inspect" ? " active" : ""}`} onClick={() => onLeftTab("inspect")}>Inspect</button>
        <button className={`tab${leftTab === "history" ? " active" : ""}`} onClick={() => onLeftTab("history")}>History</button>
      </div>
      <div className="body scrl">
        {leftTab === "history" && <HistoryPanel caseId={caseId} currentBundle={bundle} />}
        {leftTab === "inspect" && (
          <InspectPanel
            caseId={caseId} selectedId={selected} support={support} look={look} bundle={bundle}
            overlayId={overlayId} distrust={distrust} respectCorrelation={respectCorrelation}
            onSelect={onSelect} onToggleDistrust={onToggleDistrust} onLocalChange={onLocalChange}
          />
)}
        {leftTab === "evidence" && (
          <>
            <div className="control-group">
              <SectionLabel>Perspective</SectionLabel>
              {overlays.length > 0 ? (
                <>
                  <div className="seg" role="group" aria-label="Perspective">
                    {overlays.map((o) => (
                      <button key={o.id} className={o.id === overlayId ? "active" : ""} aria-pressed={o.id === overlayId} onClick={() => onOverlay(o.id)}>
                        {shortLabel(o.label)}
                      </button>
))}
                  </div>
                  <p className="note">{overlayId ? overlaysMap.get(overlayId)?.description : ""}</p>
                </>
) : (
                <p className="note">No perspectives yet, so you're seeing Support from a neutral starting point. A perspective sets which claims it accepts, anyone can add one.</p>
)}
              <label className="toggle-row">
                <input type="checkbox" checked={respectCorrelation} onChange={(e) => onRespectCorrelation(e.target.checked)} />
                Don't double-count correlated evidence
              </label>
              <p className="note" style={{ marginTop: 2 }}>Evidence sharing an origin counts once, see the Connections tab.</p>
            </div>

            <div className="control-group">
              <SectionLabel>Evidence, check to distrust</SectionLabel>
              {evidence.map((c) => {
                const p = look.passages.get(c.passages[0] ?? "");
                const src = p ? look.sources.get(p.sourceId) : undefined;
                return (
                  <div
                    key={c.id}
                    className={`claim-row ${selected === c.id ? "selected" : ""} ${distrust.includes(c.id) ? "distrusted" : ""}`}
                    onClick={() => onSelect(c.id)}
                    {...pressable(() => onSelect(c.id))}
                    aria-label={`Inspect claim: ${c.statement.slice(0, 60)}`}
                  >
                    <input
                      type="checkbox" checked={distrust.includes(c.id)}
                      onClick={(e) => e.stopPropagation()} onChange={() => onToggleDistrust(c.id)}
                      title="Distrust this claim and recompute"
                    />
                    <span className="claim-body">
                      <span className="claim-text" title={c.statement}>{c.statement}</span>
                      {src && (
                        <span className="claim-source subtle">
                          <SourceLink title={truncate(src.title, 56)} url={src.url} />
                        </span>
)}
                    </span>
                  </div>
);
              })}
              {q && <p className="note">{evidence.length} of {bundle.claims.filter((c) => !c.derived).length} claims match “{query.trim()}”.</p>}
            </div>

            {bundle.sources.length >= 1 && (
              <div className="control-group">
                <SectionLabel>{bundle.sources.length > 1 ? "Sources, distrusting one drops all its claims" : "Source"}</SectionLabel>
                {bundle.sources.map((s) => {
                  const claimIds = bundle.claims.filter((c) => c.attribution.kind === "source" && c.attribution.ref === s.id).map((c) => c.id);
                  const allDistrusted = claimIds.length > 0 && claimIds.every((id) => distrust.includes(id));
                  return (
                    <div className={`claim-row ${allDistrusted ? "distrusted" : ""}`} key={s.id}>
                      <input
                        type="checkbox" checked={allDistrusted} disabled={claimIds.length === 0}
                        onChange={() => onSetDistrust((d) => allDistrusted ? d.filter((x) => !claimIds.includes(x)) : [...new Set([...d, ...claimIds])])}
                        title="Distrust every claim grounded in this source"
                      />
                      <span className="claim-text"><SourceLink title={truncate(s.title, 64)} url={s.url} /> <span className="subtle">({claimIds.length})</span></span>
                    </div>
);
                })}
              </div>
)}

            <div className="panel-rule" />
            <SectionLabel>Case info</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <InfoRow icon={<UsersIcon size={19} />} k="Perspectives" v={overlays.length > 0 ? `${overlays.length} perspectives` : "None yet"} />
              <InfoRow icon={<FileTextIcon size={19} />} k="Sources" v={`${bundle.sources.length} · ${bundle.passages.length} exact quotes`} />
              <InfoRow icon={<LinkIcon size={19} />} k="Connections" v={`${bundle.matches.length} related claims`} />
              <InfoRow icon={<CpuIcon size={19} />} k="How it was built" v={generated ? "AI-built" : "Hand-built"} />
            </div>
          </>
)}
      </div>
    </section>
);
}

/** Compact form of an overlay label for chips and segmented controls: drop any parenthetical, then truncate. */
export const shortLabel = (label: string): string => {
  const cleaned = label.replace(/\s*\([^)]*\)\s*/g, " ").trim() || label;
  return truncate(cleaned, 32);
};
