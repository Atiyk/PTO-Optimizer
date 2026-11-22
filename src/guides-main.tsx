import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivacyAnalytics } from './ui/PrivacyAnalytics'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import './index.css'
import { GuidesIndex } from './ui/GuidesIndex.tsx'

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GuidesIndex />
    <PrivacyAnalytics />
  </StrictMode>,
)
