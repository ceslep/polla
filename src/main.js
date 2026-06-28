import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { initInstallPrompt } from './lib/pwa/install.svelte.js'
import { autoClearCacheOnOpen } from './lib/pwa/clearCache.js'

// Auto-borrado de cache al abrir la URL: ejecuta lo mismo que el botón
// "Borrar cache" una vez por apertura de pestaña y recarga. Si disparó la
// recarga, no montamos la app (la próxima pasada, ya con el guard puesto,
// monta normal).
autoClearCacheOnOpen().then((reloading) => {
  if (reloading) return

  initInstallPrompt()

  const target = document.getElementById('app')
  if (!target) throw new Error('App container not found')

  mount(App, {
    target,
  })
})
