import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivacyAnalytics } from './ui/PrivacyAnalytics'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import './index.css'
import { Family } from './ui/Family.tsx'

// P3 PWA: production builds only, after load (src/pwa/registerServiceWorker.ts).
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Family />
    <PrivacyAnalytics />
  </StrictMode>,
)
