import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built app works from a GitHub Pages project path
  // (https://user.github.io/<repo>/) and inside Capacitor's WebView.
  base: './',
  server: { port: 5173, strictPort: false },
  build: { target: 'es2020' },
});
