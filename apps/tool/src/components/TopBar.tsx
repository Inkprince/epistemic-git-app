import { HelpIcon, MenuIcon, SearchIcon } from "./icons.js";

/** Search + live ledger counts, per the spec's top bar. Hamburger appears only on small screens. */
export function TopBar({
  query, onQuery, placeholder, counts, onOpenNav, onOpenHelp,
}: {
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  counts: { label: string; value: number }[];
  onOpenNav: () => void;
  onOpenHelp: () => void;
}) {
  return (
    <div className="topbar">
      <button className="hamburger" onClick={onOpenNav} aria-label="Open navigation">
        <MenuIcon size={18} />
      </button>
      <div className="search-box">
        <SearchIcon size={18} color="#a3a3a3" />
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder} aria-label="Search" />
      </div>
      <div className="spacer" />
      <div className="counts">
        {counts.map((c, i) => (
          <span key={c.label}>
            {i > 0 && " · "}
            <strong>{c.value}</strong> {c.label}
          </span>
        ))}
      </div>
      <button className="help-btn" onClick={onOpenHelp} aria-label="What am I looking at?" title="What am I looking at?">
        <HelpIcon size={18} />
      </button>
    </div>
  );
}
