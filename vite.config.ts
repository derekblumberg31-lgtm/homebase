/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { renderPrivacyPage } from './src/cloud/privacyPage';

// GitHub Pages serves the app from /homebase/; Netlify and local dev serve it from the root.
const base = process.env.BASE_PATH ?? '/';
// .env files count the same as real environment variables, like every other VITE_ value (real variables win).
const env = loadEnv(process.env.NODE_ENV === 'test' ? 'test' : 'production', process.cwd(), 'VITE_');

/**
 * Publishes /privacy.html only when the build has a Supabase project (URL and key) and VITE_PRIVACY_CONTACT, so the
 * page never goes live describing a sign-in that isn't there, or with an empty contact line.
 */
function privacyPage(): Plugin {
  return {
    name: 'homebase-privacy-page',
    apply: 'build',
    generateBundle() {
      const template = readFileSync(new URL('./supabase/privacy.template.html', import.meta.url), 'utf8');
      const page = renderPrivacyPage(template, { supabaseUrl: env.VITE_SUPABASE_URL, supabaseKey: env.VITE_SUPABASE_PUBLISHABLE_KEY, contact: env.VITE_PRIVACY_CONTACT });
      if (page) this.emitFile({ type: 'asset', fileName: 'privacy.html', source: page });
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    privacyPage(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: base,
        name: 'Homebase',
        short_name: 'Homebase',
        description: 'Maintenance, property details, keys, records and help for your home, all in one place.',
        start_url: `${base}home`,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        lang: 'en',
        categories: ['lifestyle', 'utilities', 'productivity'],
        background_color: '#f3f4ef',
        theme_color: '#f3f4ef',
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell is precached. The key engine (~20 MB of OpenCV and Tesseract) is cached
        // the first time someone opens Identify a Key, so the first visit stays light.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,json}'],
        globIgnores: ['engine/**'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        importScripts: ['notifications-sw.js'],
        runtimeCaching: [
          {
            // A RegExp, not a function: functions are copied into the service worker as source,
            // where this config's variables don't exist.
            urlPattern: new RegExp(`${base.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}engine/`),
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
