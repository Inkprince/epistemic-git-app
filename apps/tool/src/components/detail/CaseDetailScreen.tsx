import { computeSupport, explainSupport, perspectiveDiff, valueOfInformation } from "@epistemic-git/analysis";
import type { MergeReport } from "@epistemic-git/analysis";
import type { Bundle } from "@epistemic-git/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { deleteScenario, loadScenarios, saveScenario } from "../../cases/scenarios.js";
import type { Scenario } from "../../cases/scenarios.js";
import type { CaseOrigin } from "../../cases/types.js";
import {
  claimsById, inferencesById, overlaysById, passagesById, pct, primaryConclusion, sourcesById, truncate,
} from "../../domain.js";
import { decodeScenario, encodeScenario, idRef, resolveRef } from "../../routing.js";
import type { CaseParams, MainTab } from "../../routing.js";
import { AlertIcon, ArrowLeft, CheckIcon, DownloadIcon, FileTextIcon, GitBranchIcon, LinkIcon, MergeIcon, PlusIcon, QuarantineIcon, RotateIcon, UsersIcon, XIcon } from "../icons.js";
import { Avatar } from "../primitives.js";
import { SaveCaseModal } from "../SaveCaseModal.js";
import { EmptyState } from "../EmptyState.js";
import { MergedBanner } from "../MergeBanner.js";
import { ArgumentTab } from "./ArgumentTab.js";
import { AskBox } from "./AskBox.js";
import { ChallengesTab, ConnectionsTab, ExcludedTab } from "./AuditTabs.js";
import { LeftPanel, shortLabel } from "./LeftPanel.js";
import type { LeftTab } from "./LeftPanel.js";
import { PerspectiveEditor } from "./PerspectiveEditor.js";
import { PerspectivesTab } from "./PerspectivesTab.js";
import { RawDocumentModal } from "./RawDocumentModal.js";
import type { Look } from "./types.js";

/** Per-case onboarding: a "what to try" line and an optional one-click flagship preset. */
const CASE_META: Record<string, { tryThis: string; presetLabel?: string; presetMatch?: RegExp }> = {
  lhc: {
    tryThis: "Try this: distrust Hawking radiation and watch the safety conclusion barely move, the real-world cosmic-ray and white-dwarf evidence carries it on its own, without the theory-based premise.",
    presetLabel: "▶ Distrust Hawking radiation",
    presetMatch: /hawking radiation/i,
  },
  covid: {
    tryThis: "A live, contested dispute. Open the Perspectives tab and compare the two readings of ‘the market was the early epicentre’ one takes it at face value, the other says it mostly reflects where testing first looked. The crux the tool names is a technical finding about where the earliest cases cluster, not the loud public argument. Reported in plain terms, no origin probability.",
  },
  eggs: {
    tryThis: "Everyday, messy evidence. Open the Perspectives tab and compare the ‘eggs are safe in moderation’ and ‘eggs raise risk’ readings: the named crux is how much weight the link to overall death rates carries. Also see the ‘contradicts’ connection between the reduced-risk and increased-mortality findings.",
  },
};

interface CaseDetailProps {
  caseId: string;
  caseLabel: string;
  origin: CaseOrigin;
  bundle: Bundle;
  query: string;
  params?: CaseParams;
  onParamsChange: (p: CaseParams) => void;
  onAuthoredChanged: () => void;
  merged?: MergeReport;
  onOpenMergePicker: () => void;
  onRevertMerge?: () => void;
  onBack: () => void;
}

export function CaseDetailScreen(props: CaseDetailProps) {
  if (props.bundle.claims.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <EmptyState
          icon={<FileTextIcon size={24} />}
          title="This case has no claims yet"
          body="A case starts with claims backed by exact quotes. Import a case file that carries evidence, or build a case from a source."
          cta={<button className="btn-outline" onClick={props.onBack}>Back to overview</button>}
        />
      </div>
);
  }
  return <CaseDetailInner {...props} />;
}

function CaseDetailInner({
  caseId, caseLabel, origin, bundle, query,
  params, onParamsChange, onAuthoredChanged,
  merged, onOpenMergePicker, onRevertMerge,
  onBack,
}: CaseDetailProps) {
  const { conclusion, look } = useMemo(() => ({
    conclusion: primaryConclusion(bundle)!, // non-null: CaseDetailScreen guards claims.length > 0
    look: {
      claims: claimsById(bundle), inferences: inferencesById(bundle),
      passages: passagesById(bundle), sources: sourcesById(bundle),
    } as Look,
  }), [bundle]);

  const overlays = bundle.overlays;
  const overlaysMap = useMemo(() => overlaysById(bundle), [bundle]);

  // Initial state comes from the deep link when present.
  const initialScenario = params?.scenario ? decodeScenario(params.scenario, bundle) : null;
  const initialSel = params?.sel ? resolveRef(params.sel, bundle) : undefined;
  const [overlayId, setOverlayId] = useState<string | undefined>(initialScenario?.overlayId ?? overlays[0]?.id);
  const [diffBId, setDiffBId] = useState<string | undefined>(overlays[1]?.id);
  const [distrust, setDistrust] = useState<string[]>(initialScenario?.distrust ?? []);
  const [respectCorrelation, setRespectCorrelation] = useState(initialScenario?.respectCorrelation ?? true);
  const [selected, setSelected] = useState<string>(initialSel ?? conclusion.id);
  const [leftTab, setLeftTab] = useState<LeftTab>(initialSel ? "inspect" : "evidence");
  const [mainTab, setMainTab] = useState<MainTab>(params?.tab ?? "argument");
  const [scenarios, setScenarios] = useState<Scenario[]>(() => loadScenarios(caseId));
  const [savingScenario, setSavingScenario] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [rawDocOpen, setRawDocOpen] = useState(false);
  const canSave = Boolean(import.meta.env?.DEV) && (origin !== "committed" || Boolean(merged));

  // Reset per-bundle state when the underlying bundle swaps (merge / build / revert) but keep
  // whatever still resolves. Local additions (an AI summary, a red-teamed challenge) recompose the
  // bundle object too, and they must not yank the user off the node they are looking at.
  useEffect(() => {
    setOverlayId((cur) => (cur && bundle.overlays.some((o) => o.id === cur) ? cur : bundle.overlays[0]?.id));
    setDiffBId((cur) => (cur && bundle.overlays.some((o) => o.id === cur) ? cur : bundle.overlays[1]?.id));
    setSelected((cur) =>
      bundle.claims.some((c) => c.id === cur) || bundle.inferences.some((i) => i.id === cur) ? cur : conclusion.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, conclusion.id]);

  const distrustKey = [...distrust].sort().join(",");
  const toggleDistrust = (id: string) =>
    setDistrust((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  // ── Deep-link sync ────────────────────────────────────────────────────────
  // State → URL (via onParamsChange → replaceState). lastEmittedRef breaks the echo:
  // an external hash change (back/forward, hand-edit) differs from what we emitted.
  const lastEmittedRef = useRef<string | null>(null);
  const scenarioCode = encodeScenario({ ...(overlayId ? { overlayId } : {}), distrust, respectCorrelation });
  const defaultScenarioCode = encodeScenario({ ...(overlays[0]?.id ? { overlayId: overlays[0].id } : {}), distrust: [], respectCorrelation: true });
  // Saved scenarios exist, a save is in progress, or the current reading differs from the default.
  const scenarioRelevant = scenarios.length > 0 || savingScenario || scenarioCode !== defaultScenarioCode;
  useEffect(() => {
    const p: CaseParams = {
      ...(mainTab !== "argument" ? { tab: mainTab } : {}),
      ...(selected !== conclusion.id ? { sel: idRef(selected) } : {}),
      ...(scenarioCode !== defaultScenarioCode ? { scenario: scenarioCode } : {}),
    };
    const key = JSON.stringify(p);
    if (key === lastEmittedRef.current) return;
    lastEmittedRef.current = key;
    const t = setTimeout(() => onParamsChange(p), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab, selected, scenarioCode, defaultScenarioCode, conclusion.id]);

  // URL → state, only for genuinely external changes.
  const paramsKey = JSON.stringify(params ?? {});
  useEffect(() => {
    if (paramsKey === lastEmittedRef.current) return;
    const p = params ?? {};
    setMainTab(p.tab ?? "argument");
    const sel = p.sel ? resolveRef(p.sel, bundle) : undefined;
    if (sel) { setSelected(sel); setLeftTab("inspect"); }
    const sc = p.scenario ? decodeScenario(p.scenario, bundle) : null;
    if (sc) {
      setOverlayId(sc.overlayId ?? bundle.overlays[0]?.id);
      setDistrust(sc.distrust);
      setRespectCorrelation(sc.respectCorrelation);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

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

  // Conclusion support per saved scenario, for the branch chips.
  const scenarioSupport = useMemo(() => {
    const out = new Map<string, number>();
    for (const s of scenarios) {
      const field = computeSupport(bundle, {
        ...(s.overlayId ? { overlayId: s.overlayId } : {}),
        respectCorrelation: s.respectCorrelation,
        distrustClaims: new Set(s.distrust),
      });
      out.set(s.name, field.support.get(conclusion.id) ?? 0);
    }
    return out;
  }, [bundle, scenarios, conclusion.id]);

  const scenarioActive = (s: Scenario) =>
    (s.overlayId ?? "") === (overlayId ?? "") &&
    s.respectCorrelation === respectCorrelation &&
    [...s.distrust].sort().join(",") === distrustKey;

  const applyScenario = (s: Scenario) => {
    setOverlayId(s.overlayId ?? bundle.overlays[0]?.id);
    setDistrust(s.distrust.filter((id) => look.claims.has(id)));
    setRespectCorrelation(s.respectCorrelation);
  };

  const meta = CASE_META[caseId];
  const presetId = meta?.presetMatch ? bundle.claims.find((c) => meta.presetMatch!.test(c.statement))?.id : undefined;
  const presetActive = presetId ? distrust.includes(presetId) : false;

  const select = (id: string) => { setSelected(id); setLeftTab("inspect"); };

  // Every tab is always present, the tab set is the protocol's shape, not this bundle's luck.
  // Empty tabs explain themselves instead of hiding.
  const tabs: { id: MainTab; label: string; count?: number }[] = [
    { id: "argument", label: "Argument" },
    { id: "perspectives", label: "Perspectives", count: overlays.length },
    { id: "challenges", label: "Challenges", count: bundle.challenges.length },
    { id: "connections", label: "Connections", count: bundle.matches.length + bundle.correlationGroups.length },
    { id: "excluded", label: "Excluded", count: bundle.quarantine.length },
  ];
  const activeTab = mainTab;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${caseId}${merged ? "-merged" : ""}.case.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyShareLink = () => {
    void navigator.clipboard?.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1600);
    });
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
          <span className="k">Current support</span>
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
          {!merged && (
            <button className="btn-outline" onClick={onOpenMergePicker} title="Merge another case into this one">
              <MergeIcon size={18} /> Merge…
            </button>
)}
          <button className="btn-outline" onClick={copyShareLink} title="Copy a link to this exact view, tab, selection, and scenario included">
            <LinkIcon size={17} /> {linkCopied ? "Copied!" : "Share view"}
          </button>
          {bundle.sourceDocument && (
            <button className="btn-ghost" onClick={() => setRawDocOpen(true)} title="View the original document this case was broken down from">
              <FileTextIcon size={18} /> Raw document
            </button>
)}
          <button className="btn-ghost" onClick={exportJson} title="Downloads this case as JSON">
            <DownloadIcon size={18} /> Export case
          </button>
          {canSave && (
            <button className="btn-primary" onClick={() => setSaveOpen(true)} title="Saves this case permanently to the project and the sidebar (dev only)">
              <CheckIcon size={15} /> Save as case
            </button>
)}
        </div>
      </div>
      {rawDocOpen && <RawDocumentModal bundle={bundle} onClose={() => setRawDocOpen(false)} />}
      {saveOpen && (
        <SaveCaseModal
          bundle={bundle}
          suggestedLabel={merged ? `${caseLabel} (merged)` : caseLabel}
          onClose={() => setSaveOpen(false)}
        />
)}
      {editorOpen && (
        <PerspectiveEditor
          caseId={caseId}
          bundle={bundle}
          onClose={() => setEditorOpen(false)}
          onSaved={(id) => { onAuthoredChanged(); setOverlayId(id); setMainTab("perspectives"); }}
        />
)}

      {/* The row stays quiet until there is something to save or saved: a scenario only makes
          sense once the user has changed a perspective, distrusted evidence, or saved one before. */}
      <div className="scenario-row">
        <span className="sc-label" title="A scenario is a saved what-if: which perspective is applied and which evidence is set aside. The case itself never changes, you save readings, not edits.">
          <GitBranchIcon size={15} /> Scenarios
        </span>
        {!scenarioRelevant && (
          <span className="note" style={{ margin: 0 }}>
            Change the perspective or distrust evidence, then save that reading here as a scenario.
          </span>
)}
        {scenarioRelevant && scenarios.map((s) => (
          <span key={s.name} className={`sc-chip${scenarioActive(s) ? " active" : ""}`}>
            <button className="sc-apply" onClick={() => applyScenario(s)} title={`Apply “${s.name}” conclusion support ${pct(scenarioSupport.get(s.name) ?? 0)}`}>
              {s.name} <em>{pct(scenarioSupport.get(s.name) ?? 0)}</em>
            </button>
            <button className="sc-x" aria-label={`Delete scenario ${s.name}`} onClick={() => setScenarios(deleteScenario(caseId, s.name))}>
              <XIcon size={10} />
            </button>
          </span>
))}
        {scenarioRelevant && (savingScenario ? (
          <form
            className="sc-form"
            onSubmit={(e) => {
              e.preventDefault();
              const name = scenarioName.trim();
              if (!name) return;
              setScenarios(saveScenario(caseId, {
                name,
                ...(overlayId ? { overlayId } : {}),
                distrust,
                respectCorrelation,
              }));
              setScenarioName("");
              setSavingScenario(false);
            }}
          >
            <input
              autoFocus
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="scenario name…"
              maxLength={40}
              onKeyDown={(e) => { if (e.key === "Escape") setSavingScenario(false); }}
            />
            <button type="submit" className="chip-btn" style={{ padding: "5px 10px" }}>Save</button>
          </form>
) : (
          <button className="sc-new" onClick={() => setSavingScenario(true)} title="Save the current perspective + distrust set as a named scenario">
            <PlusIcon size={13} /> Save this scenario
          </button>
))}
        {distrust.length > 0 && (
          <button className="chip-btn" style={{ marginLeft: "auto" }} onClick={() => setDistrust([])}>
            <RotateIcon size={14} /> Trust all again ({distrust.length})
          </button>
)}
      </div>

      {merged && onRevertMerge && <MergedBanner report={merged} bundle={bundle} onRevert={onRevertMerge} onSelect={select} />}

      <div className="detail-body">
        <LeftPanel
          caseId={caseId} bundle={bundle} look={look} support={support} query={query}
          leftTab={leftTab} onLeftTab={setLeftTab}
          overlayId={overlayId} onOverlay={setOverlayId}
          respectCorrelation={respectCorrelation} onRespectCorrelation={setRespectCorrelation}
          distrust={distrust} onToggleDistrust={toggleDistrust} onSetDistrust={(fn) => setDistrust(fn)}
          selected={selected} onSelect={select} onLocalChange={onAuthoredChanged}
        />
        <section className="detail-main">
          <AskBox
            bundle={bundle}
            ctx={{
              respectCorrelation,
              ...(overlayId ? { overlayId } : {}),
              ...(diffBId ? { diffBId } : {}),
              selectedId: selected,
            }}
            onSelect={select}
            {...(meta?.tryThis ? { tryThis: meta.tryThis } : {})}
            {...(presetId && meta?.presetLabel
              ? { presetLabel: meta.presetLabel, presetActive, onPreset: () => toggleDistrust(presetId) }
              : {})}
          />
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
                gaugeLabel={overlayId ? `Support · ${shortLabel(overlaysMap.get(overlayId)?.label ?? "")}` : "Support · neutral, no perspective applied"}
                explanation={explanation}
              />
)}
            {activeTab === "perspectives" && diff && overlayId && diffBId && (
              <>
                <PerspectivesTab
                  bundle={bundle} overlayId={overlayId} diffBId={diffBId} onDiffB={setDiffBId} diff={diff} voi={voi} onSelect={select}
                />
                <div style={{ marginTop: 22 }}>
                  <button className="btn-outline btn-sm" onClick={() => setEditorOpen(true)}>
                    <PlusIcon size={14} /> Create another perspective
                  </button>
                </div>
              </>
)}
            {activeTab === "perspectives" && !diff && (
              <EmptyState
                icon={<UsersIcon size={24} />}
                title={overlays.length === 0 ? "No perspectives on this case yet" : "Comparison needs two perspectives"}
                body={
                  <>
                    A perspective is your reading of the evidence: the claims stay fixed, and you
                    choose which ones to accept. {overlays.length === 1
                      ? `“${shortLabel(overlays[0]!.label)}” is here, add a second to see exactly where they disagree and find the crux.`
                      : "Anyone can add one, the case itself never changes."}
                  </>
                }
                cta={
                  <button className="btn-primary" onClick={() => setEditorOpen(true)}>
                    <PlusIcon size={15} color="#fff" /> Create perspective
                  </button>
                }
              />
)}
            {activeTab === "challenges" && (bundle.challenges.length
              ? <ChallengesTab bundle={bundle} query={query} onSelect={select} />
              : <EmptyState
                  icon={<AlertIcon size={24} />}
                  title="No challenges recorded"
                  body="Challenges are specific objections (reasoning that doesn't follow, scope drift, double-counted evidence) each aimed at one claim or reasoning step. The AI raises them automatically when a case is built; hand-built cases carry the ones their authors raised."
                />)}
            {activeTab === "connections" && (bundle.matches.length + bundle.correlationGroups.length
              ? <ConnectionsTab bundle={bundle} look={look} query={query} onSelect={select} />
              : <EmptyState
                  icon={<LinkIcon size={24} />}
                  title="No connections recorded"
                  body="Connections link claims across sources (same claim, contradicts, more specific) and shared-origin groups flag evidence that comes from the same place, so it isn't counted twice. Merge in another case on the same question to see them appear."
                />)}
            {activeTab === "excluded" && (bundle.quarantine.length
              ? <ExcludedTab bundle={bundle} query={query} />
              : <EmptyState
                  icon={<QuarantineIcon size={24} />}
                  title="Nothing excluded"
                  body="Every claim here is backed by an exact quote from a source. When a proposed claim's quote can't be found in the source text, the claim is refused and parked here with the reason, never let in quietly, never silently dropped."
                />)}
          </div>
        </section>
      </div>
    </>
);
}
