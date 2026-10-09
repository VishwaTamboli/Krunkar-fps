import { defineConfig } from 'vite';

// Backend target follows BACKEND_URL so a custom server port keeps working:
//   PORT=3101 npm run server  +  BACKEND_URL=http://localhost:3101 npm run dev:lan
const backend = process.env.BACKEND_URL || 'http://localhost:3001';

export default defineConfig({
  server: {
    // Listen on all interfaces so other LAN devices can reach the dev server.
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': backend,
      '/socket.io': { target: backend, ws: true },
    },
  },
  preview: { host: '0.0.0.0', port: 4173 },
});
