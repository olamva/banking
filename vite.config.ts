/**
 * Vite runs in middleware mode inside `src/web/serve.ts` — there is no separate
 * dev server and no `vite build`. One process, one port, and the page still
 * hot-reloads.
 *
 * `root` is the app only. Everything it imports from `src/core/` is above the
 * root, which `fs.allow` has to permit explicitly.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'src/web/app',
  plugins: [react(), tailwindcss()],
  server: {
    // Local file server. It reaches into src/, and nothing here should ever be
    // reachable from another machine.
    host: '127.0.0.1',
    // Absolute, and the repo root rather than `root`: `fs.allow` resolves
    // relative to the Vite root, so anything shorter silently denies
    // `src/core/`. It looks like it works anyway, because Vite serves modules
    // already in the graph regardless — until the first `src/core/` import
    // that is a value rather than a type, which then 403s.
    fs: { allow: [import.meta.dirname] },
  },
});
