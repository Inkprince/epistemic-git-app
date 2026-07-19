import { useMemo } from "react";
import { useCases } from "../../cases/store.js";
import { isSeedCase } from "../../cases/seed.js";
import type { CaseOrigin } from "../../cases/types.js";
import { pct, truncate } from "../../domain.js";
import { caseMatches, supportByCase } from "../../stats.js";
import { AlertIcon, DownloadIcon, FileTextIcon, FolderIcon, TrashIcon, UsersIcon, ZapIcon } from "../icons.js";
import { Avatar, Badge, pressable } from "../primitives.js";

const ORIGIN_BADGE: Record<CaseOrigin, { label: string; tone: "neutral" | "green" | "purple" } | null> = {
  committed: null,
  imported: { label: "local import", tone: "neutral" },
  built: { label: "AI-built", tone: "green" },
};

/**
 * The all-cases browser (#/cases): every case in this browser, curated, imported, and
 * pipeline-built, as one card each, click to open. The overview stays the analytics dashboard;
 * this screen is the library.
 */
export function CasesScreen({
  query, onOpenCase, onOpenImport, onOpenBuildCase,
}: {
  query: string;
  onOpenCase: (caseId: string) => void;
  onOpenImport: () => void;
  onOpenBuildCase?: () => void;
}) {
  const { cases: registry, ready, deleteCase } = useCases();
  const rows = useMemo(() => supportByCase(registry), [registry]);

  const q = query.trim().toLowerCase();
  const visible = q
    ? rows.filter((c) => caseMatches(c.label, registry[c.id]!.bundle, q))
    : rows;

  return (
    <div className="scrl" style={{ overflowY: "auto", flex: 1 }}>
      <div className="page-head">
        <div>
          <div className="title">Cases</div>
          <div className="sub">
            Every case in this browser, curated examples, your imports, and cases you built from a
            source. Click one to open it.
          </div>
        </div>
        <div className="spacer" />
        <div className="actions">
          <button className="btn-outline" onClick={onOpenImport}>
            <DownloadIcon size={18} style={{ transform: "rotate(180deg)" }} /> Import case
          </button>
          {onOpenBuildCase && (
            <button className="btn-primary" onClick={onOpenBuildCase}>
              <ZapIcon size={18} color="#fff" /> Build a case
            </button>
)}
        </div>
      </div>

      <div className="case-grid">
        {visible.map((c) => {
          const entry = registry[c.id]!;
          const badge = ORIGIN_BADGE[entry.origin];
          return (
            <div
              key={c.id}
              className="case-card"
              onClick={() => onOpenCase(c.id)}
              {...pressable(() => onOpenCase(c.id))}
              aria-label={`Open ${c.label}`}
            >
              <div className="cc-top">
                <Avatar label={c.label} size={40} tile />
                <div className="cc-name">
                  <div className="nm">{c.label}</div>
                  <div className="badges">
                    {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
                    {entry.mergePairs && entry.mergePairs.length > 0 && (
                      <Badge tone="amber" dot>
                        {entry.mergePairs.length} contribution{entry.mergePairs.length > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                </div>
                {!isSeedCase(entry.id) && (
                  <button
                    className="cc-delete"
                    aria-label={`Delete ${c.label}`}
                    title={entry.origin === "committed" ? "Delete this example case" : "Delete this case"}
                    onClick={(e) => {
                      e.stopPropagation();
                      const msg = entry.origin === "committed"
                        ? `Delete “${c.label}”? In the dev server this removes its files; otherwise it is hidden and can be restored by clearing site data.`
                        : `Delete “${c.label}”? This removes it from this browser and can't be undone.`;
                      if (confirm(msg)) deleteCase(c.id);
                    }}
                  >
                    <TrashIcon size={15} />
                  </button>
                )}
              </div>
              <p className="cc-question" title={entry.bundle.question}>{truncate(entry.bundle.question, 120)}</p>
              <div className="cc-support">
                <div className="track"><div className="fill" style={{ width: `${Math.max(2, c.support * 100)}%` }} /></div>
                <span className="val">{pct(c.support)}</span>
                <span className="lbl">support</span>
              </div>
              <div className="cc-counts">
                <span title="Claims backed by exact quotes"><FileTextIcon size={14} /> {c.claims} claims</span>
                <span title="Recorded challenges"><AlertIcon size={14} /> {entry.bundle.challenges.length} challenges</span>
                <span title="Perspectives on this case"><UsersIcon size={14} /> {c.overlays} perspectives</span>
              </div>
            </div>
);
        })}
        {visible.length === 0 && (
          <div className="case-grid-empty">
            <FolderIcon size={22} />
            <p className="note" style={{ margin: 0 }}>
              {q
                ? `No cases match “${query.trim()}”.`
                : ready
                  ? "No cases yet, import one, or build a case from a source."
                  : "Loading…"}
            </p>
          </div>
)}
      </div>
    </div>
);
}
