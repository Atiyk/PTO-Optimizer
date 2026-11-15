import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivacyAnalytics } from './ui/PrivacyAnalytics'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import './index.css'
import { GlossaryTermPage } from './ui/GlossaryTermPage.tsx'

// Every glossary/<id>/index.html loads this SAME bundle (see scripts/generate-glossary-html.ts) -
// the term id comes from the URL path itself, exactly the way scripts/prerender.ts passes it
// as a prop during SSR, so client and server render the identical term with no extra config
// per page.
const termId = window.location.pathname.split('/').filter(Boolean).pop() ?? ''

// P3 PWA: production builds only, after load (src/pwa/registerServiceWorker.ts).
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlossaryTermPage termId={termId} />
    <PrivacyAnalytics />
  </StrictMode>,
)
