import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Подстановка названия в index.html.
 *
 * Родная замена `%VITE_*%` в Vite не умеет значений по умолчанию: если
 * переменной нет, в заголовке останется буквальное «%VITE_PUBLIC_APP_NAME%».
 * Поэтому подставляем сами - здесь имя уже посчитано вместе с манифестом,
 * и оба берут его из одного источника.
 */
function appNameInHtml(name: string, shortName: string): Plugin {
  return {
    name: 'app-name-in-html',
    transformIndexHtml: (html) =>
      html.replaceAll('__APP_NAME__', name).replaceAll('__APP_SHORT_NAME__', shortName),
  }
}

export default defineConfig(({ mode }) => {
  // Значения по умолчанию дублируют src/lib/appName.ts: конфиг исполняется
  // в Node и до бандла, до import.meta.env ему не достать.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const appName = env.VITE_PUBLIC_APP_NAME || 'Тандем'
  const appShortName = env.VITE_PUBLIC_APP_SHORT_NAME || appName

  return {
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    plugins: [
      react(),
      tailwindcss(),
      appNameInHtml(appName, appShortName),
      VitePWA({
        // 'autoUpdate', а не 'prompt'.
        //
        // Сначала стояло 'prompt' из опасения, что подмена ассетов под работающей
        // сессией сломает ленивые чанки. Но ленивых импортов в приложении нет -
        // сборка одним куском, - а цена 'prompt' проявилась на живом телефоне:
        // Service Worker продолжал отдавать сломанную версию, и выйти из неё было
        // нечем. Сломанная версия обязана уметь чиниться сама.
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'robots.txt'],
        manifest: {
          name: appName,
          short_name: appShortName,
          description: 'Темы, дневник питания и задачи - на двоих',
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
            {
              src: '/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Свои обработчики push дописываются только так: generateSW собирает
          // воркер сам и вклиниться в него иначе нельзя
          importScripts: ['/push-sw.js'],
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          // Service Worker занимается ТОЛЬКО оболочкой приложения.
          // Данные Supabase кэширует персистер TanStack Query в IndexedDB -
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
  }
})
