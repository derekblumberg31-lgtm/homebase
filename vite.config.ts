/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Homebase',
        short_name: 'Homebase',
        description: 'Your intelligent homeowner assistant: maintenance, property details, keys, records and help, all in one place.',
        start_url: '/home',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        lang: 'en',
        categories: ['lifestyle', 'utilities', 'productivity'],
        background_color: '#faf9f5',
        theme_color: '#faf9f5',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell is precached. The key engine (~20 MB of OpenCV and Tesseract) is cached
        // the first time someone opens Identify a Key, so the first visit stays light.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,json}'],
        globIgnores: ['engine/**'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/engine/'),
            handler: 'CacheFirst',
            options: { cacheName: 'homebase-key-engine', expiration: { maxEntries: 40 } },
          },
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { host: true, port: 5190 },
  preview: { host: true, port: 5190 },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
});
