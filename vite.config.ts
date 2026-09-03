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
      // 'autoUpdate', а не 'prompt'.
      //
      // Сначала стояло 'prompt' из опасения, что подмена ассетов под работающей
      // сессией сломает ленивые чанки. Но ленивых импортов в приложении нет —
      // сборка одним куском, — а цена 'prompt' проявилась на живом телефоне:
      // Service Worker продолжал отдавать сломанную версию, и выйти из неё было
      // нечем. Сломанная версия обязана уметь чиниться сама.
      registerType: 'autoUpdate',
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
