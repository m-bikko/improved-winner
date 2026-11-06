import { execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Подстановка названия и языка в index.html.
 *
 * Родная замена `%VITE_*%` в Vite не умеет значений по умолчанию: если
 * переменной нет, в заголовке останется буквальное «%VITE_PUBLIC_APP_NAME%».
 * Поэтому подставляем сами - здесь имя уже посчитано вместе с манифестом,
 * и оба берут его из одного источника.
 */
function shellValues(values: Record<string, string>): Plugin {
  return {
    name: 'shell-values',
    transformIndexHtml: (html) =>
      Object.entries(values).reduce((out, [key, value]) => out.replaceAll(key, value), html),
  }
}

/**
 * `version.json` в корне сайта: номер сборки и название приложения.
 *
 * По нему база раз в пять минут узнаёт, что вышла новая версия, и шлёт
 * уведомление (см. миграцию release_notify). Название едет отсюда же:
 * в базе его нет намеренно, оно задаётся сборкой.
 *
 * В кэш Service Worker файл не попадает - `globPatterns` json не берут, -
 * и это правильно: он нужен серверу, а не приложению.
 */
function versionFile(appName: string): Plugin {
  const commit = (): string => {
    if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA
    try {
      return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      return `local-${Date.now()}`
    }
  }
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: commit(), name: appName, builtAt: new Date().toISOString() }),
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Значения по умолчанию дублируют src/lib/appName.ts: конфиг исполняется
  // в Node и до бандла, до import.meta.env ему не достать.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const appName = env.VITE_PUBLIC_APP_NAME || 'Тандем'
  const appShortName = env.VITE_PUBLIC_APP_SHORT_NAME || appName

  // Язык оболочки и манифеста.
  //
  // Он ОДИН на сборку и не следует за профилем: заголовок вкладки, описание
  // в окне установки и `<html lang>` читаются системой до того, как приложение
  // запустится и узнает, кто пришёл. Внутри приложения язык у каждого свой -
  // LangProvider переставляет `<html lang>` на своё сразу после монтирования.
  //
  // Отсюда и то, что описание берётся из переменной, а не лежит строкой:
  // сборка под другой язык не должна требовать правки конфига.
  const appLang = env.VITE_PUBLIC_APP_LANG || 'ru'
  const appDescription =
    env.VITE_PUBLIC_APP_DESCRIPTION || 'Темы, дневник питания и задачи - на двоих'

  return {
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    plugins: [
      react(),
      tailwindcss(),
      shellValues({
        __APP_NAME__: appName,
        __APP_SHORT_NAME__: appShortName,
        __APP_LANG__: appLang,
        __APP_DESCRIPTION__: appDescription,
      }),
      versionFile(appName),
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
          description: appDescription,
          lang: appLang,
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#f2f2f7',
          theme_color: '#f2f2f7',
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
          // Сборка одним куском (см. registerType выше), и с картой Leaflet она
          // переросла стандартные 2 МиБ. Файл больше лимита выпал бы из прекэша,
          // а без него приложение не откроется офлайн - поэтому лимит поднят,
          // а не куски разделены
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
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
