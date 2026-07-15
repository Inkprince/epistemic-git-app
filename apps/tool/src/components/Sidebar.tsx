import { bundles } from "../data.js";
import type { Route } from "../App.js";
import {
  ChartIcon, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, FolderIcon, LogoMark, TreeElbow, ZapIcon,
} from "./icons.js";

export function Sidebar({
  route, onNavigate, collapsed, onToggleCollapse, onOpenRunPanel,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenRunPanel?: () => void;
}) {
  const onCase = route.screen === "case";
  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="logo">
        <LogoMark size={26} />
        <span className="word">Epistemic<em>Git</em></span>
      </div>
      <button className="side-collapse" onClick={onToggleCollapse} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
      <nav className="side-nav">
        <button className={`nav-item${route.screen === "overview" ? " active" : ""}`} onClick={() => onNavigate({ screen: "overview" })}>
          <ChartIcon size={20} />
          <span className="lbl">Overview</span>
        </button>
        <button
          className={`nav-item${onCase ? " active" : ""}`}
          onClick={() => onNavigate({ screen: "case", caseId: onCase ? route.caseId : Object.keys(bundles)[0]! })}
          title={collapsed ? "Cases" : undefined}
        >
          <FolderIcon size={20} />
          <span className="lbl">Cases</span>
          <span className="tail">{onCase ? <ChevronUp size={18} color="#a3a3a3" /> : <ChevronDown size={18} color="#a3a3a3" />}</span>
        </button>
        {onCase &&
          Object.entries(bundles).map(([id, { label }]) => (
            <button
              key={id}
              className={`nav-sub${route.caseId === id ? " active" : ""}`}
              onClick={() => onNavigate({ screen: "case", caseId: id })}
            >
              <span className="tree"><TreeElbow /></span>
              <span className="lbl">{label}</span>
            </button>
          ))}
      </nav>
      <div className="side-bottom">
        {onOpenRunPanel && (
          <>
            <div className="rule" />
            <button className="nav-item" onClick={onOpenRunPanel}>
              <ZapIcon size={20} />
              <span className="lbl">Run pipeline</span>
              <span className="tail"><span className="count-badge-yellow">dev</span></span>
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
