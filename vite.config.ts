/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }
import { APP_NAME, APP_TAGLINE } from './src/brand.ts'

export default defineConfig({
  // Relative base so the build works on any host or subfolder (GitHub Pages, Vercel).
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'apple-touch-icon.png', 'tmdb.svg'],
      manifest: {
        id: './',
        name: APP_NAME,
        short_name: APP_NAME,
        description: APP_TAGLINE,
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0c10',
        theme_color: '#0b0c10',
        categories: ['entertainment', 'lifestyle'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        shortcuts: [
          { name: 'Descobrir', url: './?tab=discover', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Para você', url: './?tab=recs', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Avaliar', url: './?tab=rate', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        // App shell, legal pages and the font (latin subsets are what pt-BR needs; the rest are tiny).
        // Covers are left to the browser's HTTP cache: see Cover in src/components/MediaCard.tsx.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
})
