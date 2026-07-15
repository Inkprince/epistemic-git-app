import { SearchIcon } from "./icons.js";

/** Search + live ledger counts, per the spec's top bar. */
export function TopBar({
  query, onQuery, placeholder, counts,
}: {
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  counts: { label: string; value: number }[];
}) {
  return (
    <div className="topbar">
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
    </div>
  );
}
