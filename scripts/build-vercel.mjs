/**
 * Vercel build for the monorepo, via the deterministic Build Output API (.vercel/output/), so we
 * never rely on Vercel's /api auto-detection guessing right in a workspace repo.
 *
 * Produces:
 *   .vercel/output/static/                 the SPA (apps/tool/dist), built with live-build enabled
 *   .vercel/output/functions/api/*.func/   pre-bundled serverless functions (esbuild)
 *   .vercel/output/config.json             filesystem routing + SPA fallback
 *
 * The functions are bundled here because the workspace packages are raw TypeScript whose internal
 * imports use .js extensions pointing at .ts files; a resolver plugin maps every such specifier onto
 * its .ts sibling so esbuild can inline the whole pipeline into one self-contained module.
 *
 * Run by `buildCommand` in vercel.json. Locally: `node scripts/build-vercel.mjs`.
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, ".vercel/output");
// Function wall-clock ceiling. Default 60s so the deploy succeeds on ANY plan (Hobby caps at 60).
// On Vercel Pro, set EGIT_FN_MAX_DURATION=300 in the build env for headroom on longer sources.
const FN_MAX_DURATION = Number(process.env["EGIT_FN_MAX_DURATION"] || 60);
const RUNTIME = "nodejs22.x";
const FUNCTIONS = ["build", "discover"];

console.log("→ vite build (apps/tool) with VITE_LIVE_BUILD=1");
execSync("npm run build:tool", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, VITE_LIVE_BUILD: "1" },
});

// Map ./foo.js → ./foo.ts (NodeNext-style specifiers over raw-TS workspace packages) so esbuild can
// bundle the pipeline. Only touches relative specifiers whose .ts sibling exists; real .js is left be.
const jsToTs = {
  name: "js-to-ts",
  setup(build) {
    build.onResolve({ filter: /\.js$/ }, (args) => {
      if (args.kind === "entry-point" || !args.path.startsWith(".")) return undefined;
      const tsAbs = resolve(args.resolveDir, args.path).replace(/\.js$/, ".ts");
      return existsSync(tsAbs) ? { path: tsAbs } : undefined;
    });
  },
};

console.log("→ bundling serverless functions");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const name of FUNCTIONS) {
  const fnDir = resolve(out, `functions/api/${name}.func`);
  mkdirSync(fnDir, { recursive: true });
  await esbuild.build({
    entryPoints: [resolve(root, `api-src/${name}.ts`)],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: resolve(fnDir, "index.mjs"),
    plugins: [jsToTs],
    logLevel: "info",
  });
  writeFileSync(
    resolve(fnDir, ".vc-config.json"),
    JSON.stringify({
      runtime: RUNTIME,
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      maxDuration: FN_MAX_DURATION,
    }, null, 2) + "\n",
  );
  console.log(`  ✓ api/${name} (maxDuration=${FN_MAX_DURATION}s)`);
}

console.log("→ copying static output");
cpSync(resolve(root, "apps/tool/dist"), resolve(out, "static"), { recursive: true });

// Filesystem handler serves static assets AND functions (functions/api/*.func → /api/*); anything
// else falls back to the SPA entry so client-side routes resolve.
writeFileSync(
  resolve(out, "config.json"),
  JSON.stringify({
    version: 3,
    routes: [
      { handle: "filesystem" },
      { src: "/.*", dest: "/index.html" },
    ],
  }, null, 2) + "\n",
);

console.log("✓ .vercel/output ready");
