import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'path';

export default defineConfig({
  plugins: [react(), basicSsl()],
  base: './',
  server: {
    port: 3000,
    host: true,
    proxy: {
      // Forwards to a `vercel dev` instance running separately (e.g. `vercel dev --listen 3001`),
      // so the frontend can be served by Vite (HTTPS, LAN-accessible) while the API still works.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        list: path.resolve(__dirname, 'list.html'),
        weather: path.resolve(__dirname, 'weather.html'),
        profile: path.resolve(__dirname, 'profile.html'),
        reset: path.resolve(__dirname, 'reset.html')
      },
    },
  },
  ssr: {
    external: ['@prisma/client'],
  },
});