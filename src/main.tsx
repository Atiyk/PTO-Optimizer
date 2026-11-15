import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivacyAnalytics } from './ui/PrivacyAnalytics'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import './index.css'
import { App } from './ui/App.tsx'
import { applyPlanHandoffOnLoad } from './ui/planHandoff'

// Before the planner reads its URL: adopt an on-device hand-off and strip its nonce.
applyPlanHandoffOnLoad()

// P3 PWA: production builds only, after load (src/pwa/registerServiceWorker.ts).
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PrivacyAnalytics />
  </StrictMode>,
)
