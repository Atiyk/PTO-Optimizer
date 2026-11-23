import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { PrivacyAnalytics } from './ui/PrivacyAnalytics'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import './index.css'
import { PlanGuidePage } from './ui/PlanGuidePage.tsx'

// Every worked-plan guides/<slug>/index.html loads this SAME bundle
// (scripts/generate-plan-guide-html.ts). The guide
// comes from the URL path, exactly as scripts/prerender.ts passes it during SSR. The page is
// a pure function of the committed holiday data, so it hydrates the prerendered markup.
const path = window.location.pathname

registerServiceWorker()

const root = document.getElementById('root')!
const page = (
  <StrictMode>
    <PlanGuidePage path={path} />
  </StrictMode>
)
if (root.hasChildNodes()) hydrateRoot(root, page)
else createRoot(root).render(page)

// Analytics renders nothing visible; its own root keeps it out of the hydrated tree.
createRoot(document.createElement('div')).render(<PrivacyAnalytics />)
