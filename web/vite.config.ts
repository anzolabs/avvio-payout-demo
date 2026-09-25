import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds to web/dist, which the API serves. In development `vite` serves the
// app with hot reload and proxies API calls to the backend on :4300, so the
// app never needs to know where the backend is.
// The backend's port, from the same PORT the backend reads.
const api = `http://localhost:${process.env.PORT ?? 4300}`;

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': api, '/webhooks': api },
  },
});
