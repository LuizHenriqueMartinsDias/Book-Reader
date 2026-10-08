/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// `vite build --mode pages` targets GitHub Pages, served under /<repo>/.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/Book-Reader/' : '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Book Reader',
        short_name: 'Livros',
        description: 'Leitor pessoal de PDFs com anotações',
        theme_color: '#1c1917',
        background_color: '#1c1917',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  server: { host: true },
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
}));
