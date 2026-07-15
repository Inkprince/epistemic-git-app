import { computeSupport, explainSupport, perspectiveDiff, valueOfInformation } from "@epistemic-git/analysis";
import type { MergeReport } from "@epistemic-git/analysis";
import type { Bundle } from "@epistemic-git/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { deleteScenario, loadScenarios, saveScenario } from "../../cases/scenarios.js";
import type { Scenario } from "../../cases/scenarios.js";
import {
  claimsById, inferencesById, overlaysById, passagesById, pct, primaryConclusion, sourcesById, truncate,
} from "../../domain.js";
import { decodeScenario, encodeScenario, idRef, resolveRef } from "../../routing.js";
import type { CaseParams, MainTab } from "../../routing.js";
import { AlertIcon, ArrowLeft, CheckIcon, DownloadIcon, FileTextIcon, GitBranchIcon, LinkIcon, MergeIcon, PlusIcon, QuarantineIcon, RotateIcon, UsersIcon, XIcon } from "../icons.js";
import { Avatar } from "../primitives.js";
import { CommitModal } from "../CommitModal.js";
import { EmptyState } from "../EmptyState.js";
import { LiveRunBanner, MergedBanner } from "../MergeBanner.js";
import { ArgumentTab } from "./ArgumentTab.js";
import { ChallengesTab, QuarantineTab, RelationsTab } from "./AuditTabs.js";
import { LeftPanel, shortLabel } from "./LeftPanel.js";
import type { LeftTab } from "./LeftPanel.js";
import { PerspectiveEditor } from "./PerspectiveEditor.js";
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

interface CaseDetailProps {
  caseId: string;
  caseLabel: string;
  bundle: Bundle;
  query: string;
  params?: CaseParams;
  onParamsChange: (p: CaseParams) => void;
  onAuthoredChanged: () => void;
  merged?: MergeReport;
  onOpenMergePicker: () => void;
  onRevertMerge?: () => void;
  isLiveRun: boolean;
  onExitLive: () => void;
  onBack: () => void;
}

export function CaseDetailScreen(props: CaseDetailProps) {
  if (props.bundle.claims.length === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <EmptyState
          icon={<FileTextIcon size={24} />}
          title="This ledger has no claims yet"
          body="An evidence ledger starts from claims grounded in verbatim passages. Import a bundle that carries evidence, or run the pipeline on a source text to build one."
          cta={<button className="btn-outline" onClick={props.onBack}>Back to overview</button>}
        />
      </div>
    );
  }
  return <CaseDetailInner {...props} />;
}

function CaseDetailInner({
  caseId, caseLabel, bundle, query,
  params, onParamsChange, onAuthoredChanged,
  merged, onOpenMergePicker, onRevertMerge,
  isLiveRun, onExitLive,
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
  const [commitOpen, setCommitOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const canCommit = Boolean(import.meta.env?.DEV) && (isLiveRun || Boolean(merged) || caseId.startsWith("imp-"));

  // Reset per-bundle state when the underlying bundle swaps (merge / live run / revert).
  useEffect(() => {
    setOverlayId(bundle.overlays[0]?.id);
    setDiffBId(bundle.overlays[1]?.id);
    setSelected(conclusion.id);
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

  // Every tab is always present — the tab set is the protocol's shape, not this bundle's luck.
  // Empty tabs explain themselves instead of hiding.
  const tabs: { id: MainTab; label: string; count?: number }[] = [
    { id: "argument", label: "Argument" },
    { id: "perspectives", label: "Perspectives", count: overlays.length },
    { id: "challenges", label: "Challenges", count: bundle.challenges.length },
    { id: "relations", label: "Relations", count: bundle.matches.length + bundle.correlationGroups.length },
    { id: "quarantine", label: "Quarantine", count: bundle.quarantine.length },
  ];
  const activeTab = mainTab;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${caseId}${isLiveRun ? "-live" : merged ? "-merged" : ""}.bundle.json`;
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
          {!merged && (
            <button className="btn-outline" onClick={onOpenMergePicker} title="Merge another ledger into this case">
              <MergeIcon size={18} /> Merge…
            </button>
          )}
          <button className="btn-outline" onClick={copyShareLink} title="Copy a link to this exact view — tab, selection, and scenario included">
            <LinkIcon size={17} /> {linkCopied ? "Copied!" : "Share view"}
          </button>
          <button className="btn-ghost" onClick={exportJson}>
            <DownloadIcon size={18} /> Export JSON
          </button>
          {canCommit && (
            <button className="btn-primary" onClick={() => setCommitOpen(true)} title="Persist this ledger as a permanent case (dev)">
              <CheckIcon size={15} /> Commit as case
            </button>
          )}
        </div>
      </div>
      {commitOpen && (
        <CommitModal
          bundle={bundle}
          suggestedLabel={isLiveRun ? bundle.title : merged ? `${caseLabel} (merged)` : caseLabel}
          onClose={() => setCommitOpen(false)}
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

      <div className="scenario-row">
        <span className="sc-label" title="A branch is a saved belief-state: perspective + distrust set + correlation toggle. The ledger itself never changes — you branch interpretations, not data.">
          <GitBranchIcon size={15} /> Branches
        </span>
        {scenarios.map((s) => (
          <span key={s.name} className={`sc-chip${scenarioActive(s) ? " active" : ""}`}>
            <button className="sc-apply" onClick={() => applyScenario(s)} title={`Apply “${s.name}” — conclusion support ${pct(scenarioSupport.get(s.name) ?? 0)}`}>
              {s.name} <em>{pct(scenarioSupport.get(s.name) ?? 0)}</em>
            </button>
            <button className="sc-x" aria-label={`Delete branch ${s.name}`} onClick={() => setScenarios(deleteScenario(caseId, s.name))}>
              <XIcon size={10} />
            </button>
          </span>
        ))}
        {savingScenario ? (
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
              placeholder="branch name…"
              maxLength={40}
              onKeyDown={(e) => { if (e.key === "Escape") setSavingScenario(false); }}
            />
            <button type="submit" className="chip-btn" style={{ padding: "5px 10px" }}>Save</button>
          </form>
        ) : (
          <button className="sc-new" onClick={() => setSavingScenario(true)} title="Save the current perspective + distrust set as a named branch">
            <PlusIcon size={13} /> Save current
          </button>
        )}
        {distrust.length > 0 && (
          <button className="chip-btn" style={{ marginLeft: "auto" }} onClick={() => setDistrust([])}>
            <RotateIcon size={14} /> Reset {distrust.length} distrusted
          </button>
        )}
      </div>

      {merged && onRevertMerge && <MergedBanner report={merged} bundle={bundle} onRevert={onRevertMerge} onSelect={select} />}
      {isLiveRun && <LiveRunBanner backLabel={caseLabel} onBack={onExitLive} />}

      <div className="detail-body">
        <LeftPanel
          caseId={caseId} bundle={bundle} look={look} support={support} query={query}
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
                title={overlays.length === 0 ? "No perspectives on this ledger yet" : "Comparison needs two perspectives"}
                body={
                  <>
                    A perspective is a late-binding trust layer: the evidence stays fixed while each
                    viewpoint weighs it differently. {overlays.length === 1
                      ? `“${shortLabel(overlays[0]!.label)}” exists — add a second to decompose the disagreement and find the crux.`
                      : "Anyone can add one — the ledger itself never changes."}
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
                  title="No adversarial challenges recorded"
                  body="Challenges are typed objections — invalid inference, scope drift, correlated evidence — raised against specific nodes. The pipeline's audit stage generates them automatically; hand-authored ledgers carry the ones their authors raised."
                />)}
            {activeTab === "relations" && (bundle.matches.length + bundle.correlationGroups.length
              ? <RelationsTab bundle={bundle} look={look} query={query} onSelect={select} />
              : <EmptyState
                  icon={<LinkIcon size={24} />}
                  title="No claim relations recorded"
                  body="Relations link claims across sources — equivalent, contradicts, refines — and correlation groups flag evidence that shares an origin and must not be double-counted. Merge in another ledger on the same question to see relations appear."
                />)}
            {activeTab === "quarantine" && (bundle.quarantine.length
              ? <QuarantineTab bundle={bundle} query={query} />
              : <EmptyState
                  icon={<QuarantineIcon size={24} />}
                  title="Nothing quarantined"
                  body="Every claim in this ledger is grounded in a verbatim source passage. When the pipeline can't locate a proposed claim's quote in the source bytes, the claim is refused and parked here with its receipts — never silently admitted."
                />)}
          </div>
        </section>
      </div>
    </>
  );
}
