import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { initInstallPrompt } from './lib/pwa/install.svelte.js'

initInstallPrompt()

const target = document.getElementById('app')
if (!target) throw new Error('App container not found')

const app = mount(App, {
  target,
})

export default app
