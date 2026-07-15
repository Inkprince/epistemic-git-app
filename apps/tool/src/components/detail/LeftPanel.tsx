import type { Bundle } from "@epistemic-git/protocol";
import { overlaysById, truncate } from "../../domain.js";
import { CpuIcon, FileTextIcon, LinkIcon, UsersIcon } from "../icons.js";
import { InfoRow, SectionLabel, pressable } from "../primitives.js";
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
  selected, onSelect,
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
}) {
  const overlays = bundle.overlays;
  const overlaysMap = overlaysById(bundle);
  const q = query.trim().toLowerCase();
  const evidence = bundle.claims.filter((c) => !c.derived).filter((c) => !q || c.statement.toLowerCase().includes(q));
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
          <InspectPanel selectedId={selected} support={support} look={look} bundle={bundle} onSelect={onSelect} />
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
                <p className="note">This bundle carries no perspectives yet — showing structural support under neutral priors. Assessments are a late-binding overlay anyone can add.</p>
              )}
              <label className="toggle-row">
                <input type="checkbox" checked={respectCorrelation} onChange={(e) => onRespectCorrelation(e.target.checked)} />
                Don't double-count correlated evidence
              </label>
            </div>

            <div className="control-group">
              <SectionLabel>Evidence — check to distrust</SectionLabel>
              {evidence.map((c) => (
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
                  <span className="claim-text" title={c.statement}>{c.statement}</span>
                </div>
              ))}
              {q && <p className="note">{evidence.length} of {bundle.claims.filter((c) => !c.derived).length} claims match “{query.trim()}”.</p>}
            </div>

            {bundle.sources.length > 1 && (
              <div className="control-group">
                <SectionLabel>Sources — distrust cascades</SectionLabel>
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
                      <span className="claim-text">{truncate(s.title, 64)} <span className="subtle">({claimIds.length})</span></span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="panel-rule" />
            <SectionLabel>Case info</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <InfoRow icon={<UsersIcon size={19} />} k="Perspectives" v={overlays.length > 0 ? `${overlays.length} overlays` : "None yet"} />
              <InfoRow icon={<FileTextIcon size={19} />} k="Sources" v={`${bundle.sources.length} · ${bundle.passages.length} passages`} />
              <InfoRow icon={<LinkIcon size={19} />} k="Claim relations" v={`${bundle.matches.length} matches`} />
              <InfoRow icon={<CpuIcon size={19} />} k="Provenance" v={generated ? "Pipeline-generated" : "Hand-authored"} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export const shortLabel = (label: string): string =>
  label.replace(/\s*\(.*\)\s*/, "").replace("Mainstream physics ", "").trim() || label;
