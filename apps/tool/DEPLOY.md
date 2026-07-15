# Deploying the explorer

The explorer is a **fully static** Vite build with a relative `base` (`./`), so it serves from any host
and any sub-path with no config. The pre-baked case bundles (LHC · COVID · Eggs) are imported at build
time, so the hosted site works with **no API key and no backend**.

```bash
npm install
npm run build:tool        # → apps/tool/dist  (static: index.html + assets/)
npm run preview -w @epistemic-git/tool   # serve dist locally to check it
```

Deploy `apps/tool/dist` to any static host:

| Host | Build command | Publish dir |
|------|---------------|-------------|
| GitHub Pages | `npm run build:tool` | `apps/tool/dist` (workflow included: `.github/workflows/deploy-tool.yml`) |
| Netlify | `npm run build:tool` | `apps/tool/dist` |
| Vercel | `npm run build:tool` | `apps/tool/dist` |
| Any | `npm run build:tool` | copy `apps/tool/dist/**` to your web root |

**Note — the live runner is dev-only.** The `/api/build` endpoint that runs the pipeline on pasted text
exists only under `npm run dev` (it needs the server-side key from `.env`). The static hosted build is a
pre-baked *viewer*; that is the intended dual-mode split (a judge explores instantly with no key, and can
run their own questions locally via `npm run dev` or the `egit` CLI).
