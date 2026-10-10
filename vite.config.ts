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
      // Own service worker (src/sw.ts): it also receives books shared from other apps.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
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
        // Android's "Share → Book Reader" (read when the app is installed). Relative: the app
        // lives under /Book-Reader/ on GitHub Pages and at / in development.
        share_target: {
          action: './compartilhar',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'books', accept: ['application/pdf', '.pdf', 'application/epub+zip', '.epub'] }] },
        },
        // Computers (Chrome, Edge): "Open with → Book Reader" for PDFs and EPUBs.
        file_handlers: [{ action: './', accept: { 'application/pdf': ['.pdf'], 'application/epub+zip': ['.epub'] } }],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  // wrangler dev keeps its local state in worker/.wrangler; don't reload the app on every write.
  server: { host: true, watch: { ignored: ['**/.wrangler/**'] } },
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
}));
