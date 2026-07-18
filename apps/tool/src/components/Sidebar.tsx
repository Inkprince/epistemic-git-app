import { useCases } from "../cases/store.js";
import type { Route } from "../App.js";
import {
  ChartIcon, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, DownloadIcon, FolderIcon, LogoMark, TreeElbow, XIcon, ZapIcon,
} from "./icons.js";

export function Sidebar({
  route, onNavigate, collapsed, mobileOpen, onToggleCollapse, onOpenImport, onOpenBuildCase,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onOpenImport: () => void;
  onOpenBuildCase?: () => void;
}) {
  const { cases, deleteCase } = useCases();
  const onCase = route.screen === "case";
  const casesOpen = onCase || route.screen === "cases";
  const committed = Object.values(cases).filter((c) => c.origin === "committed");
  const local = Object.values(cases).filter((c) => c.origin !== "committed");

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}>
      <div className="logo">
        <LogoMark size={26} />
        <span className="word">Epistemic<em>Git</em></span>
      </div>
      <button className="side-collapse" onClick={onToggleCollapse} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
      <nav className="side-nav scrl" style={{ overflowY: "auto" }}>
        <button className={`nav-item${route.screen === "overview" ? " active" : ""}`} onClick={() => onNavigate({ screen: "overview" })}>
          <ChartIcon size={20} />
          <span className="lbl">Overview</span>
        </button>
        <button
          className={`nav-item${casesOpen ? " active" : ""}`}
          onClick={() => onNavigate({ screen: "cases" })}
          title={collapsed ? "Cases" : undefined}
        >
          <FolderIcon size={20} />
          <span className="lbl">Cases</span>
          <span className="tail">{casesOpen ? <ChevronUp size={18} color="#a3a3a3" /> : <ChevronDown size={18} color="#a3a3a3" />}</span>
        </button>
        {casesOpen && committed.map((c) => (
          <div key={c.id} className={`nav-sub imported${route.screen === "case" && route.caseId === c.id ? " active" : ""}`} role="group">
            <button className="nav-sub-main" onClick={() => onNavigate({ screen: "case", caseId: c.id })} title={c.label}>
              <span className="tree"><TreeElbow /></span>
              <span className="lbl">{c.label}</span>
            </button>
            <button
              className="nav-sub-x"
              aria-label={`Delete case ${c.label}`}
              title="Delete this example case"
              onClick={() => {
                if (!confirm(`Delete “${c.label}”? In the dev server this removes its files; otherwise it is hidden and can be restored by clearing site data.`)) return;
                deleteCase(c.id);
                if (route.screen === "case" && route.caseId === c.id) onNavigate({ screen: "cases" });
              }}
            >
              <XIcon size={11} />
            </button>
          </div>
))}
        {casesOpen && local.map((c) => (
          <div key={c.id} className={`nav-sub imported${onCase && route.caseId === c.id ? " active" : ""}`} role="group">
            <button className="nav-sub-main" onClick={() => onNavigate({ screen: "case", caseId: c.id })} title={c.label}>
              <span className="tree"><TreeElbow /></span>
              <span className="lbl">{c.label}</span>
            </button>
            <span className="import-badge" title={c.origin === "built" ? "Built by the AI pipeline (stored locally in this browser)" : "Imported case (stored locally in this browser)"}>
              {c.origin === "built" ? "built" : "local"}
            </span>
            <button
              className="nav-sub-x"
              aria-label={`Delete case ${c.label}`}
              title="Delete (local only)"
              onClick={() => {
                if (!confirm(`Delete “${c.label}”? This removes it from this browser and can't be undone.`)) return;
                deleteCase(c.id);
                if (onCase && route.caseId === c.id) onNavigate({ screen: "cases" });
              }}
            >
              <XIcon size={11} />
            </button>
          </div>
))}
      </nav>
      <div className="side-bottom">
        <div className="rule" />
        <button className="nav-item" onClick={onOpenImport}>
          <DownloadIcon size={20} style={{ transform: "rotate(180deg)" }} />
          <span className="lbl">Import case</span>
        </button>
        {onOpenBuildCase && (
          <button className="nav-item" onClick={onOpenBuildCase}>
            <ZapIcon size={20} />
            <span className="lbl">Build a case</span>
            <span className="tail"><span className="count-badge-yellow" title="Beta, available when running the development server">beta</span></span>
          </button>
)}
      </div>
    </aside>
);
}
