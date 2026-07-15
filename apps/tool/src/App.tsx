import { merge } from "@epistemic-git/analysis";
import type { MergeReport } from "@epistemic-git/analysis";
import type { Bundle } from "@epistemic-git/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { CaseDetailScreen } from "./components/detail/CaseDetailScreen.js";
import { OverviewScreen } from "./components/overview/OverviewScreen.js";
import { RunPanelModal } from "./components/RunPanelModal.js";
import { Sidebar } from "./components/Sidebar.js";
import { TopBar } from "./components/TopBar.js";
import { bundles, mergePairs } from "./data.js";
import { overviewKpis } from "./stats.js";

export type Route =
  | { screen: "overview" }
  | { screen: "case"; caseId: string; selectId?: string };

/** Hash deep-links (`#/case/lhc`) so views are sharable and the back button works. */
const routeFromHash = (): Route => {
  if (typeof window === "undefined") return { screen: "overview" };
  const m = /^#\/case\/([\w-]+)/.exec(window.location.hash);
  return m?.[1] && bundles[m[1]] ? { screen: "case", caseId: m[1] } : { screen: "overview" };
};
const hashForRoute = (r: Route): string => (r.screen === "case" ? `#/case/${r.caseId}` : "#/");

export function App({ initialRoute }: { initialRoute?: Route }) {
  const [route, setRoute] = useState<Route>(initialRoute ?? routeFromHash());
  const [mergedView, setMergedView] = useState<{ bundle: Bundle; report: MergeReport } | null>(null);
  const [liveResult, setLiveResult] = useState<Bundle | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [runOpen, setRunOpen] = useState(false);

  const isDev = Boolean(import.meta.env?.DEV);

  const navigate = (r: Route) => {
    if (r.screen !== "case" || route.screen !== "case" || r.caseId !== route.caseId) {
      setMergedView(null);
      setLiveResult(null);
    }
    setQuery("");
    setRoute(r);
    if (typeof window !== "undefined" && window.location.hash !== hashForRoute(r)) {
      window.location.hash = hashForRoute(r);
    }
  };

  const routeRef = useRef(route);
  routeRef.current = route;
  useEffect(() => {
    // Back/forward or a hand-edited URL: only react when the hash names a different route,
    // so our own programmatic hash syncs don't clear per-route state.
    const onHash = () => {
      const r = routeFromHash();
      const cur = routeRef.current;
      const same = r.screen === cur.screen && (r.screen !== "case" || (cur.screen === "case" && r.caseId === cur.caseId));
      if (same) return;
      setMergedView(null);
      setLiveResult(null);
      setQuery("");
      setRoute(r);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const caseId = route.screen === "case" ? route.caseId : undefined;
  const caseEntry = caseId ? bundles[caseId] : undefined;
  const baseBundle = caseEntry?.bundle;
  const bundle = liveResult ?? mergedView?.bundle ?? baseBundle;
  const pair = caseId ? mergePairs[caseId] : undefined;

  const totals = useMemo(() => overviewKpis(bundles), []);
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

  return (
    <div className="shell">
      <div className="app-card">
        <Sidebar
          route={route}
          onNavigate={navigate}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          {...(isDev ? { onOpenRunPanel: () => setRunOpen(true) } : {})}
        />
        <div className="main-col">
          <TopBar
            query={query}
            onQuery={setQuery}
            placeholder={route.screen === "case" ? "Search claims…" : "Search cases…"}
            counts={counts}
          />
          {route.screen === "overview" && (
            <OverviewScreen
              query={query}
              onOpenCase={(id, selectId) => navigate({ screen: "case", caseId: id, ...(selectId ? { selectId } : {}) })}
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
              {...(route.selectId ? { selectId: route.selectId } : {})}
              {...(pair ? { mergePairLabel: pair.label } : {})}
              {...(mergedView ? { merged: mergedView.report } : {})}
              {...(pair && baseBundle
                ? { onMerge: () => { setLiveResult(null); setMergedView(merge(baseBundle, pair.bundle)); } }
                : {})}
              onRevertMerge={() => setMergedView(null)}
              isLiveRun={Boolean(liveResult)}
              onExitLive={() => setLiveResult(null)}
              onBack={() => navigate({ screen: "overview" })}
            />
          )}
        </div>
      </div>
      {runOpen && isDev && (
        <RunPanelModal
          onClose={() => setRunOpen(false)}
          onResult={(b) => {
            setMergedView(null);
            setLiveResult(b);
            setRunOpen(false);
            const target: Route = route.screen === "case" ? route : { screen: "case", caseId: Object.keys(bundles)[0]! };
            setRoute(target);
            if (typeof window !== "undefined") window.location.hash = hashForRoute(target);
          }}
        />
      )}
    </div>
  );
}
