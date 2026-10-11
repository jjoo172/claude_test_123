import { defineConfig } from 'vite';

// GitHub Pages serves project sites under `https://<user>.github.io/<repo>/`,
// so built asset URLs must be prefixed with the repo name. The deploy workflow
// sets VITE_BASE from `actions/configure-pages`; override locally if you fork
// this under a different name (e.g. `VITE_BASE=/ npm run build` for a user site).
const base = process.env.VITE_BASE ?? '/genesis/';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
