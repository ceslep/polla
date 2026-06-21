import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { copyFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  base: '/polla/',
  plugins: [
    svelte(),
    tailwindcss(),
    {
      // GitHub Pages no enruta SPAs: cuando el usuario entra a una URL
      // no-hash (ej. /polla/ranking) devuelve 404. `404.html` es la
      // convención de GH Pages para que esa petición sirva el index
      // y el router del lado cliente tome el control. Sin esto, los
      // deep-links sin hash rompen.
      name: 'spa-404',
      closeBundle() {
        const src = resolve(__dirname, 'dist/index.html')
        const dst = resolve(__dirname, 'dist/404.html')
        try {
          copyFileSync(src, dst)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.warn('[spa-404] no se pudo copiar index.html -> 404.html:', msg)
        }
      }
    },
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'balon.png', 'countries.json'],
      manifest: {
        name: 'Polla Mundialista 2026',
        short_name: 'Polla 2026',
        description: 'Apuesta los marcadores de los partidos del Mundial 2026',
        start_url: '/polla/#/apostar',
        scope: '/polla/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#111111',
        theme_color: '#06b6d4',
        lang: 'es-CO',
        categories: ['sports', 'entertainment'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        cleanupOutdatedCaches: true,
        navigateFallback: '/polla/index.html',
        runtimeCaching: [
          {
            // Google Sheets / PHP backend: nunca cachear. Apuestas y resultados
            // deben venir siempre frescos de la fuente.
            urlPattern: /^https:\/\/app\.iedeoccidente\.com\/gs\//,
            handler: 'NetworkOnly',
            options: { cacheName: 'gs-no-cache' }
          },
          {
            // openfootball: cachear 24h. La lista de partidos no cambia
            // durante el torneo, así que se puede servir offline.
            urlPattern: /^https:\/\/raw\.githubusercontent\.com\/openfootball\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'openfootball-matches',
              expiration: { maxAgeSeconds: 60 * 60 * 24, maxEntries: 16 }
            }
          },
          {
            // FIFA rankings / config: stale-while-revalidate
            urlPattern: /^https:\/\/app\.iedeoccidente\.com\/pollaweb\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'polla-config' }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ]
})
