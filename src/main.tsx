import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { StoreProvider } from './store'
import '@fontsource-variable/plus-jakarta-sans/wght.css'
import './styles.css'

registerSW({ immediate: true })

// Version 0.3.0 cached covers in the service worker; that cache is no longer used.
if ('caches' in window) {
  for (const name of ['covers', 'tmdb-images']) void caches.delete(name).catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)
