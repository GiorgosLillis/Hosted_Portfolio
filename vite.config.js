import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3000, // You can specify a different port here
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        list: path.resolve(__dirname, 'list.html'),
        weather: path.resolve(__dirname, 'weather.html'),
      },
    },
  },
});