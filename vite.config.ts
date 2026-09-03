import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt', а не 'autoUpdate': приложение живёт на домашнем экране неделями,
      // подмена ассетов под работающей сессией ломает ленивые чанки
      // (Failed to fetch dynamically imported module).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'robots.txt'],
      manifest: {
        name: 'Love promises',
        short_name: 'Love',
        description: 'Темы для обсуждения и трекер калорий',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#faf9f7',
        theme_color: '#faf9f7',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Service Worker занимается ТОЛЬКО оболочкой приложения.
        // Данные Supabase кэширует персистер TanStack Query в IndexedDB —
        // NetworkFirst на домен Supabase отдавал бы протухшие ответы и маскировал 401.
        navigateFallbackDenylist: [/^\/api/, /\/[^/?]+\.[^/]+$/],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
})
