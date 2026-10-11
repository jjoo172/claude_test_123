# Genesis — JSON Formatter

**Live site:** https://jjoo172.github.io/genesis/
_(pattern: `https://<user>.github.io/<repo>/`; goes live after the one-time Pages setup below)_

A small, fast JSON formatter and validator that runs entirely in the browser. Paste JSON, get it formatted or minified, see where it's broken if it isn't valid, copy or download the result. No accounts, no server, no data leaves the page — your last input and settings are kept in `localStorage` only.

Built with [Vite](https://vite.dev) + vanilla TypeScript and published as static files to GitHub Pages via GitHub Actions.

## Features

- Format with 2 spaces, 4 spaces, or tabs; optional alphabetical key sorting
- Minify to a single line
- Live validation with line/column of the first syntax error and a "Jump to error" shortcut
- Copy to clipboard or download as `formatted.json`
- Size / lines / keys / depth / root type stats for the output
- Dark and light themes (follows system preference), keyboard shortcut `Ctrl`/`⌘` + `Enter`

## One-time setup (repo owner)

Pushing to `main` builds and deploys automatically, but GitHub Pages must be enabled once:

1. Open the repository on GitHub → **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main` (or run the **Deploy to GitHub Pages** workflow manually from the **Actions** tab).

The first successful run of `.github/workflows/deploy.yml` publishes the site at the URL above.

## How deployment works

```text
git push (main) → GitHub Actions → npm ci && npm run build → dist/ → GitHub Pages
```

The workflow uses the official `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages` actions. `configure-pages` reports the site's base path, which is passed to Vite as `VITE_BASE` so asset URLs resolve under `/<repo>/`. If you fork or rename the repo, nothing needs to change.

## Local development (optional)

Only needed if you want to change the site. Visitors never run this.

```bash
npm install
npm run dev        # http://localhost:5173/genesis/
npm run build      # outputs static files to dist/
npm run preview    # serves dist/ locally
npm run typecheck  # tsc --noEmit
```

To build for a different base path (for example a user site at the domain root):

```bash
VITE_BASE=/ npm run build
```

## Project structure

```text
.
├── index.html                  # entry page
├── src/
│   ├── main.ts                 # UI wiring
│   ├── json-tools.ts           # parse / format / minify / stats / error positions
│   ├── storage.ts              # localStorage persistence
│   └── style.css
├── public/                     # copied as-is (favicon, robots.txt)
├── vite.config.ts              # `base` for GitHub Pages
├── tsconfig.json
└── .github/workflows/deploy.yml
```

## Not in scope (yet)

Login, cloud sync, and anything needing a server or secrets. See the project outline for how to add a backend-as-a-service or serverless functions later if a concrete need appears.
