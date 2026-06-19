import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

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
    }
  ],
})
