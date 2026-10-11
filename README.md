# Hello, World! — Python in the browser

**Live site:** https://jjoo172.github.io/claude_test_123/
**Source:** https://github.com/jjoo172/claude_test_123

A minimal static page that prints **"Hello, World!"**. The text is not hard-coded in the frontend: it comes from the Python module [`backend/hello.py`](backend/hello.py), which the page downloads and executes in your browser with [Pyodide](https://pyodide.org) (CPython compiled to WebAssembly, loaded from the jsDelivr CDN). The page shows "Loading Python…" until the runtime is ready.

Built with [Vite](https://vite.dev) + TypeScript and published to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

## Run the Python backend standalone

```bash
python3 backend/hello.py
# Hello, World!
```

The same file is what the browser runs — Vite ships it as a static asset and `src/main.ts` fetches it, runs it with Pyodide, and renders the return value of `hello()`.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173/claude_test_123/
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
├── backend/hello.py            # the Python "backend"
├── index.html                  # entry page; loads Pyodide from the CDN
├── src/
│   ├── main.ts                 # fetches hello.py, runs it, renders the result
│   └── style.css
├── public/                     # copied as-is (favicon, robots.txt)
├── vite.config.ts              # `base` for GitHub Pages
├── tsconfig.json
└── .github/workflows/deploy.yml
```

## Note on server-side Python

GitHub Pages only serves static files, so Python can't run on the server here — that's why it runs in the browser. A real server-side backend (e.g. FastAPI or Flask) would need separate hosting (Fly.io, Render, a VPS, …) with the Pages site calling it over HTTP.
