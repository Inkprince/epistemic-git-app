import { bundleDigest, validateBundle } from "@epistemic-git/protocol";
import type { Bundle, ValidationIssue } from "@epistemic-git/protocol";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { appendEvent, deleteHistory } from "./history.js";
import { hideCase, loadHidden } from "./hidden.js";
import { idbDelete, idbGetAllEntries, idbPut } from "./idb.js";
import { loadCommittedCases } from "./manifest.js";
import { isSeedCase } from "./seed.js";
import type { CaseEntry, PendingSuggestion } from "./types.js";

export type ImportResult =
  | { ok: true; id: string; alreadyImported: boolean; warnings: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[] };

interface CasesApi {
  /** Committed cases first (manifest order), then imported (import order). */
  cases: Record<string, CaseEntry>;
  /** True once IndexedDB hydration of imported cases has completed. */
  ready: boolean;
  importBundle(raw: unknown, label?: string): ImportResult;
  /** Register a pipeline-built bundle as a first-class local case; returns its id (idempotent). */
  addBuilt(bundle: Bundle, label?: string): string;
  /**
   * Delete any case. Imported/built cases are removed from IndexedDB and their history cleared.
   * Committed (curated) cases are hidden client-side (reversible) and, in dev, their files and
   * manifest entry are removed via /api/delete-case so the change persists.
   */
  deleteCase(id: string): void;
  renameImported(id: string, label: string): void;
  /**
   * File a contribution against a case: persists a pending suggestion locally and folds it into the
   * target case's mergePairs so it surfaces (box, badge, merge picker) like a seeded suggestion.
   * Idempotent per (target case, bundle). Returns the suggestion key.
   */
  addSuggestion(targetCaseId: string, bundle: Bundle, opts: { label?: string; author: string }): string;
  /** Remove a pending suggestion (decline, or accepted-and-merged). No-op for seeded suggestions. */
  declineSuggestion(key: string): void;
}

const CasesContext = createContext<CasesApi | null>(null);

interface StoredImport {
  label: string;
  bundle: Bundle;
  digest: string;
  /** Absent on entries stored before built cases existed, those are imports. */
  origin?: "imported" | "built";
}

/**
 * The app's case registry. Committed cases load synchronously (bundled at build time) so first
 * paint and SSR need no async work; user-imported bundles hydrate from IndexedDB and persist
 * across reloads. Every imported bundle passed full validateBundle in the browser first.
 */
export function CasesProvider({ children }: { children: ReactNode }) {
  const allCommitted = useMemo(loadCommittedCases, []);
  const [hidden, setHidden] = useState<Set<string>>(() => loadHidden());
  const committed = useMemo(() => allCommitted.filter((c) => !hidden.has(c.id)), [allCommitted, hidden]);
  const [imported, setImported] = useState<CaseEntry[]>([]);
  const [suggestions, setSuggestions] = useState<PendingSuggestion[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      idbGetAllEntries<StoredImport>("imports"),
      idbGetAllEntries<PendingSuggestion>("suggestions"),
    ])
      .then(([importEntries, suggestionEntries]) => {
        if (cancelled) return;
        setImported(importEntries.map(([id, v]) => ({
          id, label: v.label, origin: v.origin ?? ("imported" as const), bundle: v.bundle, digest: v.digest,
        })));
        setSuggestions(suggestionEntries.map(([, v]) => v));
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => { cancelled = true; };
  }, []);

  const api = useMemo<CasesApi>(() => {
    const cases: Record<string, CaseEntry> = {};
    for (const c of committed) cases[c.id] = c;
    for (const c of imported) cases[c.id] = c;

    // Fold locally-filed suggestions into their target case's mergePairs, so the same box, badge,
    // and merge picker that render seeded suggestions render these too, with no separate plumbing.
    for (const sug of suggestions) {
      const target = cases[sug.targetCaseId];
      if (!target) continue;
      const pair = {
        id: sug.id, label: sug.label, bundle: sug.bundle, author: sug.author, suggestionId: sug.key,
      };
      cases[sug.targetCaseId] = { ...target, mergePairs: [...(target.mergePairs ?? []), pair] };
    }

    return {
      cases,
      ready,
      importBundle(raw, label) {
        const check = validateBundle(raw);
        const errors = check.issues.filter((i) => i.severity === "error");
        if (!check.ok || errors.length) return { ok: false, issues: errors.length ? errors : check.issues };
        const bundle = raw as Bundle;
        const digest = bundleDigest(bundle);
        const id = `imp-${digest.slice(0, 8)}`;
        if (cases[id]) return { ok: true, id, alreadyImported: true, warnings: [] };
        const finalLabel = (label ?? "").trim() || bundle.title || "Imported bundle";
        const entry: CaseEntry = { id, label: finalLabel, origin: "imported", bundle, digest };
        setImported((prev) => (prev.some((c) => c.id === id) ? prev : [...prev, entry]));
        void idbPut<StoredImport>("imports", id, { label: finalLabel, bundle, digest });
        appendEvent({ caseId: id, kind: "imported", digest, parents: [], note: finalLabel });
        return { ok: true, id, alreadyImported: false, warnings: check.issues.filter((i) => i.severity === "warning") };
      },
      addBuilt(bundle, label) {
        const digest = bundleDigest(bundle);
        const id = `built-${digest.slice(0, 8)}`;
        const finalLabel = (label ?? "").trim() || bundle.title || "Built case";
        if (!cases[id]) {
          const entry: CaseEntry = { id, label: finalLabel, origin: "built", bundle, digest };
          setImported((prev) => (prev.some((c) => c.id === id) ? prev : [...prev, entry]));
          void idbPut<StoredImport>("imports", id, { label: finalLabel, bundle, digest, origin: "built" });
          appendEvent({
            caseId: id, kind: "pipeline-run", digest, parents: [],
            stats: { claims: bundle.claims.length, challenges: bundle.challenges.length }, note: finalLabel,
          });
        }
        return id;
      },
      deleteCase(id) {
        // Seed cases ship with the repo and are git-tracked; refuse to delete them so a stray
        // click can't hide a curated case or wipe its committed files. The dev endpoint mirrors this.
        if (isSeedCase(id)) return;
        const committedCase = allCommitted.some((c) => c.id === id);
        if (committedCase) {
          // Curated case: hide client-side (reversible) and, in dev, remove files + manifest entry.
          setHidden(hideCase(id));
          if (import.meta.env?.DEV) {
            void fetch("/api/delete-case", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ slug: id }),
            }).catch(() => { /* hidden client-side regardless */ });
          }
          return;
        }
        setImported((prev) => prev.filter((c) => c.id !== id));
        void idbDelete("imports", id);
        deleteHistory(id);
      },
      renameImported(id, label) {
        const next = label.trim();
        if (!next) return;
        setImported((prev) => prev.map((c) => (c.id === id ? { ...c, label: next } : c)));
        const entry = imported.find((c) => c.id === id);
        if (entry) {
          void idbPut<StoredImport>("imports", id, {
            label: next, bundle: entry.bundle, digest: entry.digest,
            ...(entry.origin === "built" ? { origin: "built" as const } : {}),
          });
        }
      },
      addSuggestion(targetCaseId, bundle, opts) {
        const digest = bundleDigest(bundle);
        const id = `sug-${digest.slice(0, 8)}`;
        const key = `${targetCaseId}:${id}`;
        const author = { name: opts.author.trim() || "Anonymous contributor" };
        const label = (opts.label ?? "").trim() || bundle.title || "Suggested contribution";
        const sug: PendingSuggestion = { key, id, targetCaseId, label, author, bundle, digest };
        setSuggestions((prev) => (prev.some((s) => s.key === key) ? prev : [...prev, sug]));
        void idbPut<PendingSuggestion>("suggestions", key, sug);
        appendEvent({ caseId: targetCaseId, kind: "suggested", digest, parents: [], note: `${author.name}: ${label}` });
        return key;
      },
      declineSuggestion(key) {
        setSuggestions((prev) => prev.filter((s) => s.key !== key));
        void idbDelete("suggestions", key);
      },
    };
  }, [allCommitted, committed, imported, suggestions, ready]);

  return <CasesContext.Provider value={api}>{children}</CasesContext.Provider>;
}

export function useCases(): CasesApi {
  const ctx = useContext(CasesContext);
  if (!ctx) throw new Error("useCases must be used inside <CasesProvider>");
  return ctx;
}
