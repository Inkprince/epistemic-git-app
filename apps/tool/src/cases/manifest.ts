import { bundleDigest } from "@epistemic-git/protocol";
import type { Bundle } from "@epistemic-git/protocol";
import manifestJson from "../../../../artifacts/cases.json";
import type { CaseEntry, CaseManifest } from "./types.js";

/**
 * Committed cases come from artifacts/cases.json joined against every artifacts/*.json module
 * bundled at build time via import.meta.glob. This works identically in dev and the static
 * production build, and in dev Vite invalidates the glob when /api/commit writes a new artifact, 
 * so a freshly committed case appears after the automatic reload with no extra wiring.
 */
const artifactModules = import.meta.glob("../../../../artifacts/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

function moduleFor(file: string): unknown {
  const hit = Object.entries(artifactModules).find(([path]) => path.endsWith(`/${file}`));
  return hit?.[1];
}

/** Cheap shape check, full validation happens for imports; committed artifacts are CI-verified. */
function looksLikeBundle(x: unknown): x is Bundle {
  return !!x && typeof x === "object" && Array.isArray((x as Bundle).claims) && typeof (x as Bundle).question === "string";
}

export function loadCommittedCases(): CaseEntry[] {
  const manifest = manifestJson as CaseManifest;
  const entries: CaseEntry[] = [];
  for (const row of manifest.cases) {
    const mod = moduleFor(row.file);
    if (!looksLikeBundle(mod)) {
      console.warn(`cases.json: skipping "${row.id}" ${row.file} missing or not a bundle`);
      continue;
    }
    const mergePairs = (row.mergePairs ?? [])
      .map((p) => {
        const pm = moduleFor(p.file);
        return looksLikeBundle(pm) ? { id: p.id, label: p.label, bundle: pm } : undefined;
      })
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
    entries.push({
      id: row.id,
      label: row.label,
      origin: "committed",
      bundle: mod,
      digest: bundleDigest(mod),
      ...(mergePairs.length ? { mergePairs } : {}),
    });
  }
  return entries;
}
