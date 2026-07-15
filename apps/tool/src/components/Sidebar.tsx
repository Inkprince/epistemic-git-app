import { useCases } from "../cases/store.js";
import type { Route } from "../App.js";
import {
  ChartIcon, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, DownloadIcon, FolderIcon, LogoMark, TreeElbow, XIcon, ZapIcon,
} from "./icons.js";

export function Sidebar({
  route, onNavigate, collapsed, mobileOpen, onToggleCollapse, onOpenImport, onOpenRunPanel,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onOpenImport: () => void;
  onOpenRunPanel?: () => void;
}) {
  const { cases, removeImported } = useCases();
  const onCase = route.screen === "case";
  const committed = Object.values(cases).filter((c) => c.origin === "committed");
  const imported = Object.values(cases).filter((c) => c.origin === "imported");

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
          className={`nav-item${onCase ? " active" : ""}`}
          onClick={() => onNavigate({ screen: "case", caseId: onCase ? route.caseId : committed[0]?.id ?? "lhc" })}
          title={collapsed ? "Cases" : undefined}
        >
          <FolderIcon size={20} />
          <span className="lbl">Cases</span>
          <span className="tail">{onCase ? <ChevronUp size={18} color="#a3a3a3" /> : <ChevronDown size={18} color="#a3a3a3" />}</span>
        </button>
        {onCase && committed.map((c) => (
          <button
            key={c.id}
            className={`nav-sub${route.caseId === c.id ? " active" : ""}`}
            onClick={() => onNavigate({ screen: "case", caseId: c.id })}
          >
            <span className="tree"><TreeElbow /></span>
            <span className="lbl">{c.label}</span>
          </button>
        ))}
        {onCase && imported.map((c) => (
          <div key={c.id} className={`nav-sub imported${route.caseId === c.id ? " active" : ""}`} role="group">
            <button className="nav-sub-main" onClick={() => onNavigate({ screen: "case", caseId: c.id })} title={c.label}>
              <span className="tree"><TreeElbow /></span>
              <span className="lbl">{c.label}</span>
            </button>
            <span className="import-badge" title="Imported bundle (stored locally)">imp</span>
            <button
              className="nav-sub-x"
              aria-label={`Remove imported case ${c.label}`}
              title="Remove (local only)"
              onClick={() => {
                removeImported(c.id);
                if (route.caseId === c.id) onNavigate({ screen: "overview" });
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
          <span className="lbl">Import ledger</span>
        </button>
        {onOpenRunPanel && (
          <button className="nav-item" onClick={onOpenRunPanel}>
            <ZapIcon size={20} />
            <span className="lbl">Run pipeline</span>
            <span className="tail"><span className="count-badge-yellow">dev</span></span>
          </button>
        )}
      </div>
    </aside>
  );
}
