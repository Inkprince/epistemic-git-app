import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Bundle } from "../src/schema.js";

/**
 * Emit the published JSON Schema for a bundle. This is the artifact another team validates
 * against — the concrete promise behind "compounding & interoperability". Written to
 * `spec/schema/bundle.schema.json` at the repo root.
 */
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../../spec/schema/bundle.schema.json");

const schema = zodToJsonSchema(Bundle, {
  name: "EpistemicGitBundle",
  $refStrategy: "root",
});

await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(schema, null, 2) + "\n", "utf8");
console.log(`Wrote JSON Schema → ${out}`);
