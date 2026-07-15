import { computeSupport, explainSupport, perspectiveDiff, valueOfInformation } from "@epistemic-git/analysis";
import type { MergeReport } from "@epistemic-git/analysis";
import type { Bundle } from "@epistemic-git/protocol";
import { useEffect, useMemo, useState } from "react";
import {
  claimsById, inferencesById, overlaysById, passagesById, pct, primaryConclusion, sourcesById, truncate,
} from "../../domain.js";
import { ArrowLeft, DownloadIcon, MergeIcon, RotateIcon } from "../icons.js";
import { Avatar } from "../primitives.js";
import { LiveRunBanner, MergedBanner } from "../MergeBanner.js";
import { ArgumentTab } from "./ArgumentTab.js";
import { ChallengesTab, QuarantineTab, RelationsTab } from "./AuditTabs.js";
import { LeftPanel, shortLabel } from "./LeftPanel.js";
import type { LeftTab } from "./LeftPanel.js";
import { PerspectivesTab } from "./PerspectivesTab.js";
import type { Look } from "./types.js";

/** Per-case onboarding: a "what to try" line and an optional one-click flagship preset. */
const CASE_META: Record<string, { tryThis: string; presetLabel?: string; presetMatch?: RegExp }> = {
  lhc: {
    tryThis: "Flagship demo: distrust Hawking radiation and watch the safety conclusion barely move — the empirical cosmic-ray / white-dwarf line carries it without the theoretical premise.",
    presetLabel: "▶ Distrust Hawking radiation",
    presetMatch: /hawking radiation/i,
  },
  covid: {
    tryThis: "Three real, contested papers in one ledger. Explore the cross-source contradictions between the market-origin and ascertainment-bias camps, and the audit challenge that catches ‘centrality ≠ causation’.",
  },
  eggs: {
    tryThis: "Real mixed evidence. See the ‘contradicts’ relation between the reduced-risk and increased-mortality findings, and the correlated-evidence challenge flagging two non-independent reviews.",
  },
};

type MainTab = "argument" | "perspectives" | "challenges" | "relations" | "quarantine";

export function CaseDetailScreen({
  caseId, caseLabel, bundle, query, selectId,
  mergePairLabel, merged, onMerge, onRevertMerge,
  isLiveRun, onExitLive,
  onBack,
}: {
  caseId: string;
  caseLabel: string;
  bundle: Bundle;
  query: string;
  selectId?: string;
  mergePairLabel?: string;
  merged?: MergeReport;
  onMerge?: () => void;
  onRevertMerge?: () => void;
  isLiveRun: boolean;
  onExitLive: () => void;
  onBack: () => void;
}) {
  const { conclusion, look } = useMemo(() => ({
    conclusion: primaryConclusion(bundle),
    look: {
      claims: claimsById(bundle), inferences: inferencesById(bundle),
      passages: passagesById(bundle), sources: sourcesById(bundle),
    } as Look,
  }), [bundle]);

  const overlays = bundle.overlays;
  const overlaysMap = useMemo(() => overlaysById(bundle), [bundle]);
  const [overlayId, setOverlayId] = useState<string | undefined>(overlays[0]?.id);
  const [diffBId, setDiffBId] = useState<string | undefined>(overlays[1]?.id);
  const [distrust, setDistrust] = useState<string[]>([]);
  const [respectCorrelation, setRespectCorrelation] = useState(true);
  const [selected, setSelected] = useState<string>(selectId ?? conclusion.id);
  const [leftTab, setLeftTab] = useState<LeftTab>(selectId ? "inspect" : "evidence");
  const [mainTab, setMainTab] = useState<MainTab>("argument");

  // Reset per-bundle state when the underlying bundle swaps (merge / live run / revert).
  useEffect(() => {
    setOverlayId(bundle.overlays[0]?.id);
    setDiffBId(bundle.overlays[1]?.id);
    setSelected(selectId ?? conclusion.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, conclusion.id]);
  useEffect(() => {
    if (selectId) { setSelected(selectId); setLeftTab("inspect"); }
  }, [selectId]);

  const distrustKey = [...distrust].sort().join(",");
  const toggleDistrust = (id: string) =>
    setDistrust((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  const { support, baseline, explanation } = useMemo(() => {
    const distrustSet = new Set(distrust);
    const opts = { ...(overlayId ? { overlayId } : {}), respectCorrelation };
    const field = computeSupport(bundle, { ...opts, distrustClaims: distrustSet });
    const base = computeSupport(bundle, opts);
    const expl = explainSupport(bundle, conclusion.id, { ...opts, distrustClaims: distrustSet });
    return { support: field.support, baseline: base.support, explanation: expl };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, overlayId, distrustKey, respectCorrelation, conclusion.id]);

  const canDiff = overlays.length >= 2 && !!overlayId && !!diffBId && overlayId !== diffBId;
  const diff = useMemo(
    () => (canDiff ? perspectiveDiff(bundle, overlayId!, diffBId!, conclusion.id, { respectCorrelation }) : undefined),
    [bundle, canDiff, overlayId, diffBId, respectCorrelation, conclusion.id],
  );
  const voi = useMemo(
    () => (canDiff ? valueOfInformation(bundle, overlayId!, diffBId!, conclusion.id, { respectCorrelation }) : []),
    [bundle, canDiff, overlayId, diffBId, respectCorrelation, conclusion.id],
  );

  const concSupport = support.get(conclusion.id) ?? 0;
  const delta = concSupport - (baseline.get(conclusion.id) ?? 0);

  const meta = CASE_META[caseId];
  const presetId = meta?.presetMatch ? bundle.claims.find((c) => meta.presetMatch!.test(c.statement))?.id : undefined;
  const presetActive = presetId ? distrust.includes(presetId) : false;

  const select = (id: string) => { setSelected(id); setLeftTab("inspect"); };

  const tabs: { id: MainTab; label: string; count?: number }[] = [
    { id: "argument", label: "Argument" },
    ...(overlays.length >= 2 ? [{ id: "perspectives" as const, label: "Perspectives", count: overlays.length }] : []),
    ...(bundle.challenges.length ? [{ id: "challenges" as const, label: "Challenges", count: bundle.challenges.length }] : []),
    ...(bundle.matches.length + bundle.correlationGroups.length
      ? [{ id: "relations" as const, label: "Relations", count: bundle.matches.length + bundle.correlationGroups.length }] : []),
    ...(bundle.quarantine.length ? [{ id: "quarantine" as const, label: "Quarantine", count: bundle.quarantine.length }] : []),
  ];
  const activeTab = tabs.some((t) => t.id === mainTab) ? mainTab : "argument";

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${caseId}${isLiveRun ? "-live" : merged ? "-merged" : ""}.bundle.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="crumb-row">
        <div className="crumb">
          <button className="back" onClick={onBack} aria-label="Back to overview"><ArrowLeft size={20} /></button>
          <button className="root" onClick={onBack}>Cases</button>
          <span style={{ color: "#c4c4c4" }}>›</span>
          <span className="leaf">{caseLabel}</span>
        </div>
        <div className="status">
          <span className="dot" />
          <span className="k">Live support</span>
          <span className="v">{pct(concSupport)}</span>
          {Math.abs(delta) > 1e-4 && (
            <span className="delta" style={{ color: delta < 0 ? "var(--pink)" : "var(--green-text)" }}>
              {delta > 0 ? "+" : ""}{pct(delta)}
            </span>
          )}
        </div>
      </div>

      <div className="entity-head">
        <div className="entity-id">
          <span className="glyph">{caseLabel[0]}</span>
          <div>
            <div className="nm">{caseLabel}</div>
            <div className="q" title={bundle.question}>Question: <strong>{truncate(bundle.question, 140)}</strong></div>
          </div>
        </div>
        <div className="spacer" />
        <div className="actions">
          <div className="avatar-stack" title={`${bundle.sources.length} source(s)`}>
            {bundle.sources.slice(0, 3).map((s) => <Avatar key={s.id} label={s.title} size={32} title={s.title} />)}
            {bundle.sources.length > 3 && <span className="avatar more" style={{ width: 32, height: 32, fontSize: 12 }}>+{bundle.sources.length - 3}</span>}
          </div>
          {mergePairLabel && !merged && !isLiveRun && onMerge && (
            <button className="btn-outline" onClick={onMerge} title={`Merge ${mergePairLabel}`}>
              <MergeIcon size={18} /> Merge investigator B
            </button>
          )}
          {distrust.length > 0 && (
            <button className="btn-outline" onClick={() => setDistrust([])}>
              <RotateIcon size={17} /> Reset {distrust.length} distrusted
            </button>
          )}
          <button className="btn-ghost" onClick={exportJson}>
            <DownloadIcon size={18} /> Export JSON
          </button>
        </div>
      </div>

      {merged && onRevertMerge && <MergedBanner report={merged} onRevert={onRevertMerge} />}
      {isLiveRun && <LiveRunBanner backLabel={caseLabel} onBack={onExitLive} />}

      <div className="detail-body">
        <LeftPanel
          bundle={bundle} look={look} support={support} query={query}
          leftTab={leftTab} onLeftTab={setLeftTab}
          overlayId={overlayId} onOverlay={setOverlayId}
          respectCorrelation={respectCorrelation} onRespectCorrelation={setRespectCorrelation}
          distrust={distrust} onToggleDistrust={toggleDistrust} onSetDistrust={(fn) => setDistrust(fn)}
          selected={selected} onSelect={select}
        />
        <section className="detail-main">
          <div className="tab-row main-tabs">
            {tabs.map((t) => (
              <button key={t.id} className={`tab${activeTab === t.id ? " active" : ""}`} onClick={() => setMainTab(t.id)}>
                {t.label}
                {t.count !== undefined && <span className="count">{t.count}</span>}
              </button>
            ))}
          </div>
          <div className="content scrl">
            {activeTab === "argument" && (
              <ArgumentTab
                bundle={bundle} look={look} support={support} distrust={distrust}
                selected={selected} onSelect={select} onGraphSelect={setSelected} onToggleDistrust={toggleDistrust}
                conclusion={conclusion} concSupport={concSupport} delta={delta}
                gaugeLabel={overlayId ? `support under “${shortLabel(overlaysMap.get(overlayId)?.label ?? "")}”` : "structural support (neutral priors)"}
                explanation={explanation}
                {...(meta?.tryThis ? { tryThis: meta.tryThis } : {})}
                {...(presetId && meta?.presetLabel
                  ? { presetLabel: meta.presetLabel, presetActive, onPreset: () => toggleDistrust(presetId) }
                  : {})}
              />
            )}
            {activeTab === "perspectives" && diff && overlayId && diffBId && (
              <PerspectivesTab
                bundle={bundle} overlayId={overlayId} diffBId={diffBId} onDiffB={setDiffBId} diff={diff} voi={voi} onSelect={select}
              />
            )}
            {activeTab === "perspectives" && !diff && (
              <p className="subtle">Pick two different perspectives to compare.</p>
            )}
            {activeTab === "challenges" && <ChallengesTab bundle={bundle} onSelect={select} />}
            {activeTab === "relations" && <RelationsTab bundle={bundle} look={look} onSelect={select} />}
            {activeTab === "quarantine" && <QuarantineTab bundle={bundle} />}
          </div>
        </section>
      </div>
    </>
  );
}
