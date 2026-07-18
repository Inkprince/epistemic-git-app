import { readFile, writeFile } from "node:fs/promises";
import { parseBundle, serializeBundle } from "./io.js";
import type { Bundle } from "./schema.js";

/**
 * Filesystem helpers (Node only, kept out of the pure `io` module so browser bundles never
 * import `node:fs`). Import from `@epistemic-git/protocol/node`.
 */

export async function readBundleFile(path: string): Promise<Bundle> {
  return parseBundle(await readFile(path, "utf8"));
}

export async function writeBundleFile(path: string, bundle: Bundle): Promise<void> {
  await writeFile(path, serializeBundle(bundle), "utf8");
}
