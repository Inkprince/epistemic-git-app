import { useEffect, useRef, useState } from "react";
import { pct, truncate } from "../domain.js";
import { HelpIcon, MenuIcon, SearchIcon } from "./icons.js";
import { Avatar, Badge } from "./primitives.js";
import type { CaseSupport } from "../stats.js";

/** A case match surfaced under the search box, plus the question it answers. */
export type SearchHit = CaseSupport & { question: string };

/** Search + live ledger counts, per the spec's top bar. Hamburger appears only on small screens. */
export function TopBar({
  query, onQuery, placeholder, counts, onOpenNav, onOpenHelp, results, onPickResult,
}: {
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  counts: { label: string; value: number }[];
  onOpenNav: () => void;
  onOpenHelp: () => void;
  /** When provided (overview screen), matches pop out under the box instead of only filtering below. */
  results?: SearchHit[];
  onPickResult?: (caseId: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const trimmed = query.trim();

  // Reopen whenever the query changes; dismissing (Escape / click-away) hides without clearing the filter.
  useEffect(() => { setOpen(Boolean(trimmed)); }, [trimmed]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const showResults = Boolean(results) && open && trimmed.length > 0;

  return (
    <div className="topbar">
      <button className="hamburger" onClick={onOpenNav} aria-label="Open navigation">
        <MenuIcon size={18} />
      </button>
      <div className="search-wrap" ref={wrapRef}>
        <div className="search-box">
          <SearchIcon size={18} color="#a3a3a3" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onFocus={() => setOpen(Boolean(trimmed))}
            onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
            placeholder={placeholder}
            aria-label="Search"
            role="combobox"
            aria-expanded={showResults}
            aria-controls="search-results"
          />
        </div>
        {showResults && (
          <div className="search-results" id="search-results" role="listbox">
            {results!.length === 0 ? (
              <div className="sr-empty">No cases match “{trimmed}”.</div>
            ) : (
              results!.map((c) => (
                <button
                  key={c.id}
                  className="sr-row"
                  role="option"
                  aria-selected={false}
                  onClick={() => { onPickResult?.(c.id); setOpen(false); }}
                >
                  <Avatar label={c.label} size={30} tile />
                  <span className="sr-main">
                    <span className="sr-name">{c.label}</span>
                    <span className="sr-q">{truncate(c.question, 72)}</span>
                  </span>
                  <span className="sr-status">
                    {c.generated
                      ? <Badge tone="green">pipeline</Badge>
                      : c.mergeable
                        ? <Badge tone="amber">mergeable</Badge>
                        : <Badge tone="purple">{c.overlays} views</Badge>}
                  </span>
                  <span className="sr-metrics">
                    <span className="sr-support">{pct(c.support)}</span>
                    <span className="sr-claims">{c.claims} claims</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
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
