import { merge } from "@epistemic-git/analysis";
import type { MergeReport } from "@epistemic-git/analysis";
import { bundleDigest } from "@epistemic-git/protocol";
import type { Bundle } from "@epistemic-git/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { withAuthored } from "./cases/authored.js";
import { appendEvent, snapshotPut } from "./cases/history.js";
import { CasesProvider, useCases } from "./cases/store.js";
import { CaseDetailScreen } from "./components/detail/CaseDetailScreen.js";
import { HelpModal } from "./components/HelpModal.js";
import { ImportModal } from "./components/ImportModal.js";
import { MergePickerModal } from "./components/MergePickerModal.js";
import { OverviewScreen } from "./components/overview/OverviewScreen.js";
import { RunPanelModal } from "./components/RunPanelModal.js";
import { Sidebar } from "./components/Sidebar.js";
import { TopBar } from "./components/TopBar.js";
import type { SearchHit } from "./components/TopBar.js";
import { formatHash, idRef, parseHash } from "./routing.js";
import type { CaseParams, Route } from "./routing.js";
import { overviewKpis, supportByCase } from "./stats.js";

export type { Route } from "./routing.js";

const routeFromHash = (): Route =>
  typeof window === "undefined" ? { screen: "overview" } : parseHash(window.location.hash);

export function App({ initialRoute }: { initialRoute?: Route }) {
  return (
    <CasesProvider>
      <AppShell {...(initialRoute ? { initialRoute } : {})} />
    </CasesProvider>
  );
}

function AppShell({ initialRoute }: { initialRoute?: Route }) {
  const { cases, ready } = useCases();
  const [route, setRoute] = useState<Route>(initialRoute ?? routeFromHash());
  const [mergedView, setMergedView] = useState<{ bundle: Bundle; report: MergeReport } | null>(null);
  const [liveResult, setLiveResult] = useState<Bundle | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("egit:ui:collapsed") === "1");
  const [runOpen, setRunOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [authoredVersion, setAuthoredVersion] = useState(0);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try { localStorage.setItem("egit:ui:collapsed", c ? "0" : "1"); } catch { /* ignore */ }
      return !c;
    });

  const isDev = Boolean(import.meta.env?.DEV);

  const navigate = (r: Route) => {
    if (r.screen !== "case" || route.screen !== "case" || r.caseId !== route.caseId) {
      setMergedView(null);
      setLiveResult(null);
    }
    setQuery("");
    setMobileNavOpen(false);
    setRoute(r);
    if (typeof window !== "undefined" && window.location.hash !== formatHash(r)) {
      window.location.hash = formatHash(r);
    }
  };

  const routeRef = useRef(route);
  routeRef.current = route;
  useEffect(() => {
    // Back/forward or a hand-edited URL. Per-case state is reset ONLY when the caseId changes;
    // a params-only change (tab/selection/scenario) flows into the detail screen instead.
    const onHash = () => {
      const r = routeFromHash();
      const cur = routeRef.current;
      const sameCase = r.screen === "case" && cur.screen === "case" && r.caseId === cur.caseId;
      if (r.screen === cur.screen && (r.screen !== "case" || sameCase)) {
        if (sameCase && JSON.stringify(r) !== JSON.stringify(cur)) setRoute(r);
        return;
      }
      setMergedView(null);
      setLiveResult(null);
      setQuery("");
      setRoute(r);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Detail-screen state (tab / selection / scenario) syncs into the URL without polluting
  // browser history — back steps between screens and cases, not between checkbox clicks.
  const onParamsChange = (p: CaseParams) => {
    const cur = routeRef.current;
    if (cur.screen !== "case") return;
    const next: Route = { screen: "case", caseId: cur.caseId, ...(Object.keys(p).length ? { params: p } : {}) };
    routeRef.current = next;
    setRoute(next);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", formatHash(next));
    }
  };

  const caseEntry = route.screen === "case" ? cases[route.caseId] : undefined;
  const baseBundle = caseEntry?.bundle;
  const rawBundle = liveResult ?? mergedView?.bundle ?? baseBundle;
  // Locally authored perspectives compose on top of whatever bundle is in view.
  const bundle = useMemo(
    () => (rawBundle && route.screen === "case" ? withAuthored(rawBundle, route.caseId) : rawBundle),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawBundle, route.screen === "case" ? route.caseId : "", authoredVersion],
  );

  // Deep link to a case that doesn't exist (or an import not on this machine) → overview once hydrated.
  useEffect(() => {
    if (route.screen === "case" && ready && !cases[route.caseId]) navigate({ screen: "overview" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, ready, cases]);

  const totals = useMemo(() => overviewKpis(cases), [cases]);

  // On the overview, matching cases pop out under the search box so results are one glance away, not a scroll away.
  const searchHits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (route.screen !== "overview" || !q) return [];
    const mergeableIds = new Set(
      Object.values(cases).filter((c) => c.mergePairs?.length).map((c) => c.id),
    );
    return supportByCase(cases, mergeableIds)
      .map((c) => ({ ...c, question: cases[c.id]!.bundle.question }))
      .filter((c) => c.label.toLowerCase().includes(q) || c.question.toLowerCase().includes(q));
  }, [route.screen, query, cases]);
  const counts = bundle
    ? [
        { label: "claims", value: bundle.claims.length },
        { label: "inferences", value: bundle.inferences.length },
        { label: "matches", value: bundle.matches.length },
        { label: "challenges", value: bundle.challenges.length },
        { label: "quarantined", value: bundle.quarantine.length },
      ]
    : [
        { label: "cases", value: totals.cases },
        { label: "claims", value: totals.claims },
        { label: "challenges", value: totals.challenges },
        { label: "quarantined", value: totals.quarantined },
      ];

  const recordMerge = (base: Bundle, incoming: Bundle, incomingLabel: string, caseId: string) => {
    const result = merge(base, incoming);
    setLiveResult(null);
    setMergedView(result);
    const baseDigest = bundleDigest(base);
    const incomingDigest = bundleDigest(incoming);
    const digest = bundleDigest(result.bundle);
    void snapshotPut(baseDigest, base);
    void snapshotPut(digest, result.bundle);
    appendEvent({
      caseId, kind: "merged", digest, parents: [baseDigest, incomingDigest],
      stats: {
        added: Object.values(result.report.added).reduce((a, b) => a + b, 0),
        conflicts: result.report.conflicts.length,
      },
      note: incomingLabel,
    });
  };

  return (
    <div className="shell">
      <div className="app-card">
        {mobileNavOpen && <div className="nav-overlay" onClick={() => setMobileNavOpen(false)} aria-hidden />}
        <Sidebar
          route={route}
          onNavigate={navigate}
          collapsed={collapsed}
          mobileOpen={mobileNavOpen}
          onToggleCollapse={toggleCollapsed}
          onOpenImport={() => { setMobileNavOpen(false); setImportOpen(true); }}
          {...(isDev ? { onOpenRunPanel: () => { setMobileNavOpen(false); setRunOpen(true); } } : {})}
        />
        <div className="main-col">
          <TopBar
            query={query}
            onQuery={setQuery}
            placeholder={route.screen === "case" ? "Search this case…" : "Search cases…"}
            counts={counts}
            onOpenNav={() => setMobileNavOpen(true)}
            onOpenHelp={() => setHelpOpen(true)}
            {...(route.screen === "overview"
              ? { results: searchHits, onPickResult: (id: string) => navigate({ screen: "case", caseId: id }) }
              : {})}
          />
          {route.screen === "overview" && (
            <OverviewScreen
              query={query}
              onOpenCase={(id, selectId) =>
                navigate({ screen: "case", caseId: id, ...(selectId ? { params: { sel: idRef(selectId) } } : {}) })}
              onOpenImport={() => setImportOpen(true)}
              {...(isDev ? { onOpenRunPanel: () => setRunOpen(true) } : {})}
            />
          )}
          {route.screen === "case" && caseEntry && bundle && (
            <CaseDetailScreen
              key={route.caseId}
              caseId={route.caseId}
              caseLabel={liveResult ? "Live pipeline run" : caseEntry.label}
              bundle={bundle}
              query={query}
              {...(route.params ? { params: route.params } : {})}
              onParamsChange={onParamsChange}
              onAuthoredChanged={() => setAuthoredVersion((v) => v + 1)}
              {...(mergedView ? { merged: mergedView.report } : {})}
              onOpenMergePicker={() => setMergeOpen(true)}
              onRevertMerge={() => setMergedView(null)}
              isLiveRun={Boolean(liveResult)}
              onExitLive={() => setLiveResult(null)}
              onBack={() => navigate({ screen: "overview" })}
            />
          )}
          {route.screen === "case" && !caseEntry && (
            <div style={{ padding: 40 }} className="subtle">{ready ? "Case not found." : "Loading…"}</div>
          )}
        </div>
      </div>
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onImported={(id) => navigate({ screen: "case", caseId: id })}
        />
      )}
      {mergeOpen && route.screen === "case" && bundle && (
        <MergePickerModal
          currentCaseId={route.caseId}
          currentBundle={bundle}
          onClose={() => setMergeOpen(false)}
          onPick={(incoming, label) => recordMerge(bundle, incoming, label, route.caseId)}
        />
      )}
      {runOpen && isDev && (
        <RunPanelModal
          onClose={() => setRunOpen(false)}
          onResult={(b) => {
            setMergedView(null);
            setLiveResult(b);
            setRunOpen(false);
            const fallback = Object.keys(cases)[0];
            const target: Route = route.screen === "case" ? route : { screen: "case", caseId: fallback ?? "lhc" };
            setRoute(target);
            appendEvent({
              caseId: target.caseId, kind: "pipeline-run", digest: bundleDigest(b), parents: [],
              stats: { claims: b.claims.length, challenges: b.challenges.length }, note: b.title,
            });
            void snapshotPut(bundleDigest(b), b);
            if (typeof window !== "undefined") window.location.hash = formatHash(target);
          }}
        />
      )}
    </div>
  );
}
