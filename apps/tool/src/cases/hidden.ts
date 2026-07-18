/**
 * Client-side hiding of curated (committed) cases. Committed bundles are baked into the build, so
 * they cannot be truly deleted in the static production app; hiding records their ids in
 * localStorage and the registry filters them out. Reversible: clearing the set brings them back.
 * In dev, deletion also removes the underlying files via /api/delete-case, but hiding still runs so
 * the case disappears immediately regardless of the endpoint.
 */

const LS_KEY = "egit:hidden:v1";

export function loadHidden(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as string[];
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function save(ids: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...ids]));
  } catch {
    /* quota exceeded, give up quietly */
  }
}

export function hideCase(id: string): Set<string> {
  const ids = loadHidden();
  ids.add(id);
  save(ids);
  return ids;
}

export function unhideCase(id: string): Set<string> {
  const ids = loadHidden();
  ids.delete(id);
  save(ids);
  return ids;
}
