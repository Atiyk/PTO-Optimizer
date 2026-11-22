import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivacyAnalytics } from './ui/PrivacyAnalytics'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import './index.css'
import { GuidePage } from './ui/GuidePage.tsx'

// Every guides/<id>/index.html loads this same bundle (scripts/generate-guide-html.ts); the
// guide id comes from the URL path, exactly as scripts/prerender.ts passes it during SSR.
const guideId = window.location.pathname.split('/').filter(Boolean).pop() ?? ''

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GuidePage guideId={guideId} />
    <PrivacyAnalytics />
  </StrictMode>,
)
