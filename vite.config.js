import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'client',
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    port: 5341,
    proxy: {
      '/api': 'http://localhost:5340',
      '/embed.js': 'http://localhost:5340',
      '/rss.xml': 'http://localhost:5340'
    }
  }
});
