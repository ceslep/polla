import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
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
      name: 'no-cache-html',
      transformIndexHtml() {
        return [
          { tag: 'meta', attrs: { 'http-equiv': 'Cache-Control', content: 'no-cache, no-store, must-revalidate' }, injectTo: 'head' },
          { tag: 'meta', attrs: { 'http-equiv': 'Pragma', content: 'no-cache' }, injectTo: 'head' },
          { tag: 'meta', attrs: { 'http-equiv': 'Expires', content: '0' }, injectTo: 'head' }
        ]
      }
    },
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
    }
  ],
})
