import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds to web/dist, which the API serves. In development `vite` serves the
// app with hot reload and proxies API calls to the backend on :4300, so the
// app never needs to know where the backend is.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4300', '/webhooks': 'http://localhost:4300' },
  },
});
